/**
 * A hybrid door's client half ends with its server half (sysop, 2026-10-18
 * live: "when exiting ctrl+k from galaga, input was not reaching the door
 * menu").
 *
 * Galaga is a hybrid door: a server half that executeTypeScriptDoor runs, and
 * a client half the ClientDoorBridge tracks. When the server half returned
 * (here, a palette pick closed it) nothing ended the bridge session; the
 * client's DISCONNECT ended it later, after MENU had started, and the bridge's
 * cleanup deleted MENU's inDoorManager and doorInputHandler. The menu drew
 * and took no keys.
 *
 * Driven through the real executeDoor for a web caller (the technique of
 * client-door-pointer.test.ts and browser-door-gate.test.ts), with the real
 * bridge and a socket that keeps its listeners, so the late DISCONNECT goes
 * through the bridge's own door:client:message handler.
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
jest.mock('../../src/amiga-emulation/loader/LibraryLoader', () => ({ LibraryLoader: jest.fn() }));
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({ AmigaDoorSession: jest.fn() }));
jest.mock('../../src/services/DoorDropFileManager');
jest.mock('../../src/services/CallersLogManager');
jest.mock('../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({ scanInstalledDoors: async () => [] }),
}));

import { executeDoor, setHelpers, type Door } from '../../src/handlers/door.handler';
import { getClientDoorBridge } from '../../src/doors/client-door-bridge';
import { flushAllBuffers } from '../../src/utils/ansi-buffer.util';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { config } from '../../src/config';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

type Listener = (...args: any[]) => void;

let root: string;
const realGet = config.get.bind(config);
const savedEnv = { dataDir: process.env.BBS_DATA_DIR, root: process.env.BBS_ROOT, nodeEnv: process.env.NODE_ENV };

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'hybrid-client-half-'));
  process.env.BBS_DATA_DIR = root;
  process.env.BBS_ROOT = root;
  // No cache-buster in production, so the import names a URL a virtual module answers.
  process.env.NODE_ENV = 'production';
  jest.spyOn(config, 'get').mockImplementation(((key: string) =>
    key === 'dataDir' ? root : (realGet as (k: string) => unknown)(key)) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const [key, value] of [['BBS_DATA_DIR', savedEnv.dataDir], ['BBS_ROOT', savedEnv.root], ['NODE_ENV', savedEnv.nodeEnv]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(root, { recursive: true, force: true });
});

/** A hybrid door whose server half is an SDK door that returns at once. */
function installHybrid(name: string, ran: jest.Mock): Door {
  const dir = path.join(root, 'Doors', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name, version: '1.0.0', runtime: 'hybrid',
    server: { entry: './server.js' }, client: { entry: './client.js' },
  }));
  const file = path.join(dir, 'server.js');
  fs.writeFileSync(file, 'module.exports = {};\n');
  // The import hands these exports back as the module's default.
  const exportsOf = { execute: async () => { ran(); }, getConfig: () => ({ name }) };
  for (const p of new Set([file, fs.realpathSync(file)])) jest.doMock(`file://${p}`, () => exportsOf, { virtual: true });
  return {
    id: name, name, description: '', command: name.toUpperCase(),
    path: `Doors/${name}`, accessLevel: 0, enabled: true, type: 'typescript',
  } as unknown as Door;
}

/** A web caller whose socket keeps its listeners, as socket.io does. */
function webCaller() {
  const listeners = new Map<string, Set<Listener>>();
  const emitted: Array<{ event: string; data: any }> = [];
  const socket: any = {
    id: `hybrid-${Math.random()}`,
    connected: true,
    emit: (event: string, data?: unknown) => { emitted.push({ event, data }); return true; },
    on: (event: string, cb: Listener) => { (listeners.get(event) ?? listeners.set(event, new Set()).get(event)!).add(cb); return socket; },
    once: (event: string, cb: Listener) => socket.on(event, cb),
    off: (event: string, cb: Listener) => { listeners.get(event)?.delete(cb); return socket; },
    removeListener: (event: string, cb: Listener) => socket.off(event, cb),
    removeAllListeners: (event: string) => { listeners.delete(event); return socket; },
  };
  const fromClient = (event: string, data: unknown) => { for (const cb of [...(listeners.get(event) ?? [])]) cb(data); };
  const session: any = {
    state: BBSState.LOGGEDON, subState: LoggedOnSubState.PROCESS_COMMAND,
    user: { id: 7, username: 'CALLER', secLevel: 100 }, nodeId: 7, currentConf: 1,
    connectionType: 'web', terminalType: 'ansi', screenWidth: 80, screenHeight: 24, tempData: {},
  };
  return { socket, session, emitted, fromClient };
}

test("the client's late DISCONNECT does not take the next door's input", async () => {
  const ran = jest.fn();
  const door = installHybrid('galaga', ran);
  const { socket, session, emitted, fromClient } = webCaller();

  await executeDoor(socket, session, door);
  flushAllBuffers();
  expect(ran).toHaveBeenCalledTimes(1);
  const load = emitted.find((e) => e.event === 'door:load-client');
  expect(load).toBeDefined();
  const sessionId = load!.data.sessionId;
  expect(typeof sessionId).toBe('string');

  // The next door (MENU) has started and owns the caller's keys.
  const nextDoorInput = jest.fn();
  session.inDoorManager = true;
  session.doorInputHandler = nextDoorInput;

  // Then the browser's client half says it has gone.
  fromClient('door:client:message', { sessionId, message: { type: 'disconnect' } });

  expect(session.inDoorManager).toBe(true);
  expect(session.doorInputHandler).toBe(nextDoorInput);
  // The bridge holds nothing for the door that ended.
  expect((getClientDoorBridge() as any).sessions.has(sessionId)).toBe(false);
}, 30000);
