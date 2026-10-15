/**
 * AliRTC's remote playout is separate from the HTMLMediaElement that carries
 * the video. In audio-context playout mode the SDK routes the remote track
 * through its own gain node, so `.muted` and `.volume` on the detached audio
 * element are not sufficient to control the audible output.
 */
export function setAliRtcRemoteAudioVolume(engine, target) {
  const volume = Number.isFinite(target) ? Math.max(0, Math.min(1, target)) : 0;
  engine.setPlayoutVolume(Math.round(volume * 100));
}
