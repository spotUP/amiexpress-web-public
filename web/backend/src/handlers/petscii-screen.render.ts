/**
 * `renderPetsciiScreen` - FULL MCI inside a PETSCII `.seq` screen.
 *
 * Plan: `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`, Task 5.
 *
 * ONE server-side render path serves both C64 transports (decision 2): the
 * telnet emitter forwards `petscii-bytes` raw and the web terminal feeds the
 * same payload to its own machine, so rendering here - and only here - keeps
 * them identical. The client-side transducer never sees an MCI code.
 *
 * This module owns NO table, NO cursor walker and NO `~` scanner of its own:
 *
 *   | concern              | survivor it calls                              |
 *   |----------------------|------------------------------------------------|
 *   | MCI scanning         | `processMci` (mci-tokenizer.util.ts)           |
 *   | MCI pre-passes       | `applyMciPrePasses` (mci-pre-passes.ts)        |
 *   | MCI values           | `buildMciDispatch` (mci-dispatch.ts)           |
 *   | ASCII -> PETSCII     | `encodePetsciiValue` (sdk/petscii)             |
 *   | `~x` / `~y` walk     | `petsciiMoveTo` (sdk/petscii)                  |
 *   | bank / cursor / pen  | `PetsciiMachine` (sdk/petscii)                 |
 *
 * The machine is the ONLY oracle. Every byte this render emits is fed to it,
 * so the charset bank, cursor column, pen and reverse state read at a token
 * are the state the caller's terminal is actually in at that point in the
 * file - positional, not guessed.
 *
 * WHAT THE TOKENS MEAN ON A C64 (plan Task 8; the sysop-facing copy of
 * this table is in `handoff.md`):
 *
 *  - `~WX` and the rest of the `~W*` family - wipes NEVER animate on a C64.
 *    A wipe is an 80-column effect by construction (`getWipeFrames` composes
 *    an 80-wide grid and pushes frames straight at the socket), so
 *    `wipeEffectsEnabled` is false for a PETSCII session and the directive
 *    is STRIPPED here, exactly as `displayScreen` strips it for the ANSI
 *    path - code and its own line together. It is never printed.
 *  - `~c0..~c7` - one VIC pen byte, in force until art or another token
 *    changes it. There is no "colour off".
 *  - `~b0..~b7` / `~z0..~z7` - the CCGMS pair `$02 <colour>`, which sets
 *    the BACKGROUND and the BORDER together (they cannot be independent on
 *    a VIC-II). Inert on SyncTERM's C64 mode, which ignores `$02`.
 *  - `~f` - `$93` CLR: clears, homes the cursor and repaints the screen in
 *    the current pen.
 *  - `~q` - reverse off plus the default pen. A C64 has no
 *    all-attributes-off; `\x1b[0m` on this wire is five garbage glyphs.
 *  - `~CR` / `~n*` - `$0D`, which on a C64 ALSO cancels reverse
 *    (`petscii-machine.ts:109`). Real KERNAL behaviour, not a bug.
 *  - `~x` / `~y` - a RELATIVE `$11`/`$1D` walk from wherever the cursor is:
 *    the C64 has no absolute cursor address.
 *  - `~AK` - 13 plain rows, no colour. The ANSI SGR frame has no C64
 *    equivalent worth faking.
 *  - `~SP` - a real pause. The remainder of the file is rendered by THIS
 *    ctx after the keypress, so the bank, cursor, pen and reverse the art
 *    left behind carry across the pause (`screen.handler.ts`'s segment
 *    machine). The gate is per FILE, so an art `~` in the remainder stays
 *    art.
 *
 * express.e parity: the first-byte `~` gate is `express.e:6800-6806`
 * (`IF linedata[0]<>"~" THEN allowMCI:=FALSE`, evaluated on the FIRST line of
 * the file only). A file without it is art and goes out byte for byte.
 */
import { Buffer } from 'buffer';
import {
  AnsiToPetsciiTransducer,
  PetsciiMachine,
  encodePetsciiValue,
  petsciiMoveTo,
} from '@amiexpress/bbs-door-sdk/petscii';
import type { BBSSession } from '../index';
import {
  processMci,
  type MciDispatchMap,
  type MciPrefixDispatchMap,
} from '../utils/mci-tokenizer.util';
import {
  buildMciDispatch,
  MCI_SENTINELS,
  PETSCII_RAW_CMDS,
  PETSCII_RAW_PREFIXES,
  type MciDispatchState,
} from './mci-dispatch';
import { applyMciPrePasses, MCI_GENERATED, type MciPrePassResult } from './mci-pre-passes';
import { parseWipeMCI } from '../utils/screen-wipe.util';
import { petsciiTerminalModelFor } from '../utils/petscii-session-model';

