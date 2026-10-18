/**
 * A TypeScript door kept playing behind the Ctrl+K palette.
 *
 * The bug (2026-10-18): the palette over a TS door held the door's OUTPUT
 * (session.doorHold -> holdDoorOutput), but the door's own timers ran on, so
 * a real-time game (donkey-kong, galaga, frogger, ...) kept playing and the
 * player died while choosing a command. A 68K door stands still
 * (AmigaDoorSession.pause).
 *
 * Now the board's hold fires 'door:pause' / 'door:resume' at the door, the SDK
 * (DoorInputManager.isPaused, honourDoorHold) carries it to the door, and the
 * door's tick returns early while paused.
 *
 * Driven through the real board: executeDoor -> executeTypeScriptDoor imports
 * a real SDK door with a DoorInputManager and a ticking game loop, and the
 * pause/resume is the hold that executeTypeScriptDoor registers.
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

const NOW = 1_700_000_000_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let ticks = 0;
let pausedTicks = 0;

/** An arcade door the way donkey-kong is built: DIM, a setInterval game loop guarded by isPaused(), quit on 'q'. */
function tickerDoor() {
  const door = new SdkDoor({ name: 'Ticker', version: '1' } as any);
  door.onStart(async (ctx: any) => {
    const screen = createScreen({ output: () => undefined } as any);
    const input = new DoorInputManager(ctx, screen, {});
    input.enable();
    const loop = setInterval(() => {
      if (input.isPaused()) { pausedTicks++; return; }
      ticks++;
    }, 5);
    screen.program.on('data', (data: string) => {
      if (data !== 'q') return;
      clearInterval(loop);
      input.disable();
      screen.destroy();
    });
    await new Promise<void>((resolve) => screen.once('destroy', () => resolve()));
  });
  return door;
}

let boardRoot: string;
let prevRoot: string | undefined; let prevData: string | undefined;
beforeEach(() => {
  boardRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-door-pause-'));
  fs.mkdirSync(path.join(boardRoot, 'Doors', 'Ticker'), { recursive: true });
  fs.writeFileSync(path.join(boardRoot, 'Doors', 'Ticker', 'index.ts'), '');
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

describe('a-door-under-the-palette-freezes-a-typescript-door', () => {
  it("a TS door's game loop stands still while the palette holds it and goes on after", async () => {
    const entry = path.join(boardRoot, 'Doors', 'Ticker', 'index.ts');
    const door0 = tickerDoor();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    jest.doMock(`file://${amigafs.resolvePath(entry)}?t=${NOW}`, () => ({ __esModule: true, default: door0 }), { virtual: true });

    const id = `ts-door-pause-${NOW}`;
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
    ticks = 0; pausedTicks = 0;

    const door = { id: 'ticker', name: 'Ticker', command: 'TICKER', path: 'Doors/Ticker', type: 'TS', accessLevel: 0, enabled: true } as unknown as Door;
    try {
      const doorRun = executeDoor(socket, session, door).catch(() => undefined);
      for (let i = 0; i < 200 && ticks < 3; i++) await wait(5);
      expect(ticks).toBeGreaterThanOrEqual(3);                  // the game is running
      const hold = (session as any).doorHold;
      expect(hold).toBeDefined();                               // the board's hold for this door

      hold.pause();                                             // Ctrl+K: the palette opens over the door
      const atPause = ticks;
      await wait(80);
      expect(pausedTicks).toBeGreaterThan(0);                   // sentinel: the loop ran and saw the pause
      expect(ticks).toBe(atPause);                              // and the game's time stood still

      hold.resume();                                            // the palette closes
      await wait(80);
      expect(ticks).toBeGreaterThan(atPause);                   // the game goes on from where it was

      await socket.listeners('command')[0]('q');
      await doorRun;
    } finally {
      deleteSession(id);
    }
  });
});
