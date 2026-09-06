/**
 * The C64 door adapter's transport seam (Phase 3 of the strategy plan).
 *
 * A 68K door paints an 80-column screen; a PETSCII caller has 40x25. Rather
 * than rewrite the byte stream, this replays the door's ANSI onto a virtual
 * 80x25 grid (FrameReconstructor), reduces each finished FRAME with the rule
 * ladder (adaptRows), and emits the minimal ANSI that repaints it (renderDiff)
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
 * PAGING (backlog 11.3). The rule ladder can make a screen TALLER than it
 * started - a menu that reflows into 33 rows cannot be shown to a 25-row
 * caller at once - so the adapter keeps ONE window over the adapted rows and
 * `windowTop()` is the only place it is anchored. With no walk in progress it
 * sits at the bottom of the PAINTED content, which keeps the door's prompt and
 * cursor on screen; when the pause owner arms a walk (xim/io.ts, the only
 * thing that can hold the emulator and read the caller's key) it is `pageTop`
 * and walks DOWN a page at a time behind the express.e pause prompt. See the
 * block on `pageTop` and the one on `windowTop`. A frame whose painted rows
 * fit - every frame the corpus and identity pins measure - is shown from its
 * first row, which is the window at offset zero.
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
  adaptRows,
  blankCell,
  isBlank,
  makeFrame,
  renderDiff,
  type AdaptedRow,
  type Cell,
  type Cursor,
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
/**
 * The SAME adapter, parked on the socket as well whenever the holder is a
 * session. A connection's `session` is a live getter onto the connection
 * object, and a connection can be handed a NEW session mid-door (a re-login,
 * a node reassignment, c64-detected-handler building a second emitter). If
 * that happens the old session still carries the mark and the new one carries
 * nothing, so a lookup from the socket would answer null - and the socket
 * would keep a patched `emit` feeding a reconstructor with no owner for the
 * rest of the connection. The back-reference is keyed to the object whose
 * `emit` was actually patched, which never changes.
 */
const SOCKET_MARK = '_c64DoorAdapterOnSocket';

export interface AdapterSession {
  petsciiMode?: boolean;
  screenWidth?: number;
}

export interface C64AdapterOptions {
  tickMs?: number;
  maxFrameMs?: number;
}

/** The rule ladder's output for the frame as it stands, plus where the painted rows end. */
interface AdaptedView {
  seq: number;
  rows: AdaptedRow[];
  cursor: Cursor;
  contentEnd: number;
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

/** Where the adapter is stored: the session when the socket has one, else the socket. */
function holderOf(socket: any): any {
  return (socket && socket.session) || socket;
}

/**
 * The adapter reachable from this socket by EITHER route - the current
 * holder's mark, or the back-reference parked on the socket itself.
 */
function lookup(socket: any): C64DoorFrameAdapter | null {
  if (!socket) return null;
  const holder = holderOf(socket);
  return (holder && holder[MARK]) || socket[SOCKET_MARK] || null;
}

export class C64DoorFrameAdapter {
  private readonly screen = new FrameReconstructor({ cols: SOURCE_COLS, rows: ROWS });
  private prev: Frame | null = null;
  private timer: NodeJS.Timeout | null = null;
  private capTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  private disposed = false;
  /**
   * ADAPTED-FRAME PAGING (backlog 11.3). The rule ladder can make a screen
   * TALLER than it started: `games` (5D-AdiMenu) paints 19 source rows that
   * reflow into 33 adapted ones, and a window that shows the LAST `rows` of
   * them leaves the title and nine games off the top having never been on the
   * caller's screen. Measured on the real file: painted rows start falling off
   * at source line 4, which is why no threshold on the SOURCE line counter can
   * fix this (a 25-row grid's blank tail is adapted too, so the total is over
   * 25 before the door has printed its second entry).
   *
   * The window is therefore walked DOWN a page at a time by whoever owns the
   * pause - xim/io.ts, which is the only thing that can hold the emulator and
   * read the caller's key. While a walk is in progress (`paging`) the window
   * sits at `pageTop`; the rest of the time `windowTop()` anchors it at the
   * bottom of the PAINTED content. INVARIANT: `paging === false` implies
   * `pageTop === 0` - settleWindow() and dropBaseline() are the only ways out
   * of a walk and both reset it - so `unseenRows()` reads the same window
   * either way.
   */
  private pageTop = 0;
  private paging = false;
  /** Bumped by every write, so the adapted view can be memoised between calls in the same frame. */
  private writeSeq = 0;
  private adaptedCache: AdaptedView | null = null;
  /** The object whose emit was patched, and the emit to put back. */
  target: any = null;
  original: ((event: string, ...args: any[]) => any) | null = null;
  /** The function install() actually assigned, so uninstall can tell whether it is still live. */
  patched: ((event: string, ...args: any[]) => any) | null = null;
  /** Was `emit` an OWN property before we patched (emitter literal), or inherited (socket.io)? */
  hadOwnEmit = false;
  /** Did WE create socket._directEmit? Only then may uninstall remove it. */
  seededDirectEmit = false;
  /** The object install() wrote MARK onto - which may no longer be socket.session. */
  holder: any = null;

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
    this.writeSeq += 1;
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
    this.settleWindow();
    this.paint(null);
  }

