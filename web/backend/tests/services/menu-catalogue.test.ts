jest.mock('../../src/utils/acs-access-loader');
import { buildCatalogue } from '../../src/services/menu-catalogue/build';
import { formatCatalogue } from '../../src/services/menu-catalogue/catalogue-file';
import { mainMenuSource } from '../../src/services/menu-catalogue/sources/main';
import { registerMenuSource, menuSourceFor } from '../../src/services/menu-catalogue/registry';
import { defaultMenuConfig, validateMenuConfig } from '../../src/screens/menu-config/menu-config';
import { commandCache } from '../../src/handlers/command-execution.handler';
import type { MenuCaller, MenuSource } from '../../src/services/menu-catalogue/types';

const caller = (over: Partial<MenuCaller> = {}): MenuCaller => ({
  secLevel: 10, conference: 1, node: 1, columns: 80, rows: 25, displayMode: 'ansi',
  may: (k: string) => !['SYSOP_COMMANDS', 'REMOTE_SHELL', 'ACCOUNT_EDITING', 'LIST_NODES', 'EDIT_DIRS', 'EDIT_FILES'].includes(k),
  isSysop: false, widthRefuses: () => false, overflowPref: '', ...over,
});
const door = (command: string, t: Record<string, string> = {}, extra: Record<string, unknown> = {}) =>
  ({ name: command, type: 'XIM', location: `Doors/${command}/x`, access: undefined, toolTypes: t, ...extra });

beforeEach(() => {
  commandCache.bbscmd.clear(); commandCache.syscmd.clear();
  commandCache.bbscmd.set('W', door('W', { DESCRIPTION: 'Your settings, the door way' }) as any);
  commandCache.bbscmd.set('FROGGER', door('FROGGER', { NAME: 'Frogger', DESCRIPTION: 'Cross the road\tnow\x1b[2J' }) as any);
  commandCache.bbscmd.set('MENU', door('MENU') as any);
  commandCache.bbscmd.set('ELITE', door('ELITE', {}, { access: 200 }) as any);
  commandCache.syscmd.set('SHUTDOWN', door('SHUTDOWN', { DESCRIPTION: 'Stop the board' }, { access: 255 }) as any);
});

const keys = (c: any) => c.sections.flatMap((s: any) => s.entries.map((e: any) => e.key));

test('internal commands are listed under their gate, doors and SysCmd under their ACCESS', () => {
  const c: any = buildCatalogue(mainMenuSource, caller(), defaultMenuConfig('MAIN'));
  expect(keys(c)).toEqual(expect.arrayContaining(['R', 'E', 'F', 'J', 'W', 'FROGGER']));
  expect(keys(c)).not.toEqual(expect.arrayContaining(['NM']));      // SYSOP_COMMANDS refused
  expect(keys(c)).not.toContain('ELITE');                            // ACCESS=200 > 10
  expect(keys(c)).not.toContain('SHUTDOWN');                         // SysCmd ACCESS=255
  expect(keys(c)).not.toContain('MENU');                             // the menu's own registration (Decision 36)
  expect(keys(c)).not.toContain('?');                                // listed: false
});

test('a SysCmd is listed, and picked as a SysCmd, for a level allowed to run it', () => {
  const c: any = buildCatalogue(mainMenuSource, caller({ secLevel: 255, isSysop: true, may: () => true }), defaultMenuConfig('MAIN'));
  const e = c.sections.flatMap((s: any) => s.entries).find((x: any) => x.key === 'SHUTDOWN');
  expect(e).toMatchObject({ runAs: 'syscmd', section: 'system' });
});

test('a door shadowing an internal command is one entry: internal label, door description (Decision 35)', () => {
  const c: any = buildCatalogue(mainMenuSource, caller(), defaultMenuConfig('MAIN'));
  const w = c.sections.flatMap((s: any) => s.entries).filter((x: any) => x.key === 'W');
  expect(w).toHaveLength(1);
  expect(w[0]).toMatchObject({ label: 'User Settings', description: 'Your settings, the door way', section: 'account' });
});

