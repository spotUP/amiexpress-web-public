/**
 * Tip frame layout across the three screens: pinned at 80, stacked and
 * borderless at 40, growing on wide terminals. Every row the frame
 * describes must fit the screen it was built for - a row past the edge
 * hard-wraps mid-word on a C64.
 */
import assert from 'node:assert';
import { buildTipFrame } from '../layout';
import type { Tip } from '../tips';

const TIP: Tip = {
  id: 'door:WHIP',
  kind: 'door',
  title: 'Try WHIP',
  body: 'Demo-scene project management with kanban boards, parties, and a leaderboard. Run WHIP at the menu.',
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
    'and a leaderboard. Run WHIP at the menu.',
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
