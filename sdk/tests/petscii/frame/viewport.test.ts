/**
 * Rule 6 - the VIEWPORT, the window a caller pans.
 *
 * Every other rule in the ladder rearranges a row so it can be read in one
 * 40-column screen. Some output cannot be rearranged honestly: a positioned
 * full-screen UI - an editor, a dashboard, a game board - whose columns mean
 * something where they are. Reflowing such a frame destroys it; cropping hides
 * half of it for ever. A window hides half of it REVERSIBLY, and the caller
 * pans. The plan's words: "navigable, not pretty"
 * (thoughts/shared/plans/2026-09-02-c64-door-adapter.md, rule 6 / phase 5).
 *
 * The property these tests exist to defend is that the LADDER NEVER CHOOSES
 * IT. Every other rule is a promise the caller can read the row; this one is a
 * promise the rest of the row still exists somewhere they must travel to, and
 * that is a decision about the DOOR, not about a row that happens to be wide.
 */
import { adaptRows, applyRule, chooseRule, viewportRow, clampOffset, AdaptRule } from '../../../petscii/frame/adapt';
import { textToFrame, Cell } from '../../../petscii/frame/types';

const row = (s: string) => textToFrame([s], 80, 1).cells[0];
const str = (cells: ReadonlyArray<Cell>) => cells.map((c) => c.ch).join('').replace(/ +$/, '');

/** 80 columns whose position is the content: column N holds digit N mod 10. */
const RULER = Array.from({ length: 80 }, (_, i) => String(i % 10)).join('');

describe('the viewport window', () => {
  it('shows the left edge when nothing has been panned', () => {
    expect(str(viewportRow(row(RULER), 40, 0).rows[0])).toBe(RULER.slice(0, 40));
  });

  it('shows the columns the offset names', () => {
    expect(str(viewportRow(row(RULER), 40, 10).rows[0])).toBe(RULER.slice(10, 50));
    expect(str(viewportRow(row(RULER), 40, 40).rows[0])).toBe(RULER.slice(40, 80));
  });

  it('parks at the last full screen instead of panning into nothing', () => {
    // A caller who holds the pan key must not end up looking at blank columns
    // and conclude the door has died.
    expect(str(viewportRow(row(RULER), 40, 999).rows[0])).toBe(RULER.slice(40, 80));
  });

  it('never starts left of the first column', () => {
    expect(str(viewportRow(row(RULER), 40, -5).rows[0])).toBe(RULER.slice(0, 40));
  });

  it('emits exactly one row of exactly the window width', () => {
    const out = viewportRow(row(RULER), 40, 17);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toHaveLength(40);
    expect(out.applied).toBe('viewport');
  });

  it('loses nothing: every column is reachable from some offset', () => {
    // The whole justification for the rule. Walk the window across the row and
    // assert the union of what was shown is the original row.
    let seen = '';
    for (let off = 0; off <= 40; off += 40) seen += str(viewportRow(row(RULER), 40, off).rows[0]);
    expect(seen).toBe(RULER);
  });
});

describe('where the cursor goes', () => {
  it('reports a cursor inside the window at its window column', () => {
    expect(viewportRow(row(RULER), 40, 10).map(10)).toEqual({ row: 0, x: 0 });
    expect(viewportRow(row(RULER), 40, 10).map(25)).toEqual({ row: 0, x: 15 });
  });

  it('parks a cursor left of the window at the left edge, right of it at the right', () => {
    // Telling the caller WHICH WAY their cursor went beats drawing it at a
    // column that is not on screen.
    expect(viewportRow(row(RULER), 40, 20).map(0)).toEqual({ row: 0, x: 0 });
    expect(viewportRow(row(RULER), 40, 20).map(79)).toEqual({ row: 0, x: 39 });
  });
});

describe('clampOffset', () => {
  it('never lets a window sit past the last screenful', () => {
    expect(clampOffset(80, 40, 100)).toBe(40);
    expect(clampOffset(80, 40, 40)).toBe(40);
    expect(clampOffset(80, 40, 39)).toBe(39);
  });

  it('pins a row narrower than the window at zero', () => {
    expect(clampOffset(20, 40, 5)).toBe(0);
  });

  it('refuses nonsense rather than producing it', () => {
    expect(clampOffset(80, 40, NaN)).toBe(0);
    expect(clampOffset(80, 40, -1)).toBe(0);
  });
});

describe('the ladder never chooses it', () => {
  it('is not what chooseRule answers for any shape', () => {
    const shapes = [
      'short',
      'x'.repeat(40),
      '='.repeat(78),
      'the quick brown fox jumps over the lazy dog again and again',
      'Sysop            Local Console              1234 calls   ratio 1:3',
      RULER,
    ];
    for (const s of shapes) expect(chooseRule(row(s), 40)).not.toBe('viewport');
  });

  it('only arrives by a pin, and then it is honoured', () => {
    const frame = textToFrame([RULER], 80, 1);
    const pinned = adaptRows(frame, {
      cols: 40,
      regions: [{ rows: [0, 0], rule: 'viewport' as AdaptRule }],
      viewportOffset: 40,
    });

    expect(pinned.rows[0].rule).toBe('viewport');
    expect(str(pinned.rows[0].cells)).toBe(RULER.slice(40, 80));
  });

  it('shows the left edge when a pin names it with no offset set', () => {
    const frame = textToFrame([RULER], 80, 1);
    const out = adaptRows(frame, { cols: 40, regions: [{ rows: [0, 0], rule: 'viewport' as AdaptRule }] });

    expect(str(out.rows[0].cells)).toBe(RULER.slice(0, 40));
  });

  it('leaves unpinned rows to the ladder they always had', () => {
    // The round trip: adding rule 6 must not change any frame that does not
    // ask for it.
    const frame = textToFrame([RULER, 'short'], 80, 2);
    const out = adaptRows(frame, { cols: 40, viewportOffset: 40 });

    for (const r of out.rows) expect(r.rule).not.toBe('viewport');
  });
});

describe('applyRule', () => {
  it('routes the rule with the offset it was given', () => {
    expect(str(applyRule('viewport', row(RULER), 40, 40).rows[0])).toBe(RULER.slice(40, 80));
  });

  it('defaults to the left edge when no offset is passed', () => {
    expect(str(applyRule('viewport', row(RULER), 40).rows[0])).toBe(RULER.slice(0, 40));
  });
});
