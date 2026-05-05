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

describe('parseMciCodes — migrated dispatch codes (express.e parity)', () => {
  // Pins the express.e behaviour after the MCI tokenizer migration.
  // Pre-migration these codes ran as post-tokenizer regexes; the tests
  // below catch any silent re-divergence.

  test('~SP| sets hasPause and emits no visible space (express.e:5455)', async () => {
    const session = makeSession();
    const result = await parseMciCodes('a~SP|b', session);
    expect(result.hasPause).toBe(true);
    expect(result.parsed).toBe('ab');
  });

  test('~SP\\n bare form sets hasPause (real-screen extension)', async () => {
    const session = makeSession();
    const result = await parseMciCodes('a~SP\nb', session);
    expect(result.hasPause).toBe(true);
    expect(result.parsed).toContain('a');
    expect(result.parsed).toContain('b');
  });

  test('~5SP| with width prefix does NOT pause (express.e width-gate)', async () => {
    const session = makeSession();
    const result = await parseMciCodes('a~5SP|b', session);
    // Express.e:5455 — `(maxLen=-1) AND (StrCmp(cmd,'SP'))`. Width=5
    // fails the gate, falls through. Soft fall-through re-emits `~`
    // and width digits while the cmd content stays as plain text.
    expect(result.hasPause).toBe(false);
  });

  test('~f| clears screen (express.e:5469-5471 sendCLS)', async () => {
    const session = makeSession();
    const result = await parseMciCodes('a~f|b', session);
    expect(result.parsed).toBe('a\x1b[2J\x1b[Hb');
  });

  test('~F| (uppercase) does NOT clear in byte-exact mode (express.e:5469)', async () => {
    // Express.e StrCmp(cmd,'f') is case-sensitive — `~F` mismatches
    // the lowercase 'f' key and falls through. Strict tokenizer
    // emits "F" plain.
    const session = makeSession();
    const result = await parseMciCodes('a~F|b', session);
    expect(result.parsed).toBe('aFb');
  });

  test('~x10| emits row-1 col-10 cursor (express.e:5478-5486 [;Nh)', async () => {
    const session = makeSession();
    const result = await parseMciCodes('a~x10|b', session);
    // Express.e StringF format `[;\dH` — empty row defaults to 1.
    // Pre-migration our build emitted `\x1b[<n>G` (column-only) which
    // was a divergence; the dispatch path now matches express.e.
    expect(result.parsed).toBe('a\x1b[;10Hb');
  });

  test('~y5| emits row-5 col-1 cursor (express.e:5487-5495 [N;H)', async () => {
    const session = makeSession();
    const result = await parseMciCodes('a~y5|b', session);
    expect(result.parsed).toBe('a\x1b[5;Hb');
  });

  test('~5w| (width-prefix delay form) is a no-op (express.e:5472-5477)', async () => {
    const session = makeSession();
    const result = await parseMciCodes('a~5w|b', session);
    expect(result.parsed).toBe('ab');
  });

  test('~w5| (Web-divergent suffix form) is also a no-op', async () => {
    const session = makeSession();
    const result = await parseMciCodes('a~w5|b', session);
    expect(result.parsed).toBe('ab');
  });

  test('strict fall-through: unknown ~ZZZ| is consumed (express.e exact)', async () => {
    // Express.e:5290-5402 ELSEIF chain has no final ELSE, so cmd that
    // matches no branch advances pos past `~` only and the cmd content
    // emits as plain text via the outer aePuts2 in processMci. Strict
    // tokenizer matches: `~ZZZ|` -> "ZZZ" (no leading `~`).
    const session = makeSession();
    const result = await parseMciCodes('a~ZZZ|b', session);
    expect(result.parsed).toBe('aZZZb');
  });

  test('~CR_<prompt>|| pre-tokenizer: prompt + hasPause (express.e:5571-5580)', async () => {
    const session = makeSession();
    const result = await parseMciCodes('start~CR_Press a key||end', session);
    expect(result.parsed).toContain('Press a key');
    expect(result.hasPause).toBe(true);
  });

  test('~CR_ prompt with embedded ~N| substitutes username', async () => {
    const session = makeSession({ user: { username: 'Spot', secLevel: 20 } });
    const result = await parseMciCodes('~CR_Hi ~N|||end', session);
    expect(result.parsed).toContain('Hi Spot');
    expect(result.hasPause).toBe(true);
  });

  test('~SM_<menu>|| sets currentMenuName', async () => {
    const session = makeSession();
    await parseMciCodes('~SM_MAIN||', session);
    expect(session.currentMenuName).toBe('MAIN');
  });

  test('~NSF sets nonStopText flag', async () => {
    const session = makeSession();
    await parseMciCodes('header~NSFbody', session);
    expect((session as any).nonStopText).toBe(true);
  });

  test('~SP. sets hasPause and emits empty', async () => {
    const session = makeSession();
    const result = await parseMciCodes('a~SP.b', session);
    expect(result.hasPause).toBe(true);
    expect(result.parsed).toBe('ab');
  });

  test('~SMC| clears slow mode', async () => {
    const session = makeSession({ slowmo: 3, slowmoCount: 60 });
    const result = await parseMciCodes('~SMC|', session);
    expect(result.slowmo).toBe(0);
    expect(result.slowmoCount).toBe(0);
  });

  test('~~ literal tilde escape preserves ~ in output', async () => {
    const session = makeSession();
    const result = await parseMciCodes('cost: 5~~|hr', session);
    // Either soft fall-through followed by `~~ -> ~` cleanup or
    // strict-mode emitting cmd content as plain text — both render
    // the literal tilde.
    expect(result.parsed).toContain('~');
    expect(result.parsed).toContain('hr');
  });
});