/** express.e's MCI opt-in byte (`~`), tested on the file's FIRST byte only. */
const GATE_BYTE = 0x7e;

/** The only cursor-moving byte `encodePetsciiValue` can produce. */
const PETSCII_RETURN = 0x0d;

export interface PetsciiRenderCtx {
  /**
   * Bank / cursor / pen / reverse oracle, fed EVERY byte this render emits.
   * Carried across `~SP` resumes and `~SS_` includes, which is why it is
   * cached on the session and the rest of this context is not.
   */
  machine: PetsciiMachine;
  /**
   * Rebuilt per render - a CALLER CONTRACT, not something this module can
   * enforce: build a fresh ctx with `petsciiRenderCtxFor` for every render
   * (Task 6 does), because these values close over the clock, the conference
   * and the byte counters. Reusing one ctx across paints freezes them.
   */
  dispatch: MciDispatchMap;
  prefixDispatch: MciPrefixDispatchMap;
  /**
   * MCI terminator. Starts at `|` and is REWRITTEN by each render to the
   * terminator its `~D<char>` pre-pass ended on, so a later per-chunk render
   * (Task 7's walker) continues with the file's own terminator.
   */
  terminator: string;
  /** `hasPause` (`~SP`), written by the dispatch AND folded in from the pre-passes. */
  state: MciDispatchState;
  /** express.e's `outdata=NIL` mode: structural tokens become NUL sentinels. */
  inlineMode: boolean;
  /**
   * The pre-pass result of the most recent render. `renderPetsciiScreen`
   * returns bytes only, so the queued commands / include files / slow-mode
   * settings the pre-passes collected are handed back here for the caller's
   * walker (Tasks 6 and 7).
   */
  lastPrePass?: MciPrePassResult;
}

export interface PetsciiRenderCtxOpts {
  /** Default true: both production call sites are socket-bound. */
  inlineMode?: boolean;
  /**
   * The render's clock, forwarded to `buildMciDispatch`. Left out here: this
   * render reads no second clock, so there is no boundary for `~DT` to
   * straddle. A caller that does read one should pass its own `Date`.
   */
  now?: Date;
}

/**
 * The session's terminal model - the SAME object the transports feed.
 *
 * It is an `AnsiToPetsciiTransducer` and not a bare `PetsciiMachine` because
 * a PETSCII terminal receives BOTH flavours and BOTH reach it through a
 * choke: `ansi-output` / `petscii-output` are transduced there
 * (`server/connection-emitter.ts` for telnet/SSH/WS-terminal, the
 * registration-time `socket.emit` wrapper in `server/socket-handlers.ts` for
 * web), and every `petscii-bytes` payload is either observed there or - when
 * THIS render produced it - fed here as it was encoded and marked, so the
 * choke does not feed it twice (`utils/petscii-session-model.ts`).
 *
 * The render therefore owns no model of its own. It reads the one the
 * session already has, which is what makes the cursor it clips against the
 * cursor the caller's terminal is actually at, no matter what put it there:
 * a menu, a paginated `.TXT`, a door, a chat page from another node.
 */
export function petsciiTransducerFor(session: BBSSession): AnsiToPetsciiTransducer {
  return petsciiTerminalModelFor(session);
}

/**
 * The session's bank / cursor / pen oracle, created on first use.
 *
 * Exported because a caller that only needs to put a control byte on the wire
 * - the `$93` screen clear - must feed that byte to the SAME machine without
 * paying for a dispatch build (`buildMciDispatch` runs the message-base and
 * system-stats lookups its closures read).
 *
 * It IS the terminal model's machine: one screen, one model of it.
 */
export function petsciiMachineFor(session: BBSSession): PetsciiMachine {
  return petsciiTerminalModelFor(session).machine;
}

/**
 * The context for one render.
 *
 * CACHED: the `PetsciiMachine` only. It is the positional oracle - a `~SS_`
 * include or a `~SP` resume must continue the same bank and cursor - and it
 * is not cached HERE at all: it is the machine of the session's ONE terminal
 * model (`utils/petscii-session-model.ts`), which the transports feed.
 *
 * REBUILT EVERY CALL: dispatch, prefix dispatch and state. Their closed-over
 * values are volatile (`~TL` time remaining, `~DT`/`~OT` clocks, `~CN` after
 * a `J`, the byte counters); caching them would freeze a caller's clock at
 * login. `buildMciDispatch` is async and cheap next to a screen paint.
 */
