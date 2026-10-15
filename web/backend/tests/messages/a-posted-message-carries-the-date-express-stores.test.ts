/**
 * A message posted on the board carries the date express.e stores, and R
 * shows the time it was posted.
 *
 * express.e:10648 `mh.msgDate:=getSystemTime()` - the board's local wall
 * clock in seconds from 1970, plus 21600 (MiscFuncs.e:463-469) - and readMSG
 * shows it through formatLongDateTime (8895), which takes the 21600 back off.
 * The port stored plain Unix seconds: live Conf1 message 267, posted at 13:52
 * in Stockholm, read as 05:52 in AmiExpress.
 *
 * Driven through handleCommand (E's body and Msg. Options S) and the R
 * reader, on a real HeaderFile on disk. The bytes at offset 100 are checked
 * against the E formula worked by hand.
 */
process.env.TZ = 'Europe/Stockholm';
process.env.SKIP_DB_INIT = '1';

// Counted, not replaced: the real conversion runs.
jest.mock('../../src/utils/date-time.util', () => {
  const actual = jest.requireActual('../../src/utils/date-time.util');
  return { ...actual, toAmigaTime: jest.fn(actual.toAmigaTime) };
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';
import { handleCommand } from '../../src/handlers/command.handler';
import { BBSState, LoggedOnSubState } from '../../src/index';
import { flushOutput } from '../../src/utils/output.util';
import { handleReadMessagesFullCommand, setMessagingDependencies } from '../../src/handlers/message/messaging.handler';
import { messageIndexManager } from '../../src/services/MessageIndexManager';
import { setConferences } from '../../src/handlers/screen.handler';
import { setMessageEntryDependencies } from '../../src/handlers/message/message-entry.handler';
import * as dates from '../../src/utils/date-time.util';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'msg-date-'));
const savedData = process.env.BBS_DATA_DIR;
const realGet = config.get.bind(config);
jest.spyOn(config, 'get').mockImplementation(((key: string) => (key === 'dataDir' ? root : realGet(key as any))) as any);

/** 2026-09-30 13:52:16 in Stockholm (CEST), the moment live message 267 was posted. */
const POSTED = new Date('2026-09-30T11:52:16Z');

/**
 * getSystemTime() for that moment, by hand: 2026-09-30 is DateStamp day 17804
 * (days from 1978-01-01), 13:52 is minute 832, 16 seconds is tick 800.
 *   (17804+2922)*1440*60 + 832*60 + 800/50 + 21600
 */
const EXPRESS_MSGDATE = (17804 + 2922) * 1440 * 60 + 832 * 60 + 800 / 50 + 21600;

beforeAll(() => {
  process.env.BBS_DATA_DIR = root;
  messageIndexManager.setBbsRoot(root);
  messageIndexManager.initializeMessageIndex(1);
  setConferences([{ id: 1, name: 'General', description: '', created: new Date(), updated: new Date() }] as any);
  setMessagingDependencies({ db: { updateReadPointer: async () => undefined } });
  // The SQL mirror the save writes after the disk; nothing here reads it.
  setMessageEntryDependencies({
    db: {
      createMessage: async () => 1,
      getConferenceById: async () => ({ name: 'General' }),
      getMessageBaseById: async () => ({ name: 'Main' }),
      getUserByUsername: async () => null,
    },
    callersLog: async () => undefined,
  });
  // Only the clock is fixed; timers stay real so the board's awaits run.
  jest.useFakeTimers({ now: POSTED, doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'clearImmediate', 'nextTick', 'queueMicrotask'] });
});

afterAll(() => {
  jest.useRealTimers();
  if (savedData === undefined) delete process.env.BBS_DATA_DIR;
  else process.env.BBS_DATA_DIR = savedData;
  fs.rmSync(root, { recursive: true, force: true });
});

function caller() {
  const out: string[] = [];
  const socket: any = {
    id: `msgdate-${Math.random()}`,
    emit: (event: string, text: unknown) => { if (event === 'ansi-output') out.push(String(text)); return true; },
    on() {}, off() {}, removeListener() {},
  };
  const session: any = {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.POST_MESSAGE_BODY,
    terminalType: 'ansi',
    connectionType: 'web',
    screenWidth: 80,
    screenHeight: 25,
    nodeId: 1,
    currentConf: 1,
    currentMsgBase: 1,
    lastMsgReadConf: 0,
    inputBuffer: '',
    user: { id: 1, username: 'spot', secLevel: 255, securityFlags: 'T'.repeat(90), secOverride: '', userFlags: 0 },
    tempData: {
      messageEntry: { body: ['hello from the board'], currentLine: 2, toUser: 'ALL', subject: 'new', isPrivate: false },
    },
  };
  const screen = () => { flushOutput(socket); return out.join(''); };
  const type = async (text: string) => {
    for (const ch of Array.from(text)) {
      await handleCommand(socket, session, ch);
      await new Promise((r) => setTimeout(r, 5));
    }
  };
  return { socket, session, screen, type, clear: () => { out.length = 0; } };
}

describe('a posted message carries the date express.e stores', () => {
  it('E writes getSystemTime() into the HeaderFile, and R shows the time it was posted', async () => {
    const toAmigaTime = dates.toAmigaTime as jest.Mock;
    toAmigaTime.mockClear();
    const c = caller();

    // An empty line ends the body; S at Msg. Options saves (express.e 10558).
    await c.type('\r');
    await c.type('S\r');
    const headerFile = path.join(root, 'Conf1', 'MsgBase', 'HeaderFile');
    for (let i = 0; i < 100 && !c.screen().includes('Message Number 1...done!'); i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => setTimeout(r, 200)); // the save's tail (SQL mirror, callers log)

    // Sentinel: the save went through the one conversion the board has.
    expect(toAmigaTime).toHaveBeenCalled();

    const record = fs.readFileSync(headerFile);
    expect(record.length).toBe(110);
    expect(record.readInt32BE(2)).toBe(1);                     // msgNumb
    expect(record.readUInt32BE(100)).toBe(EXPRESS_MSGDATE);    // msgDate, express.e's value
    expect(record.readUInt32BE(100)).toBe(0x6abd6870);
    expect(record.readUInt32BE(104)).toBe(0);                  // recv: unread

    // R shows the time it was posted, on the board's clock.
    c.clear();
    c.session.subState = LoggedOnSubState.READ_COMMAND;
    await handleReadMessagesFullCommand(c.socket, c.session, '1');
    await new Promise((r) => setTimeout(r, 40));
    const shown = c.screen();
    expect(shown).toContain('\x1b[32mDate   \x1b[33m: \x1b[0mWed 30-Sep-2026 13:52:16');
    expect(shown).toContain('hello from the board');
  });
});
