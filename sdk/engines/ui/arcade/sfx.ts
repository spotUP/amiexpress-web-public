/**
 * Arcade sound effects: the channel, shared by every arcade door.
 *
 * Arkanoid's client IS its game, so it calls `audio.playSound` directly and
 * hears itself. Every other arcade door runs server-side, and the sound has
 * to cross to the browser. This module is that crossing, written once.
 *
 * Nothing here synthesises anything. The SDK's `AudioEngine` already carries
 * an arcade sound library - `coin`, `jump`, `hit`, `explosion`, `death`,
 * `1up`, `level-up`, `gameover` and the rest - and Arkanoid already proves it
 * sounds right through the reverb and echo sends. So the only pieces missing
 * were a way for a server-side door to name one of those sounds, and a
 * browser-side listener to play it.
 *
 * Three parts, deliberately separable:
 *
 * - `SfxCues` is what the PURE game code touches. A game step pushes the
 *   names of what just happened and never sees a socket, so "the frog hops"
 *   and "the frog drowns" are assertable in a test with no audio at all.
 * - `ArcadeSfx` is the server half. The door drains its cues after each tick
 *   and hands them here; this emits them over the session socket, rate
 *   limited so a 30 Hz loop cannot machine-gun the wire.
 * - `installArcadeSfx` is the browser half, called from the door's
 *   `client.ts` with the `AudioEngine` that client already builds.
 *
 * Why the socket directly rather than `ClientDoor`'s event set: `ClientDoor`
 * forwards a fixed whitelist of `audio:*` events, and GrandMaster's audio
 * bridge already goes round it by listening on `__BBS__.socket` itself. That
 * path is proven in this repo; a new entry in someone else's whitelist is
 * not. `audio:play-sfx` was the other candidate and is the wrong one - it
 * lands in the terminal's own MediaHandler, whose library is BBS chrome
 * (click, join, mention), gated by the board's UI-sounds toggle, and shares
 * nothing with the door's own mix.
 *
 * Pure and dependency-free on both sides: the sink and the transport are
 * structural types, so this file drags neither Tone nor socket.io into a
 * bundle that did not already have them.
 */

// ===========================================================================
// The vocabulary
// ===========================================================================

/**
 * The sounds an arcade door may ask for.
 *
 * Every name here exists in `AudioEngine`'s built-in library. Keeping the
 * union closed is the point: a typo in a door becomes a type error rather
 * than silence, which is the one bug a sound effect cannot report itself.
 */
export type ArcadeSound =
  // Front end and menus
  | 'blip'
  | 'boop'
  | 'select'
  | 'start'
  | 'pause'
  | 'unpause'
  | 'countdown'
  | 'countdown-go'
  // Rewards
  | 'coin'
  | 'pickup'
  | 'powerup'
  | 'success'
  | '1up'
  | 'level-up'
  // Movement
  | 'jump'
  | 'land'
  | 'footstep'
  | 'climb'
  | 'swim'
  | 'dash'
  | 'teleport'
  | 'warp'
  | 'drop'
  // Violence
  | 'hit'
  | 'zap'
  | 'laser'
  | 'explosion'
  | 'death'
  | 'gameover'
  // Machinery
  | 'switch'
  | 'alarm';

/** Per-sound tweaks, passed through to `AudioEngine.playSound`. */
export interface ArcadeSoundParams {
  frequency?: number;
  duration?: number;
  volume?: number;
}

/** What crosses the socket. */
export interface ArcadeSfxPayload {
  sound: ArcadeSound;
  params?: ArcadeSoundParams;
}

/**
 * The socket event name.
 *
 * Namespaced under `arcade:` rather than `audio:` on purpose - the `audio:*`
 * names are the board's voice and music channels, and a door's beeps have no
 * business arriving on the same event as a microphone.
 */
export const ARCADE_SFX_EVENT = 'arcade:sfx';

// ===========================================================================
// SfxCues - what the pure game code touches
// ===========================================================================

/** How many unplayed cues to keep before dropping the oldest. */
const MAX_PENDING_CUES = 32;

