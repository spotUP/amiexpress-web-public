// @ts-nocheck
import { parseMciCodes, doPause } from '../../src/handlers/screen.handler';

function makeSession(overrides: any = {}): any {
  return {
    user: {
      username: 'TestUser',
      secLevel: 20,
      timesCalled: 5,
      messagesPosted: 3,
      uploads: 1,
      downloads: 2,
      uploadBytes: 1024,
      downloadBytes: 2048,
      dailyTimeLimit: 7200,
    },
    timeRemaining: 3600,
    currentConf: 1,
    currentConfName: 'General',
    nodeId: 1,
    slowmo: 0,
    slowmoCount: 0,
    ...overrides,
  };
}

describe('parseMciCodes — user info MCI substitutions', () => {
  test('~N| substitutes username', async () => {
    const session = makeSession({ user: { username: 'Alice', secLevel: 20 } });
    const result = await parseMciCodes('Hello ~N|!', session);
    expect(result.parsed).toContain('Alice');
  });

  test('~A| substitutes security level', async () => {
    const session = makeSession({ user: { username: 'Bob', secLevel: 42 } });
    const result = await parseMciCodes('Level: ~A|', session);
    expect(result.parsed).toContain('42');
  });

  test('~BR| always outputs 57600', async () => {
    const session = makeSession();
    const result = await parseMciCodes('Baud: ~BR|', session);
    expect(result.parsed).toContain('57600');
  });

  test('~TR| substitutes minutes of timeRemaining', async () => {
    const session = makeSession({ timeRemaining: 1800 });
    const result = await parseMciCodes('Time Left: ~TR| min', session);
    expect(result.parsed).toContain('30');
  });

  test('~TC| substitutes times called', async () => {
    const session = makeSession({ user: { username: 'X', secLevel: 20, timesCalled: 99 } });
    const result = await parseMciCodes('Calls: ~TC|', session);
    expect(result.parsed).toContain('99');
  });

  test('~RN| substitutes real name (falls back to username)', async () => {
    const session = makeSession({
      user: { username: 'Handle', realName: 'John Doe', secLevel: 20 },
    });
    const result = await parseMciCodes('Real: ~RN|', session);
    expect(result.parsed).toContain('John Doe');
  });

  test('Guest session falls back gracefully for missing user fields', async () => {
    const session = { user: null, timeRemaining: 0, slowmo: 0, slowmoCount: 0 };
    const result = await parseMciCodes('~N| ~A|', session as any);
    expect(result.parsed).toContain('Guest');
    expect(result.parsed).toContain('0');
  });
});

describe('parseMciCodes — result shape', () => {
  test('returns parsed string and commands array', async () => {
    const session = makeSession();
    const result = await parseMciCodes('Hello world', session);
    expect(typeof result.parsed).toBe('string');
    expect(Array.isArray(result.commands)).toBe(true);
    expect(typeof result.hasPause).toBe('boolean');
  });

  test('hasPause is false when no ~SP or ~CR_ present', async () => {
    const session = makeSession();
    const result = await parseMciCodes('Plain text', session);
    expect(result.hasPause).toBe(false);
  });

  test('commands array is empty when no ~XC_ present', async () => {
    const session = makeSession();
    const result = await parseMciCodes('~N| is logged in', session);
    expect(result.commands).toHaveLength(0);
  });

  test('multiple MCI codes substituted in one pass', async () => {
    const session = makeSession({ user: { username: 'Duo', secLevel: 15 } });
    const result = await parseMciCodes('User ~N| level ~A|', session);
    expect(result.parsed).toContain('Duo');
    expect(result.parsed).toContain('15');
  });
});

let _socketCounter = 0;
function makeFullSocket() {
  return { emit: jest.fn(), on: jest.fn(), id: `pause-socket-${++_socketCounter}` };
}

describe('doPause', () => {
  test('sets paginatedScreen on session', () => {
    const socket = makeFullSocket();
    const session: any = {
      subState: 'display_menu',
      paginatedScreen: undefined,
      lastScreenHadPause: false,
    };
    doPause(socket as any, session);
    expect(session.paginatedScreen).toBeDefined();
    expect(session.paginatedScreen.lines).toBeDefined();
    expect(session.paginatedScreen.pageSize).toBe(1);
  });

  test('sets lastScreenHadPause to true', () => {
    const socket = makeFullSocket();
    const session: any = {
      subState: 'display_menu',
      paginatedScreen: undefined,
      lastScreenHadPause: false,
    };
    doPause(socket as any, session);
    expect(session.lastScreenHadPause).toBe(true);
  });

  test('emits pause prompt to socket', async () => {
    jest.useFakeTimers();
    const socket = makeFullSocket();
    const session: any = {
      subState: 'display_menu',
      paginatedScreen: undefined,
      lastScreenHadPause: false,
    };
    doPause(socket as any, session);
    // ANSI buffer debounces with 16ms delay — advance past it
    jest.runAllTimers();
    jest.useRealTimers();
    const allEmitted = socket.emit.mock.calls.map((c: any[]) => String(c[1] ?? '')).join('');
    expect(allEmitted).toContain('Pause');
  });

  test('stores onComplete callback in paginatedScreen', () => {
    const socket = makeFullSocket();
    const session: any = {
      subState: 'display_menu',
      paginatedScreen: undefined,
      lastScreenHadPause: false,
    };
    const cb = jest.fn();
    doPause(socket as any, session, cb);
    expect(session.paginatedScreen.onComplete).toBe(cb);
  });
});
