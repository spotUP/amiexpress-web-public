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
import { fileRecordRung } from './c64-file-record-rung';
import { getFileViewLayout } from '../services/file-layout.service';
import { config } from '../config';
import {
  FrameReconstructor,
  adaptRows,
  blankCell,
  isBlank,
  makeFrame,
  renderDiff,
  type AdaptedRow,
  type AlignMemo,
  type Cell,
  type Cursor,
  type Frame,
} from '@amiexpress/bbs-door-sdk/petscii/frame';
import { doorScreenWidth, petsciiColumnsOf, C64_COLUMNS, DEFAULT_DOOR_COLUMNS } from '../amiga-emulation/xim/screen-width.util';
import { stripNarrowNoise } from './c64-door-noise';
import { collapseBlankRunsToFit, collapseLongBlankRuns, dropOldestEntriesToFit, dropLastEntriesToFit } from './c64-door-fit';

/** Quiet gap after the last write that ends a frame. */
export const C64_ADAPT_TICK_MS = 30;
/** Hard cap on how long a frame may accumulate before it is cut anyway. */
export const C64_ADAPT_MAX_FRAME_MS = 250;
/**
 * The cap once the door has shown it ASKS FOR INPUT - a liveness guard, not
 * a frame boundary.
 *
 * A door that asks for a key tells the adapter when its screen is finished,
 * so the timers stop guessing. This is only here so a door that asks once
 * and then paints for ever cannot leave the caller looking at nothing: at
 * that point a cut mid-paint is the lesser evil, and progressive output is
 * what a listing wants anyway. Ten seconds is far longer than any repaint
 * measured on this emulator (a twelve-row list redraw is under two).
 */
export const C64_ADAPT_INTERACTIVE_CAP_MS = 10_000;

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
  /** 40 (a C64) or 80 (the web terminal's wide PETSCII screen). Absent = 40. */
  petsciiColumns?: number;
  /** Teletext session mode: the same 40-column grid on a full ANSI terminal. */
  texttvMode?: boolean;
}

export interface C64AdapterOptions {
  /** REDACTED: room reserved for a list's selection marker. */
  markerColumns?: number;
  tickMs?: number;
  maxFrameMs?: number;
  /** The door declared C64_DROP_OLDEST: its list may lose its oldest entries to fit. */
  dropOldest?: boolean;
  /** The door declared C64_DROP_LAST: its ranked list may lose its lowest ranks to fit. */
  dropLast?: boolean;
}

