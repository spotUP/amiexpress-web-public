/**
 * The R command's reader is express.e's readMSG (11972-12296): it walks
 * message NUMBERS against MailStats, and every command is a lineInput line.
 *
 * The reader it replaced built a list of the messages the caller could read
 * and stepped through that list, answering single keys. Visible results the
 * sysop hit on 2026-09-30: "em" drawn on the prompt line with no line break,
 * "No new messages." in a conference holding ten, and a message-system that
 * was "far from 1:1 with the amiexpress sources".
 *
 * Driven through handleCommand, the entry point every keystroke takes, on a
 * real HeaderFile / MailStats / body-file message base on disk.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';

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
  messageIndexManager.setBbsRoot(root);
  messageIndexManager.initializeMessageIndex(1);
  post(1, 'Alice', 'ALL', 'Hello', MsgStatus.NORMAL, 'first body\n');
  post(2, 'Bob', 'Carol', 'Secret', MsgStatus.PRIVATE, 'for carol\n');
  post(3, 'Dave', 'ALL', 'Third', MsgStatus.NORMAL, 'third body\n');
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
  return { socket, session, type, take, settle };
}

describe('the R reader', () => {
  it('opens on its prompt naming the next message, and <CR> reads it', async () => {
    const c = caller();
    await handleReadMessagesFullCommand(c.socket, c.session, '');
    await c.settle();
    // readMSG's opening break (11985), then the prompt's own (12016).
    const opening = c.take();
    expect(opening.startsWith('\r\n\r\n\x1b[32mMsg. Options: \x1b[33mA\x1b[36m')).toBe(true);
    expect(opening.endsWith(',\x1b[33mF\x1b[36m,\x1b[33mR\x1b[36m,\x1b[33mL\x1b[36m,\x1b[33mQ\x1b[36m,\x1b[33m?\x1b[36m,\x1b[33m??\x1b[36m,\x1b[32m<\x1b[33mCR\x1b[32m> \x1b[32m(\x1b[0m 1+3\x1b[32m )\x1b[0m>: ')).toBe(true);

    await c.type('\r');
    const shown = c.take();
    // lineInput's break (2378), readMSG's (12068), then the message.
    expect(shown.startsWith('\r\n\r\n\x1b[32mDate   \x1b[33m: \x1b[0m')).toBe(true);
    // `\l\s[30]  ` then ` [32mRecv'd` - three spaces after the padded name (8914-8916).
    expect(shown).toContain(`\x1b[32mTo     \x1b[33m: \x1b[0m${'ALL'.padEnd(30)}   \x1b[32mRecv'd\x1b[33m: \x1b[0mN/A\r\n`);
    expect(shown).toContain('first body\r\n');
  });

  it('a command is a line: N waits for Enter, and NS reads the rest non-stop', async () => {
    const c = caller();
    await handleReadMessagesFullCommand(c.socket, c.session, '1');
    await c.settle();
    c.take();
    await c.type('n');
    expect(c.take()).toBe('n'); // no single-key dispatch: N waits for Enter
    await c.type('s\r');
    // NS reads the rest non-stop - message 2 is private and passed silently
    const rest = c.take();
    expect(rest).toContain('third body');
    expect(rest).not.toContain('for carol');
  });

  it('a typed number of someone else\'s private message says so', async () => {
    const c = caller();
    await handleReadMessagesFullCommand(c.socket, c.session, '');
    await c.settle();
    c.take();
    await c.type('2\r');
    expect(c.take()).toContain('\r\nThat message is Private.\r\n\r\n');
  });

  it('?? lists every command, one line below the prompt', async () => {
    const c = caller();
    await handleReadMessagesFullCommand(c.socket, c.session, '');
    await c.settle();
    c.take();
    await c.type('??\r');
    expect(c.take().startsWith('??\r\n\r\n\x1b[33mA\x1b[32m>\x1b[36mgain')).toBe(true);
  });

  it('D on public mail that is not yours, below level 210, is refused', async () => {
    const c = caller();
    await handleReadMessagesFullCommand(c.socket, c.session, '');
    await c.settle();
    c.session.user.securityFlags = 'T'.repeat(200); // every ACS flag, DELETE_MESSAGE included
    c.take();
    await c.type('\r');
    c.take();
    await c.type('d\r');
    expect(c.take()).toContain('\r\nMessage not deleted, not your mail.\r\n\r\n');
  });

  it('M moves the message to the chosen conference as it was, and deletes it here', async () => {
    const c = caller();
    // A sysop: every ACS flag, level 255, access to both conferences.
    c.session.user = { id: 1, username: 'sysop', secLevel: 255, securityFlags: 'T'.repeat(200), userFlags: 0, confAccess: 'XX' };
    await handleReadMessagesFullCommand(c.socket, c.session, '3');
    await c.settle();
    c.take();
    await c.type('m\r');
    expect(c.take()).toContain('\r\nConference Number to move to (L to List): ');
    await c.type('2\r');
    expect(c.take()).toContain('\r\nYou have chosen conference: Amiga\r\n\r\nMove message (y/n)? ');
    await c.type('y');
    const done = c.take();
    expect(done).toContain('Yes\r\nMessage Number 1...done!\r\n\r\n');
    expect(done).toContain('\r\nMessage 3 deleted...\r\n');

    const moved = messageIndexManager.readHeaderFile(2)[0];
    expect(moved).toMatchObject({ fromName: 'Dave', toName: 'ALL', subject: 'Third', status: MsgStatus.NORMAL });
    expect(fs.readFileSync(path.join(root, 'Conf2', 'MsgBase', '1'), 'latin1')).toBe('third body\n');
    expect(messageIndexManager.readHeaderFile(1)[2].status).toBe(MsgStatus.DELETED);
  });

  it('T! shows the body in every other language, a pause after each', async () => {
    const c = caller();
    c.session.user.securityFlags = 'T'.repeat(200);
    const spies = [
      jest.spyOn(translationService, 'initialize').mockResolvedValue(undefined),
      jest.spyOn(translationService, 'getAllLanguages').mockReturnValue(['English', 'Deutsch']),
      jest.spyOn(translationService, 'getHostLanguage').mockReturnValue('English'),
      jest.spyOn(translationService, 'translateText').mockImplementation((text: string, mode: TranslatorMode) =>
        (mode === TranslatorMode.TRANS_HOST_TO_DEFINED ? text.toUpperCase() : text)),
    ];
    try {
      await handleReadMessagesFullCommand(c.socket, c.session, '1');
      await c.settle();
      c.take();
      await c.type('t!\r');
      const shown = c.take();
      // 12116: plain text, no colour; then the body alone - no header.
      expect(shown).toContain('\r\nTranslating to Deutsch\r\n\r\nFIRST BODY\r\n');
      expect(shown).not.toContain('Date   ');
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });

  it('R replies through message entry and comes back to the reader', async () => {
    const c = caller();
    c.session.user.username = 'Carol';
    await handleReadMessagesFullCommand(c.socket, c.session, '1');
    await c.settle();
    c.take();
    await c.type('r\r');
    const asked = c.take();
    expect(asked).toContain("\x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m'\x1b[33mALL\x1b[32m'\x1b[32m?\x1b[0m Alice\r\n");
    expect(asked.endsWith('Hello')).toBe(true); // the subject, offered as the default
    await c.type('\r');   // keep the subject
    await c.type('n');     // Private (y/N)? No
    await c.type('n');     // Quote in Reply (y/N)? No
    await c.type('thanks\r\r');
    await c.type('S\r');
    const saved = c.take();
    expect(saved).toMatch(/Message Number 4\.\.\.done!/);
    const reply = messageIndexManager.readHeaderFile(1).find((x) => x.msgNumb === 4)!;
    expect(reply).toMatchObject({ toName: 'Alice', subject: 'Hello' });
    // replyToMSG returns RESULT_SUCCESS and readMSG goes on (goNextMsg).
    expect(saved).toContain('\x1b[32mMsg. Options:');
  });

  it('EH changes the header in place; a blank To keeps it and still asks Private (getAValidName 0)', async () => {
    const c = caller();
    c.session.user = { id: 1, username: 'sysop', secLevel: 255, securityFlags: 'T'.repeat(200), userFlags: 0, confAccess: 'XX' };
    await handleReadMessagesFullCommand(c.socket, c.session, '1');
    await c.settle();
    c.take();
    await c.type('eh\r');
    expect(c.take()).toContain("     \x1b[36mFrom\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m'\x1b[33mAlice\x1b[32m'\x1b[32m?\x1b[0m ");
    await c.type('\r');           // From: keep Alice
    await c.type('\r');           // To: keep ALL - blank is the default, flag 0 (11562-11566)
    await c.type('New subject\r');
    expect(c.take()).toContain('         \x1b[36mPrivate \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)\x1b[32m?\x1b[0m ');
    await c.type('n');
    const h = messageIndexManager.readHeaderFile(1).find((x) => x.msgNumb === 1)!;
    expect(h).toMatchObject({ fromName: 'Alice', toName: 'ALL', subject: 'New subject', status: MsgStatus.NORMAL });
  });

  it('U on a sender who has no account says so', async () => {
    const c = caller();
    c.session.user = { id: 1, username: 'sysop', secLevel: 255, securityFlags: 'T'.repeat(200), userFlags: 0, confAccess: 'XX' };
    await handleReadMessagesFullCommand(c.socket, c.session, '1');
    await c.settle();
    c.take();
    await c.type('u\r');
    expect(c.take()).toContain('User no longer exists.\r\n');
  });

  it('F forwards a copy to ALL, asking Private, and saves it as a new message', async () => {
    const c = caller();
    await handleReadMessagesFullCommand(c.socket, c.session, '1');
    await c.settle();
    c.take();
    await c.type('f\r');
    await c.type('all\r');        // getAValidName: ALL, flag 1
    await c.type('\r');           // keep the subject
    await c.type('n');            // Private (y/N)? No
    const done = c.take();
    expect(done).toMatch(/\r\nSaving\.\.\.Message Number \d+\.\.\.done!\r\n\r\n/);
    const copy = messageIndexManager.readHeaderFile(1).slice(-1)[0];
    expect(copy).toMatchObject({ toName: 'ALL', status: MsgStatus.NORMAL });
  });

  it('a key while the reader is between prompts is dropped, not a crash', async () => {
    const c = caller();
    await handleReadMessagesFullCommand(c.socket, c.session, '');
    await c.settle();
    const waiting = c.session.inputWaiter;
    c.session.inputWaiter = undefined; // as while a message is still being drawn
    await expect(handleCommand(c.socket, c.session, '\r')).resolves.toBeUndefined();
    c.session.inputWaiter = waiting;
  });

  it('<CR> past the last message leaves quietly; a number past it names the last', async () => {
    const c = caller();
    const high = messageIndexManager.readMailStats(1)!.highMsgNum - 1;
    await handleReadMessagesFullCommand(c.socket, c.session, String(high));
    await c.settle();
    c.take();
    await c.type('\r'); // noDirF=1: noMorePlus says nothing (12082, 12298-12305)
    expect(c.take()).not.toContain('The last message in this conference is');

    const d = caller();
    await handleReadMessagesFullCommand(d.socket, d.session, '');
    await d.settle();
    d.take();
    await d.type(`${high + 5}\r`); // passItIN: noDirF=0
    expect(d.take()).toContain(`\r\nThe last message in this conference is ${high}\r\n`);
  });

  it('an unknown command is a blank line and the prompt again, no "No such command!!"', async () => {
    const c = caller();
    await handleReadMessagesFullCommand(c.socket, c.session, '');
    await c.settle();
    c.take();
    await c.type('zz\r');
    const shown = c.take();
    expect(shown).not.toContain('No such command');
    expect(shown).toMatch(/^zz\r\n\r\n\r\n\r\n\x1b\[32mMsg\. Options:/);
  });

  it('R NS reads every message without a prompt, then leaves', async () => {
    const c = caller();
    await handleReadMessagesFullCommand(c.socket, c.session, 'NS');
    await c.settle();
    const shown = c.take();
    expect(shown).toContain('first body');
    expect(shown).not.toContain('Msg. Options');
  });
});
