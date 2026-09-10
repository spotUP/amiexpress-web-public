/**
 * Leaderboard rows fit on one line, headed and unblocked.
 *
 * Rows ran 77-85 visible cells in a 76-cell pane (every row wrapped,
 * the star meter tore columns apart), the header did not match them,
 * and the current user got a full-width inverse block nobody needed.
 * Rows now fit the pane, header and rows share columns, and <- YOU
 * is the only marker. The tableHeader box paints LEADERBOARD_HEADER.
 */

import assert from 'assert';
import {
  LEADERBOARD_HEADER,
  formatLeaderboardRow,
  visibleLength,
} from '../ui/leaderboard';

export async function rowsFitThePane(): Promise<void> {
  const row = formatLeaderboardRow(
    0, 'spot', 'lamer', 'gray', '0', 0, 1, '0/30', false
  );
  assert.ok(visibleLength(row) <= 60, `row fits with room: ${visibleLength(row)}`);
  assert.ok(row.includes('spot'), 'handle survives');
  assert.ok(row.includes('LAMER'), 'level survives');
  assert.ok(!row.includes('{inverse}'), 'no inverse block, even plain');
}

export async function youGetAMarkerNotABlock(): Promise<void> {
  const row = formatLeaderboardRow(
    0, 'sysop', 'lamer', 'gray', '0', 0, 1, '0/30', true
  );
  assert.ok(!row.includes('{inverse}'), 'no inverse block for you either');
  assert.ok(row.includes('<- YOU'), 'the marker says it');
  assert.ok(visibleLength(row) <= 70, 'marked row still fits');
}

export async function headerMatchesTheColumns(): Promise<void> {
  for (const word of ['RANK', 'HANDLE', 'LEVEL', 'POINTS', 'TASKS', 'PROJ', 'ACHV']) {
    assert.ok(LEADERBOARD_HEADER.includes(word), `header names ${word}`);
  }
  assert.ok(visibleLength(LEADERBOARD_HEADER) <= 60, 'header fits too');
}
