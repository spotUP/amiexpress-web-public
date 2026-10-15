// @ts-nocheck
import {
  handleMessageSubjectInput,
  handleMessagePrivateInput,
  getConfMailName,
  isSysopRecipient,
} from '../../../src/handlers/message/message-entry.handler';
import { LoggedOnSubState } from '../../../src/constants/bbs-states';

let _sockCtr = 0;
function makeSocket() {
  return { emit: jest.fn(), on: jest.fn(), id: `msg-socket-${++_sockCtr}` };
}

function makeSession(overrides: any = {}): any {
  return {
    state: 'logged_in',
    subState: LoggedOnSubState.POST_MESSAGE_TO,
    nodeId: 1,
    user: {
      username: 'Poster',
      secLevel: 20,
      confAccess: 'X',
    },
    currentConf: 1,
    tempData: {
      messageEntry: {
        toUser: '',
        subject: '',
        isPrivate: false,
        body: [],
      },
    },
    ...overrides,
  };
}

// The To: line (blank = ALL, EALL, sysop, names) is
// entering-a-message-names-the-recipient-like-express.test.ts.

describe('handleMessageSubjectInput', () => {
  test('blank subject aborts entry and returns to DISPLAY_MENU', () => {
    const socket = makeSocket();
    const session = makeSession();
    handleMessageSubjectInput(socket, session, '');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(session.tempData).toBeUndefined();
  });

  test('blank subject silently returns (express.e:10854 RESULT_FAILURE)', () => {
    // Express.e enterMSG returns silently on a blank subject — there is no
    // textual "Aborted" message. The handler still emits a CR/LF for
    // formatting before transitioning back to DISPLAY_MENU.
    const socket = makeSocket();
    const session = makeSession();
    handleMessageSubjectInput(socket, session, '');
    const emitted = socket.emit.mock.calls.map((c: any[]) => String(c[1] ?? '')).join('');
    expect(emitted).not.toMatch(/abort/i);
    expect(emitted.length).toBeLessThan(20); // just whitespace, no banner
  });

  test('valid subject stored on tempData', () => {
    const socket = makeSocket();
    const session = makeSession();
    handleMessageSubjectInput(socket, session, 'Re: Testing');
    expect(session.tempData.messageEntry.subject).toBe('Re: Testing');
  });

  test('subject with only whitespace treated as blank (abort)', () => {
    const socket = makeSocket();
    const session = makeSession();
    handleMessageSubjectInput(socket, session, '   ');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});

describe('isSysopRecipient — express.e:9919 stringCompare(name, sysop.name)', () => {
  // express.e:9918-9919 loadAccount(1, ...) + stringCompare(name, tempUser.name).
  // The check matches the configured slot-1 user, not just the literal token
  // 'SYSOP' — so a reply to a sysop-authored message under sysop_name='Spot'
  // must still trigger FORWARDMAIL redirect.
  test("literal 'SYSOP' (any case) is recognized", () => {
    expect(isSysopRecipient('SYSOP')).toBe(true);
    expect(isSysopRecipient('sysop')).toBe(true);
    expect(isSysopRecipient('Sysop')).toBe(true);
  });

  test('whitespace around literal is tolerated', () => {
    expect(isSysopRecipient('  sysop  ')).toBe(true);
  });

  test('non-sysop names are rejected', () => {
    expect(isSysopRecipient('Alice')).toBe(false);
    expect(isSysopRecipient('')).toBe(false);
    // bbsConfig.sysop_name lookup may fail in this test env; that's OK,
    // it falls back to literal-only matching (return false).
  });
});

describe('getConfMailName — express.e:12459-12466 confMailName', () => {
  // express.e populates confMailName from loggedOnUserKeys.userName /
  // loggedOnUserMisc.realName / .internetName based on confNameType,
  // then uses that for mh.fromName (10649) and every "is this my mail?"
  // comparison. Default (no flag set) is NAME_TYPE_USERNAME.
  test('default conference returns username verbatim (NAME_TYPE_USERNAME)', () => {
    const session = makeSession({ user: { username: 'Spot', secLevel: 20, realName: 'Real Name Here' } });
    expect(getConfMailName(session)).toBe('Spot');
  });

  test('username field truncated at 31 chars (express.e AstrCopy limit)', () => {
    const longName = 'A'.repeat(40);
    const session = makeSession({ user: { username: longName, secLevel: 20 } });
    expect(getConfMailName(session).length).toBeLessThanOrEqual(31);
  });

  test('falls back gracefully when user is missing', () => {
    const session: any = { currentConf: 1, currentMsgBase: 1, user: null };
    // Should not throw — returns empty string for absent user (matches
    // express.e behavior where confMailName would just be empty).
    expect(() => getConfMailName(session)).not.toThrow();
  });

  test('USERNAME tooltype does NOT change confMailName (it gates TO: only)', () => {
    // Simulate flags with requireUsername=true. USERNAME / USERNAME.<n> is
    // express.e:4078-4087 CHECK_REALNAME (TO: field validation), NOT
    // express.e:5017-5024 confNameType. confMailName must stay at the
    // default NAME_TYPE_USERNAME branch.
    jest.resetModules();
    jest.doMock('../../../src/utils/conference-tooltypes.util', () => ({
      getConferenceToolFlags: () => ({
        requireUsername: true,
        requireRealname: false,
        requireInternetname: false,
        requireUsernameMsgBases: new Set(),
        requireRealnameMsgBases: new Set(),
        requireInternetnameMsgBases: new Set(),
      }),
    }));
    const { getConfMailName: gcm } = require('../../../src/handlers/message/message-entry.handler');
    const session = makeSession({
      user: { username: 'Bob', realName: 'Robert', internetName: 'bob@x' },
    });
    expect(gcm(session)).toBe('Bob');
    jest.dontMock('../../../src/utils/conference-tooltypes.util');
    jest.resetModules();
  });

  test('REALNAME wins over INTERNETNAME when both tooltypes set', () => {
    jest.resetModules();
    jest.doMock('../../../src/utils/conference-tooltypes.util', () => ({
      getConferenceToolFlags: () => ({
        requireUsername: false,
        requireRealname: true,
        requireInternetname: true,
        requireUsernameMsgBases: new Set(),
        requireRealnameMsgBases: new Set(),
        requireInternetnameMsgBases: new Set(),
      }),
    }));
    const { getConfMailName: gcm } = require('../../../src/handlers/message/message-entry.handler');
    const session = makeSession({
      user: { username: 'Bob', realName: 'Robert Smith', internetName: 'bob@x' },
    });
    // express.e:5020-5023 IF/ELSEIF — REALNAME branch fires first.
    expect(gcm(session)).toBe('Robert Smith');
    jest.dontMock('../../../src/utils/conference-tooltypes.util');
    jest.resetModules();
  });

  test('INTERNETNAME truncates to 10 chars (express.e:12465 AstrCopy 10)', () => {
    jest.resetModules();
    jest.doMock('../../../src/utils/conference-tooltypes.util', () => ({
      getConferenceToolFlags: () => ({
        requireUsername: false,
        requireRealname: false,
        requireInternetname: true,
        requireUsernameMsgBases: new Set(),
        requireRealnameMsgBases: new Set(),
        requireInternetnameMsgBases: new Set(),
      }),
    }));
    const { getConfMailName: gcm } = require('../../../src/handlers/message/message-entry.handler');
    const session = makeSession({
      user: { username: 'Bob', internetName: 'verylonginternet@example.com' },
    });
    expect(gcm(session).length).toBeLessThanOrEqual(10);
    jest.dontMock('../../../src/utils/conference-tooltypes.util');
    jest.resetModules();
  });
});

describe('handleMessagePrivateInput', () => {
  test('Y sets isPrivate to true', () => {
    const socket = makeSocket();
    const session = makeSession();
    handleMessagePrivateInput(socket, session, 'Y');
    expect(session.tempData.messageEntry.isPrivate).toBe(true);
  });

  test('y (lowercase) sets isPrivate to true', () => {
    const socket = makeSocket();
    const session = makeSession();
    handleMessagePrivateInput(socket, session, 'y');
    expect(session.tempData.messageEntry.isPrivate).toBe(true);
  });

  test('YES sets isPrivate to true', () => {
    const socket = makeSocket();
    const session = makeSession();
    handleMessagePrivateInput(socket, session, 'YES');
    expect(session.tempData.messageEntry.isPrivate).toBe(true);
  });

  test('N sets isPrivate to false', () => {
    const socket = makeSocket();
    const session = makeSession();
    handleMessagePrivateInput(socket, session, 'N');
    expect(session.tempData.messageEntry.isPrivate).toBe(false);
  });

  test('blank input sets isPrivate to false (default public)', () => {
    const socket = makeSocket();
    const session = makeSession();
    handleMessagePrivateInput(socket, session, '');
    expect(session.tempData.messageEntry.isPrivate).toBe(false);
  });

  test('random input sets isPrivate to false', () => {
    const socket = makeSocket();
    const session = makeSession();
    handleMessagePrivateInput(socket, session, 'maybe');
    expect(session.tempData.messageEntry.isPrivate).toBe(false);
  });
});
