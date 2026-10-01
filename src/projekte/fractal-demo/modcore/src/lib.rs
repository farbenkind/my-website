use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use serde_wasm_bindgen::to_value;

use std::cell::RefCell;
use realfft::RealFftPlanner;
use num_complex::Complex32;

// ---------------------------------------------
// Konfiguration
// ---------------------------------------------
const FFT_SIZE: usize = 2048;
const SAMPLE_RATE: f32 = 48_000.0;

// ---------------------------------------------
// Thread-lokaler Audio-State
// ---------------------------------------------
thread_local! {
    static SAMPLE_BUFFER: RefCell<Vec<f32>> = RefCell::new(Vec::new());

    static LAST_BASS: RefCell<f32> = RefCell::new(0.0);
    static LAST_MID:  RefCell<f32> = RefCell::new(0.0);
    static LAST_TRE:  RefCell<f32> = RefCell::new(0.0);

    static PREV_BASS: RefCell<f32> = RefCell::new(0.0);
    static PREV_MID:  RefCell<f32> = RefCell::new(0.0);
    static PREV_TRE:  RefCell<f32> = RefCell::new(0.0);
}

// ---------------------------------------------
// Datenstruktur für JS
// ---------------------------------------------
#[derive(Serialize, Deserialize, Clone)]
pub struct BeatData {
    pub bass: f32,
    pub mid: f32,
    pub tre: f32,
}

// ---------------------------------------------
// Spektrumanalyse (FFT → Bänder → Onsets)
// ---------------------------------------------
fn analyze_spectrum(spectrum: &[Complex32], fft_size: usize) {
    let bin_hz = SAMPLE_RATE / fft_size as f32;

    let mut bass = 0.0;
    let mut mid  = 0.0;
    let mut tre  = 0.0;

    // --- Frequenzbänder summieren ---
    for (i, c) in spectrum.iter().enumerate() {
        let freq = i as f32 * bin_hz;
        let mag  = c.norm();

        if freq < 150.0 {
            bass += mag;
        } else if freq < 2000.0 {
            mid += mag;
        } else if freq < 8000.0 {
            tre += mag;
        }
    }

    // --- Onset Detection (Delta) ---
    PREV_BASS.with(|pb| {
        LAST_BASS.with(|lb| {
            let prev = *pb.borrow();
            *lb.borrow_mut() = (bass - prev).max(0.0);
            *pb.borrow_mut() = bass;
        });
    });

    PREV_MID.with(|pm| {
        LAST_MID.with(|lm| {
            let prev = *pm.borrow();
            *lm.borrow_mut() = (mid - prev).max(0.0);
            *pm.borrow_mut() = mid;
        });
    });

    PREV_TRE.with(|pt| {
        LAST_TRE.with(|lt| {
            let prev = *pt.borrow();
            *lt.borrow_mut() = (tre - prev).max(0.0);
            *pt.borrow_mut() = tre;
        });
    });
}

// ---------------------------------------------
// FFT ausführen
// ---------------------------------------------
fn process_fft(samples: &[f32]) {
    let mut planner = RealFftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(samples.len());

    let mut spectrum = fft.make_output_vec();
    let mut buffer   = samples.to_vec();

    fft.process(&mut buffer, &mut spectrum).unwrap();

    analyze_spectrum(&spectrum, samples.len());
}

// ---------------------------------------------
// JS → Rust: Samples updaten
// ---------------------------------------------
#[wasm_bindgen]
pub fn update_audio(samples: &[f32])  {
    SAMPLE_BUFFER.with(|buf| {
        let mut buf = buf.borrow_mut();
        buf.extend_from_slice(samples);

        if buf.len() >= FFT_SIZE {
            let chunk = buf[..FFT_SIZE].to_vec();
            buf.drain(..FFT_SIZE);
            process_fft(&chunk);
        }
    });
}

// ---------------------------------------------
// Rust → JS: Beats zurückgeben
// ---------------------------------------------
#[wasm_bindgen]
pub fn get_beats() -> JsValue {
    let bass = LAST_BASS.with(|b| *b.borrow());
    let mid  = LAST_MID.with(|m| *m.borrow());
    let tre  = LAST_TRE.with(|t| *t.borrow());

    let data = BeatData { bass, mid, tre };
    to_value(&data).unwrap()
}
