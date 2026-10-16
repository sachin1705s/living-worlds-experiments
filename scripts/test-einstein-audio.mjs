import test from 'node:test';
import assert from 'node:assert/strict';
import { PcmPlayer } from '../frontend/src/einstein/pcm-player.js';

class AudioContextMock {
  currentTime = 0;
  destination = {};
  played = [];
  resume() { return Promise.resolve(); }
  createBuffer(_, samples, rate) {
    const data = new Float32Array(samples);
    return { duration: samples / rate, getChannelData: () => data };
  }
  createBufferSource() {
    const source = {
      connect() {}, disconnect() {},
      start: (at) => { source.at = at; this.played.push(source); },
      stop: () => { source.stopped = true; source.onended?.(); },
    };
    return source;
  }
}
globalThis.AudioContext = AudioContextMock;
const tick = () => new Promise(resolve => setImmediate(resolve));

test('plays before response ends, preserves split samples and schedules ordered chunks', async () => {
  const player = new PcmPlayer();
  await player.unlock();
  let stream;
  const response = new Response(new ReadableStream({ start(c) { stream = c; } }));
  const playing = player.play(response, new AbortController().signal);
  stream.enqueue(new Uint8Array([0, 128, 255]));
  await tick();
  assert.equal(player.context.played.length, 1);
  assert.equal(player.context.played[0].buffer.getChannelData(0)[0], -1);
  stream.enqueue(new Uint8Array([127, 0, 0]));
  await tick();
  assert.equal(player.context.played.length, 2);
  assert.equal(player.context.played[1].buffer.getChannelData(0)[0], 32767 / 32768);
  assert.ok(player.context.played[1].at >= player.context.played[0].at + 1 / 24000);
  stream.close();
  assert.deepEqual([...new Uint8Array(await playing)], [0, 128, 255, 127, 0, 0]);
  player.stop();
  assert.equal(player.isPlaying, false);
});

test('aborting stops queued audio and cancels the response reader', async () => {
  const player = new PcmPlayer();
  await player.unlock();
  let canceled = false;
  const response = new Response(new ReadableStream({
    start(c) { c.enqueue(new Uint8Array([0, 0])); },
    cancel() { canceled = true; },
  }));
  const abort = new AbortController();
  const playing = player.play(response, abort.signal);
  const rejected = assert.rejects(playing, { name: 'AbortError' });
  await tick();
  abort.abort();
  await rejected;
  assert.equal(canceled, true);
  assert.equal(player.context.played[0].stopped, true);
  assert.equal(player.isPlaying, false);
});

test('rejects empty or truncated PCM instead of presenting broken replay audio', async () => {
  for (const bytes of [[], [0]]) {
    const player = new PcmPlayer();
    await player.unlock();
    await assert.rejects(player.play(new Response(new Uint8Array(bytes)), new AbortController().signal), /Incomplete/);
    assert.equal(player.isPlaying, false);
  }
});
