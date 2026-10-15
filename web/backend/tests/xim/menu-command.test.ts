jest.mock('../../src/utils/acs-access-loader');
const permissionDenied = jest.fn();
jest.mock('../../src/utils/error-handling.util', () => ({ ErrorHandler: { permissionDenied: (...a: unknown[]) => permissionDenied(...a) } }));
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-command-'));
process.env.BBS_DATA_DIR = root;
import { config } from '../../src/config';
config.set('dataDir', root);   // boardRoot() reads the config, which was built before this file's env
import { menuAnswer, lastCatalogueOf } from '../../src/amiga-emulation/xim/menu';
import { takeMenuExit, menuRowOf } from '../../src/handlers/commands/menu-door-exit';
import { loggableXimString } from '../../src/amiga-emulation/xim/redact';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';
import { commandCache } from '../../src/handlers/command-execution.handler';

const drawn: string[] = [];
const session = (over: any = {}): any => ({ nodeId: 3, currentConf: 1, screenWidth: 80,
  user: { id: 7, secLevel: 10, securityFlags: 'T'.repeat(128), menuOverflow: '' }, ...over });
const ctx = (s: any) => ({ session: s, socket: { emit: jest.fn() }, emitDoorText: (t: string) => drawn.push(t) });
beforeEach(() => { drawn.length = 0; permissionDenied.mockClear(); commandCache.bbscmd.clear(); commandCache.syscmd.clear(); });

test('OPEN MAIN writes the catalogue file for this node and answers its Amiga path', async () => {
  const s = session();
  expect(await menuAnswer('OPEN MAIN', ctx(s))).toBe('OK\tBBS:Node3/menu-main.cat');
  const text = fs.readFileSync(path.join(root, 'Node3/menu-main.cat'), 'latin1');
  expect(text.startsWith('AEMENU 1\nK MAIN\t-\n')).toBe(true);
  expect(text).toMatch(/\nE R\tRead Mail\t/);
  expect(lastCatalogueOf(s, 'MAIN')).toBeDefined();
});

test('OPEN BULLETINS without ACS_READ_BULLETINS prints the board refusal and answers NO', async () => {
  const s = session();
  const f = s.user.securityFlags.split(''); f[require('../../src/constants/acs-permissions').ACSPermission.READ_BULLETINS] = 'F';
  s.user.securityFlags = f.join('');
  expect(await menuAnswer('OPEN BULLETINS', ctx(s))).toBe('NO');
  expect(permissionDenied).toHaveBeenCalledWith(expect.anything(), 'read bulletins');
});

test('an unknown kind answers nothing, like a board that does not know the command', async () => {
  expect(await menuAnswer('OPEN CONFERENCES', ctx(session()))).toBe('');
});

test('ROW is remembered per kind and comes back in the next catalogue', async () => {
  const s = session();
  expect(await menuAnswer('ROW 5', ctx(s))).toBe('');                    // ROW applies to the last opened kind: none yet
  await menuAnswer('OPEN MAIN', ctx(s));
  await menuAnswer('ROW 5', ctx(s));
  expect(menuRowOf(s, 'MAIN')).toBe(5);
  await menuAnswer('OPEN MAIN', ctx(s));
  expect(fs.readFileSync(path.join(root, 'Node3/menu-main.cat'), 'latin1')).toContain('\nR 5\n');
});

test('OVERFLOW stores the caller choice and answers the effective mode', async () => {
  const s = session();
  await menuAnswer('OPEN MAIN', ctx(s));
  expect(await menuAnswer('OVERFLOW pages', ctx(s))).toBe('OK\tpages');
  expect(s.user.menuOverflow).toBe('pages');
  expect(await menuAnswer('OVERFLOW default', ctx(s))).toBe('OK\tscroll');
  expect(await menuAnswer('OVERFLOW?', ctx(s))).toBe('default\tscroll');
  expect(await menuAnswer('OVERFLOW sideways', ctx(s))).toBe('');
});

test('RUN of a typed line runs as typed; a picked listed SysCmd runs as a SysCmd (Decision 34)', async () => {
  commandCache.syscmd.set('SHUTDOWN', { name: 'SHUTDOWN', type: 'XIM', toolTypes: {}, access: 10 } as any);
  const s = session();
  await menuAnswer('OPEN MAIN', ctx(s));
  expect(await menuAnswer('RUN j 2', ctx(s))).toBe('OK');
  expect(takeMenuExit(s).run).toEqual({ text: 'j 2', runAs: 'typed' });
  await menuAnswer('RUN SHUTDOWN', ctx(s));
  expect(takeMenuExit(s).run).toEqual({ text: 'SHUTDOWN', runAs: 'syscmd' });
  expect(takeMenuExit(s)).toEqual({});
});

test('a RUN line never reaches a log: the loggable form withholds it', () => {
  expect(loggableXimString(XIMCommand.AEW_MENU, 1, 'RUN J 5 secretpass')).toBe('RUN [14 bytes withheld]');
  expect(loggableXimString(XIMCommand.AEW_MENU, 1, 'OPEN MAIN')).toBe('OPEN MAIN');
});

test('LOGO draws through the door output path, or answers NONE', async () => {
  const s = session();
  await menuAnswer('OPEN MAIN', ctx(s));
  expect(await menuAnswer('LOGO header 2 1 4 80', ctx(s))).toBe('NONE');
  expect(drawn).toEqual([]);
});

test('LOGO draws a chosen logo through emitDoorText and answers the rows drawn', async () => {
  const dir = path.join(root, 'Screens/menus/main/logos');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(__dirname, '../fixtures/menu-logos/cat.txt'), path.join(dir, 'cat.txt'));
  fs.mkdirSync(path.join(root, 'Menus'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Menus/MAIN.json'), JSON.stringify({ logos: [{ position: 'header', widthClass: 'standard', levelFloor: 0, rule: 'fixed', files: ['cat.txt'] }] }));
  try {
    const s = session();
    await menuAnswer('OPEN MAIN', ctx(s));
    expect(fs.readFileSync(path.join(root, 'Node3/menu-main.cat'), 'latin1')).toContain('\nL header\t3\t7\t');
    expect(await menuAnswer('LOGO header 2 30 3 20', ctx(s))).toBe('OK\t3');
    expect(drawn.join('')).toContain('\x1b[2;30H');
    drawn.length = 0;
    expect(await menuAnswer('LOGO header 2 30 2 20', ctx(s))).toBe('NONE');   // does not fit its box
    expect(drawn).toEqual([]);
  } finally { fs.rmSync(path.join(root, 'Menus'), { recursive: true, force: true }); }
});

test('SHOW answers NO for a key that is not a bulletin entry', async () => {
  const s = session();
  await menuAnswer('OPEN MAIN', ctx(s));
  expect(await menuAnswer('SHOW 3', ctx(s))).toBe('NO');
  expect(takeMenuExit(s)).toEqual({});
});
