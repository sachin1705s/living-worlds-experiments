/**
 * Per-model adapters for the Reactor streaming layer.
 *
 * Reactor models do not share a command schema. The two this app can run on
 * differ in ways that matter at the call site, so the differences live here
 * rather than as `if (model === …)` scattered through the service:
 *
 * | | Helios | Visko Orbis |
 * |---|---|---|
 * | conditioning | `set_conditioning` (prompt+image, atomic) | `set_image` then `set_prompt`, in that order |
 * | audio | none | `main_audio` track, generated from `set_audio_prompt` |
 * | delivery size | `set_sr_scale` (`off`/`2x`/`4x`) | `set_resolution` from `state.available_resolutions` |
 * | run length | unbounded | ~229 chunks (~7 min), then `generation_complete` → WAITING |
 *
 * The last row is the one that bites: on Visko a run ENDS on its own. The
 * service reports that as a stream end so the app's existing auto-restart path
 * picks it up, which is the behaviour the app already had for Odyssey.
 */

export type ReactorModelId = 'helios' | 'visko-orbis-stable' | 'visko-orbis-dynamic';

/** What an adapter is handed to talk to the session. */
export interface ModelContext {
  /** Sends a command, throwing if the session is not `ready`. Note that a
   *  model-side rejection does NOT reject this promise — it arrives as a
   *  broadcast `command_error`. */
  command: (name: string, data: Record<string, unknown>) => Promise<unknown>;
  uploadFile: (file: File | Blob, name?: string) => Promise<unknown>;
  /** Resolves on the next broadcast message of `type`. */
  waitForBroadcast: (type: string, timeoutMs?: number) => Promise<unknown>;
  /** Latest `state` snapshot the model has broadcast, if any. */
  getState: () => Record<string, unknown> | null;
  /** Optional startup timing hook for command-level latency debugging. */
  mark?: (stage: string, data?: Record<string, unknown>) => void;
}

export interface StartOptions {
  prompt: string;
  image?: File | Blob;
  /** Visko only — the sound description. Ignored by models without audio. */
  audioPrompt?: string;
  /** Visko only — generate sound at all. Default OFF: the characters speak
   *  through Gemini/TTS, and the model's picture-driven audio fights that.
   *  Off also skips the audio model, so each chunk is cheaper. */
  audio?: boolean;
}

/** Build-time switch to hear the model's own audio (debugging, demos). */
export const MODEL_AUDIO_ENABLED = import.meta.env.VITE_REACTOR_AUDIO === 'on';

export interface ReactorModelAdapter {
  id: ReactorModelId;
  /** Namespaced slug for `new Reactor({ modelName })` and for the token's
   *  model match. The bare form only appears in the pricing catalog. */
  slug: string;
  label: string;
  /** Whether the model publishes a `main_audio` track. */
  hasAudio: boolean;
  /** Broadcast message types that mean the current run is over. */
  runEndMessages: string[];
  /** Stage conditioning and begin generation. */
  start: (ctx: ModelContext, options: StartOptions) => Promise<void>;
  /** Live prompt steering mid-run. */
  steer: (ctx: ModelContext, prompt: string) => Promise<void>;
}

/** Delivery tiers we'd accept from Visko, best first. The offered list is
 *  per-deployment, so this is a preference order, never a hard-coded value. */
const PREFERRED_RESOLUTIONS = ['1080p', '2k', '4k'];

/** Visko's generation canvas. The reference is resized to exactly this with
 *  NO crop, so anything that isn't 16:9 arrives squashed. */
const VISKO_W = 832;
const VISKO_H = 480;

/**
 * Fits an image onto Visko's 16:9 canvas without distorting it. The
 * character portraits are tall; sent as-is, Visko stretches them to 832×480
 * and the face goes wide. Behind the contained image sits a blurred,
 * cover-scaled copy of itself, so the bars read as set dressing rather than
 * black borders and the model has something coherent to grow the scene from.
 * The output is always 832×480 so startup avoids uploading oversized references.
 */
