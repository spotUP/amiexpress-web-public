/**
 * The C64 door adapter's transport seam (Phase 3 of the strategy plan).
 *
 * A 68K door paints an 80-column screen; a PETSCII caller has 40x25. Rather
 * than rewrite the byte stream, this replays the door's ANSI onto a virtual
 * 80x25 grid (FrameReconstructor), reduces each finished FRAME with the rule
 * ladder (adaptFrame), and emits the minimal ANSI that repaints it (renderDiff)
 * - which the existing downstream carries unchanged: connection-emitter.ts's
 * AnsiToPetsciiTransducer for telnet/SSH, or the browser's transducer in
 * BBSTerminal. The canvas side needs no change.
 *
 * WHERE IT SITS. Every 68K door emit goes through the ONE socket handed to
 * `new AmigaDoorSession(socket, ...)`: xim/io.ts's `directEmit` IS
 * `this.socket.emit(...)` and AnsiBuffer captures the same socket
 * (ansi-buffer.util.ts). Both do a LIVE lookup of `socket.emit` per call, so
 * the seam is that socket's `emit`, patched IN PLACE for the door's lifetime -
 * same technique and marker discipline as ModemEmulator.install()
 * (modem-emulator.util.ts). In place, not a wrapper object, because socket
 * IDENTITY is load-bearing: AnsiBuffer keys off socket.id and AmigaDoorSession
 * registers door:input listeners on it.
 *
 * KEYED BY SESSION WHERE THERE IS ONE, else by the socket. A telnet/SSH
 * connection can carry more than one emitter object for the same session
 * (c64-detected-handler.ts:36 builds a second buildConnectionEmitter for the
 * same connection), and connection-emitter.ts gives every emitter a LIVE
 * `session` getter onto the connection - so for those the holder is the
 * session, lookup from any emitter for that session finds the adapter, and
 * uninstall restores the emit onto the object that was actually patched.
 *
 * A socket.io Socket carries NO `session` property (session-manager keys
 * sessions by socket.id), so for web callers `holderOf` falls back to the
 * socket object itself. That is correct rather than a degradation: on web
 * there is exactly one socket object per session, so object identity and
 * session identity are the same thing. The multi-emitter problem only exists
 * on telnet/SSH, which is exactly where the session getter exists to solve it.
 *
 * RESTORING THE EMIT. `emit` is an OWN property on a connection-emitter object
 * literal but lives on the PROTOTYPE of a socket.io Socket. Assigning the
 * captured original back would pin a prototype method as an own property on
 * every web socket for the rest of its life, so install records which of the
 * two it was and uninstall either reassigns or `delete`s. It also restores
 * only when OUR patch is still the live `emit`: if something layered another
 * wrapper above us (a ModemEmulator install mid-door), that wrapper owns the
 * property now and stomping it would undo it.
 *
 * _directEmit. ModemEmulator captures socket.emit in its CONSTRUCTOR
 * (modem-emulator.util.ts:28-30) and AmigaDoorSession.suspendModemThrottle can
 * construct one mid-door, so install() seeds `socket._directEmit` with the
 * PRE-adapter emit if it is unset - and removes it again on uninstall if the
 * seeding was ours, so the socket ends the door exactly as it started it. Consumers of _directEmit (screen wipes,
 * slowmo per-frame chunks) therefore BYPASS the adapter by design: they are
 * timing-critical single-byte paths whose whole point is skipping queues, and a
 * bypassed chunk simply reaches the transducer unadapted, which is the same
 * thing that happens today.
 *
 * FRAME BOUNDARIES (sysop ruling, both): a quiet gap of C64_ADAPT_TICK_MS since
 * the last write; a cap of C64_ADAPT_MAX_FRAME_MS; an explicit flush() when the
 * emulator stops (MoiraEmulator.pause -> AmigaDoorSession); and teardown.
 * flush() is idempotent and silent when nothing was written since the last one.
 *
 * Teardown has TWO flavours. The normal one (the door exited) flushes the last
 * frame, because the door's final screen is something the caller should see.
 * The DEFENSIVE one at executeDoor's entry does not: anything still pending
 * there belongs to a door that already ended badly, and painting it would drop
 * a stale frame on top of the menu the caller is looking at now. That is
 * `{ silent: true }` / disposeSilently().
 *
 * NOT INSTALLED for a non-PETSCII session: install() returns null and `emit` is
 * not replaced, so 80-column output is byte-for-byte what it was. Non-string
 * payloads (ZMODEM buffers) and every non-'ansi-output' event pass through
 * untouched after the pending frame is flushed, so wire ordering holds. Raw
 * PETSCII ('petscii-bytes'/'petscii-output' - the .seq-first security screen a
 * 68K door can trigger) repaints the caller's screen outside this model, so the
 * diff baseline is dropped and the next frame is a full paint.
 */
