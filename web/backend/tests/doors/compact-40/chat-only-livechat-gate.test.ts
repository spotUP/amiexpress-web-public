/**
 * The chat-only LiveChat auto-launch goes through the MIN_COLUMNS gate
 * against the REGISTERED door.
 *
 * index.ts opens LiveChat for a ?chatOnly=true socket without the login
 * sequence, from two branches (SSO and anonymous). Both used to hand
 * executeDoor a hand-built Door literal: the gate inside executeDoor ran, but
 * on a door with no registration, so Commands/BBSCmd/LIVECHAT.info's
 * MIN_COLUMNS / C64_ADAPT never reached it - a PETSCII chat caller stayed
 * refused after the sysop marked the door, and the Enter path could open a
 * door the auto-launch refused. The launch body now lives in
 * server/chat-only-launch.ts so this test can drive it.
 *
 * Not a source pin: the real LIVECHAT.info bytes are parsed by the parser
 * registration uses, registered through the real initializeDoors(), and the
 * launch runs the real executeDoor. createAllDropFiles is the "launch
 * proceeded" sentinel, as in door-min-columns-gate.test.ts; the TypeScript
 * door runtime is not mocked - BBS_DATA_DIR points at an empty root, so
 * executeTypeScriptDoor takes its deterministic "Door not found" exit, which
 * is what makes an ANSI launch's bytes comparable run against run.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));
jest.mock('../../../src/services/DoorDropFileManager');
jest.mock('../../../src/services/CallersLogManager');

import { executeDoor, getDoors, initializeDoors, setDoors, setHelpers } from '../../../src/handlers/door.handler';
import type { Door } from '../../../src/handlers/door.handler';
import { chatOnlyLiveChatDoor, launchChatOnlyLiveChat, LIVECHAT_COMMAND } from '../../../src/server/chat-only-launch';
import { doorDropFileManager } from '../../../src/services/DoorDropFileManager';
import { DOOR_NEEDS_80_NOTICE } from '../../../src/utils/door-min-columns.util';
import { applyTooltypes } from '../../../src/utils/info-file.util';
import { loadCommandFromInfo } from '../../../src/utils/amiga-command-parser.util';
import { config } from '../../../src/config';
import { LoggedOnSubState } from '../../../src/constants/bbs-states';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

const BBSCMD = path.resolve(__dirname, '../../../../../Commands/BBSCmd');
const LIVECHAT_INFO = path.join(BBSCMD, 'LIVECHAT.info');

/** What index.ts launched before the extraction, field for field. */
const LEGACY_LITERAL = {
  id: 'livechat',
  name: 'LiveChat',
  command: 'livechat',
  type: 'typescript',
  path: 'Doors/livechat',
} as Door;

let root: string;
const realConfigGet = config.get.bind(config);
const savedDataDir = process.env.BBS_DATA_DIR;
const savedBbsRoot = process.env.BBS_ROOT;

// ONE root for the file: getAmigaDoorManager() captures dataDir when first
// constructed (see door-min-columns-gate.test.ts).
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-only-gate-'));
  // loadDoorManifestForExecution reads Doors/livechat/package.json under
  // BBS_ROOT and executeTypeScriptDoor resolves the door under BBS_DATA_DIR;
  // an empty root for both means the real (hybrid) door is never started and
  // the launch's bytes are the same on every run.
  process.env.BBS_DATA_DIR = root;
  process.env.BBS_ROOT = root;
});

