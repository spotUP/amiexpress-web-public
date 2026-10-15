/**
 * A new theme is a copy of the board's ART, and of nothing it DOES.
 *
 * "all new themes should be a copy of the default theme" is why seeding
 * exists, and it copied everything - including `logon20.txt`, which is 149
 * bytes of which bulletins show, which doors run and where the pauses fall.
 * Six of this board's seven themes ended up holding a byte-identical fork of
 * the login because this loop put it there, and the first edit to any of them
 * would have made a caller's login differ for no visual reason at all.
 *
 * The artist loses nothing: the ART a program NAMES is still themeable
 * through `Themes/<slug>/Files/`, which mirrors the board root.
 *
 * Design: thoughts/shared/plans/2026-09-14-a-theme-owns-art-not-behaviour-design.md
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { seedThemeFromBoard } from '../../src/screens/theme-seeding';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';
import { config } from '../../src/config';

let root: string;
let previousDataDir: string;

const write = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, 'latin1');
};

const THEME = { slug: 'neon', title: 'Neon', dir: 'Themes/neon', status: 'draft' } as never;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-art-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  fs.writeFileSync(path.join(root, 'Themes.info'), [
    'TYPE.0=neon', 'TITLE.0=Neon', 'DIR.0=Themes/neon', 'STATUS.0=draft', 'WIDTHS.0=80', '',
  ].join('\n'), 'latin1');

  // Art, and the sysop's own program.
  write('Node1/BBSTITLE.txt', '\x1b[31mTHE BOARD\x1b[0m\r\n');
  write('Node1/logon20.txt', [
    '~SS_BBS:bulletins/bull6.txt| ~SP',
    '~CC_gl ~SP',
    '~5SR_WORK:bbs/Screens/flt/flt ~SP',
    '',
  ].join('\n'));
  invalidateScreenIndex();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  invalidateScreenIndex();
});

describe('seeding a new theme from the board', () => {
  it('copies the art', () => {
    const result = seedThemeFromBoard(root, THEME);

    expect(result.copied).toBeGreaterThan(0);
    const art = fs.readdirSync(path.join(root, 'Themes', 'neon', 'Node'));
    expect(art.map(f => f.toLowerCase())).toContain('bbstitle.txt');
  });

  it('leaves the login program on the board, and says how many it left', () => {
    const result = seedThemeFromBoard(root, THEME);

    const copied = fs.readdirSync(path.join(root, 'Themes', 'neon', 'Node'))
      .map(f => f.toLowerCase());
    expect(copied).not.toContain('logon20.txt');
    expect(result.programsSkipped).toBeGreaterThan(0);
  });

  it('does not count a skipped program as a screen the theme carries', () => {
    const result = seedThemeFromBoard(root, THEME);

    // A theme reporting a screen it does not have is how an artist is sent to
    // redraw a file that is not there.
    expect(result.screens).toBeGreaterThan(0);
    expect(result.copied).toBe(
      fs.readdirSync(path.join(root, 'Themes', 'neon', 'Node')).length,
    );
  });
});
