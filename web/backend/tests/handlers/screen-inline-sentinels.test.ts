// @ts-nocheck
/**
 * Inline-mode sentinel walker — pins the post-tokenizer flow that
 * replaced the old inline regex. Each side-effecting MCI code
 * (`~f`, `~SP`, `~CC_<cmd>`, `~SS_<file>`, `~<n>SR_<path>`) goes
 * through the dispatch as a NUL-delimited sentinel, then the walker
 * emits text-before / runs the side effect / continues. The tests
 * here exercise the walker via parseMciCodes with a mock socket.
 */

import { parseMciCodes } from '../../src/handlers/screen.handler';
import { flushOutput } from '../../src/utils/output.util';

// emitText buffers for 16ms before flushing to socket; tests need to
// explicitly drain the buffer (or the socket sees nothing in the
// async window).
const drainBuffer = (socket: any) => flushOutput(socket);

function makeMockSocket() {
  const emitted: string[] = [];
  const socket: any = {
    emit: (_event: string, payload: string) => {
      emitted.push(payload);
    },
    on: () => {},
    removeAllListeners: () => {},
    id: `inline-test-${Math.random()}`,
  };
  return { socket, emitted };
}

function makeSession(overrides: any = {}): any {
  return {
    user: { username: 'TestUser', secLevel: 20 },
    timeRemaining: 3600,
    nodeId: 1,
    slowmo: 0,
    slowmoCount: 0,
    currentConf: 1,
    currentConfName: 'Main',
    ...overrides,
  };
}

describe('inline-mode sentinel walker', () => {
  test('plain text without MCI codes emits to socket as-is', async () => {
    const { socket, emitted } = makeMockSocket();
    const session = makeSession();
    const result = await parseMciCodes(
      'hello world',
      session,
      undefined,
      undefined,
      undefined,
      socket,
    );
    drainBuffer(socket);
    expect(result.inlineEmitted).toBe(true);
    expect(result.parsed).toBe('');
    expect(emitted.join('')).toContain('hello world');
  });

  test('user-info codes substitute before emit', async () => {
    const { socket, emitted } = makeMockSocket();
    const session = makeSession({ user: { username: 'Spot', secLevel: 20 } });
    await parseMciCodes(
      'hi ~N|!',
      session,
      undefined,
      undefined,
      undefined,
      socket,
    );
    drainBuffer(socket);
    expect(emitted.join('')).toContain('hi Spot!');
  });

  test('~f sends CLS to socket in document order', async () => {
    const { socket, emitted } = makeMockSocket();
    const session = makeSession();
    await parseMciCodes(
      'before~f|after',
      session,
      undefined,
      undefined,
      undefined,
      socket,
    );
    drainBuffer(socket);
    const joined = emitted.join('');
    // CLS must appear AFTER "before" and BEFORE "after"
    const beforeIdx = joined.indexOf('before');
    const clsIdx = joined.indexOf('\x1b[2J\x1b[H');
    const afterIdx = joined.indexOf('after');
    expect(beforeIdx).toBeGreaterThanOrEqual(0);
    expect(clsIdx).toBeGreaterThan(beforeIdx);
    expect(afterIdx).toBeGreaterThan(clsIdx);
  });

  test('~SP triggers early-return with pendingInlineContent', async () => {
    const { socket, emitted } = makeMockSocket();
    const session = makeSession();
    const result = await parseMciCodes(
      'visible~SP|hidden until resume',
      session,
      undefined,
      undefined,
      undefined,
      socket,
    );
    expect(result.hasPause).toBe(true);
    drainBuffer(socket);
    expect(result.inlineEmitted).toBe(true);
    expect(result.pendingInlineContent).toBeDefined();
    expect(result.pendingInlineContent).toContain('hidden until resume');
    // "visible" should have been emitted to socket, "hidden" must not.
    const joined = emitted.join('');
    expect(joined).toContain('visible');
    expect(joined).not.toContain('hidden until resume');
  });

  test('pendingInlineContent re-runs through parseMciCodes idempotently', async () => {
    // The pause state machine resumes by calling parseMciCodes again
    // on pendingInlineContent. Sentinels (now NUL-delimited bytes) in
    // that buffer must survive the next tokenizer pass since they
    // contain no `~` for the strict tokenizer to consume.
    const { socket: socket1, emitted: emitted1 } = makeMockSocket();
    const session = makeSession();
    const first = await parseMciCodes(
      'page1~SP|page2~f|page3',
      session,
      undefined,
      undefined,
      undefined,
      socket1,
    );
    expect(first.hasPause).toBe(true);
    expect(first.pendingInlineContent).toBeDefined();
    drainBuffer(socket1);
    expect(emitted1.join('')).toContain('page1');
    expect(emitted1.join('')).not.toContain('page3');

    // Resume: feed pendingInlineContent back through.
    const { socket: socket2, emitted: emitted2 } = makeMockSocket();
    const second = await parseMciCodes(
      first.pendingInlineContent!,
      session,
      undefined,
      undefined,
      undefined,
      socket2,
    );
    drainBuffer(socket2);
    expect(second.inlineEmitted).toBe(true);
    const joined2 = emitted2.join('');
    // page2, then CLS, then page3
    const page2Idx = joined2.indexOf('page2');
    const clsIdx = joined2.indexOf('\x1b[2J\x1b[H');
    const page3Idx = joined2.indexOf('page3');
    expect(page2Idx).toBeGreaterThanOrEqual(0);
    expect(clsIdx).toBeGreaterThan(page2Idx);
    expect(page3Idx).toBeGreaterThan(clsIdx);
  });

  test('multiple ~f sentinels emit CLS in order', async () => {
    const { socket, emitted } = makeMockSocket();
    const session = makeSession();
    await parseMciCodes(
      'A~f|B~f|C',
      session,
      undefined,
      undefined,
      undefined,
      socket,
    );
    drainBuffer(socket);
    const joined = emitted.join('');
    // Two CLS occurrences expected.
    const matches = joined.match(/\x1b\[2J\x1b\[H/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(2);
  });

  test('~5SP| (width prefix) is NOT treated as pause', async () => {
    // express.e:5455 width-gate — `(maxLen=-1) AND (StrCmp(cmd,'SP'))`.
    // With width prefix, the SP handler returns undefined; the
    // tokenizer's strict fall-through emits "SP" as plain text. No
    // sentinel emitted, no pause, no early return.
    const { socket, emitted } = makeMockSocket();
    const session = makeSession();
    const result = await parseMciCodes(
      'a~5SP|b',
      session,
      undefined,
      undefined,
      undefined,
      socket,
    );
    expect(result.hasPause).toBe(false);
    expect(result.pendingInlineContent).toBeUndefined();
    drainBuffer(socket);
    // "SP" should appear as plain text in output.
    const joined = emitted.join('');
    expect(joined).toContain('aSPb');
  });

  test('~F (uppercase) does NOT clear in byte-exact mode', async () => {
    const { socket, emitted } = makeMockSocket();
    const session = makeSession();
    await parseMciCodes(
      'x~F|y',
      session,
      undefined,
      undefined,
      undefined,
      socket,
    );
    drainBuffer(socket);
    // F (uppercase) doesn't match the lowercase `f` dispatch key —
    // strict fall-through emits "F" as plain text. No CLS.
    const joined = emitted.join('');
    expect(joined).toContain('xFy');
    expect(joined).not.toContain('\x1b[2J\x1b[H');
  });
});
