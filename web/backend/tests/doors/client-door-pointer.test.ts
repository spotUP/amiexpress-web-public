/**
 * Pointer capture is a door's own declaration, not a side effect of game mode.
 *
 * executeClientDoor emits `game-mode: true` for EVERY client door, because
 * game mode means "send raw key-down/key-up". Yesterday's terminal change
 * hung the cursor hiding, the xterm pointer-events cut and the text-selection
 * block off that same flag - so LiveChat, a client door whose whole UI is
 * mouse-driven, lost its cursor and its clicks (reported live 2026-08-25).
 *
 * Doors now say whether they own the pointer, and the backend passes it on.
 */

process.env.SKIP_DB_INIT = '1';

import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readFileSync } from 'fs';
import { join } from 'path';

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

const repoRoot = join(__dirname, '..', '..', '..', '..');

function manifest(door: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, 'Doors', door, 'package.json'), 'utf8'));
}

describe('client door pointer capture', () => {
  it('is claimed by the real-time games', () => {
    expect(manifest('grandmaster').capturePointer).toBe(true);
    expect(manifest('arkanoid').capturePointer).toBe(true);
  });

  it('is NOT claimed by mouse-driven TUI doors', () => {
    // LiveChat has menus, context menus and video tiles - all clicked.
    expect(manifest('livechat').capturePointer).toBeUndefined();
  });

});

/**
 * What the BACKEND tells the browser, driven through the real executeDoor for
 * a browser caller (the technique of tests/transport/browser-door-gate): a
 * client door is installed on a temp board and the `door:load-client` the
 * socket received is read back.
 */
describe('the backend passes the claim on', () => {
  let root: string;
  const realGet = config.get.bind(config);
  const savedEnv = { dataDir: process.env.BBS_DATA_DIR, root: process.env.BBS_ROOT };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'client-door-pointer-'));
    // The manifest is read from BBS_ROOT, the door from dataDir.
    process.env.BBS_DATA_DIR = root;
    process.env.BBS_ROOT = root;
    jest.spyOn(config, 'get').mockImplementation(((key: string) =>
      key === 'dataDir' ? root : (realGet as (k: string) => unknown)(key)) as never);
    jest.spyOn(getClientDoorBridge(), 'startSession').mockImplementation(() => 'pointer-session');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const [key, value] of [['BBS_DATA_DIR', savedEnv.dataDir], ['BBS_ROOT', savedEnv.root]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  function install(name: string, manifest: Record<string, unknown>, type = 'typescript'): Door {
    const dir = path.join(root, 'Doors', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...manifest }));
    return {
      id: name, name, description: '', command: name.toUpperCase(),
      path: `Doors/${name}`, accessLevel: 0, enabled: true, type,
    } as unknown as Door;
  }

  async function run(door: Door) {
    const emitted: Array<{ event: string; data: any }> = [];
    const socket = {
      id: `pointer-${Math.random()}`,
      connected: true,
      emit: (event: string, data?: unknown) => { emitted.push({ event, data }); return true; },
      on: () => socket, once: () => socket, off: () => socket, removeListener: () => socket,
    };
    const session: any = {
      state: BBSState.LOGGEDON, subState: LoggedOnSubState.PROCESS_COMMAND,
      user: { id: 7, username: 'CALLER', secLevel: 100 }, nodeId: 7, currentConf: 1,
      connectionType: 'web', terminalType: 'ansi', screenWidth: 80, screenHeight: 24, tempData: {},
    };
    await executeDoor(socket as never, session, door);
    flushAllBuffers();
    return emitted;
  }

  const capturePointerSent = (emitted: Array<{ event: string; data: any }>) => {
    const load = emitted.find((e) => e.event === 'door:load-client');
    expect(load).toBeDefined();
    return load!.data.manifest.capturePointer;
  };

  it('reaches the client in the door:load-client manifest', async () => {
    const emitted = await run(install('game', { runtime: 'client', capturePointer: true }));

    expect(capturePointerSent(emitted)).toBe(true);
  });

  it('defaults to false rather than undefined, so the client can trust it', async () => {
    expect(capturePointerSent(await run(install('tui', { runtime: 'client' })))).toBe(false);
    // Only a real `true` claims it - not a truthy string.
    expect(capturePointerSent(await run(install('odd', { runtime: 'client', capturePointer: 'yes' })))).toBe(false);
  });

  it('does NOT blanket-clear the screen when a door exits', async () => {
    // Tried on 2026-08-26 to contain a stray TetriNET block appearing over
    // LiveChat, and it broke the BBS outright: the welcome and login screen
    // is itself drawn by a door (telnet-front), so clearing on every door
    // exit wiped it the instant it was drawn - "there is just a blinking
    // cursor". Containment that breaks the front door is not containment.
    //
    // Any door that runs and exits goes through the shared exit path; an MCI
    // door with nothing to show is the one that needs no runtime at all.
    const emitted = await run(install('mci', {}, 'MCI'));
    const wire = emitted.filter((e) => e.event === 'ansi-output').map((e) => String(e.data)).join('');

    // The door ran (runDoor's tail, express.e:4530, is on the wire), and
    // nothing wiped it after.
    expect(wire).toContain('\x1b[0m');
    expect(wire).not.toContain('\x1b[r\x1b[2J\x1b[H');
  });

  // express.e:4293-4296 and 4529-4530: an MCI door shows its MCI_TEXT (or,
  // with none, ~SS_ of its own file) and ends with ESC[0m - no invented
  // "MCI door has no text to display." and no "Press any key to continue...".
  // express.e:4257-4262: a typed command runs with privcmd TRUE (28250),
  // so a door whose file is missing returns without a word.
  it('an ARexx door whose script is missing says nothing invented', async () => {
    const gone = { id: 'gone', name: 'gone', description: '', command: 'GONE', path: path.join(root, 'Doors', 'gone', 'GONE.REXX'), accessLevel: 0, enabled: true, type: 'AREXX' } as unknown as Door;
    const wire = (await run(gone)).filter((e) => e.event === 'ansi-output').map((e) => String(e.data)).join('');
    expect(wire).not.toMatch(/not found|contact the sysop|Press any key/i);
  });

  it('an MCI door ends as express.e runDoor does', async () => {
    const withText = { ...install('mcihi', {}, 'MCI'), mciText: 'hello' } as Door;
    const wire = (await run(withText)).filter((e) => e.event === 'ansi-output').map((e) => String(e.data)).join('');
    expect(wire).toContain('hello');
    expect(wire).not.toContain('Press any key');

    const without = (await run(install('mcinone', {}, 'MCI'))).filter((e) => e.event === 'ansi-output').map((e) => String(e.data)).join('');
    expect(without).not.toContain('MCI door has no text');
    expect(without).not.toContain('Press any key');
  });
});

