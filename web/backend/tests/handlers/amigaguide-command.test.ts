/**
 * AG - the command that opens the guide reader nobody could reach.
 *
 * `src/amigaguide/AmigaGuideParser.ts` and `AmigaGuideViewer.ts` are a
 * complete AmigaGuide reader that no command opened, while fourteen `.guide`
 * files ship under `Doors/` on this board. These drive the dispatcher the
 * board runs - `processBBSCommand` in command.handler.ts - so what is proved
 * is that a caller typing AG gets the reader, not that a class exists.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));
jest.mock('../../src/services/DoorDropFileManager');
jest.mock('../../src/services/CallersLogManager');
jest.mock('../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({
    bbsRoot: '',
    scanInstalledDoors: async () => [],
    getCachedDoors: () => [],
    isCachePopulated: () => true,
  }),
}));

import 'reflect-metadata';
import { processBBSCommand } from '../../src/handlers/command.handler';
import { handleAmigaGuideInput, findGuides, pickGuide } from '../../src/handlers/commands/amigaguide-commands.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { config, type BBSConfig } from '../../src/config';
import { flushOutput } from '../../src/utils/output.util';

/** A small but real AmigaGuide document. */
const GUIDE = [
  '@database "TestDoor.guide"',
  '@node MAIN "TestDoor"',
  'A door that does something.',
  '',
  'See @{"Options" link OPTIONS} for the tooltypes.',
  '@endnode',
  '@node OPTIONS "Options"',
  'STACK - how much stack the door wants.',
  '@endnode',
  '',
].join('\n');

let root = '';
const realGet = config.get.bind(config);

function makeSocket() {
  const wire: string[] = [];
  return {
    wire,
    // A UNIQUE ID PER SOCKET. The output buffer is keyed by socket id, so two
    // sockets sharing one id share a buffer - and the second test's flush
    // found the first test's, already drained.
    id: `ag-test-${Math.random().toString(36).slice(2)}`,
    emit(event: string, payload?: unknown) {
      if (event === 'ansi-output' && typeof payload === 'string') wire.push(payload);
      return true;
    },
    text() { return this.wire.join(''); },
    on() { return this; },
  };
}

const session = () => ({
  state: 'loggedon',
  subState: LoggedOnSubState.PROCESS_COMMAND,
  currentConf: 1,
  screenWidth: 80,
  screenHeight: 24,
  user: { id: 1, username: 'SYSOP', secLevel: 255, securityFlags: 'T'.repeat(90) },
  currentUser: { username: 'SYSOP', secLevel: 255 },
  tempData: {},
}) as never;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-'));
  fs.mkdirSync(path.join(root, 'Doors', 'TestDoor'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Doors', 'TestDoor', 'TestDoor.guide'), GUIDE, 'latin1');
  // Case matters on Linux and did not on the Amiga: this board ships both
  // `MultiTop.guide` and `Conftop.Guide`.
  fs.mkdirSync(path.join(root, 'Doors', 'OtherDoor'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Doors', 'OtherDoor', 'Other.Guide'), GUIDE, 'latin1');
});

afterAll(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* noop */ }
});

beforeEach(() => {
  jest.spyOn(config, 'get').mockImplementation((key: keyof BBSConfig) =>
    key === 'dataDir' ? root : realGet(key));
});

afterEach(() => jest.restoreAllMocks());

describe('finding what there is', () => {
  it('finds guides whatever case the extension is written in', () => {
    const guides = findGuides(root);

    expect(guides.map((guide) => guide.name)).toEqual(['Other', 'TestDoor']);
    expect(guides[1].door).toBe('TestDoor');
  });

  it('takes a number or a name, and is happy with a prefix', () => {
    const guides = findGuides(root);

    expect(pickGuide(guides, '2')?.name).toBe('TestDoor');
    expect(pickGuide(guides, 'testdoor')?.name).toBe('TestDoor');
    expect(pickGuide(guides, 'test')?.name).toBe('TestDoor');
    expect(pickGuide(guides, '')).toBeNull();
    expect(pickGuide(guides, 'nothing-like-this')).toBeNull();
  });
});

describe('AG at the menu', () => {
  it('lists the guides when it is given nothing', async () => {
    const socket = makeSocket();
    const sess = session();

    await processBBSCommand(socket as never, sess, 'AG', '');
    // emitText buffers; the menu flushes at the prompt, and so must a test.
    flushOutput(socket as never);

    expect(socket.text()).toContain('TestDoor');
    expect(socket.text()).toContain('AG <number> or AG <name>');
  });

  it('opens one and hands the keyboard to the viewer', async () => {
    const socket = makeSocket();
    const sess: any = session();

    await processBBSCommand(socket as never, sess, 'AG', 'TestDoor');

    expect(socket.text()).toContain('TestDoor');
    expect(socket.text()).toContain('A door that does something');
    expect(sess.subState).toBe(LoggedOnSubState.AG_VIEW);
    expect(sess.amigaGuideViewer).toBeDefined();
  });

  it('gives the keyboard back when the caller quits', async () => {
    const socket = makeSocket();
    const sess: any = session();
    await processBBSCommand(socket as never, sess, 'AG', 'TestDoor');

    await handleAmigaGuideInput(socket as never, sess, 'Q');

    expect(sess.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(sess.amigaGuideViewer).toBeUndefined();
  });

  it('refuses a screen too narrow to hold a guide rather than folding one', async () => {
    const socket = makeSocket();
    const sess: any = session();
    sess.screenWidth = 40;

    await processBBSCommand(socket as never, sess, 'AG', 'TestDoor');
    flushOutput(socket as never);

    expect(socket.text()).toContain('THIS COMMAND NEEDS AN 80 COLUMN SCREEN');
    expect(sess.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});
