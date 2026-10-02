import { createFractalRenderer } from "./fractal-renderer.js";
import { startAudioInput } from "./audio-input.js";

let dbg = false;

const pi = Math.PI;

const fmod = (x, m) => ((x % m) + m) % m;

function myPow(base, exp) {
    if (exp >= 0)
        return Math.pow(base, exp);
    return Math.pow(base, -1 / exp)
}
const symExp = (max) => Math.log2(max * max / (max - 1));

function log(desc, val) {
    if (dbg) {
        console.log(desc, val);
    }
}
function clamp(x, min, max) {
    return x >= min ? (x < max ? x : max) : min;
}



/////////////


/////////////////  Webgui Settup
const canvas = document.querySelector("canvas");
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();

const context = canvas.getContext("webgpu");
const format = navigator.gpu.getPreferredCanvasFormat();


context.configure({
    device,
    format,
    alphaMode: "opaque"
});


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//            FRACTAL


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////


///////// /// FractalParams - uniforms
const fractalRenderer = createFractalRenderer({ canvas, context, device, format });
const { cmSize, colormapTexture: CMAP_Texture } = fractalRenderer;


//////////////////////////////////////////////////////////////////
// FractalShader
//////////////////////////////////////////////////////////////////

// Fractal rendering, GPU resources, and canvas navigation live in fractal-renderer.js.






















//////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//            C O L O R M A P   -   E D I T O R 


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var editor = false;
var editorAudioReact = true;



const ModMode = {
    PUNCH: "punch",
    BASE: "base",
};
const BaseMode = {
    SLIDE: "slide",
    BOUNCE: "bounce",
}
const ModTransfrom = {
    LINEAR: "linear",
    POWER: "power",
}
const sliderMod = {
    SYMLIN: "symlin",
    LINEAR: "linear",
    QUBIC: "qubic",
}


class KnobState {
    constructor(initValue) {
        this.liveValue = initValue;
        this.cmValue = initValue;
        this.presetValue = initValue;

        this.modEnabled = false;
        this.knobPressed = false;

        this.mods = [];
        this.mode = BaseMode.BOUNCE,
            this.bounceDir = 1;
        this.min = 0;
        this.max = 1;
        this.smooth = .1;
    }
}
const knobs = {};


function packCMParams() {
    return new Float32Array([
        knobs["amount-r"].cmValue,
        knobs["shape-r"].cmValue,
        knobs["pow-r"].cmValue,
        knobs["pos-r"].cmValue,
        knobs["mult-r"].cmValue,

        knobs["amount-g"].cmValue,
        knobs["shape-g"].cmValue,
        knobs["pow-g"].cmValue,
        knobs["pos-g"].cmValue,
        knobs["mult-g"].cmValue,

        knobs["amount-b"].cmValue,
        knobs["shape-b"].cmValue,
        knobs["pow-b"].cmValue,
        knobs["pos-b"].cmValue,
        knobs["mult-b"].cmValue,

        knobs["phaseShift"].cmValue,
        knobs["hueShift"].cmValue,
    ]);
}


document.getElementById("modClose").addEventListener("click", () => {
    document.getElementById("modOverlay").classList.add("hidden");
});

function initKnobs() {
    document.querySelectorAll(".knob").forEach(knob => {
        const param = knob.dataset.param;
        const initValue = parseFloat(knob.dataset.init) || 0.0;

        knobs[param] = new KnobState(initValue);

        const updateVisual = () => {
            const v = knobs[param].liveValue;
            const angle = v * 270 - 135;
            knob.style.transform = `rotate(${angle}deg)`;
            knob.style.setProperty("--needle-angle", angle + "deg");
        };

        updateVisual();

        knob.addEventListener("dblclick", () => {
            openModOverlay(param);
        })

        knob.addEventListener("pointerdown", () => {
            knobs[param].knobPressed = true;
        });

        window.addEventListener("pointerup", () => {
            knobs[param].knobPressed = false;
        });

        window.addEventListener("pointermove", (ev) => {
            if (!knobs[param].knobPressed) return;

            let v = knobs[param].liveValue;
            v += ev.movementY * -0.005;
            v = Math.max(0, Math.min(1, v));

            knobs[param].liveValue = v;
            knobs[param].cmValue = v;

            updateVisual();
        });
    });
}

document.querySelectorAll(".mod-toggle").forEach(btn => {
    const param = btn.dataset.param;

    btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        knobs[param].modEnabled = !knobs[param].modEnabled;
        btn.classList.toggle("active", knobs[param].modEnabled);

        // Rust informieren
        if (knobs[param].modEnabled) {
            core.param_mod_on(param);
        } else {
            core.param_mod_off(param);
        }
    });
});

initKnobs();