/**
 * A queue of "this just happened", filled by pure game logic and drained by
 * whoever owns the socket.
 *
 * The game never learns whether anything is listening. That is what makes a
 * door's sound design testable: a test steps the game and asserts the cues,
 * with no audio engine, no browser and no socket anywhere near it.
 */
export class SfxCues {
  private queue: ArcadeSound[] = [];

  /** Record that something happened. */
  push(sound: ArcadeSound): void {
    this.queue.push(sound);
    // A door that stops draining (a game left paused on a dead socket) must
    // not grow this without limit. The oldest cue is the one worth losing:
    // by the time 32 have stacked up, it is long stale.
    if (this.queue.length > MAX_PENDING_CUES) {
      this.queue.splice(0, this.queue.length - MAX_PENDING_CUES);
    }
  }

  /** Everything pushed since the last drain, in order. Empties the queue. */
  drain(): ArcadeSound[] {
    if (this.queue.length === 0) return [];
    const out = this.queue;
    this.queue = [];
    return out;
  }

  /** What is waiting, without taking it. For tests and for diagnostics. */
  get pending(): readonly ArcadeSound[] {
    return this.queue;
  }

  /** Throw away anything queued - a state change nobody should hear. */
  clear(): void {
    this.queue.length = 0;
  }
}

// ===========================================================================
// ArcadeSfx - the server half
// ===========================================================================

/** The shape of a socket.io socket, as far as this module cares. */
export interface ArcadeSfxTransport {
  emit(event: string, payload: unknown): unknown;
}

export interface ArcadeSfxOptions {
  /**
   * Shortest gap between two emissions of the SAME sound, in milliseconds.
   *
   * A safety net, not a design tool. A door should emit on discrete events;
   * this catches the case where a condition rather than an event drives the
   * call and the same beep would fire every tick.
   */
  minGapMs?: number;
  /** Per-sound overrides of `minGapMs`. */
  soundGapMs?: Partial<Record<ArcadeSound, number>>;
  /**
   * Ceiling on how many sounds may be emitted in any one second, across all
   * sounds. Protects the socket from a runaway loop; generous enough that
   * ordinary play never reaches it.
   */
  maxPerSecond?: number;
  /** Clock, for tests. Defaults to `Date.now`. */
  now?: () => number;
}

const DEFAULT_MIN_GAP_MS = 60;
const DEFAULT_MAX_PER_SECOND = 20;

/**
 * Sends named sounds to the browser over a door session's socket.
 *
 * Construct it in the door's `onStart` with `ctx.socket` and keep it for the
 * life of the session. A missing or dead socket is not an error - a door
 * played over telnet has no browser to hear anything, and it must play
 * exactly the same.
 */
export class ArcadeSfx {
  private transport: ArcadeSfxTransport | null;
  private enabled = true;
  private readonly minGapMs: number;
  private readonly soundGapMs: Partial<Record<ArcadeSound, number>>;
  private readonly maxPerSecond: number;
  private readonly now: () => number;

  /** When each sound last went out, for the per-sound gap. */
  private lastPlayed = new Map<ArcadeSound, number>();
  /** Timestamps inside the current one-second window, for the rate cap. */
  private recent: number[] = [];