export async function petsciiRenderCtxFor(
  session: BBSSession,
  opts: PetsciiRenderCtxOpts = {},
): Promise<PetsciiRenderCtx> {
  const machine = petsciiMachineFor(session);
  const inlineMode = opts.inlineMode ?? true;
  const { dispatch, prefixDispatch, state } = await buildMciDispatch(session, {
    flavour: 'petscii',
    inlineMode,
    sentinels: MCI_SENTINELS,
    now: opts.now,
  });
  return {
    machine,
    dispatch,
    prefixDispatch,
    state,
    terminator: '|',
    inlineMode,
  };
}

/**
 * True when the machine would PRINT this byte, i.e. when it advances the
 * cursor. Mirrors `petscii-machine.ts`'s own control-byte rule (`b < $20` or
 * `$80..$9F` are controls, everything else is printable) - the machine has no
 * public predicate to ask, and the clip below must decide BEFORE it feeds.
 */
function advancesCursor(b: number): boolean {
  return !(b < 0x20 || (b >= 0x80 && b <= 0x9f));
}

/** A substituted value whose bytes are ALREADY PETSCII and must not be re-encoded. */
function isRawSpan(cmd: string): boolean {
  return PETSCII_RAW_CMDS.has(cmd) || (cmd.length > 0 && PETSCII_RAW_PREFIXES.has(cmd[0]));
}

/** Where `processMci` substituted a value, as offsets on its OWN output. */
export interface PetsciiSpan {
  start: number;
  len: number;
  cmd: string;
}

/**
 * One `.seq`, scanned ONCE: the express.e gate, the pre-passes and the
 * tokenizer. Scanning and rendering are separate because a screen with a
 * structural token is rendered in PIECES - the walker (`screen.handler.ts`)
 * emits the text before a `~SS_`, runs the include, then renders the rest -
 * and the oracle must observe those pieces in document order. The scan
 * itself must still happen once for the whole file: sentinel offsets are
 * only meaningful on `processMci`'s immediate output.
 */
export interface PetsciiSeqPlan {
  /** express.e's first-byte `~` gate (`:6800-6806`). false = art, verbatim. */
  gated: boolean;
  /** `processMci`'s output: art, substituted values and NUL sentinels. */
  text: string;
  /** Where the tokenizer substituted, on `text`. */
  spans: PetsciiSpan[];
}

/**
 * Gate, pre-pass and tokenize one `.seq` buffer. No bytes are emitted and
 * the oracle is not fed - `renderChunkBytes` does both, per chunk.
 *
 * A non-gated file returns `{ gated: false }` with no text: it is art and
 * the caller must put its ORIGINAL bytes on the wire (and feed them to the
 * machine), which is what `renderPetsciiScreen` does below.
 */
export async function preparePetsciiSeq(
  bytes: Buffer,
  session: BBSSession,
  ctx: PetsciiRenderCtx,
): Promise<PetsciiSeqPlan> {
  // 1. The gate (decision 3, express.e:6800-6806), evaluated ONCE per file on
  //    its first byte - never per `~SP` segment.
  if (bytes.length === 0 || bytes[0] !== GATE_BYTE) {
    return { gated: false, text: '', spans: [] };
  }

  // 2. latin1: one char per byte, lossless for $00-$FF. NEVER utf8 - it
  //    destroys every high-bit PETSCII byte in the art.
  const src = bytes.toString('latin1');

  // 2b. Wipe directives (decision 8). A `.seq` returns from `displayScreen`'s
  //     `isPetscii` branch BEFORE the ANSI wipe detection runs, so the strip
  //     has to happen here or the tokenizer's strict fall-through prints the
  //     cmd text (`~WX` reaches a C64 as the letters `WX`). Effects are off
  //     for a PETSCII session by construction - `wipeEffectsEnabled` is
  //     false, a wipe being an 80-column effect - so the directive is
  //     consumed and never animated. ONE regex, the ANSI path's own
  //     (`parseWipeMCI`), including its own-line semantics: the code and its
  //     line break go together.
  const dewiped = parseWipeMCI(src).content;

  const pre = await applyMciPrePasses(dewiped, session, {
    flavour: 'petscii',
    inlineMode: ctx.inlineMode,
    sentinels: MCI_SENTINELS,
  });
  ctx.lastPrePass = pre;
  ctx.terminator = pre.terminator;
  if (pre.hasPause) ctx.state.hasPause = true;

  // 3. ONE tokenizer, told where it substituted. Strict fall-through is
  //    express.e exact (the `~` is consumed); case-sensitive matches the ANSI
  //    path. Offsets are only meaningful on processMci's immediate output,
  //    which is why the renderer calls it directly instead of going through
  //    parseMciCodes' regex stages.
  const spans: PetsciiSpan[] = [];
  const text = processMci(
    pre.text,
    {
      dispatch: ctx.dispatch,
      prefixDispatch: ctx.prefixDispatch,
      softFallThrough: false,
      caseSensitive: true,
      onSubstitution: (start, len, cmd) => {
        if (len > 0) spans.push({ start, len, cmd });
      },
    },
    ctx.terminator,
  );

  return { gated: true, text, spans };
}

