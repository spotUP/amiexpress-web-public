// @ts-nocheck
/**
 * Message entry's names, as express.e resolves them (msg-names.ts):
 * enterMSG's To: (10785-10845), commentToSYSOP's sysop (8765-8785),
 * chooseAName (11526), findUserFromName (11474), checkToForward (9909),
 * captureRealAndInternetNames (28151), and the Quote in Reply load (10886).
 *
 * The accounts are the board's own files - user.data / user.keys / user.misc
 * in a board directory made for this file - because that is where express.e
 * looks a name up.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'msg-names-'));
process.env.BBS_DATA_DIR = root;
process.env.BBS_ROOT = root;

// The conference's tooltypes (REALNAME, FORWARDMAIL, EXTSEND) per test.
let mockFlags: any = {};
jest.mock('../../../src/utils/conference-tooltypes.util', () => {
  const actual = jest.requireActual('../../../src/utils/conference-tooltypes.util');
  return { ...actual, getConferenceToolFlags: (id: number) => ({ ...actual.getConferenceToolFlags(id), ...mockFlags }) };
});
// Where a refused name sends the caller: back to the menu.
jest.mock('../../../src/handlers/command.handler', () => ({ advanceDisplayFlow: jest.fn(async () => undefined) }));
// The message being replied to, as its file on disk holds it.
jest.mock('../../../src/utils/message-file.util', () => ({
  ...jest.requireActual('../../../src/utils/message-file.util'),
  readMessageFile: jest.fn(),
}));

// The test setup has already loaded the board's modules against the worker's
// board; start them again on this one.
jest.resetModules();
const { UserDatabaseManager } = require('../../../src/services/UserDatabaseManager');
const { getACSConfig, ToggleFlags } = require('../../../src/utils/acs.util');
const { feedInputWaiter } = require('../../../src/utils/await-input');
const { LoggedOnSubState } = require('../../../src/constants/bbs-states');
const entry = require('../../../src/handlers/message/message-entry.handler');
const names = require('../../../src/handlers/message/msg-names');
const { readMessageFile } = require('../../../src/utils/message-file.util');

function addUser(slot: number, username: string, o: { real?: string; inet?: string; access?: string; deact?: boolean } = {}) {
  const udm = new UserDatabaseManager();
  udm.initializeUserDatabase();
  const u = udm.userToStruct({ username });
  u.slotNumber = slot;
  u.conferenceAccess = Buffer.from((o.access ?? 'XXXXXXXXXX').padEnd(10, '\0'), 'latin1');
  const k = udm.userToKeys({ username }, o.deact ? 0 : slot);
  const m = udm.userToMisc({ realname: o.real ?? '' });
  m.internetName = o.inet ?? '';
  udm.appendUser(u, k, m);
}

beforeAll(() => {
  addUser(1, 'Spot', { real: 'Johan Sysop', inet: 'spotnet' });
  addUser(2, 'Alice', { real: 'Alice Real', inet: 'alicenet' });
  addUser(3, 'Alina', { real: 'Alina Real' });
  addUser(4, 'Carol', { access: '_XXXXXXXXX' });
  addUser(5, 'Ghost', { deact: true });
});

beforeEach(() => {
  mockFlags = {};
  getACSConfig().toggles[ToggleFlags.USEWILDCARDS] = false;
});

// Every ACS flag granted but the one a test takes away.
const ALL_FLAGS = 'T'.repeat(100);

function harness(user: any = {}) {
  const out: string[] = [];
  const socket: any = { id: `names-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {} };
  const session: any = {
    state: 'loggedon',
    subState: LoggedOnSubState.POST_MESSAGE_TO,
    nodeId: 1,
    user: { id: 9, username: 'Poster', secLevel: 20, confAccess: 'X', securityFlags: ALL_FLAGS, ansi: true, ...user },
    currentConf: 1,
    currentMsgBase: 1,
    tempData: { messageEntry: {} },
  };
  const text = async () => {
    await new Promise((r) => setTimeout(r, 40));
    return out.join('');
  };
  const type = async (keys: string) => {
    for (const k of keys) {
      feedInputWaiter(socket, session, k);
      await new Promise((r) => setImmediate(r));
    }
  };
  return { socket, session, out, text, type };
}

const SUBJECT = '\x1b[36mSubject\x1b[33m: \x1b[32m(\x1b[33mBlank\x1b[32m)\x1b[0m=\x1b[33mabort\x1b[32m?\x1b[0m ';

describe('the To: line of E (enterMSG 10785-10845)', () => {
  it('a recipient nobody on the board is called ends E with "User does not exist!!"', async () => {
    const h = harness();
    await entry.processToRecipient(h.socket, h.session, 'Nobody');
    const out = await h.text();
    expect(out).toBe('\r\nUser does not exist!!\r\n\r\n');
    expect(h.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(h.session.tempData).toBeUndefined();
  });

  it('a typed ALL is a name to look up; only a blank To: is ALL', async () => {
    const typed = harness();
    await entry.processToRecipient(typed.socket, typed.session, 'all');
    expect(await typed.text()).toContain('User does not exist!!');

    const blank = harness();
    await entry.processToRecipient(blank.socket, blank.session, '');
    expect(blank.session.tempData.messageEntry.toUser).toBe('ALL');
    expect(await blank.text()).toBe(SUBJECT);
  });

  it("'eallice' is a name, not EALL", async () => {
    const h = harness();
    await entry.processToRecipient(h.socket, h.session, 'eallice');
    expect(await h.text()).toBe('\r\nUser does not exist!!\r\n\r\n');
  });

  it('a name is addressed as the account spells it', async () => {
    const h = harness();
    await entry.processToRecipient(h.socket, h.session, 'aLiCe');
    expect(h.session.tempData.messageEntry.toUser).toBe('Alice');
    expect(h.session.tempData.messageEntry.toSlot).toBe(2);
  });

  it('a deactivated account is not a recipient', async () => {
    const h = harness();
    await entry.processToRecipient(h.socket, h.session, 'Ghost');
    expect(await h.text()).toContain('User does not exist!!');
  });

  it('an account without the conference is refused', async () => {
    const h = harness();
    await entry.processToRecipient(h.socket, h.session, 'Carol');
    expect(await h.text()).toBe('\r\nUser does not have access to this conference!\r\n\r\n');
  });

  it('a REALNAME conference finds the recipient by real name and addresses him by it', async () => {
    mockFlags = { requireRealname: true };
    const h = harness({ realName: 'Poster Real' });
    await entry.processToRecipient(h.socket, h.session, 'alice real');
    expect(h.session.tempData.messageEntry.toUser).toBe('Alice Real');

    const byHandle = harness({ realName: 'Poster Real' });
    await entry.processToRecipient(byHandle.socket, byHandle.session, 'Alice');
    expect(await byHandle.text()).toContain('User does not exist!!');
  });

  it("E to sysop is addressed to account 1's name, not the word SYSOP", async () => {
    const h = harness();
    await entry.processToRecipient(h.socket, h.session, 'sysop');
    expect(h.session.tempData.messageEntry.toUser).toBe('Spot');
    expect(h.session.tempData.messageEntry.toSlot).toBe(1);

    mockFlags = { requireRealname: true };
    const real = harness({ realName: 'Poster Real' });
    await entry.processToRecipient(real.socket, real.session, 'SYSOP');
    expect(real.session.tempData.messageEntry.toUser).toBe('Johan Sysop');
  });

  it('EALL without the access says "User does not exist!!" and nothing more', async () => {
    const flags = ALL_FLAGS.split('');
    flags[34] = 'F'; // ACS_EALL_MESSAGES
    const h = harness({ securityFlags: flags.join('') });
    await entry.processToRecipient(h.socket, h.session, 'EALL');
    expect(await h.text()).toBe('\r\nUser does not exist!!\r\n\r\n');
  });

  it('EALL with the access is the public EALL', async () => {
    const h = harness();
    await entry.processToRecipient(h.socket, h.session, 'eall');
    expect(h.session.tempData.messageEntry.toUser).toBe('EALL');
    expect(h.session.tempData.messageEntry.aFlag).toBe(2);
  });

  it('FORWARDMAIL takes mail addressed to the sysop', async () => {
    mockFlags = { forwardMail: 'alina' };
    const h = harness();
    await entry.processToRecipient(h.socket, h.session, 'sysop');
    expect(await h.text()).toBe(`    \x1b[36mForwarding mail To\x1b[33m:\x1b[0m Alina\r\n${SUBJECT}`);
    expect(h.session.tempData.messageEntry.toUser).toBe('Alina');
    expect(h.session.tempData.messageEntry.toSlot).toBe(3);
  });
});

describe('wildcard names (chooseAName 11531-11552)', () => {
  it('offers each match with " Expand: <name> Correct" and a No moves to the next', async () => {
    getACSConfig().toggles[ToggleFlags.USEWILDCARDS] = true;
    const h = harness();
    const done = entry.processToRecipient(h.socket, h.session, 'Ali*');
    await h.text();
    await h.type('n');
    await h.text();
    await h.type('y');
    await done;
    const yn = '\x1b[32m(\x1b[33mY\x1b[32m/\x1b[33mn\x1b[32m)\x1b[32m?\x1b[0m ';
    expect(await h.text()).toBe(
      ` Expand: Alice Correct ${yn}No\r\n\x1b[A\x1b[K Expand: Alina Correct ${yn}Yes\r\n${SUBJECT}`,
    );
    expect(h.session.tempData.messageEntry.toUser).toBe('Alina');
  });

  it('a * before the fourth character is refused without a word', async () => {
    getACSConfig().toggles[ToggleFlags.USEWILDCARDS] = true;
    const h = harness();
    await entry.processToRecipient(h.socket, h.session, 'Al*');
    expect(await h.text()).toBe('');
    expect(h.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  it('with wildcards off a * is a letter like any other', () => {
    expect(names.findUserFromName(1, 'username', 'Ali*', false)).toBe(0);
    expect(names.findUserFromName(1, 'username', 'Ali*', true)).toBe(2);
  });
});

describe('E <params> (express.e:10764 parsedParams.item(0))', () => {
  it('E with two words takes the first as the recipient', async () => {
    const { handleEnterMessageFullCommand, setMessagingDependencies } = require('../../../src/handlers/message/messaging.handler');
    setMessagingDependencies({ setEnvStat: () => undefined });
    const h = harness();
    h.session.subState = LoggedOnSubState.READ_COMMAND;
    handleEnterMessageFullCommand(h.socket, h.session, 'Alice hello there');
    const out = await h.text();
    expect(out).toContain('\x1b[32m?\x1b[0m Alice\r\n');
    expect(h.session.tempData.messageEntry.toUser).toBe('Alice');
  });
});

describe('C, the comment to the sysop (commentToSYSOP 8757-8785)', () => {
  const { handleCommentToSysopCommand } = require('../../../src/handlers/chat/preference-chat-commands.handler');

  it("addresses the comment to account 1's real name in a REALNAME conference", async () => {
    mockFlags = { requireRealname: true };
    const h = harness({ realName: 'Poster Real' });
    handleCommentToSysopCommand(h.socket, h.session, '');
    expect(await h.text()).toContain('\x1b[32m?\x1b[0m Johan Sysop\r\n');
    expect(h.session.tempData.messageEntry.toUser).toBe('Johan Sysop');
    expect(h.session.tempData.messageEntry.toSlot).toBe(1);
  });

  it('without a real name it asks for one there and then, and goes on to the comment', async () => {
    mockFlags = { requireRealname: true };
    const h = harness({ realName: '' });
    handleCommentToSysopCommand(h.socket, h.session, '');
    expect(await h.text()).toContain('Real Name (Alpha Numeric): ');
    await h.type('Poster Real\r');
    const out = await h.text();
    expect(out).toContain('Poster Real\r\n\r\nChecking for duplicate name...Ok!\r\n');
    expect(out).toContain('\x1b[32m?\x1b[0m Johan Sysop\r\n');
    expect(out.endsWith(SUBJECT)).toBe(true);
    expect(h.session.user.realName).toBe('Poster Real');
    expect(h.session.subState).toBe(LoggedOnSubState.POST_MESSAGE_SUBJECT);
  });
});

describe('the name capture (captureRealAndInternetNames 28166-28225)', () => {
  // Through the gate E, C, R and F call; `resumed` is the command carrying on.
  function capture(user: any) {
    const h = harness(user);
    let resumed = 0;
    const ready = entry.captureRealAndInternetNames(h.socket, h.session, () => { resumed++; });
    return { h, ready, resumed: () => resumed };
  }

  it('a real name already in use is refused on the "Checking" line', async () => {
    mockFlags = { requireRealname: true };
    const { h, ready, resumed } = capture({ realName: '' });
    expect(ready).toBe(false);
    await h.text();
    await h.type('alice real\r');
    expect(await h.text()).toContain(
      'Checking for duplicate name...Already in use!, try another.\r\n\r\nReal Name (Alpha Numeric): ',
    );
    await h.type('\r');
    await h.text();
    expect(resumed()).toBe(0);
    expect(h.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  it('a one-letter name is asked for again without a check', async () => {
    mockFlags = { requireRealname: true };
    const { h } = capture({ realName: '' });
    await h.text();
    await h.type('x\r');
    const out = await h.text();
    expect(out).not.toContain('Checking');
    expect(out).toMatch(/x\r\nReal Name \(Alpha Numeric\): $/);
  });

  it('an internet name with a space is checked like any other - there is no "No spaces allowed."', async () => {
    mockFlags = { requireInternetname: true };
    const { h, resumed } = capture({ internetName: '' });
    await h.text();
    await h.type('po st\r');
    const out = await h.text();
    expect(out).not.toContain('No spaces');
    expect(out).toContain('po st\r\n\r\nChecking for duplicate name...Ok!\r\n');
    expect(resumed()).toBe(1);
    expect(h.session.user.internetName).toBe('po st');
  });
});

describe('the yesNo(2) questions (express.e:2134)', () => {
  const YN2 = '\x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)\x1b[32m?\x1b[0m ';

  it('Private ends in yesNo(2) exact bytes', async () => {
    const h = harness();
    h.session.tempData.messageEntry = { toUser: 'Alice', aFlag: 0 };
    await entry.handleMessageSubjectInput(h.socket, h.session, 'hi');
    expect(await h.text()).toBe(`\r\n         \x1b[36mPrivate ${YN2}`);
  });

  it('Quote in Reply ends in yesNo(2) exact bytes', async () => {
    const h = harness();
    h.session.tempData.messageEntry = { toUser: 'Alice', parentId: 7 };
    entry.handleMessagePrivateInput(h.socket, h.session, 'n');
    expect(await h.text()).toBe(`No\r\n  \x1b[36mQuote in Reply ${YN2}`);
  });
});

describe('Quote in Reply (express.e:10886-10899)', () => {
  it('shows the message being replied to from its file on disk', async () => {
    readMessageFile.mockResolvedValue({ from: 'Alice', to: 'Poster', subject: 's', date: '', msgDate: 0, msgNum: 7, body: 'first line\nsecond line' });
    const h = harness();
    h.session.tempData.messageEntry = { toUser: 'Alice', parentId: 7, body: [] };
    await entry.handleMessageQuoteReplyConfirm(h.socket, h.session, 'y');
    const out = await h.text();
    expect(readMessageFile).toHaveBeenCalledWith(1, 7, root);
    expect(out).toContain('01> first line\r\n02> second line\r\n');
    expect(out).toContain(' Enter Startline,Endline or (*=ALL, A=Abort): ');
  });
});
