// @ts-nocheck
import {
  handleMessageToInput,
  handleMessageSubjectInput,
  handleMessagePrivateInput,
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

  test('EALL accepted when user has secLevel >= 10', () => {
    const socket = makeSocket();
    const session = makeSession({ user: { username: 'Op', secLevel: 20, confAccess: 'X' } });
    handleMessageToInput(socket, session, 'eall');
    expect(session.tempData.messageEntry.toUser).toBe('EALL');
  });

  test('EALL rejected when user secLevel < 10', () => {
    const socket = makeSocket();
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

  test('blank subject emits abort message', () => {
    jest.useFakeTimers();
    const socket = makeSocket();
    const session = makeSession();
    handleMessageSubjectInput(socket, session, '');
    jest.runAllTimers();
    jest.useRealTimers();
    const emitted = socket.emit.mock.calls.map((c: any[]) => String(c[1] ?? '')).join('');
    expect(emitted).toMatch(/abort/i);
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
