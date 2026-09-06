/**
 * Captured 68K door output (fixtures/*.ans, raw ANSI from run-amiga-door.ts;
 * manifest.json says how each was produced, with the byte count and sha256 of
 * the capture) driven through the whole Phase 1-2 pipeline. Asserts the
 * strategy's Phase 2 invariants per fixture, over EVERY frame the stream
 * passes through: every adapted row is exactly 40 cells; crop keeps its left
 * 40 columns verbatim and only ever drops one repeated non-alphanumeric
 * border glyph; gutter and split lose no cell; reflow keeps word order; the
 * adapted cursor is where the row's own rule put it (computed independently of
 * `adaptRows`/`adaptFrame`); and the 40x25 result renders through the
 * transducer onto the KERNAL oracle with the cursor in place.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { FrameReconstructor } from '../../../petscii/frame/ansi-screen';
import { adaptRows, adaptFrame, applyRule, chooseRule, recordFields } from '../../../petscii/frame/adapt';
import { renderDiff } from '../../../petscii/frame/frame-render';
import { Cell, Cursor, Frame, isBlank } from '../../../petscii/frame/types';
import { columnParts, contentWidth, isRuleRow } from '../../../petscii/frame/classify';
import { AnsiToPetsciiTransducer } from '../../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../../petscii/petscii-machine';

const COLS = 40;
const ROWS = 25;

const DIR = path.join(__dirname, 'fixtures');

interface ManifestEntry {
  binary: string;
  command: string | null;
  script: string[];
  bytes: number;
  sha256: string;
  harness: string;
  cwd: string;
  /** Corpus capture fixtures (`<id>.ans`) only: the commit the door binaries were taken from. */
  binariesFrom?: string;
  /**
   * The `Commands/BBSCmd/<CMD>.info` registrations this fixture is the PROOF
   * for - one command, or several when one binary is registered more than
   * once (`Doors/RTW/RTW` answers to both RTW and WHO). Every command named
   * here must carry `C64_ADAPT=40` in its real bytes, and its binary must be
   * on disk.
   *
   * This field is the single source the launch suites derive their marked-door
   * lists from, so a `.info` cannot be marked without a capture behind it and
   * a capture cannot claim a door that is not marked. Absent on the eight
   * `binariesFrom` captures, whose doors LEFT the tree at `1cdddac24` and
   * survive only as fixtures.
   */
  installed?: string | string[];
  /**
   * Golden fixtures (`<id>.txt`) only. A door-corpus integration golden is
   * 8-bit door output with the ESC sequences already stripped, so it is read
   * as latin1 - `utf8` would turn every high-bit block glyph into U+FFFD and
   * the reconstructed frame would stop being the door's screen.
   */
  encoding?: 'latin1';
  /** Golden fixtures only: the path the fixture was copied from, byte for byte. */
  source?: string;
  /**
   * Golden fixtures only. The integration goldens keep recording after the
   * door exits, so for these the LAST frame is the BBS's own menu repaint
   * (three-column command rows plus the prompt), not door output.
   */
  containsBbsMenu?: boolean;
  notes: string;
}
const manifest: Record<string, ManifestEntry> = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));

/** The registrations a fixture is the proof for, always as a list. */
const installedOf = (e: ManifestEntry): string[] =>
  e.installed === undefined ? [] : Array.isArray(e.installed) ? e.installed : [e.installed];

/** A door-corpus integration golden (latin1 `<id>.txt`) rather than a harness capture (utf8 `<id>.ans`). */
const isGolden = (e: ManifestEntry) => e.encoding === 'latin1';
const fixtureFile = (id: string, e: ManifestEntry) => path.join(DIR, `${id}.${isGolden(e) ? 'txt' : 'ans'}`);
const fixtureText = (id: string, e: ManifestEntry) => fs.readFileSync(fixtureFile(id, e)).toString(e.encoding ?? 'utf8');

const multiset = (cells: ReadonlyArray<Cell>) => cells.map((c) => c.ch).filter((ch) => ch !== ' ').sort();
const text = (cells: ReadonlyArray<Cell>) => cells.map((c) => c.ch).join('');
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
/** Order- and content-preserving, immune to where the wrap put its breaks. */
const squeeze = (s: string) => s.replace(/\s+/g, '');
/**
 * A reflowed row's output is a LIST of rows: the boundary between two of them
 * is a line break, i.e. whitespace. Joining the cells with no separator (the
 * first draft of this helper) glued "(return" to "for" across the break of
 * `hststat` row 9 and reported a wrap bug that was not there. Joining with a
 * space is only safe when no source word is longer than the target width -
 * `wrapLineToWidth` hard-splits those - so the word-list check is guarded and
 * the unguarded invariant is the whitespace-squeezed character stream.
 */
