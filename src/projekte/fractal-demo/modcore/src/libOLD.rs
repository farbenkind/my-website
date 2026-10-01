use wasm_bindgen::prelude::*;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use serde_wasm_bindgen::{from_value, to_value};

#[allow(non_snake_case)]
#[derive(Serialize, Deserialize, Clone)]
pub struct KnobState {
    pub liveValue: f32,
    pub cmValue: f32,
    pub presetValue: f32,
    pub modEnabled: bool,
    pub knobPressed: bool,
}

#[allow(non_snake_case)]
pub struct ParamState {
    pub base: f32,
    pub modval: f32,
    pub slide: f32,
    pub punch: f32,
    pub uiOut: f32,
    pub internal: f32,
    pub mod_enabled: bool,
}

#[wasm_bindgen]
pub struct ModCore {
    params: HashMap<String, ParamState>,
}

#[wasm_bindgen]
impl ModCore {
    #[wasm_bindgen(constructor)]

    pub fn new() -> ModCore {
        ModCore {
            params: HashMap::new(),
        }
    }

    pub fn init_params(&mut self, js_knobs: JsValue) {
        // JS → Rust: HashMap<String, KnobState>
        let map: HashMap<String, KnobState> = from_value(js_knobs).unwrap();

        for (key, state) in map {
            self.params.insert(
                key,
                ParamState {
                    base: state.liveValue,
                    modval: 0.0,
                    slide: 0.0,
                    punch: 0.0,
                    uiOut: 0.0,
                    internal: state.liveValue,
                    mod_enabled: state.modEnabled,
                },
            );
        }
    }

    pub fn param_mod_on(&mut self, name: String) {
        if let Some(p) = self.params.get_mut(&name) {
            p.mod_enabled = true;
        }
    }

    pub fn param_mod_off(&mut self, name: String) {
        if let Some(p) = self.params.get_mut(&name) {
            p.mod_enabled = false;
            p.modval = 0.0;
        }
    }

    pub fn set_param_base(&mut self, name: String, value: f32) {
        if let Some(p) = self.params.get_mut(&name) {
            p.base = value;
        }
    }

    pub fn set_param_mod(&mut self, name: String, value: f32) {
        if let Some(p) = self.params.get_mut(&name) {
            p.modval = value;
        }
    }

    pub fn set_param_slide(&mut self, name: String, v: f32) {
        if let Some(p) = self.params.get_mut(&name) {
            p.slide = v;
        }
    }

    pub fn set_param_punch(&mut self, name: String, v: f32) {
        if let Some(p) = self.params.get_mut(&name) {
            p.punch = v;
        }
    }

    pub fn process(&mut self) {
        for (_, p) in self.params.iter_mut() {
            p.uiOut = (p.base + p.slide).rem_euclid(1.0);
            p.internal = (p.uiOut+p.punch).clamp(0.0,1.0);
        }
    }

    pub fn get_internal(&self, name: String) -> f32 {
        if let Some(p) = self.params.get(&name) {
            p.internal
        } else {
            0.0
        }
    }

    #[allow(non_snake_case)]
    pub fn get_uiOut(&self, name: String) -> f32 {
        if let Some(p) = self.params.get(&name) {
            p.uiOut
        } else {
            0.0
        }
    }

    pub fn get_all_internal(&self) -> JsValue {
        let mut map = HashMap::new();

        for (key, p) in &self.params {
            map.insert(key.clone(), p.internal);
        }

        to_value(&map).unwrap()
    }
}
