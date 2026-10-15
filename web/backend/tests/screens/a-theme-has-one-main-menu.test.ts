/**
 * A THEME HAS ONE MAIN MENU, served to every conference.
 *
 * Themes were seeded with a MENU per conference. h7's artist redrew
 * conference 2's, conference 1 went on serving the 2573-byte template, and the
 * studio showed several "main menu" cards, some of which no replace could
 * reach (2026-10-02). The sysop's ruling: a theme's MENU falls back to ONE
 * theme-wide copy - `Themes/<slug>/Conf/` - after the conference's own theme
 * directory and before the board. The board's own resolution stays express.e's
 * (express.e:6560-6566 reads MENU from confScreenDir alone, 5052-5054).
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';
import { displayScreen } from '../../src/handlers/screen.handler';
import { screenSearchLocations } from '../../src/screens/screen-resolution';
import { buildScreenIndex, getScreenIndex, invalidateScreenIndex } from '../../src/screens/screen-index.service';
import { clearThemeRegistryCache, writeTheme, type ThemeEntry } from '../../src/screens/theme-registry';
import { themeTargetForBoardFile } from '../../src/screens/theme-target-path';
import { validateTheme } from '../../src/screens/theme-validation';
import { runThemeMenuMigration } from '../../src/scripts/promote-theme-main-menu';

let root: string;
let previousDataDir: string;

const write = (rel: string, body: string, mtime?: Date) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
  if (mtime) fs.utimesSync(full, mtime, mtime);
};

function theme(files: Record<string, string>): ThemeEntry {
  const entry: ThemeEntry = {
    slug: 'neon', title: 'Neon', author: 'Skope', owner: 'skope',
    dir: 'Themes/neon', widths: [80], doorTheme: '', status: 'live',
  };
  writeTheme(root, entry);
  for (const [rel, body] of Object.entries(files)) write(path.join('Themes', 'neon', rel), body);
  clearThemeRegistryCache();
  invalidateScreenIndex();
  return entry;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'one-main-menu-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'),
    'NCONFS=2\nNAME.1=Amiga\nLOCATION.1=BBS:Conf1/\nNAME.2=C64\nLOCATION.2=BBS:Conf2/\n');
  fs.mkdirSync(path.join(root, 'Node1'));
  // The board's own menus: one per conference, and the sysop's own list.
  write('Conf1/Menu.txt', 'the board menu one\r\n');
  write('Conf1/MENU250.TXT', 'the board sysop menu\r\n');
  write('Conf2/Menu.txt', 'the board menu two\r\n');
  write('Conf1/bull20.txt', 'the board bulletin one\r\n');
  clearThemeRegistryCache();
  invalidateScreenIndex();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  clearThemeRegistryCache();
  invalidateScreenIndex();
});

const dirs = (screen: string, confId: number, themeSlug?: string) =>
  screenSearchLocations(root, screen, { nodeId: 1, confId, themeSlug })
    .map(l => path.relative(root, l.dir) || '.');

describe("the board's own MENU is express.e's", () => {
  it('looks in the conference directory and nowhere a theme keeps', () => {
    theme({ 'Conf/Menu.txt': 'the neon menu\r\n' });

    // No theme worn, and `default` - the board itself: no theme directory at all.
    for (const slug of [undefined, 'default']) {
      expect(dirs('MENU', 2, slug)).toEqual(['Conf2', path.join('Conf2', 'Screens')]);
    }
  });
});

describe('a caller wearing a theme', () => {
  it("falls back to the theme's one menu after the conference's own, before the board", () => {
    theme({ 'Conf/Menu.txt': 'the neon menu\r\n', 'Conf/1/Menu.txt': 'an override\r\n' });

    expect(dirs('MENU', 1, 'neon')).toEqual([
      path.join('Themes', 'neon', 'Conf', '1'),
      path.join('Themes', 'neon', 'Conf'),
      'Conf1',
      path.join('Conf1', 'Screens'),
    ]);
  });

  it("does not share a conference's bulletin - only the main menu falls back", () => {
    theme({ 'Conf/Menu.txt': 'the neon menu\r\n' });

    expect(dirs('CONF_BULL', 1, 'neon')).not.toContain(path.join('Themes', 'neon', 'Conf'));
  });
});

/** The product's own entry point for painting a screen, as the caller's socket sees it. */
async function served(over: { secLevel: number; conf: number; screenTheme?: string }): Promise<string> {
  const emits: Array<{ event: string; data: unknown }> = [];
  const socket = {
    id: `menu-${Math.random()}`,
    emit: (event: string, data: unknown) => emits.push({ event, data }),
    on: () => {},
  };
  const session = {
    nodeId: 1,
    relConfNum: over.conf,
    user: { username: 'lamer', secLevel: over.secLevel, screenTheme: over.screenTheme },
  };
  await displayScreen(socket as never, session as never, 'MENU');
  return emits.filter(e => e.event === 'ansi-output').map(e => String(e.data)).join('');
}

