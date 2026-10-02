import init, { update_audio, get_beats } from "./modcore.js";

export async function startAudioInput(onBeatUpdate) {
    await init();

    const audioContext = new AudioContext();
    await audioContext.audioWorklet.addModule(new URL("./pcm-processor.js", import.meta.url));

    const pcmNode = new AudioWorkletNode(audioContext, "pcm-proc");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mic = audioContext.createMediaStreamSource(stream);
    mic.connect(pcmNode);
    pcmNode.connect(audioContext.destination);

    // Browser starten den AudioContext oft erst nach einer Benutzeraktion
    const resume = () => { if (audioContext.state !== "running") audioContext.resume(); };
    resume();
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);

    pcmNode.port.onmessage = (event) => {
        update_audio(event.data);
    };

    setInterval(() => {
        onBeatUpdate(get_beats());
    }, 25);
}