/** The rule ladder's output for the frame as it stands, plus where the painted rows end. */
export interface AdaptedView {
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
  // FORTY COLUMNS, not PETSCII. This asked "is this caller PETSCII?" while it
  // meant "is this caller a C64?", and the two stopped being the same question
  // when the web terminal's 80-column PETSCII screen arrived.
  //
  // At 80 the ladder's fold IS the identity, so installing looked harmless. It
  // is not: the caller's door output is still round-tripped through a 25-row
  // FrameReconstructor and repainted by renderDiff, which drops the escape
  // sequences that reconstructor does not model; `collapseLongBlankRuns`
  // squeezes his blank rows whatever his width; the file-record rung re-renders
  // a door's DIR rows through the FORTY-column FILEVIEW layout; and - worst -
  // the per-line pause stands down for an adapted caller (xim/io.ts:1632) in
  // favour of an adapted pause that can never fire at 80, because unseenRows()
  // is zero when nothing was folded. An 80-column caller was reading door
  // output with no pause at all, and whatever scrolled past 25 rows was never
  // sent to him.
  //
  // "80 column petscii dont need any special petscii rules it can use the
  // normal /X doors for everything and normal file lists etc" (sysop,
  // 2026-09-07). This is that sentence, in the one place that decides it.
  //
  // Teletext drives it too: a T caller chose the same 40-column grid, and
  // the reduction is width logic (frames to 40 ANSI rows) - the PETSCII
  // transducer sits further downstream and simply never runs for him.
  if (session?.texttvMode === true) return true;
  return session?.petsciiMode === true && petsciiColumnsOf(session) === C64_COLUMNS;
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
  /**
   * What this door has shown about its lists; see AlignMemo in the ladder.
   * Seeded from `REDACTED` so a door that marks a row reserves the
   * room from its FIRST frame, before any marker has been drawn.
   */
  private readonly align: AlignMemo = {};

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
    /** C64_DROP_OLDEST: this door's list may lose its oldest entries to fit. */
    private readonly dropOldest: boolean = false,
    /** C64_DROP_LAST: this door's ranked list may lose its lowest ranks to fit. */
    private readonly dropLast: boolean = false,
    /**
     * REDACTED: room this door's list needs to the LEFT of its
     * entries for the marker it draws on the selected row. Reserved from the
     * FIRST frame, because a door draws no marker until the caller moves.
     */
    markerColumns: number = 0,
  ) {
    if (markerColumns > 0) this.align.markerColumns = markerColumns;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Has this door asked the caller for a key? Then IT says when a screen is
   * finished, and the quiet gap stops guessing. See `flushForInput`.
   */
  private asksForInput = false;

  write(text: string): void {
    this.screen.write(text);
    this.dirty = true;
    this.writeSeq += 1;
    if (this.timer) clearTimeout(this.timer);
    // THE QUIET GAP IS A GUESS, and only worth making while the door's own
    // rhythm is unknown. This emulator writes a repaint's rows 200-400 ms
    // apart, so a 30 ms gap lands INSIDE one: the caller was shown a list
    // with one entry in its old position and its new one at once, and which
    // entry doubled moved with the cut (sysop, 2026-09-14).
    if (!this.asksForInput) {
      this.timer = setTimeout(() => this.flush(), this.tickMs);
    }
    if (!this.capTimer) {
      this.capTimer = setTimeout(
        () => this.flush(),
        this.asksForInput ? C64_ADAPT_INTERACTIVE_CAP_MS : this.maxFrameMs,
      );
    }
  }

  /**
   * The door has stopped painting and is asking for a key: THE frame
   * boundary, and the only one that knows a repaint has finished.
   *
   * Called from the XIM input path (`xim/io.ts`, JH_HK). It also records
   * that this door asks at all, which is what lets `write` stop cutting on
   * the quiet gap.
   */
  flushForInput(): void {
    this.asksForInput = true;
    this.flush();
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

  /**
   * How wide this caller's PETSCII screen is: 40 for a C64, 80 for the web
   * terminal's wide screen. Read by anything that must ask "is this caller
   * 40 columns?" rather than "does this caller have an adapter?" - the two
   * were the same question until the wide screen existed.
   */
  get columns(): number {
    return this.cols;
  }

  /**
   * The adapted view, for a test that wants what the caller SEES rather than
   * a re-derivation of the pipeline. The corpus end-to-end suite rebuilt
   * these stages by hand and broke twice in one day when a stage was added;
   * asking is one call and cannot drift.
   */
  adaptedView(): AdaptedView {
    return this.adapted();
  }

  /**
   * The frame the ladder folds: the reconstructed screen after the pre-passes,
   * before adaptRows sees it. Public for the same reason `adaptedView` is -
   * the corpus end-to-end suite has to check the ladder's rules against what
   * the ladder was actually given, and every copy of these three calls is a
   * copy that drifts when a pre-pass is added.
   */
  sourceView(): Frame {
    return this.prePassed();
  }

  /**
   * The pre-passes, applied to the reconstructed screen.
   *
   * Three steps, each a no-op on a screen that already fits: blank what the
   * door wrote into slots nobody filled, squeeze runs of blank rows, and -
   * only where the door declared it - drop the oldest entries of its list.
   * See c64-door-noise.ts and c64-door-fit.ts for what each one may touch.
   *
   * A rule that matches TEXT needs a width gate; a reducer that MEASURES
   * does not. stripNarrowNoise blanks what a door writes into slots nobody
   * filled in - and every one of those was removed because it cost a
   * 40-column caller ROWS he did not have. An 80-column caller has the
   * room the 80-column ANSI caller has and sees what that caller sees.
   * The two fit reducers beside it stay ungated: they ask how tall the
   * screen came out and do nothing while it fits.
   */
  private prePassed(): Frame {
    const fit = { cols: this.cols, rows: ROWS };
    const snapshot = this.screen.snapshot();
    const stripped = collapseBlankRunsToFit(
      collapseLongBlankRuns(this.cols <= C64_COLUMNS ? stripNarrowNoise(snapshot) : snapshot),
      fit,
    );
    return this.dropOldest ? dropOldestEntriesToFit(stripped, fit) : stripped;
  }

  /** The adapted rows of the frame as it stands, memoised until the next write. */
  private adapted(): AdaptedView {
    if (this.adaptedCache && this.adaptedCache.seq === this.writeSeq) return this.adaptedCache;
    // The noise pre-pass runs on the SOURCE grid, before any rung sees it:
    // a phrase blanked here costs the caller no rows at all, where blanking it
    // afterwards would leave the rows the ladder had already spent. See
    // c64-door-noise.ts for what qualifies and why it is not a ladder rung.
    // It lives in prePassed(), which is also what sourceView() hands a test.
    //
    // THE FILE-RECORD RUNG. A DIR row a 68K door printed is re-rendered
    // through the SAME interpreter and the SAME Prompts/FILEVIEW.40 the
    // board's own listing uses, so `F` through AquaScan and `F` through the
    // internal handler are one screen rather than two.
    //
    // ONE LAYOUT SNAPSHOT PER FRAME, taken here: a sysop saving the file
    // mid-listing cannot split a frame between two layouts, and the two paths
    // cannot be handed different layouts for the same record.
    //
    // The ordinal restarts per frame because a frame is what a caller can see
    // - and the internal listing's own numbering is per pass for the same
    // reason.
    let ordinal = 0;
    const layout = getFileViewLayout(config.get('dataDir'));
    const { rows, cursor } = adaptRows(this.prePassed(), {
      cols: this.cols,
      // WHAT THIS DOOR HAS SHOWN ABOUT ITS LISTS, kept for the door's
      // lifetime. A marked list's left edge is the LIST's, not one frame's:
      // without this the numbers stepped a column sideways the moment the
      // caller's marker appeared, and back again when it left (sysop,
      // 2026-09-14). One memo per adapter, so it dies with the door.
      align: this.align,
      blockRenderer: fileRecordRung({
        layout,
        cols: this.cols,
        nextOrdinal: () => ++ordinal,
      }),
    });
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
  // The caller's own PETSCII width - 40 for a C64, 80 for the wide screen.
  // At 80 the 80-to-N fold is the identity and nothing is reduced.
  const cols = Math.min(DEFAULT_DOOR_COLUMNS, doorScreenWidth(session, C64_COLUMNS));
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
    opts.dropOldest === true,
    opts.dropLast === true,
    opts.markerColumns ?? 0,
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