import {
  FrameReconstructor,
  adaptFrame,
  renderDiff,
  type Frame,
} from '@amiexpress/bbs-door-sdk/petscii/frame';
import { doorScreenWidth, C64_COLUMNS } from '../amiga-emulation/xim/screen-width.util';

/** Quiet gap after the last write that ends a frame. */
export const C64_ADAPT_TICK_MS = 30;
/** Hard cap on how long a frame may accumulate before it is cut anyway. */
export const C64_ADAPT_MAX_FRAME_MS = 250;

/** The grid a 68K door believes it is painting on. */
const SOURCE_COLS = 80;
const ROWS = 25;
/** Property name the adapter is parked under, on the session. */
const MARK = '_c64DoorAdapter';

export interface AdapterSession {
  petsciiMode?: boolean;
  screenWidth?: number;
}

export interface C64AdapterOptions {
  tickMs?: number;
  maxFrameMs?: number;
}

/**
 * The session half of "this session's 68K door output goes through the
 * adapter", and install()'s own last-line guard. The per-DOOR half (the
 * C64_ADAPT declaration) is doorOpensForC64() in door-min-columns.util.ts,
 * which the launch gate and the install site both ask, so a door that has not
 * been adapted and verified never arms this even for a C64 caller.
 */
export function c64AdapterDrives(session: AdapterSession | null | undefined): boolean {
  return session?.petsciiMode === true;
}

/**
 * The per-DOOR half of the decision lives in ONE place, and it is not here:
 * `doorOpensForC64()` in utils/door-min-columns.util.ts (Task 5). It reads
 * C64_ADAPT from all three sources MIN_COLUMNS is read from - including the
 * value initializeDoors() resolves onto the Door at registration - so a door
 * marked only in its installed .info is treated the same by the launch gate
 * and by the install site below. An earlier local copy here read only the two
 * tooltype maps, which the Enter-by-command-name path does not carry, and
 * would have run such a door UNADAPTED after the gate had let it in.
 */

/**
 * The per-DOOR half of the decision: has this door been adapted and verified
 * for a 40-column caller?
 *
 * The tooltype is C64_ADAPT, read from the registration exactly where
 * MIN_COLUMNS is read (door-min-columns.util.ts) so the two can never disagree
 * about which registration object carries the truth. PRESENCE is what counts
 * today - the value is reserved for Task 5, which extends this into the full
 * per-door clause (region pins, opt-out for doors that paint their own 40
 * columns). Absent means unadapted, and an unadapted door runs exactly as it
 * runs now: 80-column bytes straight through, no reconstructor.
 */
export interface C64AdaptDoorShape {
  toolTypes?: Record<string, string>;
  doorInfo?: { toolTypes?: Record<string, string> };
}

export function doorRequestsC64Adapt(door: C64AdaptDoorShape | null | undefined): boolean {
  if (!door) return false;
  return (
    door.toolTypes?.['C64_ADAPT'] !== undefined ||
    door.doorInfo?.toolTypes?.['C64_ADAPT'] !== undefined
  );
}

/** Where the adapter is stored: the session when the socket has one, else the socket. */
function holderOf(socket: any): any {
  return (socket && socket.session) || socket;
}

export class C64DoorFrameAdapter {
  private readonly screen = new FrameReconstructor({ cols: SOURCE_COLS, rows: ROWS });
  private prev: Frame | null = null;
  private timer: NodeJS.Timeout | null = null;
  private capTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  private disposed = false;
  /** The object whose emit was patched, and the emit to put back. */
  target: any = null;
  original: ((event: string, ...args: any[]) => any) | null = null;
  /** The function install() actually assigned, so uninstall can tell whether it is still live. */
  patched: ((event: string, ...args: any[]) => any) | null = null;
  /** Was `emit` an OWN property before we patched (emitter literal), or inherited (socket.io)? */
  hadOwnEmit = false;
  /** Did WE create socket._directEmit? Only then may uninstall remove it. */
  seededDirectEmit = false;

  constructor(
    private readonly downstream: (event: string, ...args: any[]) => any,
    private readonly cols: number,
    private readonly tickMs: number,
    private readonly maxFrameMs: number,
  ) {}

  isDisposed(): boolean {
    return this.disposed;
  }