const cmEditorRenderCode = /*wgsl*/`
struct VSOut {
    @builtin(position) pos : vec4<f32>,
    @location(0) uv : vec2<f32>,
};

@vertex
fn cm_vs(@builtin(vertex_index) idx : u32) -> VSOut {
    let pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
        vec2<f32>(-1.0,  3.0),
    );

    let p = pos[idx];
    var out : VSOut;
    out.pos = vec4<f32>(p, 0.0, 1.0);
    out.uv  = (p + vec2<f32>(1.0, 1.0)) * 0.5;
    return out;
}

// Preview: Colormap-Texture
@group(0) @binding(0)
var cmTexSample : texture_2d<f32>;

// AA-Curve: 1D-Kurve als Texture
@group(0) @binding(1)
var curve1D : texture_2d<f32>;

@fragment
fn cm_fs(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
    let x = i32(uv.x * 1023.0);
    let color = textureLoad(cmTexSample, vec2<i32>(x, 0), 0);
    return vec4<f32>(color.rgb, 1.0);
}

fn AAColor(colval : f32, y : f32) -> f32 {

    let curveY = colval * 63.0;

    let dy = abs(y - curveY);
    let lineWidth = 1.0;
    let aaWidth   = 1.0;

    // Kern der Linie
    if (dy < lineWidth) {
        return 1.0;
    }

    // AA-Bereich
    if (dy < lineWidth + aaWidth) {
        return 1.0 - (dy - lineWidth) / aaWidth;
    }

    // Hintergrund = 0 → wird später mit Weiß gemischt
    return 0.0;
}

@fragment
fn cmAACurve_fs(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {

    let w = 1024.0;
    let h = 63.0;

    let x = i32(uv.x * w);
    let y = f32(i32(uv.y * h));

    let c = textureLoad(curve1D, vec2<i32>(x, 0), 0);

    // AA für jede Farbe
    let ar = AAColor(c.r, y);
    let ag = AAColor(c.g, y);
    let ab = AAColor(c.b, y);

    let col = vec3<f32>(ar, ag, ab);

    // Hintergrund weiß
    let bg = vec3<f32>(1.0, 1.0, 1.0);

    // Alpha = max der drei Kanäle → deckend, wo eine Kurve ist
    let alpha = max(max(ar, ag), ab);

    // Finales Mischen
    let finl = mix(bg, col, alpha);

    return vec4<f32>(finl, 1.0);
}

`;












const cmComputeShaderCode = /*wgsl*/`
struct CMParams {
    amount_r : f32,
    shape_r  : f32,
    pow_r    : f32,
    pos_r    : f32,
    mult_r   : f32,

    amount_g : f32,
    shape_g  : f32,
    pow_g    : f32,
    pos_g    : f32,
    mult_g   : f32,

    amount_b : f32,
    shape_b  : f32,
    pow_b    : f32,
    pos_b    : f32,
    mult_b   : f32,

    phaseShift : f32,
    hueShift : f32,
};

@group(0) @binding(0)
var<uniform> cmParams : CMParams;

@group(0) @binding(1)
var cmTexWrite : texture_storage_2d<rgba8unorm, write>;

@group(0) @binding(2)
var curve1DWrite : texture_storage_2d<rgba8unorm, write>;

const pi2 = 6.283185307179586476925286766559;
const small = 1e-5;

fn logb(x: f32, base: f32) -> f32 {
    return log(x) / log(base);
}

fn sympow(base :f32, exp:f32) -> f32 {
    let b = clamp(base, 0, 1);
    var e = exp;
    if (e < 1e-9) { e = 1e-9;}
    if (exp<1) {
        return f32(1-pow(1-b,1/e));
    }
    else {
        return f32(pow(b,e));
    }
}
fn sympowknob(base: f32, knob: f32, mult: f32) -> f32 {

    var exp_1 = pow(knob, logb(mult,2)) * mult;

    
    if (exp_1 < 1) {
        exp_1 = pow(knob, logb(mult/100,2)) * mult/100;
        return 1-pow(1-base, 1/exp_1);
    }
    else {
        return pow(base, exp_1);
    }
}
fn powknob(base: f32, knob: f32, mult: f32) -> f32 {
        
    var exp_1 = pow(knob, logb(mult,2)) * mult;
    if ( exp_1 < 1) {
        exp_1 = pow(pow(knob*2,knob*1.1/10)/2,logb(mult,2))*mult;
    }

    exp_1 = pow(pow(knob*2,(knob+.1)/1.1)/2,logb(mult,2))*mult;
    return pow(base, exp_1);
    

}
fn shapeWave(t : f32, shape : f32) -> f32 {
    let s = max(0.001, shape * 20.0);
    return 0.5 + 0.5 * tanh(cos(t) * s);
}
fn powerWave(t: f32, shape: f32) -> f32 {
    let c = 0.5 + 0.5 * cos(t);
    if (shape > 0.5) {
        return pow(c, 1.0 + (shape - 0.5) * 50.0);
    }
    return 1.0 - pow(1.0 - c, 1.0 + (0.5 - shape) * 50.0);
}

fn primcolmap1(x: f32, amount: f32, power: f32, pos: f32, mult: f32, phaseShift: f32) -> f32 {
    let t = (x * mult * 20.0 - pos - phaseShift) * pi2;
    let c = 0.5 + small + (0.5-small) * cos(t);
    return amount * sympowknob(c, power, 10000.0);
}
fn primcolmap2(x: f32, amount: f32, shape:f32, power: f32, pos: f32, mult: f32, phaseShift: f32) -> f32 {
    let t = (x * mult * 20.0 - pos - phaseShift) * pi2;
    var c = small+(1-small)*powerWave(t,shape);
    //ec = powerWave(t,shape);
    return amount * sympowknob(c, power, 10000.0);
}

@compute @workgroup_size(64)
fn cm_main(@builtin(global_invocation_id) gid : vec3<u32>) {
    if (gid.x >= 1024u) { return; }

    let x = f32(gid.x) / 1024.0;

    let r = primcolmap2(x, cmParams.amount_r, cmParams.shape_r, cmParams.pow_r, cmParams.pos_r, cmParams.mult_r, cmParams.phaseShift);
    let g = primcolmap2(x, cmParams.amount_g, cmParams.shape_g, cmParams.pow_g, cmParams.pos_g, cmParams.mult_g, cmParams.phaseShift);
    let b = primcolmap2(x, cmParams.amount_b, cmParams.shape_b, cmParams.pow_b, cmParams.pos_b, cmParams.mult_b, cmParams.phaseShift);

textureStore(
    cmTexWrite,
    vec2<i32>(i32(gid.x), 0),
    vec4<f32>(r, g, b, 1.0)
);

    // 1D-Kurve: nur r-Kanal als Kurve
    textureStore(
        curve1DWrite,
        vec2<i32>(i32(gid.x), 0),
        vec4<f32>(r, g, b, 1.0)
    );
}
`;










