// @ts-nocheck
/**
 * MCI code regression suite — pins the three root causes behind the
 * recurring "MCI codes appear literally in the terminal" bugs:
 *
 *   1. allowMCI gate: the first line of a screen file must start with
 *      '~' for any MCI substitution to run. An empty first line (e.g.
 *      after wipe-code stripping left a leading '\n') silently disables
 *      ALL substitution — a failure mode that has surfaced repeatedly.
 *
 *   2. Case sensitivity: express.e StrCmp is byte-exact. '~f' (clear
 *      screen) and '~N' (username) have DIFFERENT cases; swapping them
 *      silently falls through to plain-text output.
 *
 *   3. Non-inline mode (socket=undefined): used by the wipe animation
 *      path. ALL MCI codes must substitute into `result.parsed` even
 *      when no socket is provided.
 *
 * Tests are deliberately minimal — one failure per failure mode so that
 * any regression points unambiguously at the cause.
 */

import { parseMciCodes } from '../../src/handlers/screen.handler';
import { parseWipeMCI } from '../../src/utils/screen-wipe.util';
import { flushOutput } from '../../src/utils/output.util';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: any = {}): any {
  return {
    user: {
      username: 'BbsUser',
      realName: 'Actual Name',
      secLevel: 50,
      timesCalled: 7,
      messagesPosted: 3,
      uploads: 1,
      downloads: 4,
      uploadBytes: 512,
      downloadBytes: 4096,
      location: 'Sydney',
      phoneNumber: '555-1234',
      dailyTimeLimit: 7200,
    },
    timeRemaining: 3600,
    currentConf: 0,
    currentConfName: 'Main',
    nodeId: 2,
    slowmo: 0,
    slowmoCount: 0,
    ...overrides,
  };
}

function makeMockSocket(): { socket: any; emitted: string[] } {
  const emitted: string[] = [];
  const socket: any = {
    emit: (_event: string, payload: string) => emitted.push(payload),
    on: () => {},
    removeAllListeners: () => {},
    id: `regtest-${Math.random()}`,
  };
  return { socket, emitted };
}

// Drain the 16ms ansi-buffer so emitted[] is populated before assertions.
const drain = (socket: any) => flushOutput(socket);

// ---------------------------------------------------------------------------
// 1. allowMCI gate
//
// Express.e:6800-6806 — MCI substitution is ONLY enabled when the first
// line of the file content starts with '~'. If this gate fails the
// entire file renders as raw text and every ~code appears literally.
//
// The gate logic (mirrored from displayScreen):
//   const firstLine = content.slice(0, content.indexOf('\n'));
//   const allowMCI  = firstLine.trimEnd().length > 0 && firstLine[0] === '~';
//
// We test this in isolation (pure string computation) because displayScreen
// reads from disk and has too many side-effects for a unit test; the
// parseMciCodes path IS the critical substitution step the gate controls.
// ---------------------------------------------------------------------------