test('a shadowing door the caller may not run by LEVEL removes the internal row; refused by WIDTH only it keeps it', () => {
  commandCache.bbscmd.set('W', door('W', {}, { access: 50 }) as any);
  expect(keys(buildCatalogue(mainMenuSource, caller(), defaultMenuConfig('MAIN')))).not.toContain('W');
  commandCache.bbscmd.set('W', door('W') as any);
  const c: any = buildCatalogue(mainMenuSource, caller({ columns: 40, displayMode: 'petscii', widthRefuses: (d: any) => d.name === 'W' }), defaultMenuConfig('MAIN'));
  expect(c.sections.flatMap((s: any) => s.entries).filter((x: any) => x.key === 'W')).toHaveLength(1);
});

test('a door too wide for the caller is not listed (the width gate, one predicate)', () => {
  const c: any = buildCatalogue(mainMenuSource, caller({ columns: 40, displayMode: 'petscii', widthRefuses: (d: any) => d.name === 'FROGGER' }), defaultMenuConfig('MAIN'));
  expect(keys(c)).not.toContain('FROGGER');
});

test('the sysop description wins, per-level hide/rename/order apply at and above their floor', () => {
  const { config } = validateMenuConfig('MAIN', {
    descriptions: { R: 'Mail, here' },
    levels: { '0': { hide: ['T'], rename: { R: 'Mail' }, order: ['E', 'R'] }, '100': { hide: [], rename: {}, order: [] } },
  });
  const low: any = buildCatalogue(mainMenuSource, caller(), config);
  const msgs = low.sections.find((s: any) => s.id === 'messages').entries;
  expect(msgs.slice(0, 2).map((e: any) => e.key)).toEqual(['E', 'R']);
  expect(msgs[1]).toMatchObject({ label: 'Mail', description: 'Mail, here' });
  expect(keys(low)).not.toContain('T');
  const high: any = buildCatalogue(mainMenuSource, caller({ secLevel: 100 }), config);
  expect(keys(high)).toContain('T');
});

test('at 40 columns a C64 menu for the level replaces the derived one, still filtered by access', () => {
  const { config } = validateMenuConfig('MAIN', { c64Menus: { '0': { sections: [{ title: 'Quick', keys: ['R', 'NM', 'G'] }] } } });
  const c: any = buildCatalogue(mainMenuSource, caller({ columns: 40, displayMode: 'petscii' }), config);
  expect(c.sections.map((s: any) => s.title)).toEqual(['Quick']);
  expect(keys(c)).toEqual(['R', 'G']);
});

test('the caller\'s overflow choice beats the board default; the default follows width and level', () => {
  expect((buildCatalogue(mainMenuSource, caller({ columns: 40, displayMode: 'petscii' }), defaultMenuConfig('MAIN')) as any).overflow).toBe('pages');
  expect((buildCatalogue(mainMenuSource, caller(), defaultMenuConfig('MAIN')) as any).overflow).toBe('scroll');
  expect((buildCatalogue(mainMenuSource, caller({ overflowPref: 'pages' }), defaultMenuConfig('MAIN')) as any).overflow).toBe('pages');
});

test('wipes are off at 40 when the sysop switched at40 off', () => {
  const { config } = validateMenuConfig('MAIN', { wipes: { open: 'X', leave: 'H', page: 'V', at40: false } });
  expect((buildCatalogue(mainMenuSource, caller({ columns: 40, displayMode: 'petscii' }), config) as any).wipes).toEqual({ open: '', leave: '', page: '' });
});