const cmEditorRenderModule = device.createShaderModule({
    label: "ColorMap Render Shader",
    code: cmEditorRenderCode,
});

const cmComputeModule = device.createShaderModule({
    label: "ColorMap Compute Shader",
    code: cmComputeShaderCode,
});

const CMAP_Pipeline = device.createRenderPipeline({
    label: "ColorMap Preview Pipeline",
    layout: "auto",
    vertex: {
        module: cmEditorRenderModule,
        entryPoint: "cm_vs",
        buffers: [],
    },
    fragment: {
        module: cmEditorRenderModule,
        entryPoint: "cm_fs",
        targets: [{ format }],
    },
    primitive: { topology: "triangle-list" },
});

const AA_CURVE_Pipeline = device.createRenderPipeline({
    label: "ColorMap AA Curve Pipeline",
    layout: "auto",
    vertex: {
        module: cmEditorRenderModule,
        entryPoint: "cm_vs",
        buffers: [],
    },
    fragment: {
        module: cmEditorRenderModule,
        entryPoint: "cmAACurve_fs",
        targets: [{ format }],
    },
    primitive: { topology: "triangle-list" },
});


const CMAP_COMPUTE_Pipeline = device.createComputePipeline({
    label: "ColorMap Compute Pipeline",
    layout: "auto",
    compute: {
        module: cmComputeModule,
        entryPoint: "cm_main",
    },
});



const CURVE_Texture = device.createTexture({
    label: "Curve 1D Texture",
    size: [cmSize, 3],
    format: "rgba8unorm",
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
});


const cmPreviewBindGroup = device.createBindGroup({
    label: "ColorMap Preview BindGroup",
    layout: CMAP_Pipeline.getBindGroupLayout(0),
    entries: [
        { binding: 0, resource: CMAP_Texture.createView() },      // cmTexSample
    ],
});


const cmEditorAACurveBindGroup = device.createBindGroup({
    label: "AA Curve BindGroup",
    layout: AA_CURVE_Pipeline.getBindGroupLayout(0),
    entries: [
        { binding: 1, resource: CURVE_Texture.createView() }, // curve1D
    ],
});

const cmParamsBuffer = device.createBuffer({
    size: 80,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(cmParamsBuffer, 0, packCMParams());

const cmComputeBindGroup = device.createBindGroup({
    label: "ColorMap Compute BindGroup",
    layout: CMAP_COMPUTE_Pipeline.getBindGroupLayout(0),
    entries: [
        { binding: 0, resource: { buffer: cmParamsBuffer } },
        { binding: 1, resource: CMAP_Texture.createView() },
        { binding: 2, resource: CURVE_Texture.createView() },
    ],
});

function runCMComputePass() {
    const encoder = device.createCommandEncoder({ label: "ColorMap Compute Encoder" });
    const pass = encoder.beginComputePass();
    pass.setPipeline(CMAP_COMPUTE_Pipeline);
    pass.setBindGroup(0, cmComputeBindGroup);
    pass.dispatchWorkgroups(Math.ceil(cmSize / 64));
    pass.end();
    device.queue.submit([encoder.finish()]);
}
// ===============================
//  Colormap Preview Canvas
// ===============================
const cmCanvas = document.getElementById("cmCanvas");
const cmContext = cmCanvas.getContext("webgpu");

cmCanvas.width = 1024;
cmCanvas.height = 64;

cmContext.configure({
    device,
    format,
    alphaMode: "premultiplied",
});


// ===============================
//  AA Curve Canvas
// ===============================
const cmAACurveCanvas = document.getElementById("curveCanvas");
const cmAACurveContext = cmAACurveCanvas.getContext("webgpu");

cmAACurveCanvas.width = 1024;
cmAACurveCanvas.height = 64;   // gleiche Höhe wie Curve-Preview

cmAACurveContext.configure({
    device,
    format,
    alphaMode: "premultiplied",
});

function renderCMPreview() {
    const encoder = device.createCommandEncoder({ label: "ColorMap Preview Encoder" });
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: cmContext.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
        }],
    });

    pass.setPipeline(CMAP_Pipeline);
    pass.setBindGroup(0, cmPreviewBindGroup);
    pass.draw(3);
    pass.end();

    device.queue.submit([encoder.finish()]);
}

function renderEditorAACurve() {
    const encoder = device.createCommandEncoder({ label: "ColorMap AA Curve Encoder" });
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: cmAACurveContext.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 1, g: 1, b: 1, a: 1 },
        }],
    });

    pass.setPipeline(AA_CURVE_Pipeline);
    pass.setBindGroup(0, cmEditorAACurveBindGroup);
    pass.draw(3);
    pass.end();

    device.queue.submit([encoder.finish()]);
}


















/////////////////////////////////////////////////////////////////////////////////////
//
//          M O D U L A T I O N   -   M A T R I X 
//
/////////////////////////////////////////////////////////////////////////////////////

