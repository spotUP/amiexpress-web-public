/**
 * A password typed into a 68K door must not reach the backend log or the door log file.
 *
 * executeAmigaDoor's doorInputHandler printed EVERY key it was given (console.log) and wrote it to
 * logs/door-68k.log (logDoorDebug "KEY door=... data=..."), ungated. The W door's masked password entry
 * (AEW_USERFIELD SECRET 1) therefore left the password, a key at a time, in both. Mouse reports (a hover is
 * dozens a second) landed raw too. Normal keys stay in both sinks: per-key 68K debugging is wanted signal.
 *
 * Driven through the real executeDoor -> executeAmigaDoor -> session.doorInputHandler; only the emulator
 * (AmigaDoorSession) is replaced, by a stub whose start() types the keys at the handler the launch installed.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';

jest.mock('../src/index', () => {
  const states = require('../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, LOCALHOST_IPS: [] };
});
jest.mock('../src/amiga-emulation/loader/LibraryLoader', () => ({ LibraryLoader: jest.fn() }));
jest.mock('../src/amiga-emulation/AmigaDoorSession', () => ({ AmigaDoorSession: jest.fn() }));
jest.mock('../src/services/DoorDropFileManager');
jest.mock('../src/services/CallersLogManager');
let boardRoot = '';
jest.mock('../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({ bbsRoot: boardRoot, scanInstalledDoors: async () => [] }),
}));

import { AmigaDoorSession } from '../src/amiga-emulation/AmigaDoorSession';
import { setSecretInput } from '../src/amiga-emulation/xim/secret-input';
import { BBSState, LoggedOnSubState } from '../src/constants/bbs-states';
import { executeDoor, routeAmigaDoorInput, setHelpers, type Door } from '../src/handlers/door.handler';
import { config } from '../src/config';
import type { BBSSession } from '../src/index';

setHelpers({ callersLog: async () => undefined, getRecentCallerActivity: async () => [] });

const SECRET = 'hunter2-Pa55';
const MOUSE_PRESS = '\x1b[<0;12;5M';
const MOUSE_HOVER = '\x1b[<35;47;19M';

/** Launch a 68K door; while it "runs", type `typed` at the installed handler. Returns console text + door log text. */
async function runDoorTyping(typed: (session: BBSSession) => string[]): Promise<{ consoleText: string; fileText: string }> {
  const session = {
    state: BBSState.LOGGEDON, subState: LoggedOnSubState.PROCESS_COMMAND,
    user: { id: 7, username: 'CALLER', secLevel: 255 }, nodeId: 1, currentConf: 1, timeRemaining: 3600,
    petsciiMode: false, screenWidth: 80, screenHeight: 24, tempData: {},
  } as unknown as BBSSession;
  (AmigaDoorSession as unknown as jest.Mock).mockImplementation(() => ({
    sharedState: {},
    on: () => undefined,
    start: async () => { for (const k of typed(session)) (session as unknown as { doorInputHandler: (d: string) => void }).doorInputHandler(k); },
  }));
  const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  const socket: any = Object.assign(new EventEmitter(), { id: 'sock-1', emit: jest.fn(() => true) });
  const door = { id: 'wdoor', name: 'WDoor', command: 'WDOOR', path: 'Doors/WDoor/WDoor', type: 'XIM', accessLevel: 0, enabled: true } as unknown as Door;
  await executeDoor(socket, session, door).catch(() => undefined);
  const consoleText = log.mock.calls.map((c) => c.join(' ')).join('\n');
  log.mockRestore();
  const file = path.join(boardRoot, 'logs', 'door-68k.log');
  return { consoleText, fileText: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '' };
}

