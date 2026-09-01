/**
 * The express.e screen resolution table, as a module of its own.
 *
 * It used to be private inside screen.handler.ts, which meant anything else
 * that needed to know where a screen comes from - the admin's screen file
 * manager, most immediately - had to re-derive it. A writer and a reader with
 * their own copy of one rule is the fault that ran through the whole 2026-08-31
 * admin audit, so the rule lives in one place and both read it.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ScreenDirType, getScreenDirType, getScreenFileName,
  resolveNodeScreenDir, screenSearchLocations,
} from '../../src/screens/screen-resolution';

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-res-'));
  fs.mkdirSync(path.join(root, 'Node7'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Node200.info'), 'SCREENS=BBS:Screens/Shared/\n');
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the express.e screen directory table', () => {
  test('LOGON is a node screen, MENU a conference one, BULL a board one', () => {
    expect(getScreenDirType('LOGON')).toBe(ScreenDirType.NODE);
    expect(getScreenDirType('MENU')).toBe(ScreenDirType.CONF);
    expect(getScreenDirType('BULL')).toBe(ScreenDirType.GLOBAL);
  });

  test('a screen this port does not know answers null', () => {
    expect(getScreenDirType('NOTASCREEN')).toBeNull();
  });

  test('NODE_BULL and CONF_BULL both read the file named BULL', () => {
    expect(getScreenFileName('NODE_BULL')).toBe('BULL');
    expect(getScreenFileName('CONF_BULL')).toBe('BULL');
    expect(getScreenFileName('LOGON24')).toBe('Logon24hrs');
  });
});

describe('screenSearchLocations', () => {
  test('a node screen searches the node directory and nothing else', () => {
    const locations = screenSearchLocations(root, 'LOGON', { nodeId: 7 });
    expect(locations.map(l => l.dir)).toEqual([path.join(root, 'Node7')]);
  });

  test('the SCREENS tooltype replaces the node directory', () => {
    const locations = screenSearchLocations(root, 'LOGON', { nodeId: 200 });
    expect(locations[0].dir).toBe(path.join(root, 'Screens', 'Shared'));
    expect(resolveNodeScreenDir(root, 200)).toBe(path.join(root, 'Screens', 'Shared'));
  });

  test('a conference screen searches the conference, then its Screens/', () => {
    const dirs = screenSearchLocations(root, 'MENU', { nodeId: 7, confId: 3 }).map(l => l.dir);
    expect(dirs).toEqual([path.join(root, 'Conf3'), path.join(root, 'Conf3', 'Screens')]);
  });

  test('a board screen searches the board root before Screens/', () => {
    const dirs = screenSearchLocations(root, 'BULL', { nodeId: 7 }).map(l => l.dir);
    expect(dirs[0]).toBe(root);
    expect(dirs[1]).toBe(path.join(root, 'Screens'));
  });
});