function makeEnv({ name, source, attack, decay }) {
    return {
        type: "env",
        name,
        source,
        value: 0,

        params: {
            attack: { min: 0, max: 1, exp: false, value: attack },
            decay: { min: 0, max: 1, exp: false, value: decay }
        },

        update() {
            const input = this.source();
            if (input > 0) this.value += this.params.attack.value;
            this.value *= this.params.decay.value;
            return this.value;
        }
    };
}
function makeConst({ name, value }) {
    return {
        type: "const",
        name,
        value: 0,

        params: {
            value: { min: -1, max: 1, exp: false, value: value },
        },

        update() {
            this.value = this.params.value.value;
            return this.value;
        }
    };
}
function makeOsc1({ name, freq, shape }) {
    return {
        type: "osc",
        name,
        freq,
        shape,
        value: 0,
        phase: 0,

        params: {
            freq: { min: 1 / 3600, max: 5, exp: true, value: freq },
            shape: { min: -1.0, max: 1, exp: false, value: shape },
        },

        update() {
            // Phase update
            this.phase = fmod(this.phase + this.params.freq.value * (1 / 60), 1.0);

            const t = this.phase;
            const S = this.params.shape.value;

            // Peak position (0 = ramp down, 0.5 = triangle, 1 = ramp up)
            const p = (S + 1) * 0.5;

            // Abstand zum Peak
            const d = Math.abs(t - p);

            // Normierung: linker oder rechter Bereich
            const denom = (t < p ? p : (1 - p));

            // Schutz gegen 0
            const safe = denom + 1e-6;

            // Dreiecksform
            this.value = 1 - d / safe;

            return this.value;
        }
    };
}
function makeLinearTransform({ slope = 1 / 2, bias = 0 }) {
    return {
        type: "linear",
        name: "linear",
        params: {
            slope: { min: -1, max: 1, exp: false, value: slope },
            bias: { min: -1, max: 1, exp: false, value: bias }
        },

        apply(x) {
            const s = Math.pow(this.params.slope.value * 2, 3);
            const b = Math.pow(this.params.bias.value * 2, 3);
            return (x + b) * s;
        }
    }
};
function makePowerTransform({ exponent = 1 }) {
    return {
        type: "power",
        name: "power",
        params: {
            exponent: { min: 1 / 5, max: 5, exp: true, value: exponent },
        },

        apply(x) {
            return Math.pow(x, this.params.exponent.value);
        }
    }
}
function makeSourceFromName(name) {

    // Audio‑Beats (globale Variablen)
    if (name === "bassEnv") return makeEnv({
        name: name,
        source: () => window.bassBeat,
        attack: 0.3,
        decay: 0.7
    });

    if (name === "midEnv") return makeEnv({
        name,
        source: () => window.midBeat,
        attack: 0.3,
        decay: 0.7
    });

    if (name === "treEnv") return makeEnv({
        name,
        source: () => window.treBeat,
        attack: 0.3,
        decay: 0.7
    });

    // OSC‑Quellen
    if (name === "osc1") return makeOsc1({
        name,
        freq: 1,
        shape: 0,
    });

    if (name === "osc2") return makeOsc({
        name,
        freq: 0.4,
        phase: 0
    });

    if (name === "const") return makeConst({
        name,
        value: .1,
    });

    // Random‑Quelle
    if (name === "random") return makeRandom({
        name,
        speed: 0.3
    });

    if (name === "bassBeat") return { name, type: "beat", update: () => window.bassBeat, params: {} };
    if (name === "midBeat") return { name, type: "beat", update: () => window.midBeat, params: {} };
    if (name === "treBeat") return { name, type: "beat", update: () => window.treBeat, params: {} };
    // Fallback
    console.warn("Unknown source:", name);
    return makeEnv({
        name: "fallbackEnv",
        source: () => 0,
        attack: 0.0,
        decay: 1.0
    });
}
function createSourceSelector(mod, paramName) {
    const wrap = document.createElement("div");
    const sel = document.createElement("select");

    for (const name of ["bassEnv", "midEnv", "treEnv", "osc1", "osc2", "const", "bassBeat", "midBeat", "treBeat"]) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        if (mod.sourceObj.name === name) opt.selected = true;
        sel.appendChild(opt);
    }

    sel.onchange = () => {
        mod.sourceObj = makeSourceFromName(sel.value);
        renderModUI(paramName);
    };

    wrap.appendChild(sel);
    return wrap;
}
function createTransformSelector(mod, paramName) {
    const wrap = document.createElement("div");
    const sel = document.createElement("select");

    for (const val of ["linear", "power"]) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = val;
        if (mod.transformObj.type === val) opt.selected = true;
        sel.appendChild(opt);
    }

    sel.onchange = () => {
        switch (sel.value) {
            case ModTransfrom.LINEAR:
                mod.transformObj = makeLinearTransform({ slope: 1, bias: 0 });
                break;
            case ModTransfrom.POWER:
                mod.transformObj = makePowerTransform({ exponent: 1 })
                break;
        }
        renderModUI(paramName);
    };

    wrap.appendChild(sel);
    return wrap;
}
function createModeSelector(mod, paramName) {
    const wrap = document.createElement("div");
    const sel = document.createElement("select");

    for (const [key, val] of Object.entries(ModMode)) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = val;
        if (mod.mode === val) opt.selected = true;
        sel.appendChild(opt);
    }

    sel.onchange = () => {
        mod.mode = sel.value;
        renderModUI(paramName);
    };

    wrap.appendChild(sel);
    return wrap;
}
function createParamKnobs(params) {
    const wrap = document.createElement("div");
    wrap.className = "param-knobs";
    wrap.style.gap = "0px"
    for (const key in params) {
        const p = params[key];

        const label = document.createElement("label");
        label.textContent = key;

        const inp = document.createElement("input");
        inp.type = "range";
        inp.min = 0;
        inp.max = 1;
        inp.step = 0.005;
        inp.style.width = "100%";

        // inverse exponentielle Formel
        const exp = p.exp ? symExp(p.max) : 1;
        const range = (p.max - p.min) || 1;
        const norm = Math.max(0, Math.min(1, (p.value - p.min) / range));
        inp.value = Math.pow(norm, 1 / exp);

        // --- Tooltip über dem Slider ---
        const tooltip = document.createElement("div");
        tooltip.className = "slider-tooltip";
        tooltip.style.position = "absolute";
        tooltip.style.top = "0px";
        tooltip.style.padding = "2px 6px";
        tooltip.style.background = "#222";
        tooltip.style.color = "#fff";
        tooltip.style.fontSize = "11px";
        tooltip.style.borderRadius = "4px";
        tooltip.style.pointerEvents = "none";
        tooltip.style.transform = "translate(-50%, -120%)";
        tooltip.style.display = "none"; // erst unsichtbar

        // Tooltip in DOM einfügen
        const sliderWrap = document.createElement("div");
        sliderWrap.style.position = "relative";
        sliderWrap.appendChild(inp);
        sliderWrap.appendChild(tooltip);

        // --- Tooltip Position + Wert aktualisieren ---
        function updateTooltip() {
            const ui = parseFloat(inp.value);
            const val = p.min + Math.pow(ui, exp) * range;

            tooltip.textContent = val.toFixed(3);

            // Position berechnen
            const rect = inp.getBoundingClientRect();
            const percent = ui; // 0–1
            const x = percent * rect.width;

            tooltip.style.left = x + "px";
        }

        // --- Events ---
        inp.oninput = () => {

            const ui = parseFloat(inp.value);
            /*
            console.log("ui", ui);
            console.log("exp", exp);
            console.log("p.value", p.value);
            */
            p.value = p.min + Math.pow(ui, exp) * range;

            tooltip.style.display = "block";
            updateTooltip();
        };

        inp.onmouseenter = () => {
            tooltip.style.display = "block";
            updateTooltip();
        };

        inp.onmouseleave = () => {
            tooltip.style.display = "none";
        };

        wrap.appendChild(label);
        wrap.appendChild(sliderWrap);
    }

    return wrap;
}
function createDualSlider(param) {

    const p = param.range;

    const wrap = document.createElement("div");
    const label = document.createElement("label");
    label.textContent = param.name;


    const slider = document.createElement("div");
    slider.className = "dual-slider";

    const track = document.createElement("div");
    track.className = "track";

    const range = document.createElement("div");
    range.className = "range";

    const thumbMin = document.createElement("div");
    thumbMin.className = "thumb min";

    const thumbMax = document.createElement("div");
    thumbMax.className = "thumb max";

    slider.appendChild(track);
    slider.appendChild(range);
    slider.appendChild(thumbMin);
    slider.appendChild(thumbMax);

    function update() {
        const w = slider.clientWidth;
        const xMin = p.minVal * w;
        const xMax = p.maxVal * w;

        thumbMin.style.left = xMin + "px";
        thumbMax.style.left = xMax + "px";

        range.style.left = xMin + "px";
        range.style.width = (xMax - xMin) + "px";
    }

    function dragThumb(thumb, isMin) {
        function onMove(e) {
            const rect = slider.getBoundingClientRect();
            let x = e.clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            const v = x / rect.width;

            if (isMin) {
                p.minVal = Math.min(v, p.maxVal - 5e-2);
            } else {
                p.maxVal = Math.max(v, p.minVal + 5e-2);
            }

            update();
        }

        function onUp() {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        }

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }

    thumbMin.addEventListener("mousedown", () => dragThumb(thumbMin, true));
    thumbMax.addEventListener("mousedown", () => dragThumb(thumbMax, false));

    const ro = new ResizeObserver(() => update());
    ro.observe(slider);
    wrap.appendChild(label);
    wrap.appendChild(slider);
    return wrap;
}
function createAmountKnob(mod) {
    const wrap = document.createElement("div");
    wrap.className = "param-knobs";

    const label = document.createElement("label");
    label.textContent = "Amount";

    const inp = document.createElement("input");
    inp.type = "range";
    inp.min = 0;
    inp.max = 1;
    inp.step = 0.01;
    inp.value = mod.amount;

    inp.oninput = () => {
        mod.amount = parseFloat(inp.value);
    };

    wrap.appendChild(label);
    wrap.appendChild(inp);

    return wrap;
}
function button(text) {
    const btn = document.createElement("button)");
    btn.textContent = text;
    btn.classList.add("button");
    return btn;
}
function renderModUI(paramName) {
    function createModSlotUI(mod, paramName) {
        const div = document.createElement("div");
        div.className = "mod-slot";
        div.style.background = "#555";

        const heading = document.createElement("div");
        const label = document.createElement("label");
        label.textContent = paramName;
        label.style.fontSize = "20px";
        heading.appendChild(label);
        label.style.alignContent = "center";
        div.appendChild(heading);
        heading.style.display = "flex";
        heading.style.justifyContent = "center";
        div.style.gap = "10px";
        // Quelle
        div.appendChild(createSourceSelector(mod, paramName));
        // Source-Parameter
        div.appendChild(createParamKnobs(mod.sourceObj.params));


        // Transform
        div.appendChild(createTransformSelector(mod, paramName));
        // Transform-Parameter
        div.appendChild(createParamKnobs(mod.transformObj.params));

        // Amount
        div.appendChild(createAmountKnob(mod));


        // Mode
        div.appendChild(createModeSelector(mod, paramName));

        return div;
    }
    function createModSlotAddDel(mod, paramName) {
        const div = document.createElement("div");
        div.classList.add("centerdiv");


        const delButton = button("del");
        delButton.addEventListener("click", () => {
            delButton.style.transform = "scale(.95)";
            const index = mods.findIndex(item => item === mod);
            index !== -1 && mods.splice(index, 1);
            mods.length > 0 && renderModUI(paramName);
            mods.length == 0 && document.getElementById("modOverlay").classList.add("hidden");
            mods.length == 0 && document.querySelector(`[data-param="${paramName}"].mod-toggle`)?.classList.remove("active");
        })
        div.append(delButton);
        const addButton = button("add");
        addButton.addEventListener("click", () => {
            console.log("addButton", "");

            addButton.style.transform = "scale(.95)";
            mods.push(makeDefaultModSlot());
            renderModUI(paramName);

        })

        div.append(addButton);
        return div;
    }
    function createBaseModeOptions(knob) {
        const div = document.createElement("div");
        div.innerHTML = "";
        div.style.background = "#456"
        div.style.padding = "20px 20px";
        div.style.borderRadius = "10px"
        const sel = document.createElement("select");

        const base = knob.modulationBase;

        for (const val of Object.values(BaseMode)) {
            const opt = document.createElement("option");
            opt.value = val;
            opt.textContent = val;
            if (knob.mode === val) opt.selected = true;
            sel.appendChild(opt);
        }

        sel.onchange = () => {
            knob.mode = sel.value;
        };

        div.appendChild(sel);

        div.appendChild(createDualSlider({
            name: "range",
            range: {
                min: 0,
                max: 1,
                get minVal() { return knob.min },
                set minVal(v) { knob.min = v },
                get maxVal() { return knob.max },
                set maxVal(v) { knob.max = v },
            }
        }));


        div.appendChild(createParamKnobs({
            smooth: {
                min: -.95,
                max: 0.95,
                exp: false,
                get value() { return knob.smooth },
                set value(v) { knob.smooth = v }
            }
        }));

        return div;
    }
    const container = document.getElementById("modUIContainer");
    container.innerHTML = "";
    const modsDiv = document.createElement("div");
    modsDiv.innerHTML = "";
    modsDiv.classList.add("modsDiv");
    const mods = knobs[paramName].mods;
    console.log("slotanzahl", mods.length);

    for (const mod of mods) {
        modsDiv.appendChild(createModSlotUI(mod, paramName));
        modsDiv.appendChild(createModSlotAddDel(mod, paramName));
    }
    container.append(modsDiv);
    container.appendChild(createBaseModeOptions(knobs[paramName]));
    //container.appendChild()

}
function makeDefaultModSlot() {
    return {
        sourceObj: makeSourceFromName("const"),
        transformObj: makeLinearTransform({ type: "linear", value: 0.0 }),
        mode: ModMode.BASE,
        amount: 1
    };
}
function openModOverlay(knobName) {
    const overlay = document.getElementById("modOverlay");
    overlay.classList.remove("hidden");
    overlay.dataset.knob = knobName;
    const knob = knobs[knobName];
    const mods = knob.mods;

    // 2) Wenn keine Mods existieren → einen erzeugen
    if (mods.length === 0) {
        mods.push(makeDefaultModSlot());
    }
    knob.modEnabled = true;
    document.querySelector(`[data-param="${knobName}"].mod-toggle`)?.classList.add("active");

    // 3) UI rendern
    renderModUI(knobName);
}


