describe('through the real loader', () => {
  beforeEach(() => {
    theme({
      'Conf/Menu.txt': 'the neon menu\r\n',
      'Conf/MENU250.TXT': 'the neon sysop menu\r\n',
      'Conf/2/Menu.txt': 'the neon conference two override\r\n',
    });
  });

  it("serves the theme's one menu in a conference that has none of its own", async () => {
    expect(await served({ secLevel: 20, conf: 1, screenTheme: 'neon' })).toContain('the neon menu');
  });

  it('keeps the level variant at the theme-wide scope', async () => {
    expect(await served({ secLevel: 250, conf: 1, screenTheme: 'neon' })).toContain('the neon sysop menu');
  });

  it("lets a conference's own theme menu override it", async () => {
    expect(await served({ secLevel: 20, conf: 2, screenTheme: 'neon' })).toContain('the neon conference two override');
  });

  it('leaves a caller not wearing the theme on the board', async () => {
    expect(await served({ secLevel: 20, conf: 1 })).toContain('the board menu one');
  });
});

describe('the screen index', () => {
  it('credits the theme-wide menu to every conference that falls back to it', () => {
    theme({ 'Conf/Menu.txt': 'the neon menu\r\n' });
    const index = buildScreenIndex(root, 'neon');
    const menu = index.screens.find(s => s.screen === 'MENU')!;
    const wide = path.join('Themes', 'neon', 'Conf', 'Menu.txt');

    // Level 255 is how the index resolves; the theme's base file covers it.
    expect(menu.resolutions.map(r => r.file)).toEqual([wide, wide]);
  });
});

describe('a redraw from the board', () => {
  it("lands the board's menu in the theme's one menu, and a bulletin in its conference", () => {
    const index = getScreenIndex(root);
    expect(themeTargetForBoardFile(index, path.join('Conf1', 'MENU250.TXT'))).toBe(path.join('Conf', 'MENU250.TXT'));
    expect(themeTargetForBoardFile(index, path.join('Conf2', 'Menu.txt'))).toBe(path.join('Conf', 'Menu.txt'));
    expect(themeTargetForBoardFile(index, path.join('Conf1', 'bull20.txt'))).toBe(path.join('Conf', '1', 'bull20.txt'));
  });
});

describe('publishing', () => {
  it("a theme's one main menu covering the board's sysop menu does not block it", () => {
    const entry = theme({ 'Conf/Menu.txt': 'the neon menu\r\n' });
    const result = validateTheme(root, entry);

    expect(result.blocking).toEqual([]);
    expect(result.publishable).toBe(true);
    // Said, not hidden: the sysop's list is covered on purpose.
    expect(result.advisory.some(f => f.rule === 'shadows-security-variant' && /MENU250\.TXT/.test(f.message))).toBe(true);
  });

  it('a per-conference menu that hides the board sysop menu still blocks, as before', () => {
    const entry = theme({ 'Conf/1/Menu.txt': 'the neon menu\r\n' });
    expect(validateTheme(root, entry).blocking.map(f => f.rule)).toContain('shadows-security-variant');
  });
});

