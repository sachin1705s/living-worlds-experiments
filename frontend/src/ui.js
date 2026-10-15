export function showFlash() {
  document.getElementById("portal-flash")?.classList.add("visible");
}

export function hideFlash() {
  document.getElementById("portal-flash")?.classList.remove("visible");
}

export function setWorldLabel(name) {
  const el = document.getElementById("world-label");
  if (!el) return;
  el.textContent = name;
  el.classList.add("visible");
}

export function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

export function setHint(html) {
  const el = document.getElementById("controls-hint");
  if (el) el.innerHTML = html;
}
