/**
 * Regression: task 18 (interactive sysop page-wait), round 2 (post-review).
 *
 * FAME/FIM doors (5D_Page) request a sysop page mid-door via
 * CF_InternalCmd "C", which sets session.sysopPagePending (chat.handler.ts's
 * notifySysopPage) WITHOUT running any pager UI — the door still owns the
 * screen.
 *
 * executeAmigaDoor's post-exit path must:
 *   1. Consume (clear) sysopPagePending IMMEDIATELY after the door exits,
 *      BEFORE the CHAIN/RETURNCOMMAND/exitState-merge block that can throw
 *      — otherwise an exception there hits the outer catch with the flag
 *      still set, and the STALE flag fires the page-wait on the NEXT,
 *      unrelated door's exit (round-2 review finding #2).
 *   2. Only actually START the wait (runSysopPageWait) AFTER that same
 *      CHAIN/RETURNCOMMAND block, and only using the ALREADY-consumed chat
 *      session — never re-reading session.sysopPagePending at that point.
 *   3. Never call startSysopPage / consumePendingSysopPage a second time
 *      from the trigger site (no recursive PowerPager launch; no double
 *      consumption).
 *   4. Finish the wait before the menu is repainted.
 *   5. The outer catch block must ALSO clear sysopPagePending /
 *      sysopPageChatSessionId as a belt-and-braces measure, for the case
 *      where a crash happens BEFORE the door's exit is processed (so step 1
 *      never executed).
 *
 * Driven through the REAL executeDoor -> executeAmigaDoor with the 68K
 * runtime replaced by a door that pages the sysop and then exits asking for a
 * CHAIN (the technique of tests/transport/browser-door-gate). The page-wait
 * pair, the command dispatcher and the menu are replaced by recorders, so the
 * ORDER in which executeAmigaDoor reaches them is what is asserted.
 */
process.env.SKIP_DB_INIT = '1';

import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../src/index', () => {
  const states = require('../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, LOCALHOST_IPS: [] };
});
jest.mock('../src/services/DoorDropFileManager');
jest.mock('../src/services/CallersLogManager');

/** Everything the door exit touched, in the order it touched it. */
const mockOrder: string[] = [];
/** How the fake door behaves on this run. */
const mockDoor = { crash: false };

jest.mock('../src/amiga-emulation/AmigaDoorSession', () => ({
  AmigaDoorSession: class {
    private session: any;
    constructor(_socket: unknown, config: { bbsSession: any }) { this.session = config.bbsSession; }
    async start(): Promise<void> {
      // What notifySysopPage leaves behind when a FIM door pages mid-door.
      this.session.sysopPagePending = true;
      this.session.sysopPageChatSessionId = 'chat-1';
      if (mockDoor.crash) throw new Error('door crashed');
      mockOrder.push('door-exit');
    }
    getExitState() {
      mockOrder.push('exit-state');
      return { ximState: { chainCommand: 'NEXTDOOR' } };
    }
    isDoorRunning() { return false; }
  },
}));

const mockChat = { id: 'chat-1' };
jest.mock('../src/handlers/chat/chat.handler', () => ({
  ...jest.requireActual('../src/handlers/chat/chat.handler'),
  consumePendingSysopPage: jest.fn((session: any) => {
    mockOrder.push('consume');
    session.sysopPagePending = false;
    return mockChat;
  }),
  runSysopPageWait: jest.fn((_socket: unknown, _session: unknown, _chat: unknown, done: () => void) => {
    mockOrder.push('wait-start');
    // The dots animation takes real time; the menu must wait for it.
    setTimeout(() => { mockOrder.push('wait-done'); done(); }, 5);
  }),
  startSysopPage: jest.fn(),
}));

jest.mock('../src/handlers/command.handler', () => ({
  processCommand: jest.fn(async () => { mockOrder.push('chain'); }),
  runSysCommand: jest.fn(),
  processBBSCommand: jest.fn(),
}));

