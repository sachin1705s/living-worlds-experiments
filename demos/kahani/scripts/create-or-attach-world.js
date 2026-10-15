import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const appDir = path.resolve(here, "..");
const worldIdPath = path.join(appDir, ".world-id");
const chromeBinary = process.env.CHROME_BIN || "google-chrome";
const requestedPort = Number(process.env.WORLD_SCRIPT_PORT || 0);
const skipSmoke = process.argv.includes("--skip-smoke");
// --recreate is the explicit, human-triggered path to build a brand new
// world from the current (possibly revised) prompt. Without it, an existing
// .world-id always wins and is attached to — this script never silently
// creates a new world on a run that already has one, and never deletes
// .world-id on its own; --recreate only overwrites it once a fresh build
// actually succeeds.
const recreate = process.argv.includes("--recreate");

function actionErrorCode(value) {
  const text = String(value?.message || value);
  return value?.code || text.match(/\[([^\]]+)\]/)?.[1] || null;
}

function adviceFor(code) {
  return {
    TRAVELING: "End the current travel before changing worlds.",
    BUSY: "Wait for the current world action to finish, then retry.",
    NO_WORLD: "Create or attach a world before starting travel.",
    WORLD_NOT_READY: "Wait for the world build to reach ready.",
    MODE_MISMATCH: "Use the directing model to attach this world.",
    "403001": "The saved world id is stale or belongs to another account.",
    "403004": "The world prompt or instruction was rejected by the model gate.",
    "403005": "The prompt was rejected by the content gate.",
  }[code] || "Inspect the full error and retry.";
}

async function unusedPort() {
  if (requestedPort) return requestedPort;
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url, child, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`Dev server exited before startup (${child.exitCode})`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopChrome(chrome) {
  if (chrome.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (chrome.exitCode === null) chrome.kill("SIGKILL");
      resolve();
    }, 5_000);
    chrome.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    chrome.kill("SIGTERM");
  });
}

async function runBrowserSmoke(port, existingWorldId, skipSmokeRun) {
  const profile = await mkdtemp("/tmp/kahani-world-chrome-");
  const target = new URL(`http://127.0.0.1:${port}/scripts/world-smoke.html`);
  if (existingWorldId) target.searchParams.set("worldId", existingWorldId);
  if (skipSmokeRun) target.searchParams.set("skipSmoke", "1");
  const chromeArgs = [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-ui-for-media-stream",
    "--user-data-dir=" + profile,
    target.toString(),
  ];
  const chrome = spawn(chromeBinary, chromeArgs, {
    cwd: appDir,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let chromeError = null;
  let chromeStderr = "";
  chrome.once("error", (error) => {
    chromeError = error;
  });
  chrome.stderr.on("data", (chunk) => {
    chromeStderr += String(chunk);
  });
  try {
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      if (chromeError) throw chromeError;
      if (chrome.exitCode !== null) {
        throw new Error(`Chrome exited before posting a smoke result (${chrome.exitCode})`);
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/world-smoke-result`);
        if (response.ok) return await response.json();
        if (response.status !== 404) throw new Error(`Smoke result poll failed (${response.status})`);
      } catch (error) {
        if (error.message.startsWith("Smoke result poll failed")) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
    throw new Error(`Timed out waiting for the browser smoke result after 240 seconds${chromeStderr.trim() ? `: ${chromeStderr.trim().slice(-1000)}` : ""}`);
  } finally {
    await stopChrome(chrome);
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  }
}

async function main() {
  const existingWorldId = await readFile(worldIdPath, "utf8").then((value) => value.trim()).catch(() => "");
  const port = await unusedPort();
  const hmrPort = await unusedPort();
  const server = spawn(process.execPath, ["server.js", "--dev"], {
    cwd: appDir,
    env: { ...process.env, PORT: String(port), VITE_HMR_PORT: String(hmrPort) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverError = "";
  server.stderr.on("data", (chunk) => {
    serverError += String(chunk);
  });

  // --recreate forces the create path even when .world-id already holds a
  // world: pass no worldId to the browser smoke page so it builds fresh from
  // the current prompt, but never touch the on-disk file until that build
  // actually succeeds.
  const attachTarget = recreate ? "" : existingWorldId;

  try {
    await waitForServer(`http://127.0.0.1:${port}/`, server);
    if (recreate) {
      console.log(
        existingWorldId
          ? `--recreate requested; creating a fresh Kahani world from the current prompt (previous saved world ${existingWorldId} stays in .world-id unless this build succeeds)`
          : "--recreate requested; no saved world id existed, creating Kahani world",
      );
    } else {
      console.log(existingWorldId ? `Attaching to saved world ${existingWorldId}` : "No saved world id; creating Kahani world");
    }
    const result = await runBrowserSmoke(port, attachTarget, skipSmoke);
    if (result.worldId && (recreate || !existingWorldId)) {
      await writeFile(worldIdPath, `${result.worldId}\n`, "utf8");
      if (recreate && existingWorldId && result.worldId !== existingWorldId) {
        console.log(`.world-id updated: ${existingWorldId} -> ${result.worldId}`);
      }
    }
    if (!recreate && existingWorldId && result.worldId !== existingWorldId) {
      throw new Error(`Reattachment returned a different world id (${result.worldId || "missing"})`);
    }
    if (result.worldId) console.log(`World id persisted: ${result.worldId}`);
    console.log(`Smoke: travel_started=${result.travelStarted ?? false} instruction_accepted=${result.instructionAccepted ?? false} pivot_observed=${result.pivotObserved ?? false} ambience_audible=${result.ambienceAudible ?? false}`);
    if (!result.ok) {
      const error = result.code ? `${result.code}: ${result.error}` : result.error;
      console.error(`Smoke diagnostics: ${JSON.stringify({ phase: result.phase, worldPhase: result.worldPhase, sdkStatus: result.sdkStatus, events: result.events })}`);
      if (result.worldId) {
        console.error(`World ${result.worldId} is ready despite the smoke failure; it is saved in .world-id.`);
        console.error("Reattach with `npm run world:create -- --skip-smoke`, then run `npm run dev` and open http://localhost:5175/scripts/world-smoke.html?worldId=$(cat .world-id) in a real browser to retry the travel smoke.");
      }
      throw new Error(`${error || "World smoke test failed"}. ${result.advice || adviceFor(result.code)}`);
    }
    if (skipSmoke) {
      console.log("Smoke skipped. The ready world is persisted; run the browser smoke manually when WebRTC is available.");
      return;
    }
    console.log("World smoke test passed: instruction executed at a live chunk boundary and ambience audio was present.");
  } catch (error) {
    if (serverError.trim()) console.error(serverError.trim());
    const code = actionErrorCode(error);
    console.error(`World smoke test failed${code ? ` [${code}]` : ""}: ${error.message || error}`);
    console.error(adviceFor(code));
    process.exitCode = 1;
  } finally {
    if (server.exitCode === null) {
      const exited = new Promise((resolve) => server.once("exit", resolve));
      server.kill("SIGTERM");
      await exited;
    }
  }
}

await main();