describe('parseMciCodes — non-inline mode file-display codes', () => {
  // ~SS_/~SR_/~SX_ in non-inline mode pre-process pre-tokenizer and
  // emit `{{DISPLAY_FILE:N}}` placeholders that get substituted with
  // file content at the end of parseMciCodes. For tests that don't
  // mock file loading the placeholder ends up replaced with empty
  // string, so the assertions here pin the absence of the raw MCI
  // code in the output (which proves the pre-tokenizer regex
  // matched). Pinned because the pre-tokenizer move was required
  // when strict fall-through was enabled — previously the post-
  // tokenizer regex would have been silently broken by the
  // tokenizer consuming the leading `~`.

  test('~SS_<file> is consumed by pre-tokenizer (not leaked as plain text)', async () => {
    const session = makeSession();
    const result = await parseMciCodes('a~SS_BANNER|b', session);
    expect(result.parsed).not.toContain('~SS_');
    expect(result.parsed).not.toContain('SS_BANNER');
    // File doesn't exist → placeholder collapses to empty → output "ab".
    expect(result.parsed).toContain('a');
    expect(result.parsed).toContain('b');
  });

  test('~2S<file> short form also gets consumed', async () => {
    const session = makeSession();
    const result = await parseMciCodes('a~2SBANNER|b', session);
    expect(result.parsed).not.toContain('~2S');
    expect(result.parsed).not.toContain('2SBANNER');
  });

  test('~SR_<path>| is consumed by pre-tokenizer', async () => {
    const session = makeSession();
    const result = await parseMciCodes('a~SR_/tmp/foo|b', session);
    expect(result.parsed).not.toContain('~SR_');
    expect(result.parsed).not.toContain('SR_/tmp');
  });

  test('multiple ~SS_ entries all get consumed', async () => {
    const session = makeSession();
    const result = await parseMciCodes('~SS_A| then ~SS_B|', session);
    expect(result.parsed).not.toContain('~SS_');
    expect(result.parsed).not.toContain('SS_A');
    expect(result.parsed).not.toContain('SS_B');
    expect(result.parsed).toContain('then');
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
