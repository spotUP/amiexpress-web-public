/**
 * The reader's L command lists the caller's mail from a typed starting
 * number: listMSGs (express.e 8820-8879). The number is read with Val, and
 * the reader (12002, 12266) tests a typed line with isDigit (8806-8812); the
 * quote range (10908) tests its first character with firstCharValue
 * (8816-8819). Driven through the real R reader on an on-disk message base.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';

import { isDigit } from '../../src/handlers/message/read-msg';
import { firstCharValue } from '../../src/handlers/message/message-entry.handler';
import { handleCommand } from '../../src/handlers/command.handler';
import { handleReadMessagesFullCommand, setMessagingDependencies } from '../../src/handlers/message/messaging.handler';
import { messageIndexManager, MsgStatus } from '../../src/services/MessageIndexManager';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { setConferences } from '../../src/handlers/screen.handler';
import { translationService, TranslatorMode } from '../../src/services/TranslationService';

// A board of its own: the index, the body files the reader and the writers
// share (config dataDir), and board-root lookups all point at it.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'read-msg-'));
const savedData = process.env.BBS_DATA_DIR;
const realGet = config.get.bind(config);
jest.spyOn(config, 'get').mockImplementation(((key: string) => (key === 'dataDir' ? root : realGet(key as any))) as any);


function post(n: number, from: string, to: string, subject: string, status: number, body: string): void {
  messageIndexManager.appendMessageHeader(1, {
    status, msgNumb: n, toName: to, fromName: from, subject, msgDate: 1_700_000_000 + n, recv: 0, extMsgNum: 0,
  });
  fs.writeFileSync(path.join(root, 'Conf1', 'MsgBase', String(n)), body, 'latin1');
}

beforeAll(() => {
  process.env.BBS_DATA_DIR = root;
  // The board's access files: this board is the one the reader asks.
  fs.cpSync(path.join(savedData!, 'Access'), path.join(root, 'Access'), { recursive: true });
  messageIndexManager.setBbsRoot(root);
  messageIndexManager.initializeMessageIndex(1);
  post(1, 'Alice', 'spot', 'Hello', MsgStatus.NORMAL, 'first body\n');
  post(2, 'Bob', 'Carol', 'Secret', MsgStatus.PRIVATE, 'for carol\n');
  post(3, 'Dave', 'spot', 'Third', MsgStatus.NORMAL, 'third body\n');
  messageIndexManager.initializeMessageIndex(2);
  setConferences([
    { id: 1, name: 'General', description: '', created: new Date(), updated: new Date() },
    { id: 2, name: 'Amiga', description: '', created: new Date(), updated: new Date() },
  ] as any);
  setMessagingDependencies({ db: { updateReadPointer: async () => undefined } });
});

afterAll(() => {
  if (savedData === undefined) delete process.env.BBS_DATA_DIR;
  else process.env.BBS_DATA_DIR = savedData;
  fs.rmSync(root, { recursive: true, force: true });
});

function caller() {
  const out: string[] = [];
  const socket: any = { id: `reader-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, off() {}, removeListener() {} };
  const session: any = {
    state: 'loggedon',
    subState: LoggedOnSubState.READ_COMMAND,
    nodeId: 1,
    currentConf: 1,
    currentMsgBase: 1,
    lastMsgReadConf: 0,
    screenWidth: 80,
    user: { id: 1, username: 'spot', secLevel: 20, securityFlags: '', userFlags: 0 },
    tempData: {},
  };
  const settle = () => new Promise((r) => setTimeout(r, 40));
  const type = async (text: string) => {
    for (const ch of text) await handleCommand(socket, session, ch);
    await settle();
  };
  const take = () => { const t = out.join(''); out.length = 0; return t; };
  /** Until the output holds `text` - a save writes files and can outlast a settle. */
  const until = async (text: string) => {
    // Up to ten seconds: a loaded machine (a parallel test run) slows the save.
    for (let i = 0; i < 500 && !out.join('').includes(text); i++) await new Promise((r) => setTimeout(r, 20));
  };
  return { socket, session, type, take, settle, until };
}

describe('the reader L command (listMSGs, 8820-8879)', () => {
  async function list(startAnswer: string): Promise<string> {
    const c = caller();
    await handleReadMessagesFullCommand(c.socket, c.session, '');
    await c.settle();
    c.take();
    await c.type('l\r');
    const asked = c.take();
    expect(asked).toContain('\x1b[32mStarting message \x1b[33m[\x1b[0m1\x1b[33m]\x1b[0m: ');
    await c.type(`${startAnswer}\r`);
    return c.take();
  }

  it('lists the caller\'s mail, skips private mail to others, from the default start', async () => {
    const out = await list('');
    expect(out).toContain('\x1b[32mMsg    Type     From                           Subject              \r\n');
    expect(out).toContain('\x1b[33m------ -------  -----------------------------  ---------------------\r\n');
    expect(out).toContain(`000001 Public   ${'Alice'.padEnd(29)}  ${'Hello'.padEnd(21)}  \x1b[0m\r\n`);
    expect(out).not.toContain('Secret');
  });

  it('starts at the typed number, read with Val (decimal prefix, $hex)', async () => {
    for (const answer of ['3', '3xyz', '$3']) {
      const out = await list(answer);
      expect(out).not.toContain('Hello');
      expect(out).toContain('000003');
    }
  });

  it('stops without a list when the answer holds no number', async () => {
    const out = await list('abc');
    expect(out).not.toContain('Msg    Type');
    expect(out).not.toContain('000001');
  });
});

describe('isDigit (8806-8812) and firstCharValue (8816-8819)', () => {
  it('isDigit is true when Val reads a character, false otherwise', () => {
    expect(isDigit('12')).toBe(true);
    expect(isDigit('12abc')).toBe(true);
    expect(isDigit('$1f')).toBe(true);
    expect(isDigit('abc')).toBe(false);
    expect(isDigit('')).toBe(false);
    expect(isDigit('+')).toBe(false);
  });

  it('firstCharValue is the first character as typed (no trimming), 0 when empty', () => {
    expect(firstCharValue('')).toBe(0);
    expect(firstCharValue('A')).toBe(65);
    expect(firstCharValue('*')).toBe(42);
    expect(firstCharValue(' A')).toBe(32);
  });
});