const rowsText = (rows: ReadonlyArray<{ cells: Cell[] }>) => rows.map((r) => text(r.cells).trimEnd()).join(' ');

/** Every distinct 80x25 frame the stream passes through: one per CR/LF-terminated write, plus the final state. */
function framesOf(ansi: string): Frame[] {
  const r = new FrameReconstructor();
  const frames: Frame[] = [];
  for (const chunk of ansi.split(/(?<=\n)/)) { r.write(chunk); frames.push(r.snapshot()); }
  return frames;
}

/**
 * Where the source cursor must end up, walked from `chooseRule` + `applyRule`
 * + `RuleResult.map` alone. Deliberately does NOT call `adaptRows`/`adaptFrame`
 * - comparing `adaptFrame(f).cursor` with itself is what let a mutation of
 * adapt.ts's own cursor arithmetic (`clampCol(cols, adapted.cursor.x)`) survive
 * on all eight fixtures while the render-side `cupTo` mutation died on all
 * eight. `map` returns a `RuleCursor` whose `row` is an OFFSET into the rows
 * that one rule produced, so the running base index is what turns it into a
 * frame position; the tail-paging offset is the only positional policy left.
 */
function cursorFromRules(f: Frame): Cursor {
  let base = 0;
  let at: Cursor = { x: 0, y: 0 };
  for (let y = 0; y < f.rows; y++) {
    const src = f.cells[y];
    const res = applyRule(chooseRule(src, COLS), src, COLS);
    if (y === f.cursor.y) {
      const m = res.map(f.cursor.x);
      at = { x: m.x, y: base + m.row };
    }
    base += res.rows.length;
  }
  const scrolledOff = Math.max(0, base - ROWS);
  return {
    x: Math.max(0, Math.min(COLS - 1, at.x)),
    y: Math.max(0, Math.min(ROWS - 1, at.y - scrolledOff)),
  };
}


/**
 * `narrow`'s invariant, checked without re-implementing the rule: the output
 * row is the source columns in order, joined by exactly one space, each either
 * whole or a non-empty prefix followed by '>'.
 *
 * The walk BACKTRACKS because a column can contain single spaces of its own
 * (and a '>' of its own - door text is full of "->"), so the longest prefix
 * that matches is not always the one the rule kept; the shortest that still
 * lets every later column line up is the true parse.
 */
function narrowKeepsColumns(parts: string[], out: string): boolean {
  const walk = (i: number, s: string): boolean => {
    if (i === parts.length) return s.length === 0;
    const p = parts[i];
    const after = (rest: string) => (i === parts.length - 1 ? walk(i + 1, rest) : rest.startsWith(' ') && walk(i + 1, rest.slice(1)));
    if (s.startsWith(p) && after(s.slice(p.length))) return true;
    for (let k = Math.min(p.length - 1, s.length - 1); k >= 1; k--) {
      if (s.slice(0, k) === p.slice(0, k) && s[k] === '>' && after(s.slice(k + 1))) return true;
    }
    return false;
  };
  return walk(0, out);
}

/**
 * `stat`'s invariant, checked without re-implementing the rule: the produced
 * rows are the source columns, in order, whole, joined by exactly one space,
 * and NO column is split across a row boundary. Each column's own internal runs
 * of blanks collapse to one - the same squeeze `narrow` and `gutter` apply, and
 * the only thing this rung drops.
 *
 * The walk is greedy and needs no backtracking: a row is a maximal run of whole
 * columns, so the first column that does not fit the row's remaining text is
 * the first column of the next row.
 */
function statKeepsColumns(parts: string[], lines: string[]): boolean {
  let i = 0;
  for (const line of lines) {
    let built = '';
    while (i < parts.length) {
      const next = built.length === 0 ? parts[i] : `${built} ${parts[i]}`;
      if (next.length > line.length) break;
      built = next;
      i++;
    }
    if (built !== line) return false;
  }
  return i === parts.length;
}

