/**
 * A pick from the command palette opened over a running door runs.
 *
 * The bug (sysop, 2026-10-18): Ctrl+K in the J door opened the palette, but a
 * door picked there never started. A pick closed the palette the way Esc does:
 * the J door came back and the pick was dropped.
 *
 * Now a pick ends the door through its own end path (a 68K door loses its
 * carrier), and the door's exit tail runs the pick as it runs a menu door's.
 *
 * Driven through the real entry points: the web 'command' handler takes the
 * keys, the real executeDoor -> executeAmigaDoor runs the door. Only the
 * emulator (a stub that runs until its carrier drops), the palette's own door
 * (a stand-in that picks on Enter) and the command it picks are replaced.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';

process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, LOCALHOST_IPS: [] };
});
jest.mock('../../src/amiga-emulation/loader/LibraryLoader', () => ({ LibraryLoader: jest.fn() }));
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({ AmigaDoorSession: jest.fn() }));
jest.mock('../../src/services/DoorDropFileManager');
jest.mock('../../src/services/CallersLogManager');
let boardRoot = '';
jest.mock('../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({ bbsRoot: boardRoot, scanInstalledDoors: async () => [] }),
}));
jest.mock('../../src/handlers/command-execution.handler', () => ({
  ...jest.requireActual('../../src/handlers/command-execution.handler'),
  runBbsCommand: jest.fn(),
}));
jest.mock('../../src/handlers/command.handler', () => ({
  ...jest.requireActual('../../src/handlers/command.handler'),
  processCommand: jest.fn(),
}));

import { AmigaDoorSession } from '../../src/amiga-emulation/AmigaDoorSession';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { executeDoor, setHelpers, type Door } from '../../src/handlers/door.handler';
import { commandCache, runBbsCommand } from '../../src/handlers/command-execution.handler';
import { processCommand } from '../../src/handlers/command.handler';
import { armMenuRun, takeMenuExit } from '../../src/handlers/commands/menu-door-exit';
import { notePaletteExit, isPaletteOpen } from '../../src/services/palette-over-door';
import { registerCommandHandler } from '../../src/server/socket-handlers';
import { setSession, deleteSession } from '../../src/server/session-manager';
import { config } from '../../src/config';
import type { BBSSession } from '../../src/index';

setHelpers({ callersLog: async () => undefined, getRecentCallerActivity: async () => [] });

const settle = () => new Promise((resolve) => setImmediate(resolve));

let prevRoot: string | undefined; let prevData: string | undefined;
beforeEach(() => {
  boardRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'palette-pick-'));
  fs.mkdirSync(path.join(boardRoot, 'Doors', 'JoinCnf'), { recursive: true });
  fs.writeFileSync(path.join(boardRoot, 'Doors', 'JoinCnf', 'JoinCnf'), Buffer.from([0, 0, 3, 0xf3]));
  prevRoot = process.env.BBS_ROOT; prevData = process.env.BBS_DATA_DIR;
  process.env.BBS_ROOT = boardRoot; process.env.BBS_DATA_DIR = boardRoot;
  const realGet = config.get.bind(config);
  jest.spyOn(config, 'get').mockImplementation(((key: string) =>
    key === 'dataDir' ? boardRoot : (realGet as (k: string) => unknown)(key)) as never);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  commandCache.bbscmd.delete('PALETTE');
  if (prevRoot === undefined) delete process.env.BBS_ROOT; else process.env.BBS_ROOT = prevRoot;
  if (prevData === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = prevData;
  fs.rmSync(boardRoot, { recursive: true, force: true });
});

describe('Ctrl+K over the 68K J door, then a pick', () => {
  it('ends the J door through its carrier drop, then runs the picked command at the board', async () => {
    const order: string[] = [];
    let carrierGone: () => void = () => undefined;
    (AmigaDoorSession as unknown as jest.Mock).mockImplementation(() => ({
      sharedState: {},
      on: () => undefined,
      pause: jest.fn(),
      resume: jest.fn(),
      // The door runs until it loses its carrier, as a door waiting for a key does.
      start: () => new Promise<void>((resolve) => { carrierGone = resolve; }),
      dropCarrier: () => { order.push('door ended by carrier drop'); carrierGone(); },
      getExitState: () => ({ ximState: {} }),
    }));
    (processCommand as jest.Mock).mockImplementation(async (_s: unknown, _sess: unknown, cmd: string) => {
      order.push(`ran ${cmd}`);
    });

    // The stand-in palette door: Enter picks "WHO" the way the real one does
    // (armMenuRun on its own session), then its exit tail hands the pick over.
    (runBbsCommand as jest.Mock).mockImplementation((_sock: unknown, sess: any, cmd: string) => new Promise((resolve) => {
      expect(cmd).toBe('PALETTE');
      sess.inDoorManager = true;
      sess.doorInputHandler = (d: string) => {
        if (d !== '\r') return;
        armMenuRun(sess, { text: 'WHO', runAs: 'typed' });
        notePaletteExit(sess, takeMenuExit(sess));
        resolve(0);
      };
    }));
    commandCache.bbscmd.set('PALETTE', { name: 'PALETTE' } as any);

    const id = `palette-pick-${Date.now()}`;
    const socket: any = Object.assign(new EventEmitter(), {
      id, handshake: { address: '127.0.0.1' }, connected: true,
      emit: jest.fn(() => true), join: () => undefined, leave: () => undefined, disconnect: () => undefined, onAny: () => undefined,
    });
    const session = {
      state: BBSState.LOGGEDON, subState: LoggedOnSubState.PROCESS_COMMAND, connectionType: 'web',
      user: { id: 7, username: 'CALLER', secLevel: 255 }, nodeId: 1, currentConf: 1, timeRemaining: 3600,
      petsciiMode: false, screenWidth: 80, screenHeight: 24, tempData: {},
    } as unknown as BBSSession;
    setSession(id, session);
    registerCommandHandler(socket);
    const type = (data: string) => socket.listeners('command')[0](data);

    const door = { id: 'joincnf', name: 'JoinCnf', command: 'J', path: 'Doors/JoinCnf/JoinCnf', type: 'XIM', accessLevel: 0, enabled: true } as unknown as Door;
    try {
      const doorRun = executeDoor(socket, session, door).catch(() => undefined);
      for (let i = 0; i < 50 && !(session as any).doorHold; i++) await settle();
      expect((session as any).doorHold).toBeDefined();          // the J door is running

      await type('\x0b');
      await settle();
      expect(isPaletteOpen(session)).toBe(true);
      await type('\r');                                          // the pick

      const ended = await Promise.race([
        doorRun.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
      ]);
      expect(ended).toBe(true);                                  // the J door ended (it did not come back)
      expect(order).toEqual(['door ended by carrier drop', 'ran WHO']);
      expect((session as any).doorHold).toBeUndefined();
    } finally {
      carrierGone();
      deleteSession(id);
    }
  });
});
