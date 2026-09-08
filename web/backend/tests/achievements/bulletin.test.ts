/**
 * The achievements bulletin: what it draws, and when it refuses to draw.
 *
 * The bulletin is a FILE the login ladder reads, so the two failure modes
 * that matter are a stale file on a board that turned the feature off, and
 * a blank one on a board whose server is briefly unreachable. Those get a
 * test each; the rest pins the two columns line up.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ACHIEVE_BULLETIN_ROWS,
  bulletinPaths,
  bulletinRow,
  refreshAchievementsBulletin,
  renderAchievementsBulletin,
  _resetBulletinRunningForTests,
} from '../../src/achievements/bulletin';
import type { BulletinDeps } from '../../src/achievements/bulletin';
import type { LeaderboardRow, LeaderboardResponse } from '../../src/achievements/contract';
import type { DoorAchievementsApi } from '../../src/achievements/door-api';
import type { ApiResult } from '../../src/achievements/client';

const rows = (n: number, prefix: string): LeaderboardRow[] =>
  Array.from({ length: n }, (_, i) => ({
    rank: i + 1, handle: `${prefix}${i + 1}`, points: 1000 - i * 7, unlocks: 40 - i,
  }));

const lb = (scope: string, r: LeaderboardRow[]): ApiResult<LeaderboardResponse> => ({
  status: 200,
  body: { scope, period: 'all', season: null, revision: 'r1', rows: r },
});

function stubApi(
  global: ApiResult<LeaderboardResponse>,
  board: ApiResult<LeaderboardResponse>,
  enabled = true
): DoorAchievementsApi {
  return {
    enabled: () => enabled,
    leaderboard: (scope) => Promise.resolve(scope === 'global' ? global : board),
  } as unknown as DoorAchievementsApi;
}

function tempBoard(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'achieve-bulletin-'));
}

function deps(dir: string, api: DoorAchievementsApi): BulletinDeps {
  return {
    api,
    baseDir: () => dir,
    boardName: () => 'UPROUGH',
    now: () => new Date('2026-09-08T12:34:56Z'),
    log: () => { /* silence */ },
  };
}

const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x0c/g, '');

describe('renderAchievementsBulletin', () => {
  beforeEach(() => { _resetBulletinRunningForTests(); });

  test('every column is exactly 38 characters, so the two never collide', () => {
    expect(bulletinRow({ rank: 1, handle: 'spot', points: 4200, unlocks: 37 })).toHaveLength(38);
    expect(bulletinRow(undefined)).toHaveLength(38);
    // A handle longer than the field is clipped, never folded into the neighbour.
    expect(bulletinRow({ rank: 12, handle: 'x'.repeat(60), points: 1, unlocks: 1 })).toHaveLength(38);
  });

  test('draws the global column beside this board, named after the board', () => {
    const text = renderAchievementsBulletin(
      rows(3, 'world'), rows(2, 'local'), 'UpRough', new Date('2026-09-08T12:34:56Z')
    );
    const plain = strip(text).split('\r\n');
    const scopeLine = plain.find((l) => l.includes('GLOBAL'))!;
    expect(scopeLine).toContain('GLOBAL, ALL TIME');
    expect(scopeLine).toContain('UPROUGH');

    const first = plain.find((l) => l.trimStart().startsWith('1.'))!;
    expect(first).toContain('world1');
    expect(first).toContain('local1');
    // The right column starts at 39 (38 + one space of gap).
    expect(first.indexOf('local1')).toBeGreaterThan(38);
  });

  /**
   * Every line fits 77 columns, furniture included.
   *
   * The masthead and the footer are built from two halves each; a board name
   * or a timestamp that overran its half pushed the line to 81 and 83 and
   * wrapped on the caller's screen, which puts the second column one row
   * below the first for the rest of the bulletin.
   */
  test('no line is wider than the two columns it is made of', () => {
    for (const boardName of ['UpRough BBS', 'A', 'A BOARD WITH A VERY LONG NAME INDEED OK']) {
      const plain = strip(
        renderAchievementsBulletin(rows(15, 'globalhandle'), rows(15, 'l'), boardName, new Date())
      ).split('\r\n');
      for (const line of plain) expect(line.length).toBeLessThanOrEqual(77);
    }
  });

  test('the footer keeps the whole timestamp', () => {
    const plain = strip(
      renderAchievementsBulletin(rows(2, 'w'), rows(2, 'b'), 'UpRough', new Date('2026-09-08T12:34:56Z'))
    );
    expect(plain).toContain('Updated 2026-09-08 12:34 UTC');
  });

  test('an empty board says so in its own column and leaves the other alone', () => {
    const plain = strip(
      renderAchievementsBulletin(rows(2, 'world'), [], 'UpRough', new Date())
    );
    expect(plain).toContain('Nobody on this board yet.');
    expect(plain).toContain('world1');
    expect(plain).not.toContain('Nobody has scored yet.');
  });

  test('the Header and Tailer slots replace the built-in furniture verbatim', () => {
    const text = renderAchievementsBulletin(
      rows(1, 'w'), rows(1, 'b'), 'UpRough', new Date(),
      { header: '### MY OWN ART ###\n', tailer: '### THE END ###\n' }
    );
    expect(text).toContain('### MY OWN ART ###');
    expect(text).toContain('### THE END ###');
    expect(text).not.toContain('ACHIEVEMENTS');
    expect(text).not.toContain('Type ACHIEVE');
  });

  /**
   * A board with one player got fourteen blank rows under it. The table is
   * as tall as the taller column, never taller.
   */
  test('is only as tall as it has rows to show', () => {
    const plain = strip(
      renderAchievementsBulletin(rows(1, 'w'), [], 'UpRough', new Date())
    ).split('\r\n');
    expect(plain.filter((l) => /^\s*\d+\./.test(l))).toHaveLength(1);
    // Nothing blank between the column rule and the footer rule.
    const body = plain.slice(
      plain.findIndex((l) => l.startsWith('====')) + 1,
      plain.findIndex((l) => l.startsWith('----'))
    );
    expect(body.filter((l) => l.trim() !== '')).toHaveLength(1);
    expect(body).toHaveLength(2);  // the single row, then the gap before the footer
  });

  test('holds exactly the row count it advertises', () => {
    const plain = strip(
      renderAchievementsBulletin(rows(50, 'w'), rows(50, 'b'), 'UpRough', new Date())
    ).split('\r\n');
    const numbered = plain.filter((l) => /^\s*\d+\./.test(l));
    expect(numbered).toHaveLength(ACHIEVE_BULLETIN_ROWS);
  });
});