/////////////////////////////////////////////////////////////////////////////
//
//               M O D U L A T I O N   -   M A I N L O O P 
//
/////////////////////////////////////////////////////////////////////////////

/*
import init, { ModCore } from "./modcore.js";

let core;
await init();
core = new ModCore();

core.init_params(knobs);

const fastEnv = makeEnv({ attack: .9, decay: .5 });
const slowEnv = makeEnv({ attack: .3, decay: 0.9 });
*/

function updateCMEditor() {
    for (const param in knobs) {

        const knob = knobs[param];

        knob.modEnabled && log("", param);

        let punchSum = 0.0;
        let baseSum = 0.0;
        let baseMod = false;

        for (const mod of knob.mods) {
            const srcVal = mod.sourceObj.update();
            const tVal = mod.transformObj.apply(srcVal);
            const value = tVal * mod.amount;

            switch (mod.mode) {
                case ModMode.BASE:
                    baseSum += value * .1;
                    baseMod = true;
                    break
                case ModMode.PUNCH:
                    punchSum += value;
                    break;
            }
            knob.modEnabled && log("", mod.sourceObj.name);

        }

        /*
        if (!slideMods) knob.slideValue = 0;
        if (!bounceMods) knob.bounceValue = 0;
*/

        if (knob.modEnabled) {
            log("#####", "");
            let liveVal = knob.liveValue;

            if (baseMod) {
                const baseMin = knob.min;
                const baseMax = knob.max;
                const baseRange = baseMax - baseMin;

                const small = baseRange * 1e-6;  // baserange ist nach unten durch die UI(min < max) begrenzt
                const smoothFkt = (x, m) => { return 1 + (knob.smooth) * Math.cos((x - baseMin) * m * pi / (baseMax - baseMin)); };

                switch (knob.mode) {

                    case BaseMode.SLIDE:
                        const smoothS = (liveVal) => smoothFkt(liveVal, 1);
                        liveVal = baseMin + fmod((liveVal - baseMin) + baseSum * smoothS(liveVal), baseRange);
                        break;

                    case BaseMode.BOUNCE:
                        const smoothB = (liveVal) => smoothFkt(liveVal, 2);
                        liveVal = liveVal + baseSum * smoothB(liveVal) * knob.bounceDir;

                        if (liveVal > baseMax) {
                            liveVal = baseMax * (1 - small);
                            knob.bounceDir = -1;
                        }
                        else if (liveVal < baseMin) {
                            liveVal = baseMin * (1 + small);
                            knob.bounceDir = 1;
                        }
                        break;
                }

                knob.liveValue = liveVal;

                // Punch zyklisch im BaseRange
                knob.cmValue = baseMin + fmod((liveVal - baseMin) + punchSum * knob.bounceDir, baseRange);
            }

            else {
                // Punch-only: clamp
                knob.cmValue = clamp(knob.liveValue + punchSum, 0, 1);
            }

            if (!knob.knobPressed) {
                const v = liveVal;
                const knob = document.querySelector(`.knob[data-param="${param}"]`);
                const angle = v * 270 - 135;      // -135° bis +135°
                knob.style.transform = `rotate(${angle}deg)`;
                knob.style.setProperty("--needle-angle", angle + "deg");

            }
        }
    }

    // 6. GPU-Pipeline aktualisieren
    device.queue.writeBuffer(cmParamsBuffer, 0, packCMParams());
    runCMComputePass();
    renderCMPreview();
    renderEditorAACurve();
    fractalRenderer.runCompute();

}




