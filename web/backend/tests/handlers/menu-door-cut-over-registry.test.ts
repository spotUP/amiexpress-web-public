/**
 * M19: the cut-over against the REAL command registry - a MENU.info written by the
 * register script and scanned by the real loadCommands. Only the door itself is stubbed.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setBoardRoot } from '../helpers/board-root';

const processCommand = jest.fn(async (_s: any, session: any) => {
  const e = require('../../src/handlers/commands/menu-door-exit');
  e.enterExitTail(session); e.leaveExitTail(session);
  return 'SUCCESS';
});
jest.mock('../../src/handlers/command.handler', () => ({ processCommand: (...a: unknown[]) => (processCommand as any)(...a) }));

import { loadCommands, commandCache, doorLevelForCommandAccess } from '../../src/handlers/command-execution.handler';
import { launchMenuDoor } from '../../src/handlers/command-handler/menu';
import { STEPS } from '../../src/scripts/register-menu-doors';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'mreg-'));
const restore = setBoardRoot(board);
afterAll(() => { restore(); fs.rmSync(board, { recursive: true, force: true }); });
const binary = path.join(board, 'Doors', 'MAINMENU', 'mainmenu');
const infoPath = path.join(board, 'Commands', 'BBSCmd', 'MENU.info');

function reload() { commandCache.bbscmd.clear(); loadCommands(board, 1, 1); }
const session = (level: number): any => ({ currentConf: 1, nodeId: 1, user: { secLevel: level }, state: 'loggedon' });

beforeAll(() => {
  STEPS.menu(board);
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  fs.writeFileSync(binary, 'x');
});
beforeEach(() => { processCommand.mockClear(); reload(); });

test('the registered MENU.info with a live binary runs the door', async () => {
  expect(commandCache.bbscmd.has('MENU')).toBe(true);
  expect(await launchMenuDoor({}, session(10), 'display-flow')).toBe('ran');
  expect(processCommand).toHaveBeenCalledTimes(1);
});

test('the same registration with the binary gone falls back', async () => {
  fs.rmSync(binary);
  try {
    expect(await launchMenuDoor({}, session(10), 'display-flow')).toBe('fallback');
    expect(processCommand).not.toHaveBeenCalled();
  } finally { fs.writeFileSync(binary, 'x'); }
});

test('no MENU.info at all falls back', async () => {
  const saved = fs.readFileSync(infoPath);
  fs.rmSync(infoPath);
  try {
    reload();
    expect(await launchMenuDoor({}, session(10), 'display-flow')).toBe('fallback');
  } finally { fs.writeFileSync(infoPath, saved); }
});

test('ACCESS=0 parks the door at the disabled level and ACCESS=50 refuses a level-10 caller', async () => {
  const saved = fs.readFileSync(infoPath, 'latin1');
  try {
    fs.writeFileSync(infoPath, saved + 'ACCESS=0\r\n', 'latin1'); reload();
    expect(doorLevelForCommandAccess(commandCache.bbscmd.get('MENU')?.access)).toBeGreaterThan(255);
    expect(await launchMenuDoor({}, session(255), 'display-flow')).toBe('fallback');
    fs.writeFileSync(infoPath, saved + 'ACCESS=50\r\n', 'latin1'); reload();
    expect(await launchMenuDoor({}, session(10), 'display-flow')).toBe('fallback');
    expect(await launchMenuDoor({}, session(50), 'display-flow')).toBe('ran');
  } finally { fs.writeFileSync(infoPath, saved, 'latin1'); }
});
