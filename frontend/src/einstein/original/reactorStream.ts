import { Reactor, type ReactorMessage, type ReactorStatus } from '@reactor-team/js-sdk';
import {
  MODEL_AUDIO_ENABLED,
  resolveModel,
  type ModelContext,
  type ReactorModelAdapter,
  type StartOptions,
} from './reactorModels';

export { Reactor };
export type { ReactorStatus };
export type { ReactorModelAdapter } from './reactorModels';

/** Track every model in this app publishes its video on. */
const VIDEO_TRACK = 'main_video';
/** Visko publishes generated sound on its own track. Models without audio
 *  simply never emit it. */
const AUDIO_TRACK = 'main_audio';

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** `getStatus()` is the source of truth for readiness — see `waitUntilReady`. */
const READY_POLL_MS = 400;
const READY_TIMEOUT_MS = 90_000;

/** How long to wait for a staging broadcast (`conditions_ready`) before
 *  giving up on `start`. */
const BROADCAST_TIMEOUT_MS = 15_000;

export type StreamState = 'idle' | 'starting' | 'streaming' | 'ended' | 'error';

/**
 * Kept identical to the type the app imported from the Odyssey SDK, so the
 * UI's status chrome needs no rewrite. Reactor's own four states map onto it:
 * `waiting` (GPU provisioning) reads as `connecting`, and only `ready` — the
 * point at which commands are accepted — reads as `connected`.
 */
export type ConnectionStatus =
  | 'authenticating'
  | 'connecting'
  | 'reconnecting'
  | 'connected'
  | 'disconnected'
  | 'failed';

const toConnectionStatus = (status: ReactorStatus): ConnectionStatus => {
  switch (status) {
    case 'ready': return 'connected';
    case 'waiting': return 'connecting';
    case 'connecting': return 'connecting';
    default: return 'disconnected';
  }
};

export interface ReactorStreamHandlers {
  /** Video track arrived and is bound to a MediaStream. Fires during `waiting`,
   *  BEFORE the session is ready — bind the element, but don't send commands yet. */
  onConnected?: (stream: MediaStream) => void;
  /** The model acknowledged `start` and is emitting chunks. */
  onStreamStarted?: (sessionId: string) => void;
  onStreamEnded?: () => void;
  onStreamError?: (reason: string, message?: string) => void;
  /** The session exists at Reactor (status `waiting`) — before it is ready and
   *  before any frame. This is the earliest point it can be registered with
   *  the kill switch, and therefore the earliest it can be terminated
   *  server-side if the handshake wedges. */
  onSessionCreated?: (sessionId: string) => void;
  /** Odyssey-shaped status, for callers that had UI keyed to it. */
  onStatusChange?: (status: ConnectionStatus) => void;
  /** Raw Reactor status, for callers that want the `waiting`/`ready` split. */
  onStatusChanged?: (status: ReactorStatus) => void;
  /** A prompt the model echoed back as applied. */
  onInteractAcknowledged?: (prompt: string) => void;
  onError?: (error: Error) => void;
  /** Every inbound model message, for callers that want the raw feed. */
  onMessage?: (message: ReactorMessage) => void;
  /** Command-level startup timing marks from the model adapter. */
  onStartupMark?: (stage: string, data?: Record<string, unknown>) => void;
}

/**
 * A Reactor session wrapped in the shape the app already expects from its
 * streaming provider: connect → startStream → interact → endStream →
 * disconnect. Which model it drives is decided by the adapter (see
 * `reactorModels.ts`), so swapping Helios for Visko Orbis is a slug change,
 * not a rewrite.
 *
 * Four ordering rules are load-bearing, and each one fails silently rather
 * than throwing if you get it wrong:
 *
 * 1. `connect()` resolves at `"waiting"`, not `"ready"`, and the SDK's status
 *    event does NOT fire on the `waiting → ready` transition. Anything that
 *    waits on the event hangs until its own timeout even though `getStatus()`
 *    already flipped. So readiness is POLLED.
 * 2. The video track arrives during `waiting`. Track arrival is not readiness —
 *    binding the element early is right, sending a command that early is not.
 * 3. Staging must complete before `start`. On Helios that means awaiting the
 *    broadcast `conditions_ready`; on Visko it means awaiting `set_image`'s own
 *    reply. Either way a `start` that races conditioning produces an
 *    unconditioned first chunk, or is rejected outright.
 * 4. `sendCommand()` never rejects on a model-side refusal — `command_error`
 *    arrives as a broadcast instead. Errors are surfaced from the message
 *    stream, not from the `await`.
 */