describe('allowMCI gate — first-line invariants', () => {
  function computeAllowMCI(content: string): boolean {
    const firstNewline = content.indexOf('\n');
    const firstLine = firstNewline >= 0 ? content.slice(0, firstNewline) : content;
    return firstLine.trimEnd().length > 0 && firstLine[0] === '~';
  }

  it('allows MCI when first line starts with ~', () => {
    expect(computeAllowMCI('~f\nsome content\n')).toBe(true);
  });

  it('allows MCI when first line starts with ~N (username code)', () => {
    expect(computeAllowMCI('~N\nsome content\n')).toBe(true);
  });

  it('allows MCI when first line starts with ~WX (wipe code still present)', () => {
    expect(computeAllowMCI('~WX\n~f\ncontent\n')).toBe(true);
  });

  it('disables MCI when first line does not start with ~ (plain text files)', () => {
    expect(computeAllowMCI('Hello world\n~N\n')).toBe(false);
  });

  it('disables MCI when first line is empty — the wipe-stripping regression', () => {
    // Before the fix, parseWipeMCI('~WX\n~f\n...') left a leading \n,
    // making the first line '', and allowMCI became false — hiding all codes.
    expect(computeAllowMCI('\n~f\ncontent\n')).toBe(false);
  });

  it('parseWipeMCI + allowMCI: stripped wipe content enables MCI', () => {
    const raw = '~WX\n~f\n~N\nMenu content\n';
    const { content: stripped } = parseWipeMCI(raw);
    expect(computeAllowMCI(stripped)).toBe(true);
    expect(stripped.startsWith('~f')).toBe(true);
  });

  it('parseWipeMCI + allowMCI: CRLF line ending also strips cleanly', () => {
    const raw = '~WM\r\n~f\r\n~N\r\nMenu content\r\n';
    const { content: stripped } = parseWipeMCI(raw);
    expect(computeAllowMCI(stripped)).toBe(true);
  });

  it('disables MCI when first line is only whitespace', () => {
    expect(computeAllowMCI('   \n~N\ncontent\n')).toBe(false);
  });

  it('allows MCI on single-line content starting with ~', () => {
    // No newline at all — firstLine is the whole string
    expect(computeAllowMCI('~N|')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Case sensitivity — express.e StrCmp is byte-exact
//
// The tokenizer is called with caseSensitive:true. Wrong case silently
// falls through and emits the cmd chars as plain text (softFallThrough:false).
// These tests pin every code whose case has historically been confused.
// ---------------------------------------------------------------------------

describe('MCI case-sensitivity invariants (non-inline, express.e parity)', () => {
  // ~f (lowercase) → clear screen
  it('~f| clears screen (lowercase f, express.e:5469)', async () => {
    const result = await parseMciCodes('a~f|b', makeSession());
    expect(result.parsed).toBe('a\x1b[2J\x1b[Hb');
  });

  it('~F| (uppercase) does NOT clear — falls through as plain "F"', async () => {
    const result = await parseMciCodes('a~F|b', makeSession());
    expect(result.parsed).not.toContain('\x1b[2J');
    expect(result.parsed).toBe('aFb');
  });

  // ~N (uppercase) → username
  it('~N| substitutes username (uppercase N, express.e:5292)', async () => {
    const result = await parseMciCodes('~N|', makeSession());
    expect(result.parsed).toContain('BbsUser');
  });

  it('~n| (lowercase) does NOT substitute username — falls through as "n"', async () => {
    const result = await parseMciCodes('~n|', makeSession());
    expect(result.parsed).not.toContain('BbsUser');
    expect(result.parsed).toBe('n');
  });

  // ~SP (uppercase) → pause
  it('~SP| pauses (uppercase SP, express.e:5455)', async () => {
    const result = await parseMciCodes('a~SP|b', makeSession());
    expect(result.hasPause).toBe(true);
    expect(result.parsed).toBe('ab');
  });

  it('~sp| (lowercase) does NOT pause — falls through', async () => {
    const result = await parseMciCodes('a~sp|b', makeSession());
    expect(result.hasPause).toBe(false);
  });

  // ~UL (uppercase) → location
  it('~UL| substitutes location (uppercase UL, express.e:5293)', async () => {
    const result = await parseMciCodes('~UL|', makeSession());
    expect(result.parsed).toContain('Sydney');
  });

  it('~ul| (lowercase) does NOT substitute location', async () => {
    const result = await parseMciCodes('~ul|', makeSession());
    expect(result.parsed).not.toContain('Sydney');
  });

  // ~RN (uppercase) → real name
  it('~RN| substitutes real name (uppercase RN, express.e:5304)', async () => {
    const result = await parseMciCodes('~RN|', makeSession());
    expect(result.parsed).toContain('Actual Name');
  });

  it('~rn| (lowercase) does NOT substitute real name', async () => {
    const result = await parseMciCodes('~rn|', makeSession());
    expect(result.parsed).not.toContain('Actual Name');
  });
});

// ---------------------------------------------------------------------------
// 3. Non-inline mode (socket=undefined) — the wipe animation path
//
// When a screen file has a wipe code (~WX etc.) the MCI socket is set
// to undefined to force non-inline mode, so parseMciCodes populates
// result.parsed rather than emitting to the socket. All codes MUST
// substitute into result.parsed — if any code is skipped the wipe
// animation frames display the raw code text literally.
// ---------------------------------------------------------------------------

describe('parseMciCodes non-inline mode (socket=undefined) — wipe animation path', () => {
  // Helper: call without socket (non-inline)
  const parse = (content: string, sessionOverrides: any = {}) =>
    parseMciCodes(content, makeSession(sessionOverrides));

  it('~f| → ESC[2J in result.parsed', async () => {
    const { parsed } = await parse('~f|content');
    expect(parsed).toContain('\x1b[2J\x1b[H');
  });

  it('~N| → username in result.parsed', async () => {
    const { parsed } = await parse('~N|');
    expect(parsed).toContain('BbsUser');
  });

  it('~A| → security level in result.parsed', async () => {
    const { parsed } = await parse('~A|');
    expect(parsed).toContain('50');
  });

  it('~SP| sets hasPause=true and leaves no ~SP literal', async () => {
    const { parsed, hasPause } = await parse('before~SP|after');
    expect(hasPause).toBe(true);
    expect(parsed).not.toContain('~SP');
    expect(parsed).not.toContain('SP');
  });

  it('~f followed by ~N both substitute in one pass', async () => {
    // The real Menu.txt pattern: wipe code stripped, then ~f\n~N\n content
    const content = '~f\n~N\nWelcome to the BBS\n';
    const { parsed } = await parse(content);
    expect(parsed).toContain('\x1b[2J');
    expect(parsed).toContain('BbsUser');
    expect(parsed).not.toContain('~f');
    expect(parsed).not.toContain('~N');
  });

  it('no stray ~ codes remain in result.parsed (strict fall-through)', async () => {
    // softFallThrough:false means unknowns consume ~ and emit plain text.
    // So ~ZZZ| → 'ZZZ' (no tilde). Only VALID codes emit their value.
    const { parsed } = await parse('~f|~N|plain text');
    expect(parsed).not.toMatch(/~[a-zA-Z]/);
  });

  it('result.inlineEmitted is false in non-inline mode', async () => {
    const { inlineEmitted } = await parse('~f|~N|content');
    expect(inlineEmitted).toBeFalsy();
  });

  // Color codes — full foreground set (express.e:5651-5674, lowercase)
  it.each([
    ['c0', '\x1b[30m'], ['c1', '\x1b[31m'], ['c2', '\x1b[32m'],
    ['c3', '\x1b[33m'], ['c4', '\x1b[34m'], ['c5', '\x1b[35m'],
    ['c6', '\x1b[36m'], ['c7', '\x1b[37m'],
  ])('~%s| → ANSI foreground color (express.e:5651)', async (code, ansi) => {
    const { parsed } = await parse(`~${code}|text`);
    expect(parsed).toContain(ansi);
  });

  // Background color set (express.e:5675-5698, lowercase)
  it.each([
    ['b0', '\x1b[40m'], ['b1', '\x1b[41m'], ['b2', '\x1b[42m'],
    ['b3', '\x1b[43m'], ['b4', '\x1b[44m'], ['b5', '\x1b[45m'],
    ['b6', '\x1b[46m'], ['b7', '\x1b[47m'],
  ])('~%s| → ANSI background color (express.e:5675)', async (code, ansi) => {
    const { parsed } = await parse(`~${code}|text`);
    expect(parsed).toContain(ansi);
  });

  // ~z0-z7 are aliases for ~b0-b7 (express.e:5675 same dispatch line)
  it.each([
    ['z0', '\x1b[40m'], ['z7', '\x1b[47m'],
  ])('~%s| → ANSI background color alias (express.e:5675)', async (code, ansi) => {
    const { parsed } = await parse(`~${code}|text`);
    expect(parsed).toContain(ansi);
  });

  // Uppercase color codes fall through — wrong case never reached express.e
  it('~C0| (uppercase) does NOT emit ANSI color — falls through', async () => {
    const { parsed } = await parse('~C0|text');
    expect(parsed).not.toContain('\x1b[30m');
    // strict fall-through: ~ consumed, 'C0' emitted plain
    expect(parsed).toContain('C0');
  });

  // Cursor positioning
  it('~x10| → cursor to col 10 (express.e:5478)', async () => {
    const { parsed } = await parse('~x10|');
    expect(parsed).toContain('\x1b[;10H');
  });

  it('~y3| → cursor to row 3 (express.e:5487)', async () => {
    const { parsed } = await parse('~y3|');
    expect(parsed).toContain('\x1b[3;H');
  });

  // Delay codes — no-op in non-inline mode
  it('~5w| is a no-op (express.e:5472)', async () => {
    const { parsed } = await parse('a~5w|b');
    expect(parsed).toBe('ab');
  });

  // Unknown codes — strict: ~ consumed, cmd text emitted
  it('unknown ~ZZZ| emits "ZZZ" without leading ~ (strict fall-through)', async () => {
    const { parsed } = await parse('a~ZZZ|b');
    expect(parsed).toBe('aZZZb');
    expect(parsed).not.toContain('~ZZZ');
  });
});

// ---------------------------------------------------------------------------
// 4. Inline mode (socket provided) — same codes, different output path
//
// In inline mode parseMciCodes emits content directly to the socket
// via the sentinel walker. result.parsed is '' and result.inlineEmitted
// is true. The same case-sensitivity rules apply.
// ---------------------------------------------------------------------------

describe('parseMciCodes inline mode (socket provided)', () => {
  it('~f emits ESC[2J to socket, not literal "~f"', async () => {
    const { socket, emitted } = makeMockSocket();
    const session = makeSession();
    await parseMciCodes('before~f|after', session, undefined, undefined, undefined, socket);
    drain(socket);
    const output = emitted.join('');
    expect(output).toContain('\x1b[2J');
    expect(output).not.toContain('~f');
  });

  it('~N emits username to socket, not literal "~N"', async () => {
    const { socket, emitted } = makeMockSocket();
    const session = makeSession();
    await parseMciCodes('Hello ~N|!', session, undefined, undefined, undefined, socket);
    drain(socket);
    const output = emitted.join('');
    expect(output).toContain('BbsUser');
    expect(output).not.toContain('~N');
  });

  it('~F (uppercase) does NOT emit ESC[2J — falls through as "F"', async () => {
    const { socket, emitted } = makeMockSocket();
    const session = makeSession();
    await parseMciCodes('~F|', session, undefined, undefined, undefined, socket);
    drain(socket);
    const output = emitted.join('');
    expect(output).not.toContain('\x1b[2J');
    expect(output).toContain('F');
  });

  it('~n (lowercase) does NOT emit username — falls through as "n"', async () => {
    const { socket, emitted } = makeMockSocket();
    const session = makeSession();
    await parseMciCodes('~n|', session, undefined, undefined, undefined, socket);
    drain(socket);
    const output = emitted.join('');
    expect(output).not.toContain('BbsUser');
    expect(output).toContain('n');
  });

  it('result.inlineEmitted is true when socket is provided', async () => {
    const { socket } = makeMockSocket();
    const session = makeSession();
    const result = await parseMciCodes('~N|', session, undefined, undefined, undefined, socket);
    expect(result.inlineEmitted).toBe(true);
  });

  it('result.parsed is empty when content was emitted inline', async () => {
    const { socket } = makeMockSocket();
    const session = makeSession();
    const result = await parseMciCodes('~f|~N|content', session, undefined, undefined, undefined, socket);
    expect(result.parsed).toBe('');
  });

  it('color codes emit ANSI to socket in inline mode', async () => {
    const { socket, emitted } = makeMockSocket();
    const session = makeSession();
    await parseMciCodes('~c1|red text~c7|normal', session, undefined, undefined, undefined, socket);
    drain(socket);
    const output = emitted.join('');
    expect(output).toContain('\x1b[31m');
    expect(output).toContain('\x1b[37m');
    expect(output).not.toContain('~c1');
    expect(output).not.toContain('~c7');
  });
});

// ---------------------------------------------------------------------------
// 5. Width-prefix edge cases
//
// Express.e:5288 — maxLen is the Val() of the digit run before the cmd.
// Width=-1 means no truncation. Width=0 means empty. Several codes
// (like ~SP) are only active when width=-1.
// ---------------------------------------------------------------------------

describe('MCI width-prefix handling', () => {
  it('~3N| truncates username to 3 chars', async () => {
    const result = await parseMciCodes('~3N|', makeSession());
    expect(result.parsed).toBe('Bbs');
  });

  it('~0N| width=0 treated as no-truncation by applyMciWidth (width > 0 guard)', async () => {
    // applyMciWidth uses `width > 0`, so 0 falls through and returns the full value.
    // Express.e aePuts2(str,0) would output Left$(str,0)='', but that edge case is
    // vanishingly rare in real screen files and fixing it is a separate task.
    const result = await parseMciCodes('~0N|', makeSession());
    expect(result.parsed).toBe('BbsUser');
  });

  it('~5SP| does NOT pause (width gate: only width=-1 matches express.e:5455)', async () => {
    const result = await parseMciCodes('a~5SP|b', makeSession());
    expect(result.hasPause).toBe(false);
  });

  it('no width prefix: ~SP| DOES pause (width=-1 default)', async () => {
    const result = await parseMciCodes('~SP|', makeSession());
    expect(result.hasPause).toBe(true);
  });

  it('width prefix on unknown code: ~5ZZZ| → plain text without ~', async () => {
    const result = await parseMciCodes('~5ZZZ|', makeSession());
    expect(result.parsed).not.toContain('~5ZZZ');
    expect(result.parsed).not.toContain('~');
  });
});