/**
 * Render one run of a prepared plan (or any ad-hoc PETSCII text, such as the
 * lone `$93` a screen clear puts on the wire) into bytes, feeding EVERY byte
 * to the oracle as it goes.
 *
 * `spans` are the substitution spans that fall inside `text`, with offsets
 * REBASED to it - a caller slicing a chunk out of `plan.text` must rebase.
 * Text with no span is art and is copied byte for byte.
 *
 * Structural sentinels (`~SS_` / `~SR_` / `~CC_` / `~SP` / inline `~f`) pass
 * through UNTOUCHED and UNFED: they are not screen bytes, so the oracle must
 * not see their letters printed. The walker splits chunks on them, so they
 * only reach here when a caller renders a whole file at once (a `.seq` with
 * no socket behind it). `~x` / `~y` are the one exception: their MOVE
 * sentinel is resolved here, against the live cursor.
 *
 * `$02` edge case (the real C64 behaviour, not a workaround): `$02` arms the
 * machine's background prefix and is consumed ONLY if the next byte is itself
 * a PETSCII colour byte (`petscii-machine.ts:91-100`); otherwise the prefix
 * clears and that byte prints normally. So art ending in `$02` cannot eat the
 * first letter of a substituted value - the only span it can bite is a raw
 * colour span (`~c*` / `~b*` / `~q`), exactly as it would on hardware.
 */