export class ReactorStreamService {
  private reactor: Reactor;
  private model: ReactorModelAdapter;
  private jwt: string;
  private handlers: ReactorStreamHandlers = {};
  private lastStatus: ReactorStatus = 'disconnected';
  private statusPoll: ReturnType<typeof setInterval> | null = null;
  private latestState: Record<string, unknown> | null = null;
  /** One MediaStream for the <video> element. Video and audio arrive as
   *  separate tracks, possibly in either order; merging them here means the
   *  caller binds a single srcObject once and audio joins it when it lands. */
  private mediaStream: MediaStream | null = null;
  private announcedSessionId: string | null = null;
  private streaming = false;
  /** One `onStreamStarted` per run — see `markStarted`. */
  private runStartedEmitted = false;
  /** Fallback for a `reset` whose broadcast never arrives (e.g. sent while
   *  the model was already idle). */
  private endAckTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private _lastAppliedPrompt: string | null = null;

  constructor(jwt: string, modelNameOrSlug?: string | null) {
    this.jwt = jwt;
    this.model = resolveModel(modelNameOrSlug);
    this.reactor = new Reactor({ modelName: this.model.slug, jwt });
  }

  get modelId() { return this.model.id; }
  get modelLabel() { return this.model.label; }
  get hasAudio() { return this.model.hasAudio; }
  get lastAppliedPrompt(): string | null { return this._lastAppliedPrompt; }

  getStatus(): ReactorStatus { return this.reactor.getStatus(); }
  getSessionId(): string | undefined { return this.reactor.getSessionId(); }
  getPeerConnection(): RTCPeerConnection | undefined { return this.reactor.getPeerConnection(); }

  async connect(handlers: ReactorStreamHandlers = {}) {
    this.handlers = handlers;

    this.reactor.on('trackReceived', (name, track) => {
      if (name !== VIDEO_TRACK && name !== AUDIO_TRACK) return;
      // Model audio is off unless VITE_REACTOR_AUDIO=on — the track still
      // arrives (carrying silence), so don't wire it into the element either.
      if (name === AUDIO_TRACK && !MODEL_AUDIO_ENABLED) return;
      const first = !this.mediaStream;
      if (!this.mediaStream) this.mediaStream = new MediaStream();
      this.mediaStream.addTrack(track);
      // Announce on the first media track of either kind. The element is
      // already bound by the time the second one arrives, and addTrack() on a
      // stream that is a live srcObject is picked up by the element.
      if (first) this.handlers.onConnected?.(this.mediaStream);
    });

    this.reactor.on('message', (message) => {
      this.handlers.onMessage?.(message);
      this.routeMessage(message);
    });

    // Moderation arrives on the platform-scope channel, not the model's own
    // message stream — a prompt the model refuses shows up here and nowhere else.
    this.reactor.on('runtimeMessage', (message) => {
      if (message.type !== 'moderation') return;
      const event = message.data as { message?: string; categories?: string[] };
      this.handlers.onStreamError?.(
        'moderation_failed',
        event?.message ?? `Refused by moderation (${event?.categories?.join(', ') ?? 'policy'}).`,
      );
    });

    this.reactor.on('error', (err) => {
      this.handlers.onError?.(err);
      this.handlers.onStreamError?.('sdk_error', err.message);
    });

    await this.reactor.connect(this.jwt);
    this.announceSessionId();
    this.startStatusPoll();
    await this.waitUntilReady();
    // Belt and braces: if the id was not yet populated when connect() resolved,
    // it certainly is by ready.
    this.announceSessionId();
  }

  /**
   * `portrait` and `broadcast` are accepted and ignored: the canvas is fixed
   * at connect time and no Reactor model has a broadcast mode. See
   * MIGRATION-REACTOR.md.
   */
  async startStream(options?: {
    prompt?: string;
    image?: File | Blob;
    audioPrompt?: string;
    portrait?: boolean;
    broadcast?: boolean;
  }) {
    const prompt = options?.prompt?.trim();
    if (!prompt) throw new Error(`${this.model.label} needs a prompt before it can start.`);

    await this.waitUntilReady();

    const startOptions: StartOptions = {
      prompt,
      image: options?.image,
      audioPrompt: options?.audioPrompt,
    };
    await this.model.start(this.context(), startOptions);
    this._lastAppliedPrompt = prompt;
    // The awaited `start` reply IS generation_started on js-sdk 3.x, so by
    // here the run exists whether or not the broadcast copy has been routed.
    this.markStarted();
  }

  async interact(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    await this.model.steer(this.context(), trimmed);
    this._lastAppliedPrompt = trimmed;
  }

  async pause() { await this.command('pause', {}); }
  async resume() { await this.command('resume', {}); }
  async setSeed(seed: number) { await this.command('set_seed', { seed }); }

