/**
 * A post from the SUBS door is a board message, saved by the board.
 *
 * SUBS is a second way into the board's own message bases (the sysop,
 * 2026-10-04: "subs is just a new way of accessing the mail and making the
 * messages more exposed"). Its posts used to be written by the door itself,
 * which skipped everything saveNewMSG does around the file - the post count,
 * the callers log, the database copy, the board's UTF-8 body - and the
 * board's posting access, which a door cannot evaluate (2026-10-04 SUBS
 * proposal, conflicts 6-8). AEW_POSTMSG hands the post to the board's own save
 * (message-entry.handler.ts saveNewMessage).
 *
 * Driven through XIMProtocol.handleMessage - the entry point AmigaDoorSession
 * calls - so the route is proven along with the rules.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';
import { messageIndexManager } from '../../src/services/MessageIndexManager';
import { setMessageEntryDependencies } from '../../src/handlers/message/message-entry.handler';
import { setConferences } from '../../src/handlers/screen.handler';
import { decodeMessageBody, getMessagesDir } from '../../src/utils/message-file.util';

const { XIMProtocol } = require('../../src/amiga-emulation/XIMProtocol');
const { XIMCommand } = require('../../src/amiga-emulation/xim/types');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-post-'));
const realGet = config.get.bind(config);
jest.spyOn(config, 'get').mockImplementation(((key: string) => (key === 'dataDir' ? root : realGet(key as any))) as any);

const callersLog = jest.fn(async () => undefined);
const createMessage = jest.fn(async () => 77);

beforeAll(() => {
  process.env.BBS_DATA_DIR = root;
  messageIndexManager.setBbsRoot(root);
  messageIndexManager.initializeMessageIndex(1);
  setConferences([{ id: 1, name: 'General', description: '', created: new Date(), updated: new Date() }] as any);
  setMessageEntryDependencies({
    db: {
      createMessage,
      getConferenceById: async () => ({ name: 'General' }),
      getMessageBaseById: async () => ({ name: 'Main' }),
      getUserByUsername: async () => null,
    },
    callersLog,
  });
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** Memory the message and its embedded String live in, as a door lays it out. */
function makeEmulator() {
  const mem = new Map<number, number>();
  return {
    readMemory8: (a: number) => mem.get(a) ?? 0,
    writeMemory8: (a: number, v: number) => { mem.set(a, v & 0xff); },
    readMemory: (a: number) => mem.get(a) ?? 0,
    writeMemory: (a: number, v: number) => { mem.set(a, v & 0xff); },
    readMemory16: () => 0,
    writeMemory16: () => undefined,
    readMemory32: () => 0,
    writeMemory32: () => undefined,
    readString: (addr: number, max = 200) => {
      let out = '';
      for (let i = 0; i < max; i++) {
        const b = mem.get(addr + i) ?? 0;
        if (b === 0) break;
        out += String.fromCharCode(b);
      }
      return out;
    },
    writeString: (addr: number, text: string) => {
      for (let i = 0; i < text.length; i++) mem.set(addr + i, text.charCodeAt(i));
      mem.set(addr + text.length, 0);
    },
  } as any;
}

/** All ACS granted, except ACS_CENSORED (71) and the indices named. */
function flagsDenying(...denied: number[]): string {
  const flags = 'T'.repeat(90).split('');
  flags[71] = 'F';
  for (const i of denied) flags[i] = 'F';
  return flags.join('');
}

function door(user: Record<string, unknown>) {
  const emulator = makeEmulator();
  const execLibrary = { replyMsg: jest.fn() } as any;
  const socket = { id: 'door-post', emit: jest.fn(), on: jest.fn() } as any;
  const session: any = {
    nodeId: 1, doorCommand: 'SUBS',
    currentConf: 1, currentMsgBase: 1,
    lastMsgReadConf: 0, lastNewReadConf: 0,
    user: { id: 1, username: 'spot', secLevel: 255, securityFlags: flagsDenying(), secOverride: '', userFlags: 0, messagesPosted: 4, ...user },
  };
  const protocol = new XIMProtocol(emulator, execLibrary, socket, 1, session);
  const MSG = 0x1000;

  const write = async (text: string) => {
    await protocol.handleMessage({ command: XIMCommand.AEW_POSTMSG, data: 0, msgAddr: MSG, string: text, replyPort: 0x2000 });
  };
  const read = async (): Promise<string> => {
    emulator.writeString(MSG + 0x14, '');
    await protocol.handleMessage({ command: XIMCommand.AEW_POSTMSG, data: 1, msgAddr: MSG, string: '', replyPort: 0x2000 });
    return emulator.readString(MSG + 0x14);
  };
  const pointer = async (text: string) => {
    await protocol.handleMessage({ command: XIMCommand.AEW_SETPOINTER, data: 0, msgAddr: MSG, string: text, replyPort: 0x2000 });
  };
  return { session, write, read, pointer, execLibrary };
}

