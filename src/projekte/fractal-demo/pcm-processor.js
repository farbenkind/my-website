class PCMProcessor extends AudioWorkletProcessor {
    process(inputs) {
        const input = inputs[0][0]; // Float32Array (128 samples)
        if (input) {
            this.port.postMessage(input);
        }
        return true;
    }
}

registerProcessor("pcm-proc", PCMProcessor);