test('the catalogue file: TAB-safe fields, cut at their widths, never the key', () => {
  const c: any = buildCatalogue(mainMenuSource, caller(), defaultMenuConfig('MAIN'));
  c.sections[0].entries.push({ key: 'LINKDISCORD', label: 'x'.repeat(60), description: 'y'.repeat(300), right: '12 new', flags: 'CGL', runText: 'LINKDISCORD', runAs: 'typed', section: 'messages' });
  const text = formatCatalogue(c, 3);
  const lines = text.split('\n');
  expect(lines[0]).toBe('AEMENU 1');
  expect(lines).toContain('R 3');
  expect(lines[lines.length - 2]).toBe('.');
  const e = lines.find(l => l.startsWith('E LINKDISCORD\t'))!.slice(2).split('\t');
  expect(e).toEqual(['LINKDISCORD', 'x'.repeat(26), 'y'.repeat(76), '12 new', 'CGL']);
  const frogger = lines.find(l => l.startsWith('E FROGGER\t'))!;
  expect(frogger).not.toMatch(/\x1b|\r/);
  expect(frogger.split('\t')).toHaveLength(5);
});

test('a source with second-level lists builds a child catalogue (the J contract, Decision 42)', () => {
  const fake: MenuSource = {
    kind: 'BULLETINS', title: () => 'T', prompt: () => 'P', gate: () => ({ ok: true }),
    entries: () => [{ key: '3', label: 'Amiga Scene', description: '', right: '12 new', flags: 'CL', runText: 'J 3', runAs: 'typed', section: 'bulletins' }],
    children: (_c, parent) => parent === '3' ? [{ key: '1', label: 'Main', description: '', right: '', flags: '', runText: 'J 3.1', runAs: 'typed', section: 'bulletins' }] : null,
  };
  const child: any = buildCatalogue(fake, caller(), defaultMenuConfig('BULLETINS'), '3');
  expect(child.parent).toBe('3');
  expect(keys(child)).toEqual(['1']);
  expect(formatCatalogue(child, 0).split('\n')[1]).toBe('K BULLETINS\t3');
  expect((buildCatalogue(fake, caller(), defaultMenuConfig('BULLETINS'), '9') as any).refusal).toBe('No such entry.');
});

test('the registry answers the two kinds and a later one', () => {
  expect(menuSourceFor('MAIN')).toBe(mainMenuSource);
  expect(menuSourceFor('BULLETINS')).toBeDefined();
  expect(menuSourceFor('NOPE')).toBeUndefined();
  registerMenuSource({ ...mainMenuSource, kind: 'CONFERENCES' as any });
  expect(menuSourceFor('CONFERENCES')).toBeDefined();
});

describe('drill-down line', () => {
  const dLine = (cfgDrill: unknown, over: Partial<MenuCaller> = {}) => {
    const { config } = validateMenuConfig('MAIN', { drill: cfgDrill });
    return formatCatalogue(buildCatalogue(mainMenuSource, caller(over), config), 0).split('\n').filter(l => l.startsWith('D '));
  };
  test('no D line by default, so a drill-off catalogue is unchanged', () => {
    expect(dLine(undefined)).toEqual([]);
    expect(formatCatalogue(buildCatalogue(mainMenuSource, caller(), defaultMenuConfig('MAIN')), 0)).not.toMatch(/^D /m);
  });
  test('D 1 TAB 1 when enabled, placed after W and before R', () => {
    expect(dLine({ enabled: true, slide: true })).toEqual(['D 1\t1']);
    const lines = formatCatalogue(buildCatalogue(mainMenuSource, caller(), validateMenuConfig('MAIN', { drill: { enabled: true } }).config), 0).split('\n');
    const i = lines.indexOf('D 1\t1');
    expect(lines[i - 1]).toMatch(/^W /);
    expect(lines[i + 1]).toMatch(/^R /);
  });
  test('slide is 0 at 40 columns, in PETSCII, and when slide is off', () => {
    expect(dLine({ enabled: true, slide: true }, { columns: 40 })).toEqual(['D 1\t0']);
    expect(dLine({ enabled: true, slide: true }, { columns: 80, displayMode: 'petscii' })).toEqual(['D 1\t0']);
    expect(dLine({ enabled: true, slide: false })).toEqual(['D 1\t0']);
  });
});