export function renderChunkBytes(
  text: string,
  ctx: { machine: PetsciiMachine },
  spans: readonly PetsciiSpan[] = [],
): Buffer {
  const machine = ctx.machine;
  const out = text;

  const spanAt = new Map<number, PetsciiSpan>();
  const insideSpan = new Uint8Array(out.length);
  for (const span of spans) {
    spanAt.set(span.start, span);
    insideSpan.fill(1, span.start, span.start + span.len);
  }

  // One walk over the tokenizer's output, span cursor in hand.
  const cols = machine.state.cols;   // the ONE width source - no literal 40
  const rows = machine.state.rows;
  const bytesOut: number[] = [];

  /** Emit real screen bytes: to the wire AND to the oracle. */
  const emit = (b: number[]): void => {
    if (b.length === 0) return;
    bytesOut.push(...b);
    machine.feed(b);
  };
  /** Emit bytes the terminal must receive but the screen never shows. */
  const emitUnfed = (b: number[]): void => {
    bytesOut.push(...b);
  };
  const latin1Bytes = (t: string): number[] => {
    const result: number[] = [];
    for (let i = 0; i < t.length; i++) result.push(t.charCodeAt(i) & 0xff);
    return result;
  };
  const clamp = (n: number, limit: number): number =>
    !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > limit - 1 ? limit - 1 : n;

  /**
   * Emit ASCII text as PETSCII: a substituted MCI value, or a run of text the
   * pre-passes generated (a conference list, the node list, a `~CR_` prompt).
   * Both are ASCII the sysop never drew, so both go through the ONE
   * ASCII->PETSCII table at the bank the art is currently in - never through
   * a raw `charCodeAt & 0xff`, which would turn a code point above $FF into
   * an arbitrary byte and possibly a control code.
   *
   * Decisions 5 and 6: the art's bank, pen and reverse state are inherited,
   * so the encoder emits no $0E/$8E, no colour byte and no $12/$92 - the
   * machine simply keeps the pen and reverse flag the art left it holding and
   * writes them into the cells this text fills. `allowReverseToggle` stays
   * OFF (its default), so an inverse-only glyph degrades to '?' rather than
   * leaving a $12/$92 pair in the middle of the art; with it off the encoder
   * never reads `reverseState`, so passing one would be a knob that moves
   * nothing.
   */
  const emitEncoded = (value: string): void => {
    for (const b of encodePetsciiValue(value, machine.state.charsetBank)) {
      // Decision 4, the ROW half: `$0D` is the only cursor-moving byte the
      // encoder produces, and on the bottom row `carriageReturn` SCROLLS the
      // whole screen (`petscii-machine.ts` :131-146, :157-170). A value must
      // never scroll, so on the last row the `$0D` ends it.
      if (b === PETSCII_RETURN && machine.state.cursorY >= rows - 1) break;
      // Decision 4, the COLUMN half. `PetsciiMachine` has no deferred-wrap
      // latch: its printable path writes the cell and immediately calls
      // cursorRight, which at column 40 wraps and can scroll. So the last
      // column a value may occupy is `cols - 2` (38) - one written at 39
      // would move the cursor the instant it landed. Bytes that do not print
      // are exempt: a `$0D` inside a value (a `\n` in `~AK` or `~FL`)
      // legitimately starts a new row, and the rest clips against THAT row.
      if (advancesCursor(b) && machine.state.cursorX >= cols - 1) continue;
      emit([b]);
    }
  };

  let i = 0;
  while (i < out.length) {
    // Structural sentinel - from a substitution or from a pre-pass.
    if (out.charCodeAt(i) === 0) {
      const end = out.indexOf(MCI_SENTINELS.END, i + 1);
      if (end < 0) {
        // Unterminated: pass the lone NUL on (a no-op on the machine anyway).
        emitUnfed([0]);
        i += 1;
        continue;
      }
      if (out.startsWith(MCI_SENTINELS.MOVE, i)) {
        // `~x` / `~y`: resolved HERE, against the live cursor, because a walk
        // computed inside the dispatch closure would have read the cursor
        // before any art was fed. ONE walk, the SDK's.
        const [rawX, rawY] = out.slice(i + MCI_SENTINELS.MOVE.length, end).split('|');
        const walk: number[] = [];
        petsciiMoveTo(
          machine.state,
          clamp(parseInt(rawX, 10), cols),
          clamp(parseInt(rawY, 10), rows),
          walk,
        );
        emit(walk);
      } else if (out.startsWith(MCI_GENERATED.START, i)) {
        // Text the PRE-PASSES generated (`~CL.`, `~CD.`, `~ML.`, `~MD.`,
        // `%NODELIST`, a `~CR_` prompt). It reaches the walk with no
        // substitution span - the tokenizer never saw it substituted - so
        // without this branch it would be copied as art and land on graphics
        // glyphs in the `$0E` bank. Same encoding rules as a value.
        emitEncoded(out.slice(i + MCI_GENERATED.START.length, end));
      } else {
        emitUnfed(latin1Bytes(out.slice(i, end + 1)));
      }
      i = end + 1;
      continue;
    }

    // A substituted value.
    const span = spanAt.get(i);
    if (span) {
      const value = out.slice(span.start, span.start + span.len);
      if (isRawSpan(span.cmd)) {
        // Already PETSCII (colour, clear, DELETE, RETURN, the cursor walks).
        emit(latin1Bytes(value));
      } else {
        emitEncoded(value);
      }
      i += span.len;
      continue;
    }

    // Art. `~~` -> `~` is the LAST pass, exactly as in parseMciCodes:
    // the tokenizer's strict fall-through can re-emit an unknown code
    // verbatim, so a literal-tilde pair can still reach the output here.
    // Only art collapses - a substituted value is data, not source.
    if (
      out.charCodeAt(i) === GATE_BYTE &&
      out.charCodeAt(i + 1) === GATE_BYTE &&
      !insideSpan[i + 1]
    ) {
      emit([GATE_BYTE]);
      i += 2;
      continue;
    }
    emit([out.charCodeAt(i) & 0xff]);
    i += 1;
  }

  return Buffer.from(bytesOut);
}

/**
 * Render one `.seq` buffer's PETSCII bytes, in one piece. No socket, no file
 * I/O. This is the WHOLE-FILE path (`emitPetsciiScreen`).
 *
 * In PRODUCTION only the art arm below runs: `displayScreen` reads the gate
 * byte itself and sends every gated (`~`) screen to
 * `emitPetsciiScreenInline`, so a file whose MCI is actually substituted
 * here is one a test handed straight to this function. The gated arm is kept
 * because it is the definition of the render - one `preparePetsciiSeq`, one
 * `renderChunkBytes` - and the inline walker is the same two calls spread
 * over the file's chunks.
 */
export async function renderPetsciiScreen(
  bytes: Buffer,
  session: BBSSession,
  ctx: PetsciiRenderCtx,
): Promise<Buffer> {
  const plan = await preparePetsciiSeq(bytes, session, ctx);
  if (!plan.gated) {
    // Art: byte-identical out, and the machine still observes it so the bank
    // and cursor stay truthful for whatever is drawn next.
    ctx.machine.feed(bytes);
    return bytes;
  }
  return renderChunkBytes(plan.text, ctx, plan.spans);
}
