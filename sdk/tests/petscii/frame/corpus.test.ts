/**
 * Captured 68K door output (fixtures/*.ans, raw ANSI from run-amiga-door.ts;
 * manifest.json says how each was produced) driven through the whole
 * Phase 1-2 pipeline. Asserts the strategy's Phase 2 invariants per fixture:
 * every adapted row <= 40 cells; crop/gutter lose no non-space character;
 * reflow keeps word order; split keeps every cell; the 40x25 result renders
 * through the transducer onto the KERNAL oracle with the cursor in place.
 */
import * as fs from 'fs';
import * as path from 'path';
import { FrameReconstructor } from '../../../petscii/frame/ansi-screen';
import { adaptRows, adaptFrame, isCroppable } from '../../../petscii/frame/adapt';
import { renderDiff } from '../../../petscii/frame/frame-render';
import { contentWidth } from '../../../petscii/frame/classify';
import { Cell, Frame } from '../../../petscii/frame/types';
import { AnsiToPetsciiTransducer } from '../../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../../petscii/petscii-machine';

const DIR = path.join(__dirname, 'fixtures');
const manifest: Record<string, { binary: string; command: string | null; script: string[]; notes: string }> =
  JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));

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

for (const [id, entry] of Object.entries(manifest)) {
  describe(`fixture ${id} (${entry.binary})`, () => {
    const ansi = fs.readFileSync(path.join(DIR, `${id}.ans`), 'utf8');
    const frames = framesOf(ansi);
    const last = frames[frames.length - 1];

    it('is a real capture: raw ANSI with content', () => {
      expect(ansi.length).toBeGreaterThan(150);
      expect(last.cells.some((row) => row.some((c) => c.ch !== ' '))).toBe(true);
      expect(last.cells.every((row) => row.every((c) => c.ch.codePointAt(0)! >= 0x20))).toBe(true);
    });

    it('every adapted row of every frame fits in 40 columns', () => {
      for (const f of frames) for (const r of adaptRows(f).rows) {
        expect(r.cells.length).toBe(40);
        expect({ source: r.source, rule: r.rule, fits: contentWidth(r.cells) <= 40 }).toEqual({ source: r.source, rule: r.rule, fits: true });
      }
    });

    it('crop and gutter rows lose no non-space character; split rows keep every cell; reflow keeps word order', () => {
      const { rows } = adaptRows(last);
      for (let y = 0; y < last.rows; y++) {
        const src = last.cells[y];
        const out = rows.filter((r) => r.source === y);
        const joined = out.flatMap((r) => r.cells);
        const rule = out[0].rule;
        if (rule === 'crop') {
          if (src.slice(40).every((c) => c.ch === ' ')) expect(multiset(joined)).toEqual(multiset(src));
          else expect(isCroppable(src, 40)).toBe(true);           // a border extension was cut, by rule
        } else if (rule === 'gutter' || rule === 'split') {
          expect({ y, rule, chars: multiset(joined) }).toEqual({ y, rule, chars: multiset(src) });
        } else {
          // reflow: no character lost or reordered, whatever the wrap did with
          // the whitespace it broke on.
          expect({ y, rule, chars: squeeze(text(joined)) }).toEqual({ y, rule, chars: squeeze(text(src)) });
          // ...and when no source word is wider than the screen (nothing was
          // hard-split), the word LIST across the produced rows is identical.
          if (words(text(src)).every((w) => w.length <= 40)) {
            expect({ y, words: words(rowsText(out)) }).toEqual({ y, words: words(text(src)) });
          }
        }
      }
    });

    it('renders through the transducer onto the oracle with the cursor where the frame put it', () => {
      const t = new AnsiToPetsciiTransducer();
      const m = new PetsciiMachine();
      let prev: Frame | null = null;
      for (const f of frames) { const a = adaptFrame(f); m.feed(t.transduce(renderDiff(prev, a))); prev = a; }
      const final = adaptFrame(last);
      expect([m.state.cursorX, m.state.cursorY]).toEqual([final.cursor.x, final.cursor.y]);
    });
  });
}
