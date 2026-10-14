/**
 * A door ends with the caller's terminal the way it found it.
 *
 * Blessed doors switch xterm mouse reporting on (?1000h/?1003h/?1006h) and
 * only a clean destroy switches it off. Left on, a telnet caller's own
 * terminal kept sending mouse reports after the board hung up - GNOME
 * Terminal printed "35;38;29M35;38;29M..." at the shell prompt (sysop,
 * 2026-09-29). Driven through the real executeDoor with a door that turns
 * mouse reporting on and exits.
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

jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({
  AmigaDoorSession: class {
    private socket: any;
    constructor(socket: any) { this.socket = socket; }
    async start() {
      this.socket.emit('ansi-output', '\x1b[?1000h\x1b[?1003h\x1b[?1006hA DOOR WITH A MOUSE');
    }
    getExitState() { return {}; }
    isDoorRunning() { return false; }
  },
}));

import { executeDoor, initializeDoors, getDoors, setHelpers, MOUSE_REPORTING_OFF } from '../../src/handlers/door.handler';
import { config } from '../../src/config';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

setHelpers({ callersLog: async () => undefined, getRecentCallerActivity: async () => [] });

const MOUSE_CMD = {
  name: 'MOUSEDOOR', type: 'XIM', location: 'Doors/MouseDoor/MouseDoor', access: undefined,
  toolTypes: { LOCATION: 'Doors:MouseDoor/MouseDoor', TYPE: 'XIM' },
};

let root: string;
const realConfigGet = config.get.bind(config);

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mouse-door-'));
  mockRootRef.value = root;
  jest.spyOn(config, 'get').mockImplementation((key: any) => (key === 'dataDir' ? root : realConfigGet(key)));
  fs.mkdirSync(path.join(root, 'Doors', 'MouseDoor'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Doors', 'MouseDoor', 'MouseDoor'), Buffer.from([0x00, 0x00, 0x03, 0xf3]));
  const { commandCache } = require('../../src/handlers/command-execution.handler');
  commandCache.bbscmd.clear();
  commandCache.bbscmd.set(MOUSE_CMD.name, MOUSE_CMD);
  await initializeDoors();
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

it('switches mouse reporting off after the door, so a telnet terminal stops sending reports', async () => {
  const wire: string[] = [];
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 0, currentConf: 0,
    user: { id: 'u1', username: 'MOUSER', secLevel: 255 }, screenWidth: 80, screenHeight: 25,
    tempData: {}, commandText: 'MOUSEDOOR',
  };
  const socket: any = {
    id: `mouse-door-${Math.random().toString(36).slice(2)}`, session,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output' && typeof data === 'string') wire.push(data); return true; },
    on() { return this; }, off() { return this; }, removeListener() { return this; },
  };
  const door = getDoors().find((d: any) => (d.command ?? d.name ?? '').toUpperCase() === 'MOUSEDOOR');
  expect(door).toBeDefined();

  await executeDoor(socket, session, door as any);

  const all = wire.join('');
  expect(all).toContain('A DOOR WITH A MOUSE');
  expect(all.lastIndexOf(MOUSE_REPORTING_OFF)).toBeGreaterThan(all.indexOf('A DOOR WITH A MOUSE'));
});