afterAll(() => {
  if (savedDataDir === undefined) delete process.env.BBS_DATA_DIR;
  else process.env.BBS_DATA_DIR = savedDataDir;
  if (savedBbsRoot === undefined) delete process.env.BBS_ROOT;
  else process.env.BBS_ROOT = savedBbsRoot;
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  jest.spyOn(config, 'get').mockImplementation((key: any) =>
    key === 'dataDir' ? root : realConfigGet(key)
  );
  (doorDropFileManager.createAllDropFiles as jest.Mock).mockClear();
  setDoors([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

let socketCounter = 0;
function makeSocket() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    id: `chat-only-socket-${++socketCounter}`,
    emitted,
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
  };
}

const output = (socket: ReturnType<typeof makeSocket>) =>
  socket.emitted.filter((e) => e.event === 'ansi-output').map((e) => String(e.data)).join('');

/** The session index.ts's anonymous chat-only branch builds, as a C64 caller. */
function petsciiChatOnlySession(): any {
  return {
    state: 'loggedon', subState: LoggedOnSubState.DOOR_RUNNING,
    user: { id: 'u1', username: 'C64USER', secLevel: 255 },
    nodeId: 1, terminalType: 'c64', petsciiMode: true,
    screenWidth: 40, screenHeight: 25, menuPause: false,
    tempData: { loginPhase: 'username', chatOnly: true },
    connectionType: 'web',
  };
}

function ansiChatOnlySession(): any {
  return {
    ...petsciiChatOnlySession(),
    user: { id: 'u2', username: 'ANSIUSER', secLevel: 255 },
    terminalType: 'modern', petsciiMode: false, screenWidth: 80, screenHeight: 24,
  };
}

/**
 * Register LIVECHAT from its real .info bytes through the real chain
 * (loadCommandFromInfo -> commandCache.bbscmd -> initializeDoors -> getDoors),
 * optionally with MIN_COLUMNS written onto a COPY of the file by the one
 * sanctioned .info writer - the repo's file is never touched.
 */
async function registerLiveChat(opts: { minColumns?: string } = {}) {
  const cmdDir = path.join(root, 'Commands', 'BBSCmd');
  fs.mkdirSync(cmdDir, { recursive: true });
  const copy = path.join(cmdDir, 'LIVECHAT.info');
  fs.copyFileSync(LIVECHAT_INFO, copy);
  if (opts.minColumns !== undefined) applyTooltypes(copy, [['MIN_COLUMNS', opts.minColumns]]);
  const def = loadCommandFromInfo(copy);
  if (!def) throw new Error('LIVECHAT.info did not parse');
  const { commandCache } = require('../../../src/handlers/command-execution.handler');
  commandCache.bbscmd.clear();
  commandCache.bbscmd.set(def.name, def);
  await initializeDoors();
  return getDoors().find((d) => d.command === LIVECHAT_COMMAND)!;
}

describe('the chat-only LiveChat launch and the MIN_COLUMNS gate', () => {
  it('the board registers LiveChat from Commands/BBSCmd/LIVECHAT.info, unmarked today', async () => {
    const registered = await registerLiveChat();
    expect(registered).toBeDefined();
    // TYPE=TS in the .info; initializeDoors registers it as 'typescript'.
    expect(registered.type).toBe('typescript');
    // The repo's registration carries neither mark: a C64 chat caller is
    // refused by the closed default, on Enter and on the auto-launch alike.
    expect(registered.minColumns).toBeUndefined();
    expect(registered.c64Adapt).toBeUndefined();
  });

  it('launches the same five-field door index.ts always launched when LiveChat is not registered', () => {
    expect(chatOnlyLiveChatDoor([])).toEqual(LEGACY_LITERAL);
  });

  it('a C64 chat-only caller is refused with the gate notice and no door starts (unregistered board)', async () => {
    const socket = makeSocket();
    const session = petsciiChatOnlySession();

    await launchChatOnlyLiveChat(socket as any, session);

    expect(output(socket)).toContain(DOOR_NEEDS_80_NOTICE);
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
    expect(session.currentDoorName).toBeUndefined();
  });

  it('a C64 chat-only caller gets exactly the refusal the Enter path gives for the registered door', async () => {
    const registered = await registerLiveChat();

    const viaEnter = makeSocket();
    await executeDoor(viaEnter as any, petsciiChatOnlySession(), registered);
    const viaAutoLaunch = makeSocket();
    await launchChatOnlyLiveChat(viaAutoLaunch as any, petsciiChatOnlySession());

    expect(output(viaEnter)).toContain(DOOR_NEEDS_80_NOTICE);
    expect(output(viaAutoLaunch)).toBe(output(viaEnter));
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
  });

  it('a LiveChat registration marked MIN_COLUMNS=40 opens for a C64 chat-only caller (the gate reads the registration)', async () => {
    const registered = await registerLiveChat({ minColumns: '40' });
    expect(registered.minColumns).toBe(40);
    const socket = makeSocket();

    await launchChatOnlyLiveChat(socket as any, petsciiChatOnlySession());

    // The launch went past the gate: drop files were written, no notice.
    expect(output(socket)).not.toContain(DOOR_NEEDS_80_NOTICE);
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
  });

  it('folds only the two resolved gate fields onto the launch door, never the registration itself', async () => {
    await registerLiveChat({ minColumns: '40' });
    const door = chatOnlyLiveChatDoor(getDoors());
    // PRELOADER=YES lives on the registration; it must not start painting a
    // preloader at chat callers because of a gate fix.
    expect(door).toEqual({ ...LEGACY_LITERAL, minColumns: 40 });
    expect(door.toolTypes).toBeUndefined();
  });

  it.each([
    ['unregistered', undefined],
    ['registered, unmarked', {}],
    ['registered, MIN_COLUMNS=40', { minColumns: '40' }],
  ])('an ANSI chat-only caller launches byte-identically to the legacy literal (%s)', async (_label, reg) => {
    if (reg !== undefined) await registerLiveChat(reg);

    const legacy = makeSocket();
    await executeDoor(legacy as any, ansiChatOnlySession(), { ...LEGACY_LITERAL });
    const legacyLaunches = (doorDropFileManager.createAllDropFiles as jest.Mock).mock.calls.length;
    const current = makeSocket();
    await launchChatOnlyLiveChat(current as any, ansiChatOnlySession());

    expect(legacyLaunches).toBe(1);
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(2);
    expect(output(current)).not.toContain(DOOR_NEEDS_80_NOTICE);
    // Same events, same bytes, same order.
    expect(current.emitted).toEqual(legacy.emitted);
  });
});
