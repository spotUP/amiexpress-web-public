/**
 * The theme this BBS software ships with.
 *
 * `Themes/tango` is the board's own look out of the box - the art tGø drew,
 * as a THEME rather than as edits scattered through the board's screens, so a
 * sysop can put their own art beside it and callers can choose. It is tracked
 * in the repo and carried to a board by the deploy's tracked sync (SP1), and
 * `Themes.info` names it the default.
 *
 * These tests read the REPO's own theme, not a fixture: shipping a broken one
 * is the failure worth catching, and a fixture would only prove the fixture.
 */
import * as fs from 'fs';
import * as path from 'path';

import { readThemeRegistry, clearThemeRegistryCache } from '../../src/screens/theme-registry';

const REPO = path.join(__dirname, '..', '..', '..', '..');

beforeEach(() => clearThemeRegistryCache());

describe('the shipped theme', () => {
  it('is registered, live, and the board default', () => {
    const registry = readThemeRegistry(path.join(REPO, 'board'));
    const tango = registry.themes.find(theme => theme.slug === 'tango');

    expect(tango).toBeDefined();
    expect(tango!.status).toBe('live');       // a draft would be invisible to callers
    expect(tango!.dir).toBe('Themes/tango');
    expect(registry.defaultSlug).toBe('tango');
  });

  it('has no owner, because the board ships it - it is not one artist\'s sandbox', () => {
    const tango = readThemeRegistry(path.join(REPO, 'board')).themes.find(theme => theme.slug === 'tango');
    // An OWNER is an account the sandbox lets write. The shipped theme belongs
    // to the software, so only a sysop edits it.
    expect(tango!.owner).toBe('');
  });

  it('keeps its screens in the SCOPE directories the resolver reads', () => {
    const root = path.join(REPO, 'board', 'Themes', 'tango');
    for (const scope of ['Board', 'Node', 'Conf']) {
      expect(fs.existsSync(path.join(root, scope))).toBe(true);
    }
    // Keyed on the conference NUMBER, never on a directory name a renumber
    // would move.
    expect(fs.existsSync(path.join(root, 'Conf', '1', 'Menu.txt'))).toBe(true);
  });

  it('carries the screens the board serves, whole - not just the art', () => {
    const menu = fs.readFileSync(path.join(REPO, 'board', 'Themes/tango/Conf/1/Menu.txt'), 'latin1');
    // Colour codes sit BETWEEN the bracket and the letter, so `[E]` never
    // appears in the raw bytes - the same shape that hid a damaged MENU.TXT
    // from a check this morning. Read what a caller reads.
    const plain = menu.replace(/(\x1b\[|\x9b)[0-9;?]*[A-Za-z]/g, '');

    // A theme's menu REPLACES the board's, so one with the logo and no
    // commands would leave a caller looking at art with nothing to type.
    expect(plain).toMatch(/\[E\]/);
    expect(plain).toMatch(/\[G\]/);
    expect(plain).toContain('tG\xf8');
  });

  it('is latin1 with its escapes intact, not a UTF-8 round trip', () => {
    const bull = fs.readFileSync(path.join(REPO, 'board', 'Themes/tango/Board/BULL.TXT'));
    expect(bull.includes(0x1b)).toBe(true);   // real ANSI escapes
    expect(bull.includes(0xf8)).toBe(true);   // tGø's ø, one latin1 byte
    expect(bull.includes(Buffer.from('Ã¸', 'latin1'))).toBe(false); // the UTF-8 wreck
  });

  it('ships the four logos this board has no screen for, rather than dropping them', () => {
    // doors, operator, request and sysop name no screen express.e routes, so
    // they wait in the theme's Files/ mirror for a sysop who makes one.
    for (const name of ['doors', 'operator', 'request', 'sysop']) {
      expect(fs.existsSync(path.join(REPO, 'board', 'Themes/tango/Files/Screens/tango', `${name}.ans`))).toBe(true);
    }
  });
});

/**
 * And it REACHES a caller. Everything above proves the files are there and
 * well formed; this drives the board's own loader over a copy of the shipped
 * theme, because "the theme exists" and "a caller is served it" are the two
 * claims this repo keeps confusing.
 */
describe('a caller on a board that ships it', () => {
  const os = require('os');
  let root: string;
  let previousDataDir: string;

  const { config } = require('../../src/config');
  const { displayScreen } = require('../../src/handlers/screen.handler');

  function socket(emits: string[]) {
    return {
      id: `tango-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      emit: (event: string, data: unknown) => { if (event === 'ansi-output') emits.push(String(data)); },
      on: () => {},
    } as never;
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tango-board-'));
    previousDataDir = config.get('dataDir');
    config.set('dataDir', root);
    fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
    fs.mkdirSync(path.join(root, 'Conf1'), { recursive: true });
    fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });

    // The board's own art, which the theme must shadow.
    fs.writeFileSync(path.join(root, 'Screens', 'BULL.TXT'), 'the plain board bulletin\r\n', 'latin1');

    // The shipped theme, copied as the deploy would place it.
    fs.cpSync(path.join(REPO, 'board', 'Themes', 'tango'), path.join(root, 'Themes', 'tango'), { recursive: true });
    fs.copyFileSync(path.join(REPO, 'board', 'Themes.info'), path.join(root, 'Themes.info'));
    clearThemeRegistryCache();
  });

  afterEach(() => {
    config.set('dataDir', previousDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("serves the theme's bulletin to a caller with no preference of their own", async () => {
    const emits: string[] = [];
    await displayScreen(socket(emits), {
      nodeId: 1, relConfNum: 1, currentConf: 1,
      user: { id: 1, username: 'lamer', secLevel: 100 },
    }, 'BULL');

    const painted = emits.join('');
    expect(painted).toContain('tG\xf8');                    // tGø signed it
    expect(painted).not.toContain('the plain board bulletin');
  });

  it("serves the board's own art to a caller who has chosen it", async () => {
    // `default` is not a directory - it IS the board's screens - so choosing
    // it is how a caller turns the shipped look off.
    const emits: string[] = [];
    await displayScreen(socket(emits), {
      nodeId: 1, relConfNum: 1, currentConf: 1,
      user: { id: 1, username: 'lamer', secLevel: 100, screenTheme: 'default' },
    }, 'BULL');

    expect(emits.join('')).toContain('the plain board bulletin');
  });
});