/*
 * The TERMINAL half, still read as source: BBSTerminal.tsx is a React
 * component with the pointer logic inline in its socket handlers, and
 * packages/terminal has no test runner, so nothing in this suite can execute
 * it. Converting these needs the logic extracted into a function first.
 */
describe('the pointer follows the RUNNING door, not the last one', () => {
  const terminal = readFileSync(
    join(repoRoot, 'packages', 'terminal', 'src', 'components', 'BBSTerminal.tsx'),
    'utf8'
  );

  /** The body of the game-mode socket handler. */
  function gameModeHandler(): string {
    const start = terminal.indexOf("socket.on('game-mode'");
    expect(start).toBeGreaterThan(0);
    return terminal.slice(start, terminal.indexOf("socket.on('door:load-client'", start));
  }

  it('does not hide the pointer when game mode turns on', () => {
    // game-mode arrives BEFORE door:load-client and carries no manifest, so
    // applying a remembered capture here handed the previous door's claim to
    // the next one. That is how LiveChat kept losing its cursor after a game
    // had run - reported three times, and twice "fixed" by closing other
    // ways the flag was left set rather than the line that used it.
    const body = gameModeHandler();

    expect(body).not.toMatch(/applyPointerCapture\(\s*enabled\s*&&/);
    expect(body).toMatch(/capturePointer\.current\s*=\s*false/);
  });

  it('locks the pointer only for a door that asked for it', () => {
    // The missing mouse pointer in LiveChat was POINTER LOCK, not the CSS
    // cursor: clicking the terminal locked the pointer whenever game mode
    // was on - which is every client door - and the browser then announced
    // "press Esc to show your cursor". Three fixes aimed at `cursor: none`
    // changed nothing because they were aimed at the wrong mechanism.
    // The condition guarding the lock request, wherever it sits.
    expect(terminal).toMatch(/if \(capturePointer\.current && !document\.pointerLockElement/);
    expect(terminal).not.toMatch(/if \(gameMode\.current && !document\.pointerLockElement/);
  });

  it('gives the pointer back when a door unloads', () => {
    // Read the whole handler, not a fixed number of characters from its
    // start: this asserted over the first 1200 and started failing when a
    // comment was added at the top, while the release itself never moved.
    const start = terminal.indexOf("socket.on('door:unload-client'");
    expect(start).toBeGreaterThan(0);
    const next = terminal.indexOf("socket.on('", start + 1);
    const body = terminal.slice(start, next > 0 ? next : undefined);

    expect(body).toMatch(/applyPointerCapture\(false\)/);
    expect(body).toMatch(/capturePointer\.current\s*=\s*false/);
  });
});
