const songs = [
  { title: "I Love You Baby — Heath Ledger", src: "/dance-music/i-love-you-baby.mp3" },
  { title: "Uptown Funk — Mark Ronson ft. Bruno Mars", src: "/dance-music/uptown-funk.mp3" },
  { title: "Move (feat. Camila Cabello) — Adam Port, Stryv, Malachiii, Orso", src: "/dance-music/move.m4a" },
];

export function setupDanceMedia() {
  const element = (id) => document.getElementById(id);
  const music = element("music");
  const output = element("output");
  const recordButton = element("record");
  const recordStatus = element("record-status");
  const download = element("download-recording");
  const preview = element("recording-preview");
  const resume = element("resume-music");
  const musicStatus = element("music-status");
  let context = null;
  let destination = null;
  let live = false;
  let started = false;
  let epoch = 0;
  let recorder = null;
  let recordingStream = null;
  let recordingDone = null;
  let recordedUrl = null;
  let preparing = false;
  let elapsedTimer = null;
  let song = null;
  const canRecord = typeof MediaRecorder !== "undefined" && !!(window.AudioContext || window.webkitAudioContext);

  function updateButton() {
    const track = output.srcObject?.getVideoTracks()[0];
    recordButton.disabled = !canRecord || preparing || (!recorder && (!live || output.readyState < 2 || track?.readyState !== "live"));
  }

  function prepareAudio() {
    if (!context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return Promise.resolve();
      context = new AudioContextClass();
      const source = context.createMediaElementSource(music);
      destination = context.createMediaStreamDestination();
      source.connect(context.destination);
      source.connect(destination);
    }
    return context.resume();
  }

  async function playMusic() {
    const attempt = epoch;
    try {
      await prepareAudio();
      if (!live || attempt !== epoch) return;
      await music.play();
      if (!live || attempt !== epoch) { music.pause(); return; }
      resume.hidden = true;
      musicStatus.textContent = "Playing your stream’s soundtrack. Pause or adjust volume in the player.";
    } catch {
      if (attempt !== epoch || !live) return;
      resume.hidden = false;
      musicStatus.textContent = "Your browser blocked automatic audio. Tap Play soundtrack to start this same song.";
    }
  }

  function maybeStartMusic() {
    updateButton();
    if (!live || started || output.readyState < 2 || !song) return;
    started = true;
    void playMusic();
  }

  function beginSession() {
    epoch += 1;
    live = false;
    started = false;
    preview.pause();
    music.pause();
    song = songs[Math.floor(Math.random() * songs.length)];
    music.src = song.src;
    music.load();
    element("song-name").textContent = song.title;
    resume.hidden = true;
    musicStatus.textContent = "Soundtrack selected. Waiting for the live picture…";
    try { void prepareAudio().catch(() => {}); } catch {}
    updateButton();
  }

  function finishRecording() {
    if (!recorder) return Promise.resolve();
    recordButton.disabled = true;
    if (recorder.state !== "inactive") {
      recordStatus.textContent = "Saving recording…";
      recorder.stop();
    }
    return recordingDone;
  }

  async function startRecording() {
    const attempt = epoch;
    preparing = true;
    updateButton();
    try {
      await prepareAudio();
      if (!live || attempt !== epoch) return;
      const track = output.srcObject?.getVideoTracks()[0];
      if (track?.readyState !== "live" || !destination) throw new Error("Wait for the generated video before recording.");
      recordingStream = new MediaStream([track.clone(), ...destination.stream.getAudioTracks().map((audioTrack) => audioTrack.clone())]);
      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const active = new MediaRecorder(recordingStream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 4000000 });
      const chunks = [];
      let failed = false;
      let complete;
      recordingDone = new Promise((resolve) => { complete = resolve; });
      recorder = active;
      active.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      active.onerror = () => { failed = true; recordStatus.textContent = "Recording interrupted. Saving any captured footage…"; };
      active.onstop = () => {
        clearInterval(elapsedTimer);
        recordingStream?.getTracks().forEach((streamTrack) => streamTrack.stop());
        recordingStream = null;
        recorder = null;
        if (chunks.length) {
          const type = active.mimeType || chunks[0].type || "video/webm";
          const blob = new Blob(chunks, { type });
          preview.pause();
          if (recordedUrl) URL.revokeObjectURL(recordedUrl);
          recordedUrl = URL.createObjectURL(blob);
          download.href = recordedUrl;
          download.download = `vidu-dance-${new Date().toISOString().replace(/[:.]/g, "-")}.${type.includes("mp4") ? "mp4" : "webm"}`;
          download.hidden = false;
          preview.src = recordedUrl;
          preview.hidden = false;
          recordStatus.textContent = `${failed ? "Partial recording" : "Recording"} saved in this tab (${(blob.size / 1024 / 1024).toFixed(1)} MB). Download it before closing.`;
        } else {
          recordStatus.textContent = "No video was captured. Wait for the stream and try recording again.";
        }
        recordButton.textContent = "● Record dance";
        updateButton();
        complete();
      };
      active.start(1000);
      preview.pause();
      const began = Date.now();
      const updateElapsed = () => { recordStatus.textContent = `Recording ${Math.floor((Date.now() - began) / 1000)}s · character video + soundtrack${music.paused ? " (music paused)" : ""}`; };
      updateElapsed();
      elapsedTimer = setInterval(updateElapsed, 1000);
      recordButton.textContent = "■ Stop & save recording";
    } catch (error) {
      recorder = null;
      recordingStream?.getTracks().forEach((track) => track.stop());
      recordingStream = null;
      recordStatus.textContent = `Could not record: ${error.message}`;
    } finally {
      preparing = false;
      updateButton();
    }
  }

  async function stop() {
    epoch += 1;
    live = false;
    preview.pause();
    music.pause();
    resume.hidden = true;
    musicStatus.textContent = "Soundtrack stopped. The next stream gets a new random pick.";
    updateButton();
    await finishRecording();
  }

  output.addEventListener("playing", maybeStartMusic);
  output.addEventListener("loadeddata", maybeStartMusic);
  resume.addEventListener("click", () => { void playMusic(); });
  music.addEventListener("play", () => {
    if (!live) { music.pause(); return; }
    try { void prepareAudio().catch(() => {}); } catch {}
  });
  music.addEventListener("error", () => { musicStatus.textContent = "This soundtrack could not load. Retry play; the song won’t switch during this stream."; });
  recordButton.addEventListener("click", () => {
    if (recorder) void finishRecording();
    else if (live && !preparing) void startRecording();
  });
  if (!canRecord) recordStatus.textContent = "Recording is unavailable in this browser. Try a current Chrome, Edge, Firefox, or Safari.";
  window.addEventListener("pagehide", () => {
    void stop();
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    if (context) void context.close().catch(() => {});
  });
  return { beginSession, setLive(value) { live = value; maybeStartMusic(); }, stop };
}