startAudioInput(({ bass, mid, tre }) => {
    window.bassBeat = bass;
    window.midBeat = mid;
    window.treBeat = tre;
    log("bassBeat", bass);
    updateCMEditor();
    dbg = false;
}).catch((error) => {
    console.error("Audio input could not be started:", error);
});


///////////////////////////////////////////////////////////
//
//          PRESETS
//
///////////////////////////////////////////////////////////

const alertPopup = document.getElementById("alertPopup");
const alertMessage = document.getElementById("alertMsg");
document.getElementById("alertBtn").onclick = () => alertPopup.classList.add("hidden");
function openAlert(msg = "") {
    alertMessage.textContent = msg
    alertPopup.classList.remove("hidden")
}

const yesNoDialog = document.getElementById("yesNoDialog");
const yesNoMessage = document.getElementById("yesNoMessage");
const yesBtn = document.getElementById("yesBtn");
const noBtn = document.getElementById("noBtn");

function openYesNo(msg) {
    return new Promise(resolve => {
        yesNoMessage.textContent = msg;
        yesNoDialog.classList.remove("hidden");

        const onYes = () => {
            cleanup();
            resolve("yes");
        };
        const onNo = () => {
            cleanup();
            resolve("no");
        };

        function cleanup() {
            yesNoDialog.classList.add("hidden");
            yesBtn.removeEventListener("click", onYes);
            noBtn.removeEventListener("click", onNo);
        }

        yesBtn.addEventListener("click", onYes);
        noBtn.addEventListener("click", onNo);
    });
}

