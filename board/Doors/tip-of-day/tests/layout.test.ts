/**
 * Tip frame layout across the three screens: pinned at 80, stacked and
 * borderless at 40, growing on wide terminals. Every row the frame
 * describes must fit the screen it was built for - a row past the edge
 * hard-wraps mid-word on a C64.
 */
import assert from 'node:assert';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { buildTipFrame, tipBoxRows } from '../layout';
import type { Tip } from '../tips';

const TIP: Tip = {
  id: 'door:WHIP',
  kind: 'door',
  title: 'Try WHIP',
  body: 'Demo-scene project management with kanban boards, parties, and a leaderboard.',
  command: 'WHIP',
};

function rowsOf(width: number): { frame: ReturnType<typeof buildTipFrame>; rows: string[] } {
  const frame = buildTipFrame(TIP, width);
  const rows = [frame.title, ...frame.body, frame.hint];
  return { frame, rows };
}

export async function eightyColumnFrameIsPinned(): Promise<void> {
  const { frame } = rowsOf(80);
  assert.strictEqual(frame.bordered, true);
  assert.strictEqual(frame.frameWidth, 64);
  assert.strictEqual(frame.innerWidth, 60);
  assert.deepStrictEqual(frame.body, [
    'Demo-scene project management with kanban boards, parties,',
    'and a leaderboard.',
  ]);
  assert.strictEqual(frame.hint, 'Run WHIP at the menu. Any key continues...');
}

export async function fortyColumnFrameIsBorderlessAndFits(): Promise<void> {
  const { frame, rows } = rowsOf(40);
  assert.strictEqual(frame.bordered, false);
  assert.ok(frame.frameWidth <= 40, `frame ${frame.frameWidth} wider than 40`);
  for (const row of rows) {
    assert.ok(row.length <= 40, `row too wide (${row.length}): ${row}`);
  }
  // Nothing cut: every word of the body survives, wrapped not truncated.
  const text = rows.join(' ');
  for (const word of ['Demo-scene', 'kanban', 'leaderboard.', 'WHIP']) {
    assert.ok(text.includes(word), `lost word: ${word}`);
  }
}

export async function wideScreenGrowsThenCaps(): Promise<void> {
  const narrow = buildTipFrame(TIP, 80);
  const wide = buildTipFrame(TIP, 132);
  assert.ok(wide.frameWidth > narrow.frameWidth, 'grows with the screen');
  assert.ok(wide.frameWidth <= 132, 'never past the screen');
  const { rows } = rowsOf(132);
  for (const row of rows) {
    assert.ok(row.length <= 132, `row too wide (${row.length}): ${row}`);
  }
}


export async function longWordNeverBreachesTheRow(): Promise<void> {
  const monster: Tip = { ...TIP, body: `See ${'x'.repeat(100)} now` };
  for (const width of [40, 80, 132]) {
    const f = buildTipFrame(monster, width);
    for (const row of [f.title, ...f.body, f.hint]) {
      assert.ok(row.length <= width, `width ${width}: row too wide (${row.length})`);
    }
  }
}

export async function frameBoundaryAmigaSafe(): Promise<void> {
  // Escapes keep this file ASCII: the source under test must never
  // contain these, and owed text from outside is sanitized at paint.
  const dirty: Tip = { ...TIP, title: 'Try WHIP \u2014 now', body: 'curious \u2026 situation' };
  const f = buildTipFrame(dirty, 80);
  assert.ok(f.title.includes('Try WHIP ? now'));
  for (const row of [f.title, ...f.body, f.hint]) {
    assert.ok(!/[^\x20-\x7e\xa0-\xff]/.test(row), `non-Amiga char in: ${row}`);
  }
}


/**
 * Every content row sits INSIDE the frame - the 80-column tier included.
 *
 * The 40-column tier draws no border at all, so the tests above could not
 * see the door double-counting one: child coordinates are already
 * inner-relative (sdk element.ts:572-576) and the door added the border
 * offset a second time, which put the hint row ON the frame's bottom
 * border at 80 (probe: hint yi=15, border row 15) and one column past the
 * right edge at 40. Measured here at every tier.
 */
export async function contentRowsFitInsideTheFrame(): Promise<void> {
  for (const width of [40, 80, 132]) {
    const frame = buildTipFrame(TIP, width);
    const rows = tipBoxRows(frame);
    assert.ok(rows.title >= 0, `width ${width}: title row ${rows.title} above the frame`);
    assert.ok(
      rows.hint + 1 <= rows.innerRows,
      `width ${width}: hint row ${rows.hint} past the ${rows.innerRows} rows inside the frame`,
    );
    assert.ok(
      rows.body + frame.body.length <= rows.hint,
      `width ${width}: the body runs into the hint`,
    );
    assert.ok(
      rows.left + frame.innerWidth <= frame.frameWidth - (frame.bordered ? 2 : 0),
      `width ${width}: content runs past the frame's right edge`,
    );
  }
}

/**
 * The same numbers, through the real widget: a Screen, the real frame box
 * and the real hint box, asking blessed where it actually put them.
 */
export async function theHintRowNeverLandsOnTheBottomBorder(): Promise<void> {
  const screen: any = new Screen({ title: 'tip', width: 80, height: 25, focusKeys: false } as any);
  try {
    const frame = buildTipFrame(TIP, 80);
    const rows = tipBoxRows(frame);
    assert.strictEqual(frame.bordered, true, '80 columns draws a border');

    const box: any = createBox({
      parent: screen,
      top: 'center',
      left: 'center',
      width: frame.frameWidth,
      height: frame.frameHeight,
      border: { type: 'line' },
      focusable: false,
      content: '',
    } as never);
    const hint: any = createBox({
      parent: box,
      top: rows.hint,
      left: rows.left,
      width: frame.innerWidth,
      height: 1,
      border: undefined,
      content: frame.hint,
    } as never);

    const framePos = box._getCoords();
    const hintPos = hint._getCoords();
    // The frame's LAST row is its bottom border; the hint must be above it.
    assert.ok(
      hintPos.yi < framePos.yl - 1,
      `hint row ${hintPos.yi} is on or past the border row ${framePos.yl - 1}`,
    );
    assert.ok(hintPos.yi > framePos.yi, 'hint row is below the top border');
    assert.ok(
      hintPos.xi >= framePos.xi + 1 && hintPos.xl <= framePos.xl - 1,
      `hint columns ${hintPos.xi}..${hintPos.xl} breach the frame ${framePos.xi}..${framePos.xl}`,
    );
  } finally {
    screen.destroy();
  }
}
