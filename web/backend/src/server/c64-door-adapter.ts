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
 * KEYED BY SESSION, not by object. A telnet connection can carry more than one
 * emitter object for the same session (c64-detected-handler.ts:36 builds a
 * second buildConnectionEmitter for the same connection), so the adapter is
 * stored on the session and remembers WHICH socket object it patched; lookup
 * from any emitter for that session finds it, and uninstall restores the emit
 * onto the object that was actually patched.
 *
 * _directEmit. ModemEmulator captures socket.emit in its CONSTRUCTOR
 * (modem-emulator.util.ts:28-30) and AmigaDoorSession.suspendModemThrottle can
 * construct one mid-door, so install() seeds `socket._directEmit` with the
 * PRE-adapter emit if it is unset. Consumers of _directEmit (screen wipes,
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
 * The ONE predicate for "this session's 68K door output goes through the
 * adapter". The per-DOOR half of the decision (the C64_ADAPT tooltype) lives
 * at the launch site in door.handler.ts, so a door that has not been adapted
 * and verified never arms this even for a C64 caller.
 */
export function c64AdapterDrives(session: AdapterSession | null | undefined): boolean {
  return session?.petsciiMode === true;
}

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
  /** The object whose emit was patched, and the emit to put back. */
  target: any = null;
  original: ((event: string, ...args: any[]) => any) | null = null;

  constructor(
    private readonly downstream: (event: string, ...args: any[]) => any,
    private readonly cols: number,
    private readonly tickMs: number,
    private readonly maxFrameMs: number,
  ) {}

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
  const original = socket.emit.bind(socket);
  // A ModemEmulator constructed mid-door would otherwise capture the ADAPTER as
  // its _directEmit and route bypass traffic back into the reconstructor.
  if (!socket._directEmit) socket._directEmit = original;
  const adapter = new C64DoorFrameAdapter(
    original,
    cols,
    opts.tickMs ?? C64_ADAPT_TICK_MS,
    opts.maxFrameMs ?? C64_ADAPT_MAX_FRAME_MS,
  );
  adapter.target = socket;
  adapter.original = socket.emit;
  holder[MARK] = adapter;
  socket.emit = (event: string, ...args: any[]) => {
    if (event === 'ansi-output' && typeof args[0] === 'string') {
      adapter.write(args[0]);
      return true;
    }
    adapter.flush(); // keep wire ordering
    if (event === 'petscii-bytes' || event === 'petscii-output' || Buffer.isBuffer(args[0])) {
      adapter.dropBaseline();
    }
    return original(event, ...args);
  };
  return adapter;
}

export function uninstallC64DoorAdapter(socket: any): void {
  const holder = holderOf(socket);
  const adapter: C64DoorFrameAdapter | undefined = holder && holder[MARK];
  if (!adapter) return;
  adapter.dispose();
  if (adapter.target && adapter.original) adapter.target.emit = adapter.original;
  delete holder[MARK];
}
