/**
 * Kanban cards show the whole title, wrapped on word boundaries - never the
 * old truncated single line ("BBS Re.. [L] 10") - and, since 2026-09-27,
 * nothing but the title.
 */
import assert from 'assert';
import { wrapTitle, formatKanbanCard, columnGeometry, spaceCards } from '../ui/kanban-board';

const task: any = {
  id: 't1', projectId: 'p1', title: 'BBS Releases API for chatbots',
  category: 'code', status: 'todo', priority: 'legend', points: 10, description: '',
};

export async function wrapsOnWordBoundaries(): Promise<void> {
  const rows = wrapTitle('BBS Releases API for chatbots', 12);
  assert.deepStrictEqual(rows, ['BBS Releases', 'API for', 'chatbots']);
}

export async function hyphenatesOnlyOversizeWords(): Promise<void> {
  const rows = wrapTitle('Supercalifragilistic', 8);
  assert.deepStrictEqual(rows, ['Superca-', 'lifragi-', 'listic']);
  for (const row of rows.slice(0, -1)) {
    assert.ok(row.endsWith('-'), 'split rows carry a hyphen');
    assert.ok(row.length <= 8, 'rows fit the width');
  }
}

export async function shortTitlesStayWhole(): Promise<void> {
  assert.deepStrictEqual(wrapTitle('test', 12), ['test']);
  assert.deepStrictEqual(wrapTitle('', 12), ['']);
}

/**
 * Title only (sysop, 2026-09-27): no `[S] 10 pts · handle` meta row - the
 * columns are too narrow for it; the editor Enter opens shows those fields.
 */
export async function cardShowsTheTitleOnly(): Promise<void> {
  const card = formatKanbanCard(task, 30);
  const rows = card.split('\n');
  assert.deepStrictEqual(rows, ['BBS Releases API for chatbots'], 'one title row, nothing under it');
  assert.ok(!card.includes('[L]'), 'no priority badge');
  assert.ok(!card.includes('pts'), 'no points');
  assert.ok(!card.includes('..'), 'no truncation dots');
}

/** One empty row between cards, none after the last (sysop, 2026-09-27). */
export async function cardsAreSpacedByOneEmptyRow(): Promise<void> {
  assert.deepStrictEqual(spaceCards(['a', 'b\nc', 'd']), ['a\n', 'b\nc\n', 'd']);
  assert.deepStrictEqual(spaceCards(['only']), ['only']);
  assert.deepStrictEqual(spaceCards([]), []);
}

export async function carriedCardInvertsEveryRow(): Promise<void> {
  const plain = formatKanbanCard(task, 30, false);
  assert.ok(!plain.includes('{inverse}'), 'a resting card has no inversion');
  assert.ok(!plain.includes('>>'), 'a resting card has no grip');

  const held = formatKanbanCard(task, 30, true);
  const rows = held.split('\n');
  assert.ok(rows.length >= 1, 'the title');
  for (const row of rows) {
    assert.ok(row.startsWith('{inverse}') && row.endsWith('{/inverse}'), `held row inverted: ${row}`);
  }
  assert.ok(rows[0].includes('>>'), 'the grip survives the inversion');
}

export async function columnsSpanTheWidth(): Promise<void> {
  // 80-column board: four ~19-wide columns across ~79.
  let geo = columnGeometry(80);
  assert.strictEqual(geo.colWidth, 19);
  assert.strictEqual(geo.leftOf(0), 0);
  assert.strictEqual(geo.leftOf(3), 57);
  assert.ok(geo.leftOf(3) + geo.colWidth <= 79, 'last column ends inside');
  // Widened terminal: columns grow, none stranded narrow.
  geo = columnGeometry(160);
  assert.strictEqual(geo.colWidth, 39);
  assert.strictEqual(geo.leftOf(3), 117);
  // Absurd input clamps instead of collapsing.
  geo = columnGeometry(20);
  assert.ok(geo.colWidth >= 10, 'minimum usable width');
}
