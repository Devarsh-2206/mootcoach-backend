class PCMProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    // Get the Float32Array from channel 0
    const inputChannel = input[0];

    // Downsample from hardware sampleRate (e.g. 48000Hz) to 16000Hz
    const ratio = sampleRate / 16000;

    if (ratio === 1) {
      // Natively at 16000Hz, just scale float to Int16
      const result = new Int16Array(inputChannel.length);
      for (let i = 0; i < inputChannel.length; i++) {
        let val = inputChannel[i];
        val = Math.max(-1, Math.min(1, val));
        result[i] = val < 0 ? val * 0x8000 : val * 0x7FFF;
      }
      this.port.postMessage(result.buffer, [result.buffer]);
    } else {
      // Downsample by decimating (taking samples at the ratio step)
      const length = Math.floor(inputChannel.length / ratio);
      const result = new Int16Array(length);
      for (let i = 0; i < length; i++) {
        const idx = Math.floor(i * ratio);
        let val = inputChannel[idx];
        val = Math.max(-1, Math.min(1, val));
        result[i] = val < 0 ? val * 0x8000 : val * 0x7FFF;
      }
      this.port.postMessage(result.buffer, [result.buffer]);
    }

    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