  // ---- adapted-frame paging -------------------------------------------
  //
  // The three questions the pause owner asks. All of them are answered from
  // the adapter's OWN FrameReconstructor, never from the chunk that happened
  // to arrive: a source row can be built from any number of emit() calls, and
  // `games` resolves its two columns with ESC[nC and CR rather than spaces, so
  // a measurement taken on a chunk's text would be wrong even when the chunk
  // happens to hold a whole row. The reconstructor has already absorbed every
  // chunk and resolved every cursor move, so there is nothing a chunk boundary
  // can double-count or lose.

  /**
   * Adapted rows the caller's screen cannot hold from the current window.
   *
   * With no walk in progress `pageTop` is 0 (see the invariant above), so this
   * is `contentEnd - 25` - and because `windowTop()` anchors the un-walked
   * window on the painted height too, that is EXACTLY the number of painted
   * rows that window pushes off the top. The measurement and the paint agree;
   * they did not while the window counted the grid's blank tail, and 18 of the
   * 29 corpus fixtures lost rows this reported as zero.
   *
   * Zero for every frame whose painted rows fit, so those never enter the
   * paged path.
   */
  unseenRows(): number {
    this.settleWindow();
    return Math.max(0, this.adapted().contentEnd - (this.pageTop + ROWS));
  }

  /**
   * Show the current page with `prompt` on its bottom row and arm paging. The
   * prompt is painted HERE rather than emitted into the reconstructor because
   * the door's cursor sits at the end of the source screen, which on an
   * overflowing frame adapts to a row below the window - the caller would
   * never see it. Same bytes as express.e:5193, a different row.
   */
  showPause(prompt: string): void {
    this.paging = true;
    this.paint(prompt);
  }

  /**
   * Release the next page. Returns the rows still unseen after it, so the
   * pause owner knows whether to prompt again or let the door go.
   * A page is ROWS-1 rows: the row the prompt occupies is not skipped, it is
   * the first row of the page that follows.
   */
  nextPage(): number {
    if (this.unseenRows() > 0) this.pageTop += ROWS - 1;
    return this.unseenRows();
  }

  /**
   * Repaint the current page with no prompt - the last page of a walk.
   *
   * The walk is NOT ended here, and that is deliberate. `pageTop` is the
   * high-water mark of what the caller has been shown: leaving it in place is
   * what makes `unseenRows()` answer zero for the rows he has already read, so
   * the door runs on instead of being held again on the next message. Dropping
   * back to the un-walked anchor here would report the top rows unseen a
   * second time and prompt for them again, for ever. settleWindow() releases
   * the walk as soon as the door's screen fits again or it paints past
   * `pageTop`, and dropBaseline() releases it on a raw-PETSCII repaint.
   */
  showPage(): void {
    this.paint(null);
  }

  /** The window this adapter is showing, for tests and for the pause owner's logs. */
  pageOffset(): number {
    return this.pageTop;
  }

  /**
   * A frame that fits again ends the walk: the door cleared its screen, or
   * printed something short. Without this a `pageTop` left over from the last
   * walk would window a fresh 20-row screen off the bottom and show blanks.
   */
  private settleWindow(): void {
    if (!this.paging) return;
    const { contentEnd } = this.adapted();
    if (contentEnd <= ROWS || this.pageTop >= contentEnd) {
      this.pageTop = 0;
      this.paging = false;
    }
  }

  /** The adapted rows of the frame as it stands, memoised until the next write. */
  private adapted(): AdaptedView {
    if (this.adaptedCache && this.adaptedCache.seq === this.writeSeq) return this.adaptedCache;
    const { rows, cursor } = adaptRows(this.screen.snapshot(), { cols: this.cols });
    // The blank tail of a 25-row grid is not content. It still costs adapted
    // rows, which is exactly how adaptFrame comes to push painted rows off the
    // top, so the window is measured against the PAINTED height instead.
    let contentEnd = rows.length;
    while (contentEnd > 0 && rows[contentEnd - 1].cells.every(isBlank)) contentEnd--;
    const view: AdaptedView = { seq: this.writeSeq, rows, cursor, contentEnd };
    this.adaptedCache = view;
    return view;
  }

