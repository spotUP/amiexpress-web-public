/**
 * Ctrl+C ends a blessed TypeScript door that has no onInput handler.
 *
 * scrollwars, ansi-editor and the other blessed doors route keys through
 * their screen and hold execute() open on the screen's 'destroy'. They never
 * ran the SDK input loop, so the board's 'door:close' (Ctrl+C, a Ctrl+K
 * palette pick) reached nobody: the key was dropped and the door came back.
 * A door that hands DoorInputManager its own quit (onClose) now announces
 * 'door:honours-close', the board offers it the close, and 'door:close' runs
 * that quit - so the door's own cleanup runs, as when it quits itself.
 *
 * A door that does not (scrollwars, voice-chat: no onInput, no quit handed
 * to the SDK) must keep Ctrl+C as a key: the board may only take the key
 * from a door that will honour the close.
 *
 * Driven through the real board: executeDoor -> executeTypeScriptDoor imports
 * the door (a real SDK Door on the real key bridge), and Ctrl+C is typed on the socket's 'command' channel.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState };
});
jest.mock('../../src/amiga-emulation/loader/LibraryLoader', () => ({ LibraryLoader: jest.fn() }));
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({ AmigaDoorSession: jest.fn() }));
jest.mock('../../src/services/DoorDropFileManager');
jest.mock('../../src/services/CallersLogManager');
jest.mock('../../src/handlers/command.handler', () => ({
  processCommand: jest.fn(async () => undefined),
  handleCommand: jest.fn(async () => undefined),
}));

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { executeDoor, setHelpers, type Door } from '../../src/handlers/door.handler';
import { registerCommandHandler } from '../../src/server/socket-handlers';
import { setSession, deleteSession } from '../../src/server/session-manager';
import { config } from '../../src/config';
import type { BBSSession } from '../../src/index';
import * as amigafs from '../../src/utils/amigafs';
import { Door as SdkDoor } from '../../../../sdk/src/core/Door';
import { createScreen } from '../../../../sdk/utils/blessed-helpers';
import { DoorInputManager } from '../../../../sdk/utils/door-input-manager';

setHelpers({ callersLog: async () => undefined, getRecentCallerActivity: async () => [] });

const settle = () => new Promise((resolve) => setImmediate(resolve));
const NOW = 1_700_000_000_000;

type Probe = { started: jest.Mock; screenDestroyed: jest.Mock; closed: jest.Mock; ownQuit: jest.Mock; keys: jest.Mock };
const newProbe = (): Probe => ({ started: jest.fn(), screenDestroyed: jest.fn(), closed: jest.fn(), ownQuit: jest.fn(), keys: jest.fn() });

/**
 * A blessed door the way ansi-editor is built: no onInput, execute() held on
 * the screen, and a quit of its own that stops its timers before it destroys
 * the screen. handsQuitToSdk: whether it gives that quit to DoorInputManager.
 */
function blessedDoor(probe: Probe, handsQuitToSdk: boolean) {
  const door = new SdkDoor({ name: 'Blessed', version: '1' } as any);
  door.onStart(async (ctx: any) => {
    const screen = createScreen({ output: () => undefined } as any);
    const timer = setInterval(() => undefined, 1000);
    let input: DoorInputManager;
    let quitting = false;
    const quit = () => {
      if (quitting) return;       // idempotent, as ansi-editor's cleanup() is (hasExited)
      quitting = true;
      probe.ownQuit();            // the door's own cleanup, as its quit key runs it
      clearInterval(timer);
      input.disable();
      screen.destroy();
    };
    input = new DoorInputManager(ctx, screen, handsQuitToSdk ? { onClose: quit } : {});
    input.enable();
    screen.program.on('data', (data: string) => {
      probe.keys(data);
      if (data === 'q') quit();
    });
    probe.started();
    await new Promise<void>((resolve) => screen.once('destroy', () => resolve()));
    probe.screenDestroyed();
  });
  door.onClose(async () => { probe.closed(); });
  return door;
}

