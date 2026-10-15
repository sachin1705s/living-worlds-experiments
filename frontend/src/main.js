import "./style.css";
import { initSession, onState, loadInitialWorld, preloadSeedImages } from "./reactor.js";
import { bindControls } from "./controls.js";
import { AppState } from "./state.js";
import { WORLDS } from "./worlds.js";
import { setWorldLabel, setStatus, setHint, hideFlash, showFlash } from "./ui.js";

async function main() {
  const video = document.getElementById("world-video");
  showFlash();
  setStatus("Connecting…");

  onState((s) => {
    AppState.running = !!s.running;
    AppState.currentChunk = s.current_chunk ?? 0;
  });

  await initSession(video);
  setStatus("Preloading drawings…");
  await preloadSeedImages();
  setStatus("Staging the museum…");

  const museum = WORLDS.MUSEUM;
  await loadInitialWorld(museum);
  AppState.current = museum.id;
  setWorldLabel(museum.name);

  bindControls();
  setHint(
    "WASD &mdash; Move &nbsp;&middot;&nbsp; Arrows &mdash; Look &nbsp;&middot;&nbsp; 1 / 2 &mdash; Add to the world"
  );

  // Wait for the very first chunk to actually stream before lifting the flash.
  const waitFirstFrame = setInterval(() => {
    if (AppState.running) {
      setStatus("");
      setTimeout(hideFlash, 400);
      clearInterval(waitFirstFrame);
    }
  }, 100);
}

main().catch((e) => {
  console.error(e);
  setStatus(`error: ${e.message}`);
});
