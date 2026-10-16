import "./showcase.css";

const dialog = document.getElementById("demo-dialog");
const content = document.getElementById("demo-content");
let stopping = null;
const localApp = (port) => `${location.protocol}//${location.hostname}:${port}/`;
const demos = {
  drawing: { title: "Drawing to live", provider: "01 / REACTOR · LINGBOT + HELIOS", src: "/playground.html", notice: "Upload a drawing. Step inside it, or make it come to life." },
  visco: { title: "Einstein’s Chalkboard", provider: "02 / REACTOR · VISKO ORBIS", src: "/einstein.html", notice: "Ask Einstein anything." },
  roast: { title: "Tech Roast", provider: "03 / REACTOR · VIDU S2-AVATAR", src: "/roast.html", notice: "" },
  stylized: { title: "Stylized Worlds", provider: "04 / REACTOR · SANA-STREAMING", src: "/stylized.html", notice: "" },
  drip: { title: "Check Your Drip", provider: "05 / REACTOR · VIDU S2-EDITING", src: "/drip.html", notice: "" },
  news: { title: "News Studio", provider: "06 / REACTOR · FASTH3", src: import.meta.env.VITE_NEWS_STUDIO_URL || (import.meta.env.PROD ? "https://worlds-experiments-news.vercel.app/" : localApp(5192)), notice: "Your own live news channel." },
  kahani: { title: "Kahani", provider: "07 / REACTOR · HAPPY OYSTER", src: import.meta.env.VITE_KAHANI_URL || (import.meta.env.PROD ? "https://worlds-experiments-kahani.vercel.app/" : localApp(5193)), notice: "Tell the rabbit what to do." },
};

function stopFrame(frame) {
  if (stopping) return stopping;
  if (!frame?.contentWindow) return Promise.resolve();
  const frameOrigin = new URL(frame.src, location.href).origin;
  stopping = new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const finish = () => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      resolve();
    };
    // Leave even if the demo never confirms. A missed ack used to keep the
    // dialog open, so Back looked like it did nothing.
    const timer = setTimeout(finish, 1500);
    function receive(event) {
      if (event.origin !== frameOrigin || event.source !== frame.contentWindow || event.data?.requestId !== requestId) return;
      finish();
    }
    window.addEventListener("message", receive);
    frame.contentWindow.postMessage({ type: "showcase-stop", requestId }, frameOrigin);
  }).finally(() => { stopping = null; });
  return stopping;
}

function closeDemo({ fromHistory = false } = {}) {
  const frame = content.querySelector("iframe");
  dialog.close();
  if (!fromHistory && history.state?.showcaseDemo) history.back();
  void stopFrame(frame).finally(() => {
    frame?.remove();
    if (!dialog.open) content.replaceChildren();
  });
}
document.getElementById("close-demo").addEventListener("click", () => { void closeDemo(); });
dialog.addEventListener("cancel", (event) => { event.preventDefault(); void closeDemo(); });
document.querySelectorAll("[data-demo]").forEach((button) => {
  button.addEventListener("click", () => {
    if (dialog.open) return;
    const demo = demos[button.dataset.demo];
    document.getElementById("demo-title").textContent = demo.title;
    document.getElementById("demo-provider").textContent = demo.provider;
    const frame = document.createElement("iframe");
    frame.className = "demo-frame";
    frame.title = demo.title;
    frame.allow = "camera; microphone; autoplay; fullscreen";
    frame.src = demo.src;
    content.replaceChildren(frame);
    dialog.showModal();
    history.pushState({ showcaseDemo: button.dataset.demo }, "", location.href);
  });
});

window.addEventListener("popstate", () => { if (dialog.open) void closeDemo({ fromHistory: true }); });
window.addEventListener("message", (event) => {
  const frame = content.querySelector("iframe");
  if (frame && event.source === frame.contentWindow && event.origin === new URL(frame.src).origin && event.data?.type === "showcase-back") void closeDemo();
});
