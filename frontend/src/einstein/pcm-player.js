// Schedule PCM as it arrives, retaining a copy for the replay control.
export class PcmPlayer {
  context = null;
  sources = new Set();
  generation = 0;
  nextTime = 0;

  unlock() {
    this.context ??= new AudioContext();
    return this.context.resume();
  }

  get isPlaying() { return this.sources.size > 0; }

  stop() {
    this.generation += 1;
    for (const source of this.sources) source.stop();
    this.sources.clear();
    this.nextTime = 0;
  }

  async play(response, signal) {
    const generation = this.generation;
    const rate = Number(response.headers.get('x-sample-rate') || 24000);
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    let pending = new Uint8Array();
    const cancel = () => { this.stop(); void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
      while (true) {
        const { value, done } = await reader.read();
        if (signal.aborted || generation !== this.generation) throw new DOMException('Stopped', 'AbortError');
        if (done) break;
        chunks.push(value);
        total += value.length;
        const bytes = new Uint8Array(pending.length + value.length);
        bytes.set(pending);
        bytes.set(value, pending.length);
        const samples = Math.floor(bytes.length / 2);
        pending = bytes.slice(samples * 2);
        if (!samples) continue;
        const buffer = this.context.createBuffer(1, samples, rate);
        const floats = buffer.getChannelData(0);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < samples; i++) floats[i] = view.getInt16(i * 2, true) / 32768;
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.context.destination);
        source.onended = () => { this.sources.delete(source); source.disconnect(); };
        this.sources.add(source);
        const at = Math.max(this.nextTime, this.context.currentTime + 0.04);
        source.start(at);
        this.nextTime = at + buffer.duration;
      }
      if (!total || pending.length) throw new Error('Incomplete speech audio. Please try again.');
      const audio = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { audio.set(chunk, offset); offset += chunk.length; }
      return audio.buffer;
    } catch (error) {
      if (generation === this.generation) this.stop();
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      signal.removeEventListener('abort', cancel);
      reader.releaseLock();
    }
  }
}