let prevRoot: string | undefined; let prevData: string | undefined;
beforeEach(() => {
  boardRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'door-log-redact-'));
  fs.mkdirSync(path.join(boardRoot, 'Doors', 'WDoor'), { recursive: true });
  fs.writeFileSync(path.join(boardRoot, 'Doors', 'WDoor', 'WDoor'), Buffer.from([0, 0, 3, 0xf3]));
  prevRoot = process.env.BBS_ROOT; prevData = process.env.BBS_DATA_DIR;
  process.env.BBS_ROOT = boardRoot; process.env.BBS_DATA_DIR = boardRoot;
  const realGet = config.get.bind(config);
  jest.spyOn(config, 'get').mockImplementation(((key: string) =>
    key === 'dataDir' ? boardRoot : (realGet as (k: string) => unknown)(key)) as never);
});
afterEach(() => {
  jest.restoreAllMocks();
  if (prevRoot === undefined) delete process.env.BBS_ROOT; else process.env.BBS_ROOT = prevRoot;
  if (prevData === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = prevData;
  fs.rmSync(boardRoot, { recursive: true, force: true });
});

describe('door keystroke logs keep the debug signal but never a secret', () => {
  test('a normal key shows in the backend log and in the door log file', async () => {
    const { consoleText, fileText } = await runDoorTyping(() => ['q', '\r']);
    expect(consoleText).toContain('doorInputHandler received: "q"');
    expect(fileText).toContain('KEY door=WDOOR data="q"');
    expect(fileText).toContain('KEY door=WDOOR data="\\r"');
  });

  test('a password typed while the door holds SECRET is in neither sink, a normal key afterwards is', async () => {
    const { consoleText, fileText } = await runDoorTyping((session) => {
      setSecretInput(session, true);
      const keys = [...SECRET];
      return [...keys.map((k) => { return k; }), '\r'];
    });
    // the sinks were alive for this run (a launch line reached both), so absence below is not silence
    expect(consoleText).toContain('[executeAmigaDoor] Starting Amiga door');
    expect(fileText).toContain('KEY door=WDOOR data=<1 bytes withheld>');
    expect(consoleText).toContain('doorInputHandler received: "<1 bytes withheld>"');
    for (const ch of new Set(SECRET)) {
      expect(fileText).not.toContain(`data=${JSON.stringify(ch)}`);
      expect(consoleText).not.toContain(`received: "${ch}"`);
    }
    expect(fileText).not.toContain(SECRET);
    expect(consoleText).not.toContain(SECRET);
  });

  test('SECRET off again: keys are named once more (the flag is a window, not a mute)', async () => {
    const { consoleText, fileText } = await runDoorTyping((session) => {
      setSecretInput(session, true); setSecretInput(session, false);
      return ['z'];
    });
    expect(consoleText).toContain('doorInputHandler received: "z"');
    expect(fileText).toContain('KEY door=WDOOR data="z"');
  });

  test('mouse reports are named <mouse>, never printed, in both sinks', async () => {
    const { consoleText, fileText } = await runDoorTyping(() => ['a', MOUSE_PRESS, MOUSE_HOVER]);
    expect(fileText).toContain('data="a"');                       // the sinks carried other text
    expect(consoleText).toContain('doorInputHandler received: "a"');
    expect(fileText).toContain('data="<mouse>"');
    expect(consoleText).toContain('received: "<mouse>"');
    expect(fileText).not.toContain('<0;12;5M');
    expect(fileText).not.toContain('<35;47;19M');
    expect(consoleText).not.toContain('<0;12;5M');
    expect(consoleText).not.toContain('<35;47;19M');
  });
});

describe('the router\'s per-key line (door-input-router) follows the same rule', () => {
  const routed = (secret: boolean, keys: string[]): string => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const shared = { ximProtocol: { isSecretInput: () => secret, queueInput: () => undefined } };
    for (const k of keys) routeAmigaDoorInput(shared as never, k);
    const text = log.mock.calls.map((c) => c.join(' ')).join('\n');
    log.mockRestore();
    return text;
  };

  test('a normal key and a mouse report: the key is named, the mouse is not printed', () => {
    const text = routed(false, ['k', MOUSE_HOVER]);
    expect(text).toContain('[DoorInput] "k"');
    expect(text).toContain('[DoorInput] "<mouse>"');
    expect(text).not.toContain('<35;47;19M');
  });

  test('while SECRET: only the size is logged', () => {
    const text = routed(true, [...SECRET]);
    expect(text).toContain('[DoorInput] <1 bytes withheld>');
    expect(text).not.toContain('hunter');
    expect(text).not.toContain('"h"');
  });
});