async function fitTo16x9(file: File | Blob): Promise<File | Blob> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const target = VISKO_W / VISKO_H;
  const ratio = bitmap.width / bitmap.height;
  if (bitmap.width === VISKO_W && bitmap.height === VISKO_H) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = VISKO_W;
  canvas.height = VISKO_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); return file; }

  if (Math.abs(ratio - target) < 0.08) {
    // Near-16:9: crop a few pixels to exact 16:9, then downscale to model size.
    let cw = bitmap.width;
    let ch = bitmap.height;
    if (ratio > target) cw = Math.round(bitmap.height * target); else ch = Math.round(bitmap.width / target);
    ctx.drawImage(bitmap, (bitmap.width - cw) / 2, (bitmap.height - ch) / 2, cw, ch, 0, 0, VISKO_W, VISKO_H);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return blob ? new File([blob], 'reference-832x480.jpg', { type: 'image/jpeg' }) : file;
  }

  // Background: cover-scaled, heavily blurred, slightly darkened.
  const coverScale = Math.max(VISKO_W / bitmap.width, VISKO_H / bitmap.height);
  const bw = bitmap.width * coverScale;
  const bh = bitmap.height * coverScale;
  ctx.filter = 'blur(8px) brightness(0.85)';
  ctx.drawImage(bitmap, (VISKO_W - bw) / 2, (VISKO_H - bh) / 2, bw, bh);
  ctx.filter = 'none';

  // Foreground: contained, centred, undistorted.
  const containScale = Math.min(VISKO_W / bitmap.width, VISKO_H / bitmap.height);
  const fw = bitmap.width * containScale;
  const fh = bitmap.height * containScale;
  ctx.drawImage(bitmap, (VISKO_W - fw) / 2, (VISKO_H - fh) / 2, fw, fh);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) return file;
  const name = file instanceof File ? file.name.replace(/\.[^.]+$/, '') + '-832x480.jpg' : 'reference-832x480.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}

const helios: ReactorModelAdapter = {
  id: 'helios',
  slug: 'reactor/helios',
  label: 'Helios',
  hasAudio: false,
  // Helios streams until it is told to stop; nothing ends a run on its own.
  runEndMessages: ['generation_stopped', 'generation_paused'],

  async start(ctx, { prompt, image }) {
    // `conditions_ready` must be awaited before `start`: `await sendCommand()`
    // confirms the send, not the model-side processing, so a `start` sent
    // straight after conditioning overtakes it and is rejected with
    // "No prompt set. Call set_prompt first."
    const ready = ctx.waitForBroadcast('conditions_ready');

    if (image) {
      // The atomic form. Sending set_image and set_prompt separately before
      // start races, and the image lands a chunk late.
      ctx.mark?.('reactor_upload_start');
      const ref = await ctx.uploadFile(image, 'conditioning');
      ctx.mark?.('reactor_upload_done');
      ctx.mark?.('reactor_conditioning_start');
      await ctx.command('set_conditioning', { prompt, image: ref });
    } else {
      ctx.mark?.('reactor_prompt_start');
      await ctx.command('set_prompt', { prompt });
    }

    ctx.mark?.('reactor_conditions_wait_start');
    await ready;
    ctx.mark?.('reactor_conditions_ready');
    ctx.mark?.('reactor_start_command');
    await ctx.command('start', {});
  },

  async steer(ctx, prompt) {
    await ctx.command('set_prompt', { prompt });
  },
};

/**
 * Visko reads the prompt as the scene (WHO + WHAT + WHERE + camera) and the
 * reference image only pins the first chunk. The character prompts in this app
 * are Odyssey-era one-liners — literally "Animate it" — which under Visko
 * leaves the model free to reinvent the character within a few chunks. So a
 * short or instruction-shaped prompt is wrapped in an identity anchor that
 * spends the words on what must NOT change. Long, descriptive prompts are
 * assumed to be authored for this model and pass through.
 */
const GENERIC_PROMPT = /^(animate( it)?|start|go|begin|play|talk|speak|hello)\.?$/i;
/**
 * Visko's prompt guide, in short: WHO does WHAT at WHERE plus a camera line;
 * 1–3 sentences under ~100 words; physical nouns and verbs, never adjectives
 * of intent; and for camera, NAME THE CONTROL — "static camera", "medium
 * shot" — rather than listing what not to do. A pile of "no zoom, no pan"
 * is exactly the intent-adjective form it says the model doesn't render, and
 * was costing most of the word budget besides. Follow-up prompts should say
 * only what visibly changes; everything else is preserved by default.
 */
const CAMERA = 'Medium shot, eye-level, static camera, deep depth of field.';

const anchorStart = (prompt: string) => {
  if (prompt.length > 120 && !GENERIC_PROMPT.test(prompt)) return `${prompt} ${CAMERA}`;
  const intent = GENERIC_PROMPT.test(prompt)
    ? 'looks at the camera, breathing, blinking, making small natural gestures'
    : prompt;
  return (
    `The character from the reference image, exactly as shown — same face, fur or skin, outfit ` +
    `and colours — stands in the same setting and ${intent}. The whole character stays in frame. ` +
    `${CAMERA} Polished 3D animated film style.`
  );
};

