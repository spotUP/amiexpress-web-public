/**
 * M7: what a menu door's exit tail does with the pick, driven through the REAL
 * executeDoor -> executeAmigaDoor with the 68K runtime replaced by a door that
 * arms a RUN / SHOW and exits (technique of tests/door-page-wait-sequencing).
 *
 *  - the pick runs as typed (allowSyscmd false) or as a listed SysCmd (true);
 *    every other returned command keeps allowSyscmd true (express.e:28249)
 *  - the typed line is withheld from every sink it can reach
 *  - leaving without a pick marks the dismissal once; a bulletin pick shows the
 *    bulletin and parks B; a parked reopen suppresses the post-door menu
 */
process.env.SKIP_DB_INIT = '1';

import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, LOCALHOST_IPS: [] };
});
jest.mock('../../src/services/DoorDropFileManager');
jest.mock('../../src/services/CallersLogManager');

const SECRET = 'hunter2-Zq9';
const fake = { arm: (_session: any): void => undefined, returnCommand: undefined as string | undefined };

jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({
  AmigaDoorSession: class {
    private session: any;
    constructor(_socket: unknown, config: { bbsSession: any }) { this.session = config.bbsSession; }
    async start(): Promise<void> { fake.arm(this.session); }
    getExitState() { return { ximState: fake.returnCommand ? { returnCommand: fake.returnCommand } : {} }; }
    isDoorRunning() { return false; }
  },
}));

// Wrapped, not replaced: a test chooses the stand-in or the real dispatcher.
jest.mock('../../src/handlers/command.handler', () => {
  const actual = jest.requireActual('../../src/handlers/command.handler');
  return { ...actual, processCommand: jest.fn(actual.processCommand) };
});
jest.mock('../../src/amiga-emulation/xim/secret-input', () => {
  const actual = jest.requireActual('../../src/amiga-emulation/xim/secret-input');
  return { ...actual, inputForTrace: jest.fn(actual.inputForTrace), doorInputTraceLine: jest.fn(actual.doorInputTraceLine) };
});

const order: string[] = [];
jest.mock('../../src/handlers/command-handler/menu', () => ({
  ...jest.requireActual('../../src/handlers/command-handler/menu'),
  displayMainMenu: jest.fn(async () => { order.push('menu'); }),
}));
const showBulletin = jest.fn(async (..._a: unknown[]) => { order.push('bulletin'); return true; });
jest.mock('../../src/handlers/commands/display-file-commands.handler', () => ({
  ...jest.requireActual('../../src/handlers/commands/display-file-commands.handler'),
  showBulletin: (...a: unknown[]) => showBulletin(...a),
}));

const mockRoot = { value: '' };
jest.mock('../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({
    bbsRoot: mockRoot.value, scanInstalledDoors: async () => [], getCachedDoors: () => [], isCachePopulated: () => true,
  }),
}));

import { executeDoor, setHelpers, type Door } from '../../src/handlers/door.handler';
import * as commandHandler from '../../src/handlers/command.handler';
import * as menuExit from '../../src/handlers/commands/menu-door-exit';
import * as secretInput from '../../src/amiga-emulation/xim/secret-input';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { config } from '../../src/config';

const callersLog = jest.fn(async (..._a: unknown[]) => undefined);
setHelpers({ callersLog: callersLog as never, getRecentCallerActivity: async () => [] });