let popupOpen = false;
function createSource(name, params) {
    //const obj = sourceRegistry[name]();
    const obj = makeSourceFromName(name);
    Object.assign(obj.params, params);
    return obj;
}
function createTransform(name, params) {
    //const obj = transformRegistry[name]();
    const obj = makeLinearTransform(.5, .5);
    Object.assign(obj.params, params);
    return obj;
}
function serializeKnobs(knobs) {
    const out = {};

    for (const key in knobs) {
        const k = knobs[key];

        out[key] = {
            liveValue: k.liveValue,
            cmValue: k.cmValue,
            modEnabled: k.modEnabled,
            knobPressed: k.knobPressed,
            mods: k.mods.map(m => ({
                amount: m.amount,
                mode: m.mode,
                source: m.sourceObj.name,      // z.B. "bassBeat", "midEnv", "const"
                sourceParams: { ...m.sourceObj.params },
                transform: m.transformObj.name, // z.B. "scale", "curve"
                transformParams: { ...m.transformObj.params },
            })),
            mode: k.mode,
            bounceDir: k.bounceDir,
            min: k.min,
            max: k.max,
            smooth: k.smooth,
        };
    }

    return out;
}
function deserializeKnobs(data) {
    const out = {};

    for (const key in data) {
        const k = data[key];

        out[key] = {
            liveValue: k.liveValue,
            cmValue: k.cmValue,
            modEnabled: k.modEnabled,
            knobPressed: k.knobPressed,

            mods: k.mods.map(m => ({
                amount: m.amount,
                mode: m.mode,

                sourceObj: createSource(m.source, m.sourceParams),
                transformObj: createTransform(m.transform, m.transformParams),
            })),

            mode: k.mode,
            bounceDir: k.bounceDir,
            min: k.min,
            max: k.max,
            smooth: k.smooth,
        };
    }

    return out;
}
//          1. Preset‑Struktur (sauber & cloud‑ready)
function buildPreset(name) {
    const fractalView = fractalRenderer.getView();
    return {
        name,
        created: Date.now(),
        cmParams: packCMParams(),
        knobs: serializeKnobs(knobs),
        fractalParams: {
            centerX: fractalView.centerX,
            centerY: fractalView.centerY,
            zoom: fractalView.zoom,
            iter: fractalView.maxIter,
        },
        audioReact: {
            bass: window.bassBeat,
            mid: window.midBeat,
            tre: window.treBeat
        },
        version: 1
    };
}
//          2. Lokales Speichern (localStorage)
function savePresetLocal(preset) {
    const presets = JSON.parse(localStorage.getItem("presets") || "[]");
    presets.push(preset);
    localStorage.setItem("presets", JSON.stringify(presets));
}
//          3. Lokales Laden (Liste anzeigen)
function loadPresetsLocal() {
    return JSON.parse(localStorage.getItem("presets") || "[]");
}
//          5. JS‑Logik für Popup
const presetPopup = document.getElementById("presetPopup");
const presetPopupTitle = document.getElementById("presetPopupTitle");
const presetSaveUI = document.getElementById("presetSaveUI");
const presetLoadUI = document.getElementById("presetLoadUI");
const presetNameInput = document.getElementById("presetNameInput");
const presetList = document.getElementById("presetList");

