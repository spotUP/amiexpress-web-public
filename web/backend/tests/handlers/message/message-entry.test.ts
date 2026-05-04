// @ts-nocheck
import {
  handleMessageToInput,
  handleMessageSubjectInput,
  handleMessagePrivateInput,
  processToRecipient,
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

describe('handleMessageToInput', () => {
  test('blank input sets toUser to ALL', () => {
    const socket = makeSocket();
    const session = makeSession();
    handleMessageToInput(socket, session, '');
    expect(session.tempData.messageEntry.toUser).toBe('ALL');
  });

  test('SYSOP input sets toUser to SYSOP', () => {
    const socket = makeSocket();
    const session = makeSession();
    handleMessageToInput(socket, session, 'sysop');
    expect(session.tempData.messageEntry.toUser).toBe('SYSOP');
  });

  test('SYSOP check is case-insensitive', () => {
    const socket = makeSocket();
    const session = makeSession();
    handleMessageToInput(socket, session, 'SYSOP');
    expect(session.tempData.messageEntry.toUser).toBe('SYSOP');
  });

  test('regular recipient stored verbatim', () => {
    const socket = makeSocket();
    const session = makeSession();
    handleMessageToInput(socket, session, 'JohnDoe');
    expect(session.tempData.messageEntry.toUser).toBe('JohnDoe');
  });

  test('leading/trailing whitespace trimmed from recipient', () => {
    const socket = makeSocket();
    const session = makeSession();
    handleMessageToInput(socket, session, '  Alice  ');
    expect(session.tempData.messageEntry.toUser).toBe('Alice');
  });

  test('EALL accepted when user has EALL_MESSAGES permission', () => {
    // Post c316ada1e fix(security): no more secLevel >= 10 fallback. Grant
    // EALL_MESSAGES (ACS index 34) via securityFlags so the check resolves
    // without depending on ACS files on disk.
    const securityFlags = '?'.repeat(87).split('');
    securityFlags[34] = 'T';
    const socket = makeSocket();
    const session = makeSession({
      user: {
        username: 'Op',
        secLevel: 20,
        confAccess: 'X',
        securityFlags: securityFlags.join(''),
        secOverride: '',
      },
    });
    handleMessageToInput(socket, session, 'eall');
    expect(session.tempData.messageEntry.toUser).toBe('EALL');
  });

  test('EALL rejected when user lacks EALL_MESSAGES permission', () => {
    const socket = makeSocket();
    // No securityFlags grant + no ACS files → checkSecurity denies.
    const session = makeSession({ user: { username: 'Low', secLevel: 5, confAccess: 'X' } });
    handleMessageToInput(socket, session, 'EALL');
    // Should be rejected: tempData cleared and state changed to DISPLAY_MENU
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(session.tempData).toBeUndefined();
  });
});

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

describe('processToRecipient — express.e:10802 EALL exact match', () => {
  // express.e:10802 `StrCmp(str, 'eall', 5)` requires exact 'eall' (the
  // length-5 strncmp compares the trailing null too). `eallice` must NOT
  // be treated as EALL; pre-2026-05-03 the E-command params branch
  // accepted it via startsWith().
  test("'eallice' is NOT EALL (no EALL_MESSAGES permission required)", async () => {
    const socket = makeSocket();
    // No EALL flag. If startsWith('eall') were used we would early-exit
    // with "User does not exist!!" — but exact match falls through to
    // the chooseAName path which (with no _db wired) accepts the literal
    // recipient.
    const session = makeSession({ user: { username: 'Low', secLevel: 5, confAccess: 'X' } });
    await processToRecipient(socket, session, 'eallice');
    expect(session.tempData?.messageEntry?.toUser).toBe('eallice');
    expect(session.subState).not.toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  test('EALL with extra trailing chars not treated as EALL', async () => {
    const socket = makeSocket();
    const session = makeSession({ user: { username: 'Low', secLevel: 5, confAccess: 'X' } });
    await processToRecipient(socket, session, 'eallx');
    // Falls through to regular-recipient path
    expect(session.tempData?.messageEntry?.toUser).toBe('eallx');
  });

  test('exact EALL still triggers permission check (rejected for low sec)', async () => {
    const socket = makeSocket();
    const session = makeSession({ user: { username: 'Low', secLevel: 5, confAccess: 'X' } });
    await processToRecipient(socket, session, 'eall');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(session.tempData).toBeUndefined();
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