describe('a menu door exit tail', () => {
  let root: string;
  const realGet = config.get.bind(config);
  const processSpy = commandHandler.processCommand as unknown as jest.Mock;
  const realProcess = jest.requireActual('../../src/handlers/command.handler').processCommand;
  let consoleLines: string[];

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-tail-'));
    mockRoot.value = root;
    jest.spyOn(config, 'get').mockImplementation(((key: string) =>
      key === 'dataDir' ? root : (realGet as (k: string) => unknown)(key)) as never);
    fs.mkdirSync(path.join(root, 'Doors', 'MAINMENU'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', 'MAINMENU', 'mainmenu'), Buffer.from([0x00, 0x00, 0x03, 0xf3]));
    order.length = 0; showBulletin.mockClear(); callersLog.mockClear();
    fake.arm = () => undefined; fake.returnCommand = undefined;
    consoleLines = [];
    for (const m of ['log', 'warn', 'error', 'info', 'debug'] as const) {
      jest.spyOn(console, m).mockImplementation((...a: unknown[]) => { consoleLines.push(a.map(String).join(' ')); });
    }
    processSpy.mockReset(); processSpy.mockImplementation(async () => 'SUCCESS');
  });
  afterEach(() => { jest.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

  async function runMenuDoor(command = 'MENU'): Promise<any> {
    const session: any = {
      state: BBSState.LOGGEDON, subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1,
      screenWidth: 80, tempData: {}, commandHistory: ['M'],
      user: { id: 1, username: 'CALLER', secLevel: 100, slotNumber: 1, confAccess: 'X'.repeat(25) },
    };
    const door = {
      id: 'mainmenu', name: 'MAINMENU', description: '', command, path: 'Doors/MAINMENU/mainmenu',
      accessLevel: 0, enabled: true, type: 'FIM',
    } as unknown as Door;
    const socket: any = { id: `menu-tail-${Math.random()}`, emit: () => true, on: () => undefined };
    await executeDoor(socket, session, door);
    return session;
  }

  test('a typed pick runs as the main prompt runs it (allowSyscmd false)', async () => {
    fake.arm = s => menuExit.armMenuRun(s, { text: 'M', runAs: 'typed' });
    await runMenuDoor();
    expect(processSpy).toHaveBeenCalledTimes(1);
    expect(processSpy.mock.calls[0].slice(2)).toEqual(['M', '', false]);
  });

  test('a listed SysCmd pick runs as a SysCmd (allowSyscmd true)', async () => {
    fake.arm = s => menuExit.armMenuRun(s, { text: 'ZZ now', runAs: 'syscmd' });
    await runMenuDoor();
    expect(processSpy.mock.calls[0].slice(2)).toEqual(['ZZ', 'NOW', true]);
  });

  test('another door\'s returned command keeps allowSyscmd true, and the run-as flag does not leak to it', async () => {
    fake.arm = s => menuExit.armMenuRun(s, { text: 'M', runAs: 'typed' });
    const first = await runMenuDoor();
    expect((first as any).returnCommandRunAs).toBeUndefined();
    fake.arm = () => undefined; fake.returnCommand = 'T';
    processSpy.mockClear();
    await runMenuDoor('W');
    expect(processSpy.mock.calls[0].slice(2)).toEqual(['T', '', true]);
  });

  test('leaving the menu door without a pick marks the dismissal once; another door does not', async () => {
    const s1 = await runMenuDoor('MENU');
    expect(menuExit.takeMenuDoorDismissed(s1)).toBe(true);
    expect(menuExit.takeMenuDoorDismissed(s1)).toBe(false);
    const s2 = await runMenuDoor('W');
    expect(menuExit.takeMenuDoorDismissed(s2)).toBe(false);
  });

  test('a pick shows the board menu afterwards as before; a bulletin pick shows the bulletin, reopens B, and draws no menu', async () => {
    fake.arm = s => menuExit.armMenuRun(s, { text: 'M', runAs: 'typed' });
    await runMenuDoor();
    expect(order).toEqual(['menu']);

    order.length = 0;
    fake.arm = s => menuExit.armMenuShow(s, { kind: 'BULLETINS', key: '3', command: 'B' });
    await runMenuDoor('B');
    expect(showBulletin).toHaveBeenCalledTimes(1);
    expect(showBulletin.mock.calls[0][2]).toBe(3);
    expect(order).toEqual(['bulletin']);
    expect(processSpy.mock.calls.map(c => c[2])).toContain('B');
  });

  describe('the picked line is withheld from every sink', () => {
    test('console, callers log, command history, debug log file, input traces', async () => {
      const inputTrace = secretInput.inputForTrace as unknown as jest.Mock;
      const doorTrace = secretInput.doorInputTraceLine as unknown as jest.Mock;
      inputTrace.mockClear(); doorTrace.mockClear();
      // the board's debug log file (door.handler writes it on every exit): read what THIS run appended
      const debugLog = '/tmp/bbs-debug.log';
      const before = fs.existsSync(debugLog) ? fs.statSync(debugLog).size : 0;
      processSpy.mockImplementation(realProcess);   // the REAL dispatcher: it logs the line it is given
      fake.arm = s => menuExit.armMenuRun(s, { text: `ZQXV ${SECRET}`, runAs: 'typed' });
      const session = await runMenuDoor();

      // The dispatcher did run the line (the pick reached it with its parameter intact) ...
      expect(processSpy.mock.calls[0].slice(2, 5)).toEqual(['ZQXV', SECRET.toUpperCase(), false]);
      // console: it carried the command, and not the secret
      const all = consoleLines.join('\n');
      expect(all).toContain('[CommandPriority] Processing command: ZQXV with params: [withheld]');
      expect(all.toLowerCase()).not.toContain(SECRET.toLowerCase());
      // callers log: it carried the door run, and not the secret
      expect(callersLog.mock.calls.map(c => c.join(' ')).join('\n')).toContain('Executed door');
      expect(callersLog.mock.calls.map(c => c.join(' ')).join('\n').toLowerCase()).not.toContain(SECRET.toLowerCase());
      // command history: it still holds what the caller typed at the prompt, and not the pick
      expect(session.commandHistory).toEqual(['M']);
      // debug log file: it carried the door's exit line, and not the secret
      const appended = fs.readFileSync(debugLog, 'utf8').slice(before);
      expect(appended).toContain('executeAmigaDoor EXIT');
      expect(appended.toLowerCase()).not.toContain(SECRET.toLowerCase());
      // keystroke / door-input traces: the tail feeds them nothing (UNCONFIRMED that they carry text in this run)
      expect(JSON.stringify([...inputTrace.mock.calls, ...doorTrace.mock.calls]).toLowerCase()).not.toContain(SECRET.toLowerCase());
    });

    test('the same line reaching a launched door as runtime parameters is withheld from the launch log', async () => {
      const { loggableCommandParams, runRedacted } = menuExit;
      const s = {};
      expect(loggableCommandParams(s, 'a b')).toBe('a b');
      await runRedacted(s, true, async () => { expect(loggableCommandParams(s, 'a b')).toBe('[withheld]'); });
      expect(loggableCommandParams(s, 'a b')).toBe('a b');
    });
  });
});