for (const [id, entry] of Object.entries(manifest)) {
  describe(`fixture ${id} (${entry.binary})`, () => {
    const raw = fs.readFileSync(fixtureFile(id, entry));
    const ansi = fixtureText(id, entry);
    const frames = framesOf(ansi);
    const last = frames[frames.length - 1];

    it('is the capture the manifest says it is: byte count and sha256 match', () => {
      expect({ id, bytes: raw.length, sha256: crypto.createHash('sha256').update(raw).digest('hex') })
        .toEqual({ id, bytes: entry.bytes, sha256: entry.sha256 });
      if (isGolden(entry)) {
        // A golden is a COPY: the same bytes must still sit at `source`, or
        // the fixture has silently stopped being the door output it names.
        const src = path.resolve(__dirname, '../../../..', entry.source as string);
        expect({ id, exists: fs.existsSync(src) }).toEqual({ id, exists: true });
        expect({ id, same: fs.readFileSync(src).equals(raw) }).toEqual({ id, same: true });
        expect(entry.harness).toContain('door-corpus/run.ts --capture');
      } else if (entry.installed) {
        // An INSTALLED capture: the door is on the board today.
        // NOT `--doortype XIM`: these cover four adapter types (XIM, DD, FIM
        // and SIM all reach executeAmigaDoor, which is where the adapter
        // installs), so what is asserted is that the line names a type at all
        // and drives one of the commands this entry claims.
        expect(entry.harness).toContain('run-amiga-door.ts');
        expect(entry.harness).toContain('--doortype ');
        expect(entry.harness).toContain(`--command ${installedOf(entry)[0]}`);
        expect(entry.cwd).toEqual('web/backend');
      } else {
        expect(entry.harness).toContain('--doortype XIM');
        expect(entry.harness).toContain('--timeout 25');
        expect({ cwd: entry.cwd, from: entry.binariesFrom }).toEqual({ cwd: 'web/backend', from: '1cdddac24^' });
      }
    });

    /**
     * The two halves of a mark, checked against the REAL bytes: the door this
     * fixture was captured from is still on disk, and every registration the
     * fixture claims still declares C64_ADAPT=40. Runs for goldens as well as
     * captures - `rtw` is a golden and it is the proof for two registrations.
     */
    (installedOf(entry).length > 0 ? it : it.skip)(
      'is the proof for registrations that exist, are marked, and still have their binary',
      () => {
        const repo = path.resolve(__dirname, '../../../..');
        const binary = path.join(repo, entry.binary);
        expect({ id, binary: entry.binary, exists: fs.existsSync(binary) })
          .toEqual({ id, binary: entry.binary, exists: true });
        for (const command of installedOf(entry)) {
          const infoPath = path.join(repo, 'Commands/BBSCmd', `${command}.info`);
          expect({ id, command, exists: fs.existsSync(infoPath) })
            .toEqual({ id, command, exists: true });
          // Read the tooltype out of the real bytes. The .info files on this
          // board come in two shapes - Amiga icon binaries and plain text -
          // and both put the tooltype on its own `KEY=VALUE` run, so a latin1
          // scan for the exact assignment answers for either without dragging
          // the backend's parser into an SDK test.
          const infoBytes = fs.readFileSync(infoPath).toString('latin1');
          expect({ id, command, marked: /(^|[^A-Z_])C64_ADAPT=40(\0|\n|\r|$)/.test(infoBytes) })
            .toEqual({ id, command, marked: true });
        }
      },
    );

    it('is a real capture: raw ANSI with content', () => {
      expect(ansi.length).toBeGreaterThan(150);
      // A harness capture is raw ANSI; a door-corpus golden has its ESC
      // sequences stripped by the runner, so only the captures carry CSI.
      if (!isGolden(entry)) expect(ansi).toContain('\x1b[');
      expect(last.cells.some((row) => row.some((c) => c.ch !== ' '))).toBe(true);
      expect(last.cells.every((row) => row.every((c) => c.ch.codePointAt(0)! >= 0x20))).toBe(true);
    });

    it('every adapted row of every frame is exactly 40 cells', () => {
      for (const f of frames) for (const r of adaptRows(f).rows) {
        expect({ source: r.source, rule: r.rule, cells: r.cells.length }).toEqual({ source: r.source, rule: r.rule, cells: COLS });
      }
    });

    it('crop keeps its left 40 columns and drops only a repeated border glyph; gutter and split keep every cell; reflow keeps word order', () => {
      frames.forEach((f, fi) => {
        const { rows } = adaptRows(f);
        for (let y = 0; y < f.rows; y++) {
          const src = f.cells[y];
          const out = rows.filter((r) => r.source === y);
          const joined = out.flatMap((r) => r.cells);
          const rule = out[0].rule;
          const where = { fi, y, rule };
          if (rule === 'crop') {
            // The kept half is verbatim, always - this is the assertion the
            // first draft was missing (it re-asserted `isCroppable`, which
            // `chooseRule` had already guaranteed, so 10 corpus rows checked
            // nothing at all).
            expect({ ...where, kept: text(joined).trimEnd() }).toEqual({ ...where, kept: text(src.slice(0, COLS)).trimEnd() });
            // ...and what fell off the right edge is either nothing, or one
            // repeated non-alphanumeric glyph: a rule of '=' or a box side,
            // never a character of content.
            const dropped = src.slice(COLS).filter((c) => !isBlank(c));
            const glyphs = Array.from(new Set(dropped.map((c) => c.ch)));
            expect({ ...where, glyphs, alnum: glyphs.filter((g) => /[A-Za-z0-9]/.test(g)) })
              .toEqual({ ...where, glyphs, alnum: [] });
            // ...unless the whole row is a horizontal RULE, which crops
            // because a truncated rule is still a rule. A rule mixes its
            // corners with its dashes, so the one-glyph test does not hold
            // for it; what does hold is that a rule carries no content:
            // no alphanumeric (asserted above) and no reverse video.
            if (!isRuleRow(src)) {
              expect({ ...where, distinct: glyphs.length <= 1 }).toEqual({ ...where, distinct: true });
            }
            expect({ ...where, rvs: dropped.some((c) => c.rvs) }).toEqual({ ...where, rvs: false });
          } else if (rule === 'gutter' || rule === 'split') {
            expect({ ...where, chars: multiset(joined) }).toEqual({ ...where, chars: multiset(src) });
          } else if (rule === 'deindent') {
            // Lossless: one row, and only LEADING blanks are gone.
            expect({ ...where, rows: out.length }).toEqual({ ...where, rows: 1 });
            expect({ ...where, kept: text(joined).trimEnd() }).toEqual({ ...where, kept: text(src).trim() });
          } else if (rule === 'prose') {
            // The row's ONE column, wrapped. Like `narrow` it drops the row's
            // border and the padding outside the column; unlike `narrow` it
            // drops nothing else, which is the whole point.
            const parts = columnParts(src);
            expect({ ...where, columns: parts.length }).toEqual({ ...where, columns: 1 });
            const column = text(parts[0] as ReadonlyArray<Cell>);
            expect({ ...where, chars: squeeze(text(joined)) }).toEqual({ ...where, chars: squeeze(column) });
            if (words(column).every((w) => w.length <= COLS)) {
              expect({ ...where, words: words(rowsText(out)) }).toEqual({ ...where, words: words(column) });
            }
          } else if (rule === 'stat') {
            // Every column whole, in order, none split across a row boundary.
            // `stat` reaches `columnSpans` the same way `narrow` does, so like
            // narrow it drops a bordered row's outer '|' cells and each
            // column's internal padding - and NOTHING else, which is the whole
            // reason the rung exists.
            const parts = columnParts(src).map((p) => text(p as ReadonlyArray<Cell>).replace(/ {2,}/g, ' '));
            expect({ ...where, columns: parts.length >= 2 }).toEqual({ ...where, columns: true });
            expect({ ...where, kept: statKeepsColumns(parts, out.map((r) => text(r.cells).trimEnd())) })
              .toEqual({ ...where, kept: true });
          } else if (rule === 'narrow') {
            // One row; every column still there, in order; each output column
            // is its source column's trimmed text, or a non-empty prefix of it
            // followed by the truncation mark. What narrow may drop is exactly
            // that tail plus the runs of blanks BETWEEN columns.
            expect({ ...where, rows: out.length }).toEqual({ ...where, rows: 1 });
            const parts = columnParts(src).map((p) => text(p as ReadonlyArray<Cell>));
            expect({ ...where, columns: parts.length > 0 }).toEqual({ ...where, columns: true });
            expect({ ...where, kept: narrowKeepsColumns(parts, text(joined).trimEnd()) })
              .toEqual({ ...where, kept: true });
          } else {
            // reflow: no character lost or reordered, whatever the wrap did
            // with the whitespace it broke on.
            expect({ ...where, chars: squeeze(text(joined)) }).toEqual({ ...where, chars: squeeze(text(src)) });
            // ...and when no source word is wider than the screen (nothing was
            // hard-split), the word LIST across the produced rows is identical.
            if (words(text(src)).every((w) => w.length <= COLS)) {
              expect({ ...where, words: words(rowsText(out)) }).toEqual({ ...where, words: words(text(src)) });
            }
          }
        }
      });
    });

    /**
     * The property that let `recordFields` drop its "the field contains no
     * blank" guard on 2026-09-06 (that guard cost `GWALL` its two-word
     * handles). The guard's PURPOSE - the field must not be a second column the
     * door padded in - is guaranteed by the separator rule instead: the
     * separator is the LAST run of two or more blanks, so no such run can be
     * left inside the field. Asserted here, over every record row of every
     * frame of every fixture, rather than as a branch in `recordFields` that no
     * row can reach.
     */
    it('a record field never carries a run of blanks, in any frame', () => {
      frames.forEach((f, fi) => {
        for (let y = 0; y < f.rows; y++) {
          const fields = recordFields(f.cells[y], COLS);
          if (!fields) continue;
          const field = text(f.cells[y].slice(fields.right[0], fields.right[1]));
          expect({ fi, y, field, padded: / {2,}/.test(field) }).toEqual({ fi, y, field, padded: false });
        }
      });
    });

    it('puts the cursor where the source row\'s own rule maps it, in every frame', () => {
      frames.forEach((f, fi) => {
        const got = adaptFrame(f).cursor;
        expect({ fi, cursor: [got.x, got.y] }).toEqual({ fi, cursor: (({ x, y }) => [x, y])(cursorFromRules(f)) });
      });
    });

    it('renders through the transducer onto the oracle with the cursor where the frame put it', () => {
      const t = new AnsiToPetsciiTransducer();
      const m = new PetsciiMachine();
      let prev: Frame | null = null;
      for (const f of frames) { const a = adaptFrame(f); m.feed(t.transduce(renderDiff(prev, a))); prev = a; }
      expect([m.state.cursorX, m.state.cursorY]).toEqual(((c) => [c.x, c.y])(cursorFromRules(last)));
    });
  });
}