  /**
   * Clears the run and returns the session to its waiting state, leaving the
   * session connected and reusable.
   *
   * Deliberately does NOT fire `onStreamEnded` here. The model broadcasts
   * `generation_reset` in reply to `reset`, and `routeMessage` turns that into
   * exactly one `onStreamEnded`. Firing synchronously as well produced two
   * ends per reset — and, worse, the synchronous one ran before the caller
   * had finished tearing down (e.g. clearing its auto-restart), so the app
   * restarted a stream the user had just left. Odyssey delivered this event
   * asynchronously and the app's ordering assumes that. A short fallback
   * covers the case where no broadcast comes (reset while already idle).
   */
  async endStream() {
    if (!this.streaming) return;
    await this.command('reset', {}).catch(() => undefined);
    if (this.endAckTimer) clearTimeout(this.endAckTimer);
    this.endAckTimer = setTimeout(() => {
      this.endAckTimer = null;
      this.emitStreamEnded();
    }, 2000);
  }

  async disconnect() {
    // Nothing that arrives after this point — the reset ack, a late chunk, a
    // status flip — is the caller's business any more. Without this the
    // `generation_reset` broadcast from endStream() fired onStreamEnded into
    // an app that had already moved on, which auto-restarted a stream on a
    // session that was mid-disconnect ("operation requires ready status").
    this.handlers = {};
    this.stopStatusPoll();
    if (this.endAckTimer) { clearTimeout(this.endAckTimer); this.endAckTimer = null; }
    this.streaming = false;
    this.disposed = true;
    await this.reactor.disconnect().catch(() => undefined);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /**
   * One `onStreamStarted` per run, whichever arrives first: the broadcast
   * `generation_started`, or `startStream()` resolving (its awaited reply is
   * the same message). An earlier version deduped on `this.streaming`, which
   * `startStream()` set BEFORE the broadcast was routed — so when the reply
   * won the race the broadcast was dropped and the app never learned the run
   * had begun: audio played, video stayed hidden behind "Waking up…".
   */
  private markStarted() {
    this.streaming = true;
    if (this.runStartedEmitted) return;
    this.runStartedEmitted = true;
    this.handlers.onStreamStarted?.(this.reactor.getSessionId() ?? '');
  }

  /** One `onStreamEnded` per run, whichever of reset-ack, model-side end, or
   *  the fallback timer gets there first. */
  private emitStreamEnded() {
    this.runStartedEmitted = false;
    if (!this.streaming) return;
    this.streaming = false;
    this.handlers.onStreamEnded?.();
  }

  /** Emits `onSessionCreated` exactly once, the first time the SDK has an id. */
  private announceSessionId() {
    // getSessionId() proxies the wasm client, which can lag the REST session
    // object; getSessionInfo() is the coordinator's view and has the id first.
    const id = this.reactor.getSessionId() ?? this.reactor.getSessionInfo()?.session_id;
    if (!id || this.announcedSessionId === id) return;
    this.announcedSessionId = id;
    this.handlers.onSessionCreated?.(id);
  }

  private context(): ModelContext {
    return {
      command: (name, data) => this.command(name, data),
      uploadFile: (file, name) => this.reactor.uploadFile(file, name ? { name } : undefined),
      waitForBroadcast: (type, timeoutMs) => this.waitForMessage(type, timeoutMs ?? BROADCAST_TIMEOUT_MS),
      getState: () => this.latestState,
      mark: (stage, data) => this.handlers.onStartupMark?.(stage, data),
    };
  }

  /**
   * Every command goes through here so the not-ready case is a thrown error
   * the caller can see, rather than the SDK's recoverable `NOT_READY` event
   * that otherwise vanishes into the error handler.
   */
  private async command(name: string, data: Record<string, unknown>) {
    const status = this.reactor.getStatus();
    if (status !== 'ready') {
      throw new Error(`Command "${name}" sent while ${status} — must be ready.`);
    }
    return this.reactor.sendCommand(name, data);
  }

  private routeMessage(message: ReactorMessage) {
    const data = message.data as Record<string, unknown> | undefined;

    // Everything except the two chatty ones, so a stream that stops for no
    // visible reason leaves the reason in the console.
    if (message.type !== 'state' && message.type !== 'chunk_complete') {
      console.info(`[reactor:${this.model.id}] ${message.type}`, data ?? '');
      // Also kept on window so the log survives console-tracking resets and
      // can be read back with a one-liner while debugging.
      const w = window as unknown as { __reactorLog?: string[] };
      (w.__reactorLog ??= []).push(`${new Date().toISOString().slice(11, 19)} ${message.type} ${data ? JSON.stringify(data).slice(0, 160) : ''}`);
    }

    if (message.type === 'state' && data) {
      this.latestState = data;
      return;
    }

    if (this.model.runEndMessages.includes(message.type)) {
      if (this.endAckTimer) { clearTimeout(this.endAckTimer); this.endAckTimer = null; }
      this.emitStreamEnded();
      return;
    }

    switch (message.type) {
      case 'generation_started':
        this.markStarted();
        break;
      case 'prompt_accepted':
      case 'prompt_switched':
        if (typeof data?.prompt === 'string') {
          this._lastAppliedPrompt = data.prompt;
          this.handlers.onInteractAcknowledged?.(data.prompt);
        }
        break;
      case 'command_error':
        // sendCommand() never rejects on a refusal, so this is the only place
        // a rejected command is visible.
        this.handlers.onStreamError?.(
          String(data?.command ?? 'command_error'),
          String(data?.reason ?? data?.message ?? 'The model rejected the command.'),
        );
        break;
      case 'error':
        this.handlers.onStreamError?.(
          String(data?.code ?? 'error'),
          String(data?.message ?? 'Stream error.'),
        );
        break;
    }
  }

  /** Resolves on the next inbound broadcast of `type`. */
  private waitForMessage(type: string, timeoutMs: number): Promise<ReactorMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.reactor.off('message', onMessage);
        reject(new Error(`Timed out waiting for "${type}" from ${this.model.label}.`));
      }, timeoutMs);

      const onMessage = (message: ReactorMessage) => {
        if (message.type !== type) return;
        clearTimeout(timer);
        this.reactor.off('message', onMessage);
        resolve(message);
      };

      this.reactor.on('message', onMessage);
    });
  }

  /**
   * Polls rather than listening, because `onStatusChanged` never fires for
   * `waiting → ready` — the SDK emits it on connect, after state-mutating
   * commands, and after each chunk, and GPU-provisioning-finished is none of
   * those.
   */
  private waitUntilReady(timeoutMs = READY_TIMEOUT_MS): Promise<void> {
    if (this.reactor.getStatus() === 'ready') return Promise.resolve();

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const tick = () => {
        if (this.disposed) {
          clearInterval(poll);
          reject(new Error('Disconnected while waiting for the model.'));
          return;
        }
        const status = this.reactor.getStatus();
        if (status === 'ready') {
          clearInterval(poll);
          resolve();
        } else if (status === 'disconnected') {
          clearInterval(poll);
          reject(new Error(`${this.model.label} disconnected before becoming ready.`));
        } else if (Date.now() - startedAt > timeoutMs) {
          clearInterval(poll);
          reject(new Error(`${this.model.label} did not become ready in time.`));
        }
      };
      const poll = setInterval(tick, READY_POLL_MS);
      tick();
    });
  }

  private startStatusPoll() {
    this.stopStatusPoll();
    this.statusPoll = setInterval(() => {
      this.announceSessionId();
      const status = this.reactor.getStatus();
      if (status === this.lastStatus) return;
      this.lastStatus = status;
      this.handlers.onStatusChanged?.(status);
      this.handlers.onStatusChange?.(toConnectionStatus(status));
      if (status === 'disconnected') this.emitStreamEnded();
    }, READY_POLL_MS);
  }

  private stopStatusPoll() {
    if (this.statusPoll) {
      clearInterval(this.statusPoll);
      this.statusPoll = null;
    }
  }
}

