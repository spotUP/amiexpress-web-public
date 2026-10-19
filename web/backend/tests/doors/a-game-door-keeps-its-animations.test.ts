/**
 * The game exemption of the animations-off gate follows the door that runs NOW.
 *
 * executeDoor records whether the running door is a game (its package.json
 * category) on session.runningDoorIsGame, and its finally hands the outer
 * door's answer back - so a game that runs a utility door gets its
 * exemption back when the utility returns, and the menu after the game has
 * none. Driven through the real executeDoor with an outer game door whose
 * run launches an inner non-game door.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));
jest.mock('../../src/services/DoorDropFileManager');
jest.mock('../../src/services/CallersLogManager');

const mockRootRef = { value: '' };
jest.mock('../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({
    bbsRoot: mockRootRef.value,
    scanInstalledDoors: async () => [],
    getCachedDoors: () => [],
    isCachePopulated: () => true,
  }),
}));

type Seen = { door: string; game: boolean | undefined };
const seen: Seen[] = [];
const runInner: { value: null | (() => Promise<void>) } = { value: null };
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({
  AmigaDoorSession: class {
    private socket: { session: { runningDoorIsGame?: boolean; commandText?: string } };
    constructor(socket: { session: { runningDoorIsGame?: boolean } }) { this.socket = socket as never; }
    async start() {
      const session = this.socket.session;
      seen.push({ door: 'start', game: session.runningDoorIsGame });
      const inner = runInner.value;
      if (inner) {
        runInner.value = null;
        await inner();
        seen.push({ door: 'outer-after-inner', game: session.runningDoorIsGame });
      }
    }
    getExitState() { return {}; }
    isDoorRunning() { return false; }
  },
}));

import { executeDoor, initializeDoors, getDoors, setHelpers } from '../../src/handlers/door.handler';
import { config } from '../../src/config';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { clearDoorCategoryCache } from '../../src/doors/door-category';

setHelpers({ callersLog: async () => undefined, getRecentCallerActivity: async () => [] });

const COMMANDS = ['GAMEDOOR', 'TOOLDOOR'].map((name) => ({
  name, type: 'XIM', location: `Doors/${name}/${name}`, access: undefined,
  toolTypes: { LOCATION: `Doors:${name}/${name}`, TYPE: 'XIM' },
}));

let root: string;
const realConfigGet = config.get.bind(config);

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'game-door-'));
  mockRootRef.value = root;
  clearDoorCategoryCache();
  jest.spyOn(config, 'get').mockImplementation((key: any) => (key === 'dataDir' ? root : realConfigGet(key)));
  const { commandCache } = require('../../src/handlers/command-execution.handler');
  commandCache.bbscmd.clear();
  for (const cmd of COMMANDS) {
    fs.mkdirSync(path.join(root, 'Doors', cmd.name), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', cmd.name, cmd.name), Buffer.from([0x00, 0x00, 0x03, 0xf3]));
    commandCache.bbscmd.set(cmd.name, cmd);
  }
  fs.writeFileSync(path.join(root, 'Doors', 'GAMEDOOR', 'package.json'), JSON.stringify({ category: 'games' }));
  await initializeDoors();
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
  seen.length = 0;
});

function doorNamed(name: string) {
  const door = getDoors().find((d: any) => (d.command ?? d.name ?? '').toUpperCase() === name);
  expect(door).toBeDefined();
  // An absolute path, so the category lookup does not depend on the process cwd.
  return { ...(door as any), path: path.join(root, 'Doors', name, name) };
}

it('marks a game door as a game while it runs and restores the outer answer after a nested door', async () => {
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 0, currentConf: 0,
    user: { id: 'u1', username: 'PLAYER', secLevel: 255, noAnimations: true }, screenWidth: 80, screenHeight: 25,
    tempData: {}, commandText: 'GAMEDOOR',
  };
  const socket: any = {
    id: `game-door-${Math.random().toString(36).slice(2)}`, session,
    emit: () => true, on() { return this; }, off() { return this; }, removeListener() { return this; },
  };
  runInner.value = async () => { await executeDoor(socket, session, doorNamed('TOOLDOOR')); };

  await executeDoor(socket, session, doorNamed('GAMEDOOR'));

  expect(seen).toEqual([
    { door: 'start', game: true },               // the game
    { door: 'start', game: false },              // the utility it ran
    { door: 'outer-after-inner', game: true },   // the game, back from the utility
  ]);
  expect(session.runningDoorIsGame).toBeUndefined();   // the menu after the game
});
