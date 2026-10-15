/**
 * A fuse that burns while NOTHING happens.
 *
 * A 68K door used to be killed by a wall clock: DoorLifecycleManager armed a
 * `setTimeout` for the configured timeout the moment the door started, and
 * fired it whatever the door was doing. That is right for a door that wedges
 * and wrong for every door a caller actually uses - TEXTTV died at +310s with
 * the sysop mid-page, five minutes being exactly how long a teletext reader is
 * meant to be sat in (2026-09-13).
 *
 * The question the timer should ask is "has this door done anything lately?",
 * not "how long has this caller been enjoying himself?". Every XIM message and
 * every keystroke pushes the fuse back; silence burns it down.
 *
 * Deliberately small and free of the emulator: the arithmetic of a timeout is
 * where a door lifetime goes wrong, and none of it needs a 68K to be tested.
 */
export interface InactivityFuse {
  /** Push the expiry back. Cheap enough to call on every message. */
  touch(): void;
  /** Stop the fuse for good. Safe to call twice. */
  clear(): void;
  /** Milliseconds since the last touch - for logs and tests. */
  idleMs(): number;
  /** Milliseconds since the fuse was lit, touches included. */
  aliveMs(): number;
  /** False once it has fired or been cleared. */
  armed(): boolean;
}

export interface InactivityFuseOptions {
  /** How long a door may be silent before it is considered wedged. */
  seconds: number;
  /**
   * An absolute ceiling that activity does NOT push back.
   *
   * Needed because "activity" includes the door's own idle animation: the
   * SDK doors slide their masthead rail about five times a second while
   * waiting for a key, so a caller who walks away mid-page leaves a door
   * that looks busy for ever. The inactivity fuse catches a wedged door; this
   * catches an abandoned one, and holds a node for an hour rather than a
   * night. Omit or pass 0 for no ceiling.
   */
  maxSeconds?: number;
  /** What to do when it burns out. */
  onExpire: () => void;
  /** Injected for tests; defaults to the real timers and clock. */
  setTimeoutFn?: (fn: () => void, ms: number) => any;
  clearTimeoutFn?: (handle: any) => void;
  now?: () => number;
}

/**
 * A fuse with no timeout at all (`seconds` <= 0) is one that never fires,
 * which is how a door with `timeout: 0` has always behaved.
 */
export function createInactivityFuse(options: InactivityFuseOptions): InactivityFuse {
  const setTimer = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle));
  const now = options.now ?? (() => Date.now());
  const ms = Math.max(0, Math.floor(options.seconds * 1000));

  const capMs = Math.max(0, Math.floor((options.maxSeconds ?? 0) * 1000));
  const started = now();

  let handle: any = null;
  let capHandle: any = null;
  let lastTouch = started;
  let alive = ms > 0;

  const burn = () => {
    handle = null;
    alive = false;
    if (capHandle !== null) {
      clearTimer(capHandle);
      capHandle = null;
    }
    options.onExpire();
  };

  const arm = () => {
    if (!alive) return;
    handle = setTimer(burn, ms);
  };

  if (alive) {
    arm();
    if (capMs > 0) capHandle = setTimer(burn, capMs);
  }

  return {
    touch() {
      if (!alive) return;
      lastTouch = now();
      // Re-arming rather than checking a deadline on tick keeps this to one
      // live timer per door, which is what the lifecycle manager had before.
      if (handle !== null) clearTimer(handle);
      arm();
    },
    clear() {
      alive = false;
      if (handle !== null) {
        clearTimer(handle);
        handle = null;
      }
      if (capHandle !== null) {
        clearTimer(capHandle);
        capHandle = null;
      }
    },
    idleMs() {
      return now() - lastTouch;
    },
    aliveMs() {
      return now() - started;
    },
    armed() {
      return alive;
    },
  };
}
