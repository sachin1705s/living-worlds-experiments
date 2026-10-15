export function attachVideoTrack(video, track) {
  if (track?.kind !== "video") return;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([track]);
  const play = () => {
    video.play().catch(() => {
      video.controls = true;
    });
  };
  video.onloadedmetadata = play;
  track.onunmute = play;
  play();
}

export function waitUntilReady(session, signal, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      clearInterval(poll);
      session.off("statusChanged", onStatus);
      session.off("error", onError);
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onStatus = (status) => {
      if (status === "ready") finish();
      else if (status === "disconnected") finish(new Error("Reactor disconnected before it was ready"));
    };
    const onError = (error) => finish(new Error(error.message || "Reactor connection failed"));
    const onAbort = () => finish(new Error("Session stopped"));
    const timer = setTimeout(() => finish(new Error("Reactor did not become ready. Please reconnect.")), timeoutMs);
    const poll = setInterval(() => onStatus(session.getStatus()), 250);
    session.on("statusChanged", onStatus);
    session.on("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    else onStatus(session.getStatus());
  });
}