  constructor(transport: ArcadeSfxTransport | null | undefined, options: ArcadeSfxOptions = {}) {
    this.transport = transport ?? null;
    this.minGapMs = options.minGapMs ?? DEFAULT_MIN_GAP_MS;
    this.soundGapMs = options.soundGapMs ?? {};
    this.maxPerSecond = options.maxPerSecond ?? DEFAULT_MAX_PER_SECOND;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Play one sound.
   *
   * @returns whether it actually went out - false when muted, throttled, or
   *          there is no browser on the other end. Returned rather than
   *          logged so a test can prove the throttle works.
   */
  play(sound: ArcadeSound, params?: ArcadeSoundParams): boolean {
    if (!this.enabled || !this.transport) return false;

    const at = this.now();
    const gap = this.soundGapMs[sound] ?? this.minGapMs;
    const last = this.lastPlayed.get(sound);
    if (last !== undefined && at - last < gap) return false;

    // Drop anything that fell out of the trailing second before counting.
    while (this.recent.length > 0 && at - this.recent[0] >= 1000) {
      this.recent.shift();
    }
    if (this.recent.length >= this.maxPerSecond) return false;

    const payload: ArcadeSfxPayload = params ? { sound, params } : { sound };
    try {
      this.transport.emit(ARCADE_SFX_EVENT, payload);
    } catch {
      // A socket that has gone away mid-tick must not take the game down
      // with it. The player is already disconnected; silence is correct.
      return false;
    }

    this.lastPlayed.set(sound, at);
    this.recent.push(at);
    return true;
  }

  /** Play a drained batch of cues, in order. Returns how many went out. */
  playAll(sounds: Iterable<ArcadeSound>): number {
    let sent = 0;
    for (const sound of sounds) {
      if (this.play(sound)) sent++;
    }
    return sent;
  }

  /** Drain a cue queue straight onto the wire. The usual per-tick call. */
  flush(cues: SfxCues): number {
    return this.playAll(cues.drain());
  }

  /** Turn the whole channel on or off - a door's own sound setting. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Release the socket. Call from the door's cleanup. */
  destroy(): void {
    this.transport = null;
    this.lastPlayed.clear();
    this.recent = [];
  }
}

// ===========================================================================
// installArcadeSfx - the browser half
// ===========================================================================

/** As much of `AudioEngine` as the listener needs. */
export interface ArcadeSfxSink {
  init(): Promise<void>;
  playSound(soundId: string, params?: ArcadeSoundParams): void;
}

/** As much of a client socket as the listener needs. */
export interface ArcadeSfxSocket {
  on(event: string, handler: (payload: any) => void): unknown;
  off?(event: string, handler: (payload: any) => void): unknown;
}

export interface InstallArcadeSfxOptions {
  /** The socket to listen on. Defaults to `window.__BBS__.socket`. */
  socket?: ArcadeSfxSocket | null;
  /** Called when a sound could not be played. Defaults to a console warning. */
  onError?: (error: unknown) => void;
}

function defaultSocket(): ArcadeSfxSocket | null {
  const bbs = (globalThis as any)?.__BBS__;
  const socket = bbs?.socket;
  return socket && typeof socket.on === 'function' ? (socket as ArcadeSfxSocket) : null;
}

/**
 * Listen for the door's sounds and play them.
 *
 * Call once from the door's `client.ts`, passing the `AudioEngine` that
 * client already builds - the engine carries the door's own volumes and
 * effect sends, so handing one in keeps every door's mix its own.
 *
 * @returns a function that stops listening. Call it from the door's
 *          `disconnect` and `close` handlers; a door is unloaded by removing
 *          its script, which does not detach anything it subscribed to, and
 *          a re-entry would otherwise leave two listeners playing every
 *          sound twice.
 */
export function installArcadeSfx(
  audio: ArcadeSfxSink,
  options: InstallArcadeSfxOptions = {}
): () => void {
  const socket = options.socket === undefined ? defaultSocket() : options.socket;
  if (!socket) return () => { /* nothing was ever attached */ };

  const onError =
    options.onError ??
    ((error: unknown) => console.warn('[arcade-sfx] sound unavailable:', error));

  // `AudioEngine.init` opens the AudioContext, and it must happen once, not
  // once per beep. The promise is the latch: everything that arrives while
  // it is pending waits on the same one.
  let ready: Promise<void> | null = null;
  const ensureReady = (): Promise<void> => {
    if (!ready) ready = audio.init();
    return ready;
  };

  const handler = (payload: ArcadeSfxPayload): void => {
    if (!payload || typeof payload.sound !== 'string') return;
    ensureReady()
      .then(() => audio.playSound(payload.sound, payload.params))
      .catch((error) => {
        // A failed init must not poison every later sound: clearing the
        // latch lets the next cue try again, which matters because the
        // first failure is usually the autoplay policy, and by the second
        // sound the player has certainly pressed a key.
        ready = null;
        onError(error);
      });
  };

  socket.on(ARCADE_SFX_EVENT, handler);

  return () => {
    try {
      socket.off?.(ARCADE_SFX_EVENT, handler);
    } catch {
      // Already gone.
    }
  };
}
