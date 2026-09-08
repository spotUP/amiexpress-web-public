/**
 * The achievements bulletin is generated, but its FRAME is art somebody draws.
 *
 * `Screens/AchieveTop.txt` is rewritten every fifteen minutes, so nobody
 * should edit it - and it is drawn AROUND two files that are exactly a
 * designer's: `AchieveTop.Header` above the leaderboards and `.Tailer` below
 * them. Until now those were the BOARD's only: a theme could hold the
 * generated file and never influence it, so an artist drew the furniture and
 * callers wearing the theme still saw the board's. Asked for 2026-09-08:
 * "start by making the achievement bulletings editable and add support in the
 * ansi studio".
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { refreshAchievementsBulletin, themedBulletins } from '../../src/achievements/bulletin';

let root: string;

const write = (rel: string, body: string) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
};
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'latin1');

/** Two boards' worth of rows, so the bulletin has something to draw. */
const rows = [{ rank: 1, handle: 'spot', points: 100, unlocks: 5 }];

const deps = () => ({
  api: {
    enabled: () => true,
    leaderboard: async () => ({ status: 200, body: { rows } }),
  },
  baseDir: () => root,
  boardName: () => 'UPROUGH',
  now: () => new Date('2026-09-08T20:00:00Z'),
  log: () => {},
}) as never;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'achieve-art-'));
  write('Screens/AchieveTop.Header', 'THE BOARD OWN HEADER\r\n');
  // Two themes hold the bulletin; one has drawn its own header.
  write(path.join('Themes', 'neon', 'Board', 'AchieveTop.txt'), 'yesterday\r\n');
  write(path.join('Themes', 'neon', 'Board', 'AchieveTop.Header'), 'NEON DRAWS ITS OWN\r\n');
  write(path.join('Themes', 'plain', 'Board', 'AchieveTop.txt'), 'yesterday\r\n');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('a theme that draws the furniture gets ITS art around the board facts', async () => {
  expect(await refreshAchievementsBulletin(deps())).toBe('written');

  const neon = read(path.join('Themes', 'neon', 'Board', 'AchieveTop.txt'));
  expect(neon).toContain('NEON DRAWS ITS OWN');
  expect(neon).not.toContain('THE BOARD OWN HEADER');
  // The rows are the board's facts, and they are in there too.
  expect(neon).toContain('spot');
});

test('a theme with no art of its own still gets the board\'s', async () => {
  await refreshAchievementsBulletin(deps());

  const plain = read(path.join('Themes', 'plain', 'Board', 'AchieveTop.txt'));
  expect(plain).toContain('THE BOARD OWN HEADER');
  expect(plain).toBe(read(path.join('Screens', 'AchieveTop.txt')));
});

test('the board keeps its own', async () => {
  await refreshAchievementsBulletin(deps());

  expect(read(path.join('Screens', 'AchieveTop.txt'))).toContain('THE BOARD OWN HEADER');
});

test('the art slots are reported per theme, for whoever wants to draw them', () => {
  const themes = themedBulletins(root).sort((a, b) => a.slug.localeCompare(b.slug));

  expect(themes.map(t => t.slug)).toEqual(['neon', 'plain']);
  expect(themes[0].header).toBe(path.join(root, 'Themes', 'neon', 'Board', 'AchieveTop.Header'));
  expect(themes[0].tailer).toBe(path.join(root, 'Themes', 'neon', 'Board', 'AchieveTop.Tailer'));
});

test('a theme that does not hold the bulletin is left alone entirely', async () => {
  fs.mkdirSync(path.join(root, 'Themes', 'empty', 'Board'), { recursive: true });

  await refreshAchievementsBulletin(deps());

  expect(fs.existsSync(path.join(root, 'Themes', 'empty', 'Board', 'AchieveTop.txt'))).toBe(false);
});