let boardRoot: string;
let prevRoot: string | undefined; let prevData: string | undefined;
beforeEach(() => {
  boardRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blessed-ctrl-c-'));
  fs.mkdirSync(path.join(boardRoot, 'Doors', 'Blessed'), { recursive: true });
  fs.writeFileSync(path.join(boardRoot, 'Doors', 'Blessed', 'index.ts'), '');
  prevRoot = process.env.BBS_ROOT; prevData = process.env.BBS_DATA_DIR;
  process.env.BBS_ROOT = boardRoot; process.env.BBS_DATA_DIR = boardRoot;
  const realGet = config.get.bind(config);
  jest.spyOn(config, 'get').mockImplementation(((key: string) =>
    key === 'dataDir' ? boardRoot : (realGet as (k: string) => unknown)(key)) as never);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  if (prevRoot === undefined) delete process.env.BBS_ROOT; else process.env.BBS_ROOT = prevRoot;
  if (prevData === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = prevData;
  fs.rmSync(boardRoot, { recursive: true, force: true });
});

/** Runs the door through the real board, types Ctrl+C, then (if still running) 'q'. */
async function runAndCtrlC(probe: Probe, handsQuitToSdk: boolean): Promise<{ endedOnCtrlC: boolean }> {
    const entry = path.join(boardRoot, 'Doors', 'Blessed', 'index.ts');
    const door0 = blessedDoor(probe, handsQuitToSdk);
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    jest.doMock(`file://${amigafs.resolvePath(entry)}?t=${NOW}`, () => ({ __esModule: true, default: door0 }), { virtual: true });

    const id = `blessed-ctrl-c-${Date.now()}`;
    const socket: any = Object.assign(new EventEmitter(), {
      id, handshake: { address: '127.0.0.1' }, connected: true,
      emit: jest.fn(() => true), join: () => undefined, leave: () => undefined, disconnect: () => undefined, onAny: () => undefined,
    });
    const session = {
      state: BBSState.LOGGEDON, subState: LoggedOnSubState.PROCESS_COMMAND, connectionType: 'web',
      user: { id: '7', username: 'CALLER', secLevel: 255 }, nodeId: 1, currentConf: 1, timeRemaining: 3600,
      petsciiMode: false, screenWidth: 80, screenHeight: 24, tempData: {},
    } as unknown as BBSSession;
    setSession(id, session);
    registerCommandHandler(socket);

    const door = { id: 'blessed', name: 'Blessed', command: 'BLESSED', path: 'Doors/Blessed', type: 'TS', accessLevel: 0, enabled: true } as unknown as Door;
    try {
      const doorRun = executeDoor(socket, session, door).catch(() => undefined);
      for (let i = 0; i < 200 && !probe.started.mock.calls.length; i++) await settle();
      expect(probe.started).toHaveBeenCalledTimes(1);          // the door is running, keys bridged
      expect((session as any).doorInputHandler).toBeDefined();

      await socket.listeners('command')[0]('\x03');

      const ended = (ms: number) => Promise.race([
        doorRun.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
      ]);
      const endedOnCtrlC = await ended(handsQuitToSdk ? 3000 : 300);
      if (!endedOnCtrlC) {
        await socket.listeners('command')[0]('q');            // leave by the door's own key
        expect(await ended(3000)).toBe(true);
      }
      return { endedOnCtrlC };
    } finally {
      deleteSession(id);
    }
}

describe('ctrl-c-ends-a-blessed-door-without-oninput', () => {
  it('Ctrl+C ends a blessed door that gave the SDK its quit, through that quit, and its onClose runs', async () => {
    const probe = newProbe();
    const { endedOnCtrlC } = await runAndCtrlC(probe, true);
    expect(endedOnCtrlC).toBe(true);                         // execute() returned: the door did not come back
    expect(probe.ownQuit).toHaveBeenCalledTimes(1);          // the door's own cleanup ran (timers, state)
    expect(probe.keys).not.toHaveBeenCalledWith('\x03');    // the board took the key
    expect(probe.screenDestroyed).toHaveBeenCalledTimes(1);
    expect(probe.closed).toHaveBeenCalledTimes(1);           // onClose ran
  });

  it('a door that cannot honour the close keeps Ctrl+C as a key', async () => {
    const probe = newProbe();
    const { endedOnCtrlC } = await runAndCtrlC(probe, false);
    expect(endedOnCtrlC).toBe(false);                        // not ended by the board
    expect(probe.keys).toHaveBeenCalledWith('\x03');        // the key reached the door
    expect(probe.ownQuit).toHaveBeenCalledTimes(1);          // it left by its own 'q'
    expect(probe.closed).toHaveBeenCalledTimes(1);
  });
});