describe('AEW_POSTMSG through the door entry point', () => {
  it('saves a board message: header, UTF-8 body, post count, callers log, database copy', async () => {
    const d = door({});
    const before = messageIndexManager.readHeaderFile(1).length;

    await d.write('TO P EALL');
    expect(await d.read()).toBe('READY');
    await d.write('SUBJECT hej alla');
    // The door's bytes are Latin-1: 0xE5 is a-ring.
    await d.write('TEXT fågel\n');
    await d.write('TEXT andra raden\n');
    await d.write('SEND');

    const answer = await d.read();
    expect(answer).toMatch(/^POSTED \d+$/);
    const num = Number(answer.split(' ')[1]);

    const headers = messageIndexManager.readHeaderFile(1);
    expect(headers.length).toBe(before + 1);
    const h = headers.find((x) => x.msgNumb === num)!;
    expect(h).toMatchObject({ toName: 'EALL', fromName: 'spot', subject: 'hej alla' });
    expect(String.fromCharCode(h.status)).toBe('P');

    const raw = fs.readFileSync(path.join(getMessagesDir(1, root), String(num)));
    // The board's encoding (message-file.util.ts), not the door's bytes.
    expect(raw.includes(Buffer.from('fågel', 'utf8'))).toBe(true);
    expect(decodeMessageBody(raw)).toBe('fågel\nandra raden\n');

    expect(d.session.user.messagesPosted).toBe(5);
    expect(callersLog).toHaveBeenCalledWith(1, 'spot', 'Posted message', expect.stringContaining('"hej alla" to EALL'));
    expect(createMessage).toHaveBeenCalled();
  });

  it('refuses EALL to a caller without ACS_EALL_MESSAGES, before he types anything', async () => {
    const d = door({ securityFlags: flagsDenying(34) });
    const before = messageIndexManager.readHeaderFile(1).length;

    await d.write('TO P EALL');
    expect(await d.read()).toBe('NO You may not post to everyone in this conference.');

    // Nothing started, so nothing can be sent.
    await d.write('SUBJECT sneaky');
    await d.write('TEXT body\n');
    await d.write('SEND');
    expect(await d.read()).toBe('NO Nothing has been started.');
    expect(messageIndexManager.readHeaderFile(1).length).toBe(before);
  });

  it('stores a censored caller\'s post as censored, as saveNewMSG does', async () => {
    const d = door({ securityFlags: flagsDenying().slice(0, 71) + 'T' + flagsDenying().slice(72) });
    await d.write('TO P EALL');
    await d.write('SUBJECT censored');
    await d.write('TEXT x\n');
    await d.write('SEND');
    const num = Number((await d.read()).split(' ')[1]);
    const h = messageIndexManager.readHeaderFile(1).find((x) => x.msgNumb === num)!;
    expect(String.fromCharCode(h.status)).toBe('p');
  });

  it('refuses a caller without ACS_ENTER_MESSAGE', async () => {
    const d = door({ securityFlags: flagsDenying(5) });
    await d.write('TO P ALL');
    expect(await d.read()).toBe('NO You may not enter messages here.');
  });

  it('a message with no body is not posted', async () => {
    const d = door({});
    await d.write('TO P EALL');
    await d.write('SUBJECT empty');
    await d.write('SEND');
    expect(await d.read()).toBe('NO Nothing to post.');
  });
});

describe('AEW_SETPOINTER RECV through the door entry point', () => {
  it('marks private mail received when its addressee opens it in the door, and nothing else', async () => {
    // A private message to spot, and one to somebody else.
    const mine = messageIndexManager.getNextMessageNumber(1);
    messageIndexManager.appendMessageHeader(1, {
      status: 'R'.charCodeAt(0), msgNumb: mine, toName: 'spot', fromName: 'ann', subject: 'for you',
      msgDate: 1, recv: 0, extMsgNum: -1,
    });
    const theirs = messageIndexManager.getNextMessageNumber(1);
    messageIndexManager.appendMessageHeader(1, {
      status: 'R'.charCodeAt(0), msgNumb: theirs, toName: 'bob', fromName: 'ann', subject: 'not yours',
      msgDate: 1, recv: 0, extMsgNum: -1,
    });

    const d = door({});
    await d.pointer(`RECV ${mine}`);
    await d.pointer(`RECV ${theirs}`);

    const headers = messageIndexManager.readHeaderFile(1);
    expect(headers.find((h) => h.msgNumb === mine)!.recv).not.toBe(0);
    expect(headers.find((h) => h.msgNumb === theirs)!.recv).toBe(0);
  });
});