  /**
   * The first adapted row of the window the caller is shown - the ONE place
   * the window is anchored, so `unseenRows()` and the paint cannot disagree.
   *
   * THE BUG THIS REPLACES. `adaptFrame` anchors at `total - 25`, and `total`
   * counts the BLANK TAIL of the 80x25 grid the door painted on: every unused
   * source row costs an adapted row, and each one shoves a PAINTED row off the
   * top. Measured over the 29 corpus fixtures, 22 lost painted rows that way -
   * gwall 5, olm 4, `b` 4, ratiorep 4, super_stats 4, ulist 3, six_status 9 -
   * and 18 of them (olm, `b`, ratiorep, ulist, super_stats, ...) had painted
   * content that FITS a 25-row screen and lost the top of it anyway, purely to
   * blank rows. `unseenRows()` measured `contentEnd` and so reported 0 for all
   * of those: the two ends did not agree, and the caller lost the difference.
   *
   * Anchoring on the PAINTED height instead makes them agree by construction -
   * the rows this window pushes off the top are exactly
   * `contentEnd - 25`, which is what `unseenRows()` returns. Content that fits
   * is shown from its first row and needs no pause at all; content that does
   * not is walked from the top by the pause owner (see `pageTop`).
   *
   * It is still anchored at the BOTTOM of the painted content when there is no
   * walk, which is what keeps a door's prompt and cursor - the last thing it
   * painted - on the caller's screen. Only the blank tail left the measurement.
   */
  private windowTop(height: number): number {
    if (this.paging) return this.pageTop;
    return Math.max(0, this.adapted().contentEnd - height);
  }

  /** Render window [windowTop, windowTop+height) plus an optional prompt row. */
  private paint(prompt: string | null): void {
    this.clearTimers();
    this.dirty = false;
    const { rows, cursor } = this.adapted();
    const height = prompt === null ? ROWS : ROWS - 1;
    const top = this.windowTop(height);
    const visible: Cell[][] = rows
      .slice(top, top + height)
      .map((r) => r.cells.map((c) => ({ ...c })));
    let where: Cursor;
    if (prompt === null) {
      where = {
        x: Math.max(0, Math.min(this.cols - 1, cursor.x)),
        y: Math.max(0, Math.min(ROWS - 1, cursor.y - top)),
      };
    } else {
      while (visible.length < ROWS - 1) visible.push([]);
      visible.push(Array.from(prompt).map((ch) => ({ ...blankCell(), ch })));
      where = { x: Math.min(this.cols - 1, prompt.length), y: ROWS - 1 };
    }
    const next = makeFrame(this.cols, ROWS, visible, where);
    const ansi = renderDiff(this.prev, next, this.cols, ROWS);
    this.prev = next;
    this.downstream('ansi-output', ansi);
  }

  /** The caller's screen was repainted outside this model: the next frame is a full paint. */
  dropBaseline(): void {
    this.prev = null;
    this.pageTop = 0;
    this.paging = false;
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
  return lookup(socket);
}

export function installC64DoorAdapter(
  socket: any,
  session: AdapterSession | null | undefined,
  opts: C64AdapterOptions = {},
): C64DoorFrameAdapter | null {
  if (!socket) return null;
  const existing = lookup(socket);
  if (existing) return existing;
  const holder = holderOf(socket);
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
  adapter.holder = holder;
  holder[MARK] = adapter;
  if (holder !== socket) socket[SOCKET_MARK] = adapter;
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
  const adapter = lookup(socket);
  if (!adapter) return;
  if (opts.silent) adapter.disposeSilently();
  else adapter.dispose();
  restoreEmit(adapter);
  // Clear BOTH routes, and clear the holder install() actually wrote to
  // rather than whatever socket.session happens to be now: a session swapped
  // in mid-door would otherwise leave the mark on the session that is gone.
  if (adapter.holder) delete adapter.holder[MARK];
  const holder = holderOf(socket);
  if (holder) delete holder[MARK];
  if (socket) delete socket[SOCKET_MARK];
  // ...and on the object install() actually patched, which for a telnet/SSH
  // session may be a DIFFERENT emitter from the one uninstall was called
  // with (connection-emitter builds more than one for a connection).
  if (adapter.target) delete adapter.target[SOCKET_MARK];
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