/**
 * ACCEPTANCE GATE (Phase 3 Task 2 - the ladder stops doubling bordered and
 * columnar rows).
 *
 * The ladder must not scroll a door's own header off its screen. Measured on
 * these three goldens before the fix: `what` 34, `rtw` 46, `ustats` 35 adapted
 * rows for a 25-row frame, so adaptFrame's tail-paging (it keeps the LAST 25)
 * dropped the title. Every `|...|` bordered row and every three-column menu row
 * classified as art or table and `split` doubled it.
 *
 * The pinned numbers are exact so a regression is loud. The single row of
 * expansion left in `rtw`/`ustats` is the BBS's own post-door prompt line
 * ("AmiExpress Web BBS [0:General] Menu (...)", 53 columns of prose) reflowing
 * to two rows - correct behaviour, and not door output at all, which is what
 * `containsBbsMenu` in the manifest records.
 */
const EXPECTED_ROWS: Record<string, number> = {
  // `what` 25 -> 27 on 2026-09-06, and UPWARDS is the right direction here: its
  // two "Activities" rows used to narrow to
  // `Upload   Activities -> Total files: [  >`, which stops mid-number and
  // never reaches "Total bytes" at all. As records they cost a second row each
  // and keep `Total bytes: [               0 ]`. Two rows for two numbers.
  // ...and 27 -> 28 later the same day with the `prose` rung: its title row,
  // `| WHAT: Transfer Activities v2.0 [REL 2] Copyright (c)1994-95
  // Bobo/Mystic! |`, is ONE column and `narrow` was cutting it at
  // `[REL 2] >`. One column is nothing to keep in line, so the truncation
  // bought nothing; wrapped, the credit is whole.
  what: 28,
  rtw: 26,
  ustats: 26,
  // The three doors marked on 2026-09-03. These are HARNESS captures, so the
  // last frame is the door's own screen and no BBS menu rides along - the
  // expansion above 25 is the ladder's, not the board's.
  //
  // `b` at 30: Bulls' five-row ASCII logo crops, and its three three-column
  // bulletin rows each split into two, so five rows leave the top. The six
  // entries, their labels and the prompt all stay on the glass, which is what
  // the mark claims.
  // `j` at 27: JoinCnf's bordered box; two rows leave the top and the
  // conference list, the CURRENT CONFERENCE line and the prompt remain.
  // `doorrepo` at 26: one row over, and DoorRepo's whole payload lives in the
  // left 28 columns, so the crop drops only the empty right-hand pane.
  //
  // RE-PINNED 2026-09-06 with the `record` rung's right-field guard relaxed
  // (it used to decline any field with a blank in it, which cost `GWALL` its
  // two-word handles). Each of these moved because ONE row stopped truncating:
  // `b` 30 -> 29 - the "[Bulls 2.2 - EMPiRE]" footer, which reflow used to
  //   break across THREE rows with "[Bulls" stranded at the end of the second,
  //   now costs two with the tag whole and flush right.
  // `j` 27 -> 26 - the same shape, "[JoinCnf 4.0 - EMPiRE]", three rows to two.
  b: 29,
  j: 26,
  doorrepo: 26,
  // Batch 2, 2026-09-03. Five of these fit a C64 screen with rows to spare
  // (`mrcstat1` and `chat` need no reduction at all); the three that come out
  // over 25 do so by REFLOW, not by losing anything - `wall`'s comment stream
  // simply occupies more rows at 40 than at 80.
  // `size` 26 -> 28 on 2026-09-06 with the `stat` rung. Its two Directory rows
  // are `Label: value` rows and `narrow` was shortening the values on them -
  // `Directory 2: > 650450 Bytes > 104 Files.` had lost the word `in` and
  // `Directory 1: Loa>` most of its progress text. Each row is now two rows and
  // complete. The door paints 11 rows at 40 columns, so the 17 blank rows in
  // this count never reach a caller: the adapter's window is measured against
  // the PAINTED height (c64-door-adapter.ts `adapted()`), and 11 < 25.
  size: 28,
  // `ulist` 26 -> 28 on 2026-09-06 with the `prose` rung. Two of its
  // single-column box rows were being cut: the keypad menu line and
  // `tO cONTACT uS cALL : pOWERBOX II +49-30-3242112 dUAL`, whose PHONE NUMBER
  // stopped at `+49-30>`. A phone number is data.
  ulist: 28,
  // RE-PINNED 2026-09-06 with the `record` rung, DOWNWARDS, and that direction
  // is the point: `wall` 40 -> 33 and `dtagwall` 29 -> 25. Both doors write a
  // RECORD - a message at column 0 and an author near column 80 - and the
  // ladder used to spend TWO rows on each of them, the second holding nothing
  // but a name at whatever column the split or the reflow happened to leave it
  // (61-40 = 21 for `wall`). Each entry now costs one row with its author flush
  // against column 40, so `dtagwall` fits a 25-row screen outright and `wall`
  // loses seven rows of the eight it was over. Nothing is dropped: the corpus's
  // reflow invariant (every non-blank character, in order) still holds for both,
  // which is what makes this a smaller number rather than a lossier one.
  wall: 33,
  chat: 27,
  mrcstat1: 25,
  pager5d: 25,
  dtagwall: 25,
  avhbc: 25,
  hackcheck: 26,
};

function lastFrameOf(id: string): Frame {
  const frames = framesOf(fixtureText(id, manifest[id]));
  return frames[frames.length - 1];
}

describe.each(Object.keys(EXPECTED_ROWS))('%s adapts without losing its header', (id) => {
  const frame = lastFrameOf(id);

  it('adapts to the pinned row count', () => {
    expect({ id, rows: adaptRows(frame, { cols: COLS }).rows.length }).toEqual({ id, rows: EXPECTED_ROWS[id] });
  });

  // `adaptRows` does no tail-paging - that is `adaptFrame`'s policy - so this
  // holds for every golden, including the two that come out at 26 rows.
  it('keeps the first non-blank source row first', () => {
    const rows = adaptRows(frame, { cols: COLS }).rows;
    const firstSrc = frame.cells.findIndex((r) => contentWidth(r) > 0);
    expect(rows.findIndex((r) => r.cells.some((c) => !isBlank(c)))).toBe(rows.findIndex((r) => r.source === firstSrc));
  });

  it('every adapted row is exactly 40 cells', () => {
    for (const r of adaptRows(frame, { cols: COLS }).rows) expect(r.cells.length).toBe(COLS);
  });
});