jest.mock('../src/handlers/command-handler/menu', () => ({
  ...jest.requireActual('../src/handlers/command-handler/menu'),
  displayMainMenu: jest.fn(async () => { mockOrder.push('menu'); }),
}));

const mockRoot = { value: '' };
jest.mock('../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({
    bbsRoot: mockRoot.value,
    scanInstalledDoors: async () => [],
    getCachedDoors: () => [],
    isCachePopulated: () => true,
  }),
}));

import { executeDoor, setHelpers, type Door } from '../src/handlers/door.handler';
import { consumePendingSysopPage, runSysopPageWait, startSysopPage } from '../src/handlers/chat/chat.handler';
import { BBSState, LoggedOnSubState } from '../src/constants/bbs-states';
import { config } from '../src/config';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

describe('executeAmigaDoor sysop page-wait sequencing (task 18, round 2)', () => {
  let root: string;
  const realGet = config.get.bind(config);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'page-wait-seq-'));
    mockRoot.value = root;
    jest.spyOn(config, 'get').mockImplementation(((key: string) =>
      key === 'dataDir' ? root : (realGet as (k: string) => unknown)(key)) as never);
    fs.mkdirSync(path.join(root, 'Doors', '5D_Page'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', '5D_Page', '5D_Page'), Buffer.from([0x00, 0x00, 0x03, 0xf3]));
    mockOrder.length = 0;
    mockDoor.crash = false;
    (consumePendingSysopPage as jest.Mock).mockClear();
    (runSysopPageWait as jest.Mock).mockClear();
    (startSysopPage as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function runPagingDoor(): Promise<any> {
    const session: any = {
      state: BBSState.LOGGEDON,
      subState: LoggedOnSubState.PROCESS_COMMAND,
      nodeId: 1,
      currentConf: 1,
      screenWidth: 80,
      tempData: {},
      user: { id: 1, username: 'CALLER', secLevel: 100, slotNumber: 1, confAccess: 'X'.repeat(25) },
    };
    const door = {
      id: '5d_page', name: '5D_Page', description: '', command: 'O',
      path: 'Doors/5D_Page/5D_Page', accessLevel: 0, enabled: true, type: 'FIM',
    } as unknown as Door;
    const socket: any = { id: `page-wait-${Math.random()}`, emit: () => true, on: () => undefined };
    await executeDoor(socket, session, door);
    return session;
  }

  const before = (a: string, b: string) => {
    expect(mockOrder).toContain(a);
    expect(mockOrder).toContain(b);
    expect(mockOrder.indexOf(a)).toBeLessThan(mockOrder.indexOf(b));
  };

  test('the flag is consumed as soon as the door exits, before the CHAIN/RETURNCOMMAND region', async () => {
    const session = await runPagingDoor();

    before('door-exit', 'consume');
    before('consume', 'exit-state');
    before('consume', 'chain');
    expect(session.sysopPagePending).toBe(false);
  });

  test('the page-wait starts only after the CHAIN block, with the chat session already consumed', async () => {
    await runPagingDoor();

    before('chain', 'wait-start');
    expect(runSysopPageWait).toHaveBeenCalledTimes(1);
    expect((runSysopPageWait as jest.Mock).mock.calls[0][2]).toBe(mockChat);
  });

  test('the trigger does not re-consume the flag or launch PowerPager', async () => {
    await runPagingDoor();

    expect(consumePendingSysopPage).toHaveBeenCalledTimes(1);
    expect(startSysopPage).not.toHaveBeenCalled();
  });

  test('the page-wait finishes before the menu is repainted', async () => {
    await runPagingDoor();

    before('wait-done', 'menu');
  });

  test('a door that crashes before its exit is processed leaves no page pending', async () => {
    mockDoor.crash = true;
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const session = await runPagingDoor();
    err.mockRestore();

    // The consume-first block never ran; the outer catch is what cleared it.
    expect(consumePendingSysopPage).not.toHaveBeenCalled();
    expect(session.sysopPagePending).toBe(false);
    expect(session.sysopPageChatSessionId).toBeUndefined();
    expect(runSysopPageWait).not.toHaveBeenCalled();
  });
});
