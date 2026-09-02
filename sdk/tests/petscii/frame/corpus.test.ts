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
import { adaptRows, adaptFrame, applyRule, chooseRule } from '../../../petscii/frame/adapt';
import { renderDiff } from '../../../petscii/frame/frame-render';
import { Cell, Cursor, Frame, isBlank } from '../../../petscii/frame/types';
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
  binariesFrom: string;
  notes: string;
}
const manifest: Record<string, ManifestEntry> = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));

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

for (const [id, entry] of Object.entries(manifest)) {
  describe(`fixture ${id} (${entry.binary})`, () => {
    const raw = fs.readFileSync(path.join(DIR, `${id}.ans`));
    const ansi = raw.toString('utf8');
    const frames = framesOf(ansi);
    const last = frames[frames.length - 1];

    it('is the capture the manifest says it is: byte count and sha256 match', () => {
      expect({ id, bytes: raw.length, sha256: crypto.createHash('sha256').update(raw).digest('hex') })
        .toEqual({ id, bytes: entry.bytes, sha256: entry.sha256 });
      expect(entry.harness).toContain('--doortype XIM');
      expect(entry.harness).toContain('--timeout 25');
      expect({ cwd: entry.cwd, from: entry.binariesFrom }).toEqual({ cwd: 'web/backend', from: '1cdddac24^' });
    });

    it('is a real capture: raw ANSI with content', () => {
      expect(ansi.length).toBeGreaterThan(150);
      expect(ansi).toContain('\x1b[');
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
            expect({ ...where, distinct: glyphs.length <= 1 }).toEqual({ ...where, distinct: true });
            expect({ ...where, rvs: dropped.some((c) => c.rvs) }).toEqual({ ...where, rvs: false });
          } else if (rule === 'gutter' || rule === 'split') {
            expect({ ...where, chars: multiset(joined) }).toEqual({ ...where, chars: multiset(src) });
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