describe('refreshAchievementsBulletin', () => {
  beforeEach(() => { _resetBulletinRunningForTests(); });

  test('writes the file when both leaderboards answer', async () => {
    const dir = tempBoard();
    const api = stubApi(lb('global', rows(4, 'w')), lb('board:uprough', rows(3, 'b')));
    await expect(refreshAchievementsBulletin(deps(dir, api))).resolves.toBe('written');
    const written = fs.readFileSync(bulletinPaths(dir).file, 'latin1');
    expect(written).toContain('w1');
    expect(written).toContain('b1');
  });

  test('a board with no achievements server ends with NO bulletin, not a stale one', async () => {
    const dir = tempBoard();
    const paths = bulletinPaths(dir);
    fs.mkdirSync(path.dirname(paths.file), { recursive: true });
    fs.writeFileSync(paths.file, 'yesterday');

    const api = stubApi(lb('global', rows(4, 'w')), lb('board:x', rows(3, 'b')), /* enabled */ false);
    await expect(refreshAchievementsBulletin(deps(dir, api))).resolves.toBe('removed');
    expect(fs.existsSync(paths.file)).toBe(false);
  });

  test('an unreachable server leaves the last good bulletin in place', async () => {
    const dir = tempBoard();
    const paths = bulletinPaths(dir);
    fs.mkdirSync(path.dirname(paths.file), { recursive: true });
    fs.writeFileSync(paths.file, 'yesterday');

    const down: ApiResult<LeaderboardResponse> = { status: 0, body: null, error: 'network' };
    await expect(refreshAchievementsBulletin(deps(dir, stubApi(down, down)))).resolves.toBe('unreachable');
    expect(fs.readFileSync(paths.file, 'latin1')).toBe('yesterday');
  });

  test('two empty leaderboards remove the file rather than show an empty board', async () => {
    const dir = tempBoard();
    const paths = bulletinPaths(dir);
    fs.mkdirSync(path.dirname(paths.file), { recursive: true });
    fs.writeFileSync(paths.file, 'yesterday');

    const api = stubApi(lb('global', []), lb('board:x', []));
    await expect(refreshAchievementsBulletin(deps(dir, api))).resolves.toBe('removed');
    expect(fs.existsSync(paths.file)).toBe(false);
  });

  test('picks up the sysop art slots beside the file it writes', async () => {
    const dir = tempBoard();
    const paths = bulletinPaths(dir);
    fs.mkdirSync(path.dirname(paths.file), { recursive: true });
    fs.writeFileSync(paths.header, '### BOARD ART ###\n', 'latin1');

    const api = stubApi(lb('global', rows(2, 'w')), lb('board:x', rows(2, 'b')));
    await refreshAchievementsBulletin(deps(dir, api));
    expect(fs.readFileSync(paths.file, 'latin1')).toContain('### BOARD ART ###');
  });
});
