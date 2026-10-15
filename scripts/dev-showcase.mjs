import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const root = fileURLToPath(new URL("..", import.meta.url));
const environmentFile = resolve(root, ".env");
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
const services = [
  { directory: "backend", port: 3001, args: ["start"] },
  { directory: "frontend", port: 5180, args: ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5180", "--strictPort"] },
  { directory: "demos/off-season", port: 5191, args: ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "5191"] },
  { directory: "demos/news-studio", port: 5192, args: ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "5192"] },
];

for (const { port } of services) {
  await new Promise((accept, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`Port ${port} is occupied. Stop the existing showcase server before running npm run dev.`)));
    server.listen(port, "127.0.0.1", () => server.close(accept));
  });
}

const children = [];
let ending = false;
function shutdown(code = 0) {
  if (ending) return;
  ending = true;
  for (const child of children) {
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
  }
  process.exitCode = code;
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
for (const service of services) {
  const child = spawn("npm", service.args, { cwd: resolve(root, service.directory), stdio: "inherit", detached: true, env: process.env });
  children.push(child);
  child.on("error", (error) => { console.error(error.message); shutdown(1); });
  child.on("exit", (code) => { if (!ending) shutdown(code || 1); });
}
console.log("Worlds showcase: http://127.0.0.1:5180/showcase.html");
