/**
 * The TypeScript ACHIEVE door prints the rows its C twin prints.
 *
 * Backlog 4.13, and the other half of `sdk/c/tests/test_achieve_rows.c`. The
 * two doors are the same door for a caller - `Doors/achieve` on the web
 * terminal, `Doors/ACHIEVEC/achievec` on a 68K node - so a caller who reads
 * the board scoreboard through one and then the other must not see two
 * different boards.
 *
 * Neither implementation is the contract. `sdk/c/tests/fixtures/achieve-rows.golden`
 * is, and both sides are asserted against it. The DATA is the server's own
 * `|`-separated listing, the thing the C door actually parses, converted here
 * into the JSON shapes this door reads - so there is one copy of the fixture,
 * in the format the wire uses, rather than one per language.
 *
 * WHAT PARITY COVERS (sysop's call, 2026-09-15, option 3): the scoreboard
 * rows, the catalogue rows, and the menu labels for the views both doors
 * have. Exempt, in writing, because the C door cannot do them at all: this
 * door's profile view and account states, its unlocked mark (the fixture is
 * rendered with an empty unlocked set), its `== FAMILY ==` grouping lines and
 * the leaderboard's two heading lines. Parity is on the ROWS, which is where
 * a format drifts.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as path from 'path';
import {
  catalogLines,
  leaderboardLines,
  menuItems,
  type CatalogResponse,
  type LeaderboardResponse,
} from '../../../../board/Doors/achieve/app';

const FIXTURES = path.join(__dirname, '../../../../sdk/c/tests/fixtures');

/** The listing as the C door splits it: header consumed, `|` fields, CRLF. */
function rowsOf(file: string): string[][] {
  return fs
    .readFileSync(path.join(FIXTURES, file), 'latin1')
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .slice(1)
    .map((line) => line.split('|'));
}

/** One `[section]` of the golden, comments and blank lines dropped. */
function golden(section: string): string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of fs.readFileSync(path.join(FIXTURES, 'achieve-rows.golden'), 'latin1').split(/\r?\n/)) {
    if (line.startsWith('#')) continue;
    if (line.startsWith('[')) { inside = line === `[${section}]`; continue; }
    if (!inside || line.length === 0) continue;
    out.push(line);
  }
  expect(out.length).toBeGreaterThan(0);
  return out;
}

const leaderboard = (): LeaderboardResponse => ({
  scope: 'board',
  period: 'all',
  season: null,
  rows: rowsOf('achieve-board.listing').map(([rank, handle, points, unlocks]) => ({
    rank: Number(rank),
    handle,
    points: Number(points),
    unlocks: Number(unlocks),
  })),
});

const catalog = (): CatalogResponse => ({
  revision: '7',
  achievements: rowsOf('achieve-catalog.listing').map(
    ([id, family, tier, points, hidden, name, description]) => ({
      id,
      name,
      description,
      family,
      tier,
      points: Number(points),
      hidden: hidden === '1',
      rarityPctTenths: 0,
      rarityBucket: 'common',
    }),
  ),
});

/** The rows, without the two heading lines this door adds and the C one does not. */
function scoreboardRows(width: number): string[] {
  const lines = leaderboardLines(leaderboard(), width);
  expect(lines[1]).toBe('');          // heading, blank, then rows
  return lines.slice(2);
}

/** The rows, without the `== FAMILY ==` headings and the blank after each family. */
function catalogueRows(width: number): string[] {
  return catalogLines(catalog(), width).filter((line) => line.length > 0 && !line.startsWith('== '));
}

describe('ACHIEVE, the same door in two languages', () => {
  it('prints the same scoreboard row at 80 columns', () => {
    expect(scoreboardRows(80)).toEqual(golden('board.wide'));
  });

  it('prints the same scoreboard row at 40', () => {
    expect(scoreboardRows(40)).toEqual(golden('board.compact'));
  });

  it('prints the same catalogue row at 80 columns', () => {
    expect(catalogueRows(80)).toEqual(golden('catalog.wide'));
  });

  it('prints the same catalogue row at 40', () => {
    expect(catalogueRows(40)).toEqual(golden('catalog.compact'));
  });

  it('offers the same menu labels for the views both doors have', () => {
    // The C door has no profile view and no account flow, so those two
    // entries are exempt; what remains must read the same on both.
    const labels = menuItems({ kind: 'off' }, { singleColumn: false } as never).map((m) => m.label);
    const shared = golden('menu.wide').filter((l) => !l.startsWith('Account:'));

    for (const label of shared) expect(labels).toContain(label);
  });

  it('offers the same short labels at 40', () => {
    const labels = menuItems({ kind: 'off' }, { singleColumn: true } as never).map((m) => m.label);
    const shared = golden('menu.compact').filter((l) => !l.startsWith('Account:'));

    for (const label of shared) expect(labels).toContain(label);
  });

  it('reads a fixture with something to truncate in it', () => {
    // A guard on the fixture rather than on the code: the padding rules only
    // differ from plain concatenation when a handle or a name is too long for
    // its column, so a fixture of short strings would pass against almost any
    // format. `a-very-long-handle-indeed` is 25 characters, and
    // `Archivist of the long shelf` is 27.
    const handles = rowsOf('achieve-board.listing').map((r) => r[1]);
    const names = rowsOf('achieve-catalog.listing').map((r) => r[5]);

    expect(handles.some((h) => h.length > 20)).toBe(true);
    expect(names.some((n) => n.length > 20)).toBe(true);
  });
});
