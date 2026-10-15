const slide = { id: 'einstein-lab' };
const EXPLAIN_QUESTIONS: Array<{ label: string; prompt: string }> = [
    { label: 'Gravity', prompt: 'Explain gravity to me using a falling apple and a trampoline.' },
    { label: 'Light', prompt: 'Explain what light is and why nothing goes faster, with a beam of light.' },
    { label: 'Time', prompt: 'Explain why time can run slower, using a ticking clock and a rocket.' },
    { label: 'Atoms', prompt: 'Explain what an atom is made of, showing me an atom.' },
    { label: 'Waves', prompt: 'Explain what a wave is and why light is one, showing me a wave.' },
    { label: 'Magnets', prompt: 'Explain how a magnet pulls without touching, with a magnet.' },
    { label: 'Mass', prompt: 'Explain what mass really is, using a heavy ball.' },
    { label: 'Stars', prompt: 'Explain how we know what stars are made of, with a telescope.' },
  ];
function pcmToWav(pcm: ArrayBuffer, sampleRate: number, channels: number, bitDepth: number): ArrayBuffer {
  const dataLen = pcm.byteLength;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const str = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true);
  str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * bitDepth / 8, true);
  v.setUint16(32, channels * bitDepth / 8, true); v.setUint16(34, bitDepth, true);
  str(36, 'data'); v.setUint32(40, dataLen, true);
  new Uint8Array(buf, 44).set(new Uint8Array(pcm));
  return buf;
}
const glPropDescription = (obj: string) => {
    if (/rocket/i.test(obj)) return 'a small toy model rocket prop';
    if (/atom/i.test(obj)) return 'a small glowing atom model prop';
    if (/wave/i.test(obj)) return 'a simple wave model prop';
    return obj;
  };

  /** Joins props into prose: "the apple, the clock and the magnet". */
  const glListProps = (objs: string[]) => {
    const named = objs.map((o) => glPropDescription(o).replace(/^(a|an|the)\s+/i, 'the '));
    return named.length <= 1 ? named.join('') : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
  };
const reactorIdentityAnchor = () => {
    if (slide.id === 'einstein-lab' || slide.id === 'einstein') {
      return (
        'Albert Einstein from the reference image exactly, an elderly man with wild white hair, ' +
        'white moustache, gray sweater, same face, same age, same body, same outfit, same classroom background'
      );
    }
    return 'The same character from the reference image exactly, same face, age, body, outfit, colors and background';
  };

  const buildReactorInteractPrompt = (instruction: string) => (
    `${reactorIdentityAnchor()} remains the only person on screen. ${instruction.trim()} ` +
    'Do not change the character into another person. Do not change the character age, face, hair, body, outfit, or setting.'
  );
export { EXPLAIN_QUESTIONS, pcmToWav, glListProps, buildReactorInteractPrompt };