/**
 * Binds a stream to a <video> and starts playback, surviving Chrome's autoplay
 * policy. Odyssey streams were silent so the elements were `muted` and always
 * autoplayed; Visko streams carry audio, and an UNMUTED autoplay is refused
 * (NotAllowedError) unless the page has had a user gesture. Rather than show
 * nothing, fall back to muted playback — the picture appears, and the first
 * click on the page can unmute. Returns whether audio is currently audible.
 */
export async function attachStream(video: HTMLVideoElement, stream: MediaStream): Promise<boolean> {
  video.srcObject = stream;
  try {
    await video.play();
    return !video.muted;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'AbortError') {
      // play() interrupted by a re-render — retry once, unchanged.
      await new Promise((r) => setTimeout(r, 150));
      await video.play().catch(() => undefined);
      return !video.muted;
    }
    video.muted = true;
    await video.play().catch(() => undefined);
    const unmute = () => { video.muted = false; window.removeEventListener('pointerdown', unmute); window.removeEventListener('keydown', unmute); };
    window.addEventListener('pointerdown', unmute, { once: true });
    window.addEventListener('keydown', unmute, { once: true });
    return false;
  }
}

/** Unchanged from the Odyssey build — the app calls this to turn a slide's
 *  image URL into the File that conditioning wants. */
export async function loadImageFile(url: string, name = 'slide-image') {
  const response = await fetch(encodeURI(url));
  if (!response.ok) {
    throw new Error(`Failed to load image: ${response.status} ${response.statusText}`);
  }
  const blob = await response.blob();
  if (blob.size > MAX_IMAGE_BYTES) {
    const sizeMb = (blob.size / (1024 * 1024)).toFixed(2);
    throw new Error(`Image is too large (${sizeMb} MB). Max is 25 MB.`);
  }
  const type = blob.type || 'image/png';
  return new File([blob], name, { type });
}