  write(text: string): void {
    this.screen.write(text);
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.tickMs);
    if (!this.capTimer) this.capTimer = setTimeout(() => this.flush(), this.maxFrameMs);
  }

  flush(): void {
    this.clearTimers();
    // renderDiff always ends in SGR-reset + CUP, so an "empty" diff is not an
    // empty string: never emit one.
    if (!this.dirty) return;
    this.dirty = false;
    const next = adaptFrame(this.screen.snapshot(), { cols: this.cols, rows: ROWS });
    const ansi = renderDiff(this.prev, next, this.cols, ROWS);
    this.prev = next;
    this.downstream('ansi-output', ansi);
  }

  /** The caller's screen was repainted outside this model: the next frame is a full paint. */
  dropBaseline(): void {
    this.prev = null;
  }

  dispose(): void {
    this.flush();
    this.clearTimers();
    this.disposed = true;
  }

  /**
   * Teardown that emits NOTHING. Used by the defensive uninstall at
   * executeDoor's entry: a frame still pending there belongs to a door that
   * already ended, and repainting it would drop a stale screen on top of the
   * menu the caller is looking at now.
   */
  disposeSilently(): void {
    this.clearTimers();
    this.dirty = false;
    this.disposed = true;
  }

  private clearTimers(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.capTimer) {
      clearTimeout(this.capTimer);
      this.capTimer = null;
    }
  }
}

/** The adapter driving this socket OR session, or null. */
export function c64AdapterFor(socket: any): C64DoorFrameAdapter | null {
  const holder = holderOf(socket);
  return (holder && holder[MARK]) || null;
}

export function installC64DoorAdapter(
  socket: any,
  session: AdapterSession | null | undefined,
  opts: C64AdapterOptions = {},
): C64DoorFrameAdapter | null {
  if (!socket) return null;
  const holder = holderOf(socket);
  if (holder[MARK]) return holder[MARK];
  if (!c64AdapterDrives(session)) return null; // the 80-column non-negotiable
  const cols = Math.min(C64_COLUMNS, doorScreenWidth(session, C64_COLUMNS));
  // `emit` is an own property on a connection-emitter object literal and a
  // PROTOTYPE method on a socket.io Socket. Uninstall has to put back what was
  // there, which for the prototype case means removing our own property, not
  // pinning an inherited method onto the instance for ever.
  const hadOwnEmit = Object.prototype.hasOwnProperty.call(socket, 'emit');
  const original = socket.emit.bind(socket);
  // A ModemEmulator constructed mid-door would otherwise capture the ADAPTER as
  // its _directEmit and route bypass traffic back into the reconstructor.
  const seededDirectEmit = !socket._directEmit;
  if (seededDirectEmit) socket._directEmit = original;
  const adapter = new C64DoorFrameAdapter(
    original,
    cols,
    opts.tickMs ?? C64_ADAPT_TICK_MS,
    opts.maxFrameMs ?? C64_ADAPT_MAX_FRAME_MS,
  );
  adapter.target = socket;
  adapter.original = hadOwnEmit ? socket.emit : null;
  adapter.hadOwnEmit = hadOwnEmit;
  adapter.seededDirectEmit = seededDirectEmit;
  holder[MARK] = adapter;
  const patched = (event: string, ...args: any[]) => {
    // A disposed adapter that could not be unpatched (something layered above
    // us owns `emit` now) degrades to a pass-through rather than buffering
    // into a reconstructor with no owner and re-arming its timers.
    if (!adapter.isDisposed() && event === 'ansi-output' && typeof args[0] === 'string') {
      adapter.write(args[0]);
      return true;
    }
    adapter.flush(); // keep wire ordering
    if (event === 'petscii-bytes' || event === 'petscii-output' || Buffer.isBuffer(args[0])) {
      adapter.dropBaseline();
    }
    return original(event, ...args);
  };
  adapter.patched = patched;
  socket.emit = patched;
  return adapter;
}

export interface C64UninstallOptions {
  /**
   * Tear down without emitting the pending frame. For the defensive uninstall
   * at executeDoor's entry, where a pending frame belongs to a door that has
   * already ended and would land on top of the caller's menu.
   */
  silent?: boolean;
}

export function uninstallC64DoorAdapter(socket: any, opts: C64UninstallOptions = {}): void {
  const holder = holderOf(socket);
  const adapter: C64DoorFrameAdapter | undefined = holder && holder[MARK];
  if (!adapter) return;
  if (opts.silent) adapter.disposeSilently();
  else adapter.dispose();
  restoreEmit(adapter);
  delete holder[MARK];
}

/**
 * Put `emit` back the way we found it - but ONLY if our patch is still the live
 * one. If something wrapped us after install (a ModemEmulator install mid-door
 * is the realistic case), that wrapper owns the property and captured our patch
 * as ITS downstream; assigning our captured original over it would silently
 * remove their layer. The adapter is disposed either way, and its patch then
 * behaves as a pass-through, so the door's bytes still reach the wire.
 */
function restoreEmit(adapter: C64DoorFrameAdapter): void {
  const target = adapter.target;
  if (!target) return;
  if (adapter.seededDirectEmit) delete target._directEmit;
  if (adapter.patched !== null && target.emit !== adapter.patched) return;
  if (adapter.hadOwnEmit) {
    if (adapter.original) target.emit = adapter.original;
  } else {
    // Inherited (socket.io): remove OUR own property so the prototype shows through.
    delete target.emit;
  }
}