function closePresetPopup() {
    popupOpen = false;
    presetPopup.classList.add("hidden");
}

document.getElementById("presetCloseBtn").onclick = () => {
    presetPopup.classList.add("hidden");
    popupOpen = false;
};
//          6. Save‑Popup öffnen (Taste S)
function openPresetSavePopup() {
    popupOpen = true;
    presetPopupTitle.textContent = "Preset speichern";
    presetSaveUI.classList.remove("hidden");
    presetLoadUI.classList.add("hidden");
    presetPopup.classList.remove("hidden");
}
//          7. Load‑Popup öffnen (Taste L Liste Anzeigen)
function deletePreset(index) {
    const presets = loadPresetsLocal();
    presets.splice(index, 1);
    localStorage.setItem("presets", JSON.stringify(presets));
}

function openPresetLoadPopup() {
    popupOpen = true;

    presetPopupTitle.textContent = "Preset laden";
    presetSaveUI.classList.add("hidden");
    presetLoadUI.classList.remove("hidden");
    presetPopup.classList.remove("hidden");

    const presets = loadPresetsLocal();
    presetList.innerHTML = "";

    presets.forEach((p, idx) => {
        const li = document.createElement("li");
        li.textContent = p.name;

        // Laden
        li.onclick = () => applyPreset(p);

        // Löschen
        const del = document.createElement("button");
        del.textContent = "X";
        del.style.float = "right";
        del.onclick = (ev) => {
            ev.stopPropagation();
            deletePreset(idx);
            openPresetLoadPopup(); // reload list
        };

        li.appendChild(del);
        presetList.appendChild(li);
    });
}
//          8. Preset anwenden
function applyPreset(preset) {
    // Fractal
    fractalRenderer.setView({
        centerX: preset.fractalParams.centerX,
        centerY: preset.fractalParams.centerY,
        zoom: preset.fractalParams.zoom,
        maxIter: preset.fractalParams.iter,
    });

    // CM Editor
    //Object.assign(knobs, preset.knobs);
    Object.assign(knobs, deserializeKnobs(preset.knobs));

    presetPopup.classList.add("hidden");
    popupOpen = false;
}
// Save Preset
async function trySavePreset(name) {
    const presets = loadPresetsLocal();
    const exists = presets.some(p => p.name === name);

    if (exists) {
        const action = await openYesNo(`Preset "${name}" existiert bereits.\nOverwrite?`);
        if (action !== "yes") return;
    }

    const preset = buildPreset(name);
    savePresetLocal(preset);
    closePresetPopup();
}

//          9. Save‑Button
document.getElementById("presetSaveBtn").onclick = () => {
    const name = presetNameInput.value.trim();
    trySavePreset(name)
};

window.addEventListener("keydown", ev => {
});














/*
setInterval(() => {
    if (editor && !editorAudioReact) return;
    updateAudio();
    //applyModulation();
    //updatePalette();
    updateCMEditor();
}, 25); // 40 Hz
*/

function frame() {
    fractalRenderer.render();        // smooth 60–144 Hz
    requestAnimationFrame(frame);
}
function saveView() {
    localStorage.setItem("fractalView", JSON.stringify(fractalRenderer.getView()));
}
function loadView() {
    const view = JSON.parse(localStorage.getItem("fractalView"));
    if (!view) return;

    fractalRenderer.setView({ ...view, maxIter: 1000 });
}

const editorOverlay = document.getElementById("cmOverlay");
const editorCSS = document.getElementById("editorCSS");

const keypressed = {
    'a': false,
}

window.addEventListener("keyup", ev => {

    keypressed[ev.key] = false;
});



window.addEventListener("keydown", ev => {
    if (popupOpen) return;
    if (ev.key === "s") openPresetSavePopup();
    if (ev.key === "l") openPresetLoadPopup();
    if (ev.key === "e") {
        editorOverlay.classList.toggle("hidden");
    }
    if (ev.key === " ") {
        editor ^= 1;
        editorAudioReact ^= 1;
    }
    if (ev.key === "d") {
        dbg = true;
    }
    if (ev.key === "Escape") {
        document.getElementById("modOverlay").classList.add("hidden");
    }
});

/*
document.querySelectorAll("button").forEach(b => {
    b.classList.add("button");
});
*/

console.log("knobs:", knobs);
console.log("cmParams initial:", packCMParams());

runCMComputePass();
renderCMPreview();
renderEditorAACurve();
fractalRenderer.runCompute();      // Fraktal einmal initial berechnen
fractalRenderer.render();          // und anzeigen

loadView();
//overlay.classList.toggle("hidden");
//document.querySelector('.mod-toggle[data-param="pow-b"]').click();
//document.querySelector('.mod-toggle[data-param="phaseShift"]').click();
//openModOverlay("phaseShift");
frame();