describe('the migration script', () => {
  const lines: string[] = [];
  const run = (...args: string[]) => {
    lines.length = 0;
    return runThemeMenuMigration(['--root', root, '--date', '2026-10-02', ...args], line => lines.push(line), root);
  };
  const themeFiles = () => {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(dir, e.name));
        else out.push(path.relative(path.join(root, 'Themes', 'neon'), path.join(dir, e.name)));
      }
    };
    walk(path.join(root, 'Themes', 'neon'));
    return out.sort();
  };

  beforeEach(() => {
    // The shape the seeder gave every live theme: a menu per conference, the
    // sysop's level variant and a .GR twin - and the artist's redraw in 2.
    theme({});
    const old = new Date('2026-09-09T18:15:00Z');
    write('Themes/neon/Conf/1/Menu.txt', 'template one\r\n', old);
    write('Themes/neon/Conf/1/MENU250.TXT', 'template sysop\r\n', old);
    write('Themes/neon/Conf/1/menu250.txt.GR', 'template gr\r\n', old);
    write('Themes/neon/Conf/2/Menu.txt', 'the artist menu\r\n', new Date('2026-10-01T12:00:00Z'));
    write('Themes/neon/Conf/2/menu250.txt.GR', 'template gr\r\n', old);
    write('Themes/neon/Conf/1/bull20.txt', 'a bulletin\r\n', old);
  });

  it('--dry-run prints the plan and changes nothing', () => {
    const before = themeFiles();
    expect(run('--dry-run')).toBe(0);

    expect(lines.join('\n')).toContain(`promote ${path.join('Conf', '2', 'Menu.txt')} -> ${path.join('Conf', 'Menu.txt')}`);
    expect(themeFiles()).toEqual(before);
  });

  it('promotes the newest menu, moves every other per-conference copy aside, and deletes nothing', () => {
    const count = themeFiles().length;
    expect(run()).toBe(0);

    expect(fs.readFileSync(path.join(root, 'Themes/neon/Conf/Menu.txt'), 'latin1')).toBe('the artist menu\r\n');
    expect(themeFiles()).toEqual([
      path.join('Conf', '1', 'MENU250.TXT.per-conference-2026-10-02.backup'),
      path.join('Conf', '1', 'Menu.txt.per-conference-2026-10-02.backup'),
      path.join('Conf', '1', 'bull20.txt'),
      path.join('Conf', '1', 'menu250.txt.GR.per-conference-2026-10-02.backup'),
      path.join('Conf', '2', 'menu250.txt.GR.per-conference-2026-10-02.backup'),
      path.join('Conf', 'Menu.txt'),
    ].sort());
    expect(themeFiles()).toHaveLength(count);

    // Every conference is now served the artist's menu, and the theme publishes.
    invalidateScreenIndex();
    const menu = buildScreenIndex(root, 'neon').screens.find(s => s.screen === 'MENU')!;
    expect(new Set(menu.resolutions.map(r => r.file))).toEqual(new Set([path.join('Themes', 'neon', 'Conf', 'Menu.txt')]));
    clearThemeRegistryCache();
    expect(validateTheme(root, { slug: 'neon', title: 'Neon', author: '', owner: '', dir: 'Themes/neon', widths: [80], doorTheme: '', status: 'live' }).publishable).toBe(true);
  });

  it('a second run leaves the migrated theme alone', () => {
    run();
    const after = themeFiles();
    expect(run()).toBe(0);
    expect(lines.join('\n')).toContain('neon: left alone');
    expect(themeFiles()).toEqual(after);
  });
});