/** Steers describe only the change. The camera line rides along because a
 *  new action is the moment the model is most tempted to reframe. */
const anchorSteer = (prompt: string) => `${prompt.replace(/\.?\s*$/, '')}. Static camera, same framing.`;

const makeVisko = (id: ReactorModelId, slug: string, label: string): ReactorModelAdapter => ({
  id,
  slug,
  label,
  hasAudio: true,
  // A Visko run is finite: it stops itself at max_chunks and returns the
  // session to WAITING. Reporting that as a stream end is what lets the app's
  // existing auto-restart keep the character alive past ~7 minutes.
  runEndMessages: ['generation_complete', 'generation_reset', 'generation_paused'],

  async start(ctx, { prompt, image, audioPrompt, audio = MODEL_AUDIO_ENABLED }) {
    // Session-scoped and read when `start` fires, so it must precede start.
    await ctx.command('set_audio_enabled', { audio_enabled: audio });

    // Pick a delivery tier from what this deployment actually offers. Doing it
    // before `start` matters: resolution is read when start fires, so setting
    // it later would only take effect on the next run.
    const state = ctx.getState();
    const offered = Array.isArray(state?.available_resolutions)
      ? (state.available_resolutions as string[])
      : [];
    const choice = PREFERRED_RESOLUTIONS.find((r) => offered.includes(r));
    if (choice) {
      ctx.mark?.('reactor_resolution_start', { resolution: choice });
      await ctx.command('set_resolution', { resolution: choice });
      ctx.mark?.('reactor_resolution_done', { resolution: choice });
    }

    if (audio && audioPrompt) await ctx.command('set_audio_prompt', { audio_prompt: audioPrompt });

    // I2V ordering is documented and load-bearing: uploadFile → set_image →
    // set_prompt → start. A start that races an in-flight upload renders its
    // first chunk unconditioned and visibly flickers into the anchored
    // composition a beat later. `set_image` resolves on `image_accepted`, so
    // awaiting it is the whole synchronisation.
    if (image) {
      // The app ships baked 16:9 references for its characters. Keep startup
      // local and deterministic: a runtime outpaint call is slow and optional.
      ctx.mark?.('reactor_fit_image_start');
      const fitted = await fitTo16x9(image);
      const bytes = 'size' in fitted ? Number(fitted.size) : undefined;
      ctx.mark?.('reactor_fit_image_done', bytes ? { bytes } : undefined);
      ctx.mark?.('reactor_upload_start');
      const ref = await ctx.uploadFile(fitted, 'conditioning');
      ctx.mark?.('reactor_upload_done');
      ctx.mark?.('reactor_set_image_start');
      await ctx.command('set_image', { image: ref });
      ctx.mark?.('reactor_set_image_done');
    }
    ctx.mark?.('reactor_set_prompt_start');
    await ctx.command('set_prompt', { prompt: image ? anchorStart(prompt) : prompt, passthrough: true });
    ctx.mark?.('reactor_set_prompt_done');
    ctx.mark?.('reactor_start_command');
    await ctx.command('start', {});
  },

  async steer(ctx, prompt) {
    // The hero feature: the picture morphs at the next chunk boundary. No
    // start, no reset, no ack wait. Anchored, or each turn drifts the identity.
    await ctx.command('set_prompt', { prompt: anchorSteer(prompt), passthrough: true });
  },
});

export const REACTOR_MODELS: Record<ReactorModelId, ReactorModelAdapter> = {
  helios,
  'visko-orbis-stable': makeVisko(
    'visko-orbis-stable',
    'reactor/visko-orbis-stable',
    'Visko Orbis Stable',
  ),
  'visko-orbis-dynamic': makeVisko(
    'visko-orbis-dynamic',
    'reactor/visko-orbis-dynamic',
    'Visko Orbis Dynamic',
  ),
};

export const DEFAULT_MODEL_ID: ReactorModelId = 'visko-orbis-stable';

/** Resolves a slug or bare id from the server (or an env var) to an adapter,
 *  falling back to the default rather than throwing — a typo'd env var should
 *  degrade to a working app, not a blank screen. */
export function resolveModel(nameOrSlug?: string | null): ReactorModelAdapter {
  if (!nameOrSlug) return REACTOR_MODELS[DEFAULT_MODEL_ID];
  const bare = nameOrSlug.replace(/^reactor\//, '') as ReactorModelId;
  return REACTOR_MODELS[bare] ?? REACTOR_MODELS[DEFAULT_MODEL_ID];
}

