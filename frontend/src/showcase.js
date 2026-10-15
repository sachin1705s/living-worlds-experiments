import "./showcase.css";

const dialog = document.getElementById("demo-dialog");
const content = document.getElementById("demo-content");
const globalStatus = document.getElementById("global-status");
let stopping = null;
const localApp = (port) => `${location.protocol}//${location.hostname}:${port}/`;
const demos = {
  drawing: { title: "Drawing to live", provider: "01 / REACTOR · LINGBOT", src: "/playground.html", notice: "Upload a drawing. Explore its world." },
  visco: { title: "Einstein’s Chalkboard", provider: "02 / REACTOR · VISKO ORBIS", src: "/einstein.html", notice: "Ask Einstein anything." },
  roast: { title: "Tech Roast", provider: "03 / REACTOR · VIDU S2-AVATAR", src: "/roast.html", notice: "" },
  stylized: { title: "Stylized Worlds", provider: "04 / REACTOR · SANA-STREAMING", src: "/stylized.html", notice: "" },
  drip: { title: "Check Your Drip", provider: "05 / REACTOR · VIDU S2-EDITING", src: "/drip.html", notice: "" },
  offseason: { title: "Off Season", provider: "06 / REACTOR · FASTH3", src: import.meta.env.VITE_OFF_SEASON_URL || (import.meta.env.PROD ? "https://worlds-experiments-offseason.vercel.app/" : localApp(5191)), notice: "Follow the clues. Solve the case." },
  news: { title: "News Studio", provider: "07 / REACTOR · FASTH3", src: import.meta.env.VITE_NEWS_STUDIO_URL || (import.meta.env.PROD ? "https://worlds-experiments-news.vercel.app/" : localApp(5192)), notice: "Your own live news channel." },
  dance: { title: "Vidu Dance Game", provider: "08 / REACTOR · VIDU S2-EDITING", src: "/dance.html", notice: "" },
};

function stopSessions() {
  if (stopping) return stopping;
  const frame = content.querySelector("iframe");
  if (!frame?.contentWindow) {
    globalStatus.textContent = "No active demo.";
    return Promise.resolve(true);
  }
  globalStatus.textContent = "Stopping the active demo…";
  const frameOrigin = new URL(frame.src, location.href).origin;
  stopping = new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const finish = (error) => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      globalStatus.textContent = error || "Demo stopped.";
      resolve(!error);
    };
    const timer = setTimeout(() => finish("Stop was not confirmed. Try Back again to stop the session."), 30000);
    function receive(event) {
      if (event.origin !== frameOrigin || event.source !== frame.contentWindow || event.data?.requestId !== requestId) return;
      finish(event.data.error);
    }
    window.addEventListener("message", receive);
    frame.contentWindow.postMessage({ type: "showcase-stop", requestId }, frameOrigin);
  }).finally(() => { stopping = null; });
  return stopping;
}

async function closeDemo({ fromHistory = false } = {}) {
  if (await stopSessions()) {
    dialog.close();
    content.replaceChildren();
    if (!fromHistory && history.state?.showcaseDemo) history.back();
  }
}
document.getElementById("close-demo").addEventListener("click", () => { void closeDemo(); });
dialog.addEventListener("cancel", (event) => { event.preventDefault(); void closeDemo(); });
document.querySelectorAll("[data-demo]").forEach((button) => {
  button.addEventListener("click", () => {
    if (dialog.open || stopping) return;
    const demo = demos[button.dataset.demo];
    document.getElementById("demo-title").textContent = demo.title;
    document.getElementById("demo-provider").textContent = demo.provider;
    globalStatus.textContent = "";
    const notice = document.createElement("p");
    notice.className = "notice";
    notice.textContent = demo.notice;
    const frame = document.createElement("iframe");
    frame.className = "demo-frame";
    frame.title = demo.title;
    frame.allow = "camera; autoplay; fullscreen";
    frame.src = demo.src;
    content.replaceChildren(...(demo.notice ? [notice, frame] : [frame]));
    dialog.showModal();
    history.pushState({ showcaseDemo: button.dataset.demo }, "", location.href);
  });
});

window.addEventListener("popstate", () => { if (dialog.open) void closeDemo({ fromHistory: true }); });
window.addEventListener("message", (event) => {
  const frame = content.querySelector("iframe");
  if (frame && event.source === frame.contentWindow && event.origin === new URL(frame.src).origin && event.data?.type === "showcase-back") void closeDemo();
});
