/**
 * Task TP-5 of `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`:
 * ONE WIRE ENCODER, AND THE CHARSET A PAYLOAD CAME FROM.
 *
 * THE MOCK-WRITE TRAP. The emitter suites in this repo inject a fake
 * `connection.write` that does `Buffer.from(data, 'latin1')`
 * (`tests/server/eighty-col-choke-identity.test.ts`). That fake ALREADY
 * produces the bytes this task is supposed to produce, so an encoding test
 * written on that idiom is GREEN on arrival and proves nothing: the defect was
 * one layer lower, in `TelnetConnection.write`'s `Buffer.from(data)` (no
 * encoding argument, i.e. UTF-8).
 *
 * So every byte assertion here drives a REAL `TelnetConnection` over a stub
 * `net.Socket` and reads the bytes the SOCKET received. The ban is enforced
 * twice: against this file's own source (widened from TP-1's `/write:\s*\(/`
 * to `/\bwrite\s*[:(]/` per the TP-1 review, with the stub `net.Socket` class
 * the one allowed home for the identifier), and at RUNTIME, by asserting the
 * object handed to `buildConnectionEmitter` is a real `TelnetConnection` whose
 * `write` is still the prototype's.
 *
 * Fixtures are BYTE ARRAYS BUILT IN CODE, never files written by the Write
 * tool: a UTF-8 round trip destroys every high-bit byte (RULES.md).
 *
 * `src/index.ts` is mocked away - it runs a top-level IIFE that starts the
 * HTTP/telnet/SSH servers on module load.
 */
process.env.SKIP_DB_INIT = '1';

import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';

const iconv = require('iconv-lite');

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return {
    BBSState: states.BBSState,
    LoggedOnSubState: states.LoggedOnSubState,
    LOCALHOST_IPS: [],
    initializeSecurity: jest.fn(),
    setSecurityDependencies: jest.fn(),
    setMessageCommandsDependencies: jest.fn(),
    setDisplayFileCommandsDependencies: jest.fn(),
    setPreferenceChatCommandsDependencies: jest.fn(),
    setSystemCommandsDependencies: jest.fn(),
    setNavigationCommandsDependencies: jest.fn(),
    setAdvancedCommandsDependencies: jest.fn(),
    setInfoCommandsDependencies: jest.fn(),
    setUtilityCommandsDependencies: jest.fn(),
    setMessageEntryDependencies: jest.fn(),
    setSysopCommandsDependencies: jest.fn(),
    setTransferMiscDependencies: jest.fn(),
    setMessagingDependencies: jest.fn(),
    setDatabaseDependencies: jest.fn(),
    setCommandHandlerDependencies: jest.fn(),
    setConfigDependencies: jest.fn(),
    setDoorDependencies: jest.fn(),
    setNodeServices: jest.fn(),
    setServiceDependencies: jest.fn(),
    setChatDependencies: jest.fn(),
    setAmigaExports: jest.fn(),
    setServerState: jest.fn(),
    setAmigaDoorDependencies: jest.fn(),
    setUserServices: jest.fn(),
    setWebhookDependencies: jest.fn(),
    setBulletinDependencies: jest.fn(),
    setFileMaintenanceDependencies: jest.fn(),
    setUserCommandsDependencies: jest.fn(),
    setMessageHandlersDependencies: jest.fn(),
    setSessionManager: jest.fn(),
    setConferences: jest.fn(),
    setMessageBases: jest.fn(),
    setFileAreas: jest.fn(),
    setDoors: jest.fn(),
    setProcessOlmMessageQueue: jest.fn(),
    setCheckSecurity: jest.fn(),
    setSetEnvStat: jest.fn(),
    setGetRecentCallerActivity: jest.fn(),
  };
});
jest.mock('../../src/amiga-emulation/loader/LibraryLoader', () => ({ LibraryLoader: jest.fn() }));
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({ AmigaDoorSession: jest.fn() }));

/**
 * `emitText` is counted through a delegating module mock, not a spy:
 * `jest.spyOn` on this export throws `Cannot redefine property` because
 * ts-jest compiles it to a getter-only property (TP-3's recorded D20). The
 * mock forwards to the real implementation, so behaviour is unchanged and only
 * the CALL COUNT is added - which is the sentinel the rule needs.
 */
jest.mock('../../src/utils/output.util', () => {
  const actual = jest.requireActual('../../src/utils/output.util');
  return { ...actual, emitText: jest.fn(actual.emitText) };
});

import { TelnetConnection, classifyTerminalType } from '../../src/server/telnet-server';
import { WSTerminalConnection } from '../../src/server/ws-terminal-server';
import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { displayScreen } from '../../src/handlers/screen.handler';
import { flushAllBuffers } from '../../src/utils/ansi-buffer.util';
import {
  encodeForWire,
  resolveWireCharset,
  substituteUnmappable,
  DEFAULT_WIRE_CHARSET,
  type WireCharset,
} from '../../src/utils/wire-encoding.util';
import { PRE_PACED, fromCharset, pacedFromCharset } from '../../src/utils/output-pacing';
import { readAmigaTextFile } from '../../src/utils/amiga-text-decode.util';
import * as outputUtil from '../../src/utils/output.util';
import type { BBSSession } from '../../src/index';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const BBSTITLE = path.join(REPO_ROOT, 'Screens', 'BBSTITLE.txt');

const tempDirs: string[] = [];

/**
 * The stub `net.Socket` every byte case is driven over - the ONE place the
 * identifier `write` may be defined in this file. Only the members
 * `TelnetConnection`'s constructor and write path touch.
 */
class StubNetSocket extends EventEmitter {
  public remoteAddress = '127.0.0.1';
  public written: Buffer[] = [];
  public ended = 0;

  write(data: Buffer | string): boolean {
    // latin1 here is the STUB's own record of a string the socket was handed;
    // it is not the production encode, which happens above this line.
    this.written.push(typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data));
    return true;
  }

  end(): void {
    this.ended += 1;
  }

  /** Bytes written since `from`, concatenated. */
  since(from: number): Buffer {
    return Buffer.concat(this.written.slice(from));
  }
}

function telnetSession(nodeId: number, overrides: Partial<BBSSession> = {}): BBSSession {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.DISPLAY_MENU,
    user: { id: nodeId, username: `TELNET${nodeId}`, secLevel: 100 },
    nodeId,
    currentConf: 1,
    conferenceId: 1,
    currentMsgBase: 1,
    timeRemaining: 3600,
    lastActivity: Date.now(),
    confRJoin: 1,
    msgBaseRJoin: 1,
    commandBuffer: '',
    menuPause: false,
    inputBuffer: '',
    relConfNum: 1,
    currentConfName: 'Main',
    cmdShortcuts: false,
    doorExpertMode: false,
    connectionType: 'telnet',
    terminalType: 'ansi',
    ansiEnabled: true,
    petsciiMode: false,
    screenWidth: 80,
    screenHeight: 24,
    tempData: {},
    ...overrides,
  } as unknown as BBSSession;
}

/** A real TelnetConnection over a stub socket, plus the real emitter. */
function realTelnetCaller(nodeId: number, sessionOverrides: Partial<BBSSession> = {}) {
  const socket = new StubNetSocket();
  const connection = new TelnetConnection(socket as unknown as import('net').Socket);
  const session = telnetSession(nodeId, sessionOverrides);
  connection.session = session;
  const emitter = buildConnectionEmitter(connection);
  // initializeTelnet() wrote its negotiation commands in the constructor;
  // everything a case asserts on starts after this mark.
  const preamble = socket.written.length;
  return { socket, connection, session, emitter, preamble };
}

/**
 * A CP437 art fixture, as BYTES. Double-line box with two shades inside:
 *   0xC9 0xCD 0xBB = the top corners and rule, 0xBA = the sides,
 *   0xB0 = light shade, 0xB2 = dark shade, 0xC8 0xBC = the bottom corners.
 * Every byte is CP437-only art: not one of them is a Latin-1 letter, so a
 * Latin-1 caller MUST get the ASCII fallback and a CP437 caller MUST get these
 * exact bytes back.
 */
const CP437_ART = Buffer.from([
  0xc9, 0xcd, 0xcd, 0xcd, 0xbb, 0x0d, 0x0a,
  0xba, 0xb0, 0xb2, 0xb0, 0xba, 0x0d, 0x0a,
  0xc8, 0xcd, 0xcd, 0xcd, 0xbc,
]);

const TELNET_IAC = 255;
const TELNET_SB = 250;
const TELNET_SE = 240;
const TELOPT_CHARSET = 42;
const TELOPT_TTYPE = 24;
const CHARSET_REQUEST = 1;
const CHARSET_ACCEPTED = 2;

function charsetRequest(names: string[]): Buffer {
  const bytes = [TELNET_IAC, TELNET_SB, TELOPT_CHARSET, CHARSET_REQUEST];
  const body = ';' + names.join(';');
  for (let i = 0; i < body.length; i++) bytes.push(body.charCodeAt(i));
  bytes.push(TELNET_IAC, TELNET_SE);
  return Buffer.from(bytes);
}

function ttypeIs(name: string): Buffer {
  const bytes = [TELNET_IAC, TELNET_SB, TELOPT_TTYPE, 0];
  for (let i = 0; i < name.length; i++) bytes.push(name.charCodeAt(i));
  bytes.push(TELNET_IAC, TELNET_SE);
  return Buffer.from(bytes);
}

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  tempDirs.length = 0;
});

describe('TP-5 - the wire encoder, and the charset a payload came from', () => {
  it('this suite never fakes the write that carries the bytes', () => {
    // The self-enforcing half of the mock-write ban, WIDENED from TP-1's
    // `/write:\s*\(/` (which missed `write: function`, `write(data) {` and
    // `write : (`) to `/\bwrite\s*[:(]/`, per the TP-1 review's carry-over.
    // Two forms are allowed and nothing else: the stub `net.Socket` class's
    // own method - the real sink, one layer BELOW the code under test - and a
    // member CALL on an object (`socket.write(...)`).
    const lines = String(readFileSync(__filename)).split('\n');
    const stubStart = lines.findIndex((l) => l.includes('class StubNetSocket'));
    const stubEnd = lines.findIndex((l, i) => i > stubStart && l === '}');
    expect(stubStart).toBeGreaterThan(-1);
    expect(stubEnd).toBeGreaterThan(stubStart);

    const offenders: string[] = [];
    lines.forEach((line, i) => {
      // A fresh literal per call: a module-level /g RegExp carries `lastIndex`
      // across calls and would skip matches (feedback_async_recursive_regex).
      if (!/\bwrite\s*[:(]/.test(line)) return;
      if (i >= stubStart && i <= stubEnd) return;
      if (/\.write\s*\(/.test(line)) return;
      if (line.trim().startsWith('*') || line.trim().startsWith('//')) return;
      offenders.push(`${i + 1}: ${line.trim()}`);
    });
    expect(offenders).toEqual([]);
  });

  it('the sink under every byte case is a real TelnetConnection, not a stubbed write', () => {
    const { connection, socket } = realTelnetCaller(60);
    // RUNTIME half of the ban: the object the emitter writes through is the
    // real class, and its `write` is still the prototype's - so the encode
    // under test is the production one and not a test double.
    expect(connection).toBeInstanceOf(TelnetConnection);
    expect(connection.write).toBe(TelnetConnection.prototype.write);
    expect(socket).toBeInstanceOf(StubNetSocket);
    // Non-vacuous: the constructor's negotiation really reached the socket.
    expect(socket.written.length).toBeGreaterThan(0);
  });

  it("a screen's high bytes reach a classic client unchanged", () => {
    // The bytes an Amiga screen file actually holds: 0xB7 (the middot
    // BBSTITLE carries 240 of), 0xBD, 0xE9.
    const original = Buffer.from([0x41, 0xb7, 0xbd, 0xe9, 0x42]);
    // Decoded exactly the way readAmigaTextFile decodes a non-.ans screen.
    const text: string = iconv.decode(original, 'iso-8859-1');

    const { socket, emitter, preamble } = realTelnetCaller(61);
    emitter.emit('ansi-output', text, fromCharset('iso-8859-1'));

    expect(Buffer.compare(socket.since(preamble), original)).toBe(0);
    // And the UTF-8 form, which is what the wire carried before TP-5, is NOT
    // what arrived - the assertion above would also pass on a 1-byte payload.
    expect(socket.since(preamble).length).toBe(5);
    expect(Buffer.from(text, 'utf-8').length).toBe(8);
  });

  it('BBSTITLE is 13894 bytes on the wire, not 14134', () => {
    if (!fs.existsSync(BBSTITLE)) {
      // Never a silent skip: say which file is missing and why the pin cannot
      // be measured in this checkout.
      throw new Error(
        `The controller's pin needs the real screen: ${BBSTITLE} is absent from this checkout.`,
      );
    }
    const fileBytes = fs.readFileSync(BBSTITLE);
    const decoded = readAmigaTextFile(BBSTITLE);
    expect(decoded.encoding).toBe('iso-8859-1');

    const { socket, emitter, preamble } = realTelnetCaller(62);
    emitter.emit('ansi-output', decoded.text, fromCharset(decoded.encoding as 'iso-8859-1'));
    const wire = socket.since(preamble);

    // The emitter normalises bare LF to CRLF before the encode, as it always
    // has; the file has 68 bare LFs and no CR at all. Undo exactly that and
    // the file's own 13894 bytes must come back, byte for byte.
    const restored = Buffer.from(wire.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
    expect(restored.length).toBe(13894);
    expect(Buffer.compare(restored, fileBytes)).toBe(0);

    // The number the controller pinned this against: UTF-8 doubles all 240
    // high bytes, and 14134 is what left this board before TP-5.
    expect(Buffer.from(decoded.text, 'utf-8').length).toBe(14134);
    expect(restored.length).not.toBe(14134);
    let high = 0;
    for (const b of restored) if (b >= 0x80) high += 1;
    expect(high).toBe(240);
  });

  it('a .ans reaches a CP437 caller as the bytes the file holds', () => {
    const text: string = iconv.decode(CP437_ART, 'cp437');
    const { socket, emitter, preamble } = realTelnetCaller(63, {
      wireCharset: 'cp437',
    } as Partial<BBSSession>);

    emitter.emit('ansi-output', text, fromCharset('cp437'));

    expect(Buffer.compare(socket.since(preamble), CP437_ART)).toBe(0);
  });

  it('a .ans reaches an Amiga caller as ASCII line art', () => {
    const text: string = iconv.decode(CP437_ART, 'cp437');
    const { socket, emitter, preamble } = realTelnetCaller(64);
    // No wireCharset, no unicodeCapable: the default, which is Latin-1.
    emitter.emit('ansi-output', text, fromCharset('cp437'));

    const wire = socket.since(preamble).toString('latin1');
    expect(wire).toContain('+---+');
    expect(wire).toContain('|');
    // The three shades keep their relative weight; none of them is a '?'.
    expect(wire).not.toContain('?');
    expect(socket.since(preamble).indexOf(0x3f)).toBe(-1);
    // And nothing high-bit survived: a Latin-1 terminal would have drawn
    // fraction glyphs and letters where the art was.
    for (const b of socket.since(preamble)) expect(b).toBeLessThan(0x80);
  });

  it('a UTF-8 client still gets UTF-8', () => {
    const spy = jest.spyOn(TelnetConnection.prototype, 'write');
    try {
      const { socket, emitter, preamble } = realTelnetCaller(65, {
        unicodeCapable: true,
      } as Partial<BBSSession>);
      const before = spy.mock.calls.length;

      emitter.emit('ansi-output', 'A·B');

      expect(socket.since(preamble).toString('hex')).toBe('41c2b742');
      // The STRING arm of TelnetConnection.write ran - today's behaviour,
      // unchanged, and the reason `encodeForWire` returns a union.
      const payload = spy.mock.calls[before][0];
      expect(typeof payload).toBe('string');
    } finally {
      spy.mockRestore();
    }
  });

  it('the wire charset comes from the one terminal predicate', () => {
    // Table-driven over `classifyTerminalType` itself - there is no second
    // list of terminal names anywhere for this to disagree with.
    const table: Array<[string, WireCharset]> = [
      ['XTERM-256COLOR', 'utf-8'],
      ['PUTTY', 'utf-8'],
      ['SYNCTERM', 'iso-8859-1'],
      ['NCOMM', 'iso-8859-1'],
      ['TERM', 'iso-8859-1'],
      ['VT52', 'iso-8859-1'],
      ['UNKNOWN', 'iso-8859-1'],
      ['C64', 'iso-8859-1'],
    ];
    for (const [terminal, expected] of table) {
      const { unicodeCapable } = classifyTerminalType(terminal);
      const session = telnetSession(66, { unicodeCapable } as Partial<BBSSession>);
      expect([terminal, resolveWireCharset(session)]).toEqual([terminal, expected]);
    }
    // The precedence the module documents, asserted rather than assumed.
    expect(resolveWireCharset(telnetSession(66, { connectionType: 'web' } as Partial<BBSSession>))).toBe('utf-8');
    expect(resolveWireCharset(telnetSession(66))).toBe(DEFAULT_WIRE_CHARSET);
    expect(resolveWireCharset(null)).toBe(DEFAULT_WIRE_CHARSET);
    expect(
      resolveWireCharset(
        telnetSession(66, { unicodeCapable: true, wireCharset: 'cp437' } as Partial<BBSSession>),
      ),
    ).toBe('cp437');
  });

  it('a CHARSET negotiation beats the TTYPE classification', () => {
    const { socket, connection, session, emitter } = realTelnetCaller(67);
    // The applier the live server uses, in one line: TTYPE says XTERM, which
    // classifies as unicode-capable.
    connection.on('terminal-type', (info: { unicodeCapable: boolean }) => {
      session.unicodeCapable = info.unicodeCapable;
    });
    socket.emit('data', ttypeIs('XTERM'));
    expect(session.unicodeCapable).toBe(true);
    expect(resolveWireCharset(session)).toBe('utf-8');

    // Now the client negotiates RFC 2066 and names a charset it can read.
    const beforeReply = socket.written.length;
    socket.emit('data', charsetRequest(['SOMETHING-ELSE', 'IBM437']));

    const reply = socket.since(beforeReply);
    expect(reply[0]).toBe(TELNET_IAC);
    expect(reply[1]).toBe(TELNET_SB);
    expect(reply[2]).toBe(TELOPT_CHARSET);
    expect(reply[3]).toBe(CHARSET_ACCEPTED);
    expect(reply.slice(4, reply.length - 2).toString('ascii')).toBe('IBM437');

    expect(connection.wireCharset).toBe('cp437');
    expect(session.wireCharset).toBe('cp437');
    expect(resolveWireCharset(session)).toBe('cp437');

    // And the wire follows: the same .ans art now arrives as the file's bytes.
    const preamble = socket.written.length;
    emitter.emit('ansi-output', iconv.decode(CP437_ART, 'cp437'), fromCharset('cp437'));
    expect(Buffer.compare(socket.since(preamble), CP437_ART)).toBe(0);
  });

  it('a charset nobody here speaks is REJECTED, never silently ignored', () => {
    const { socket, connection } = realTelnetCaller(68);
    const before = socket.written.length;
    socket.emit('data', charsetRequest(['EBCDIC-CP-US']));
    const reply = socket.since(before);
    expect([...reply]).toEqual([TELNET_IAC, TELNET_SB, TELOPT_CHARSET, 3, TELNET_IAC, TELNET_SE]);
    expect(connection.wireCharset).toBeUndefined();
  });

  it('a /ws/terminal client still gets text frames', () => {
    const frames: Array<{ payload: string | Buffer; opts?: { binary?: boolean } }> = [];
    const ws = {
      readyState: 1,
      OPEN: 1,
      send: (payload: string | Buffer, opts?: { binary?: boolean }) => {
        frames.push({ payload, opts });
      },
      close: () => undefined,
      on: () => undefined,
    };
    const conn = new WSTerminalConnection(ws as never, '127.0.0.1');
    const session = telnetSession(69, { wireCharset: 'utf-8' } as Partial<BBSSession>);
    conn.session = session;
    const emitter = buildConnectionEmitter(conn as never);

    emitter.emit('ansi-output', 'A·B');

    expect(frames).toHaveLength(1);
    expect(typeof frames[0].payload).toBe('string');
    expect(frames[0].opts?.binary).toBeFalsy();
    // A WebSocket TEXT frame is UTF-8 by RFC 6455, so the high character
    // must NOT have been pre-encoded to a single Latin-1 byte.
    expect(frames[0].payload).toBe('A·B');
  });

  it('screen content never goes through the buffer', async () => {
    // The rule the whole carrier depends on: `emitText` / `emitPrompt` wrap
    // the AnsiBuffer, which CONCATENATES payloads, so a per-payload attribute
    // could not survive them. Pinned, not assumed.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-encoding-'));
    tempDirs.push(dir);
    const file = path.join(dir, 'ART.ans');
    fs.writeFileSync(file, CP437_ART);

    const { socket, emitter, session, preamble } = realTelnetCaller(70, {
      wireCharset: 'cp437',
    } as Partial<BBSSession>);
    const emitTextMock = outputUtil.emitText as unknown as jest.Mock;
    emitTextMock.mockClear();
    try {
      expect(await displayScreen(emitter, session, file)).toBe(true);
      flushAllBuffers();

      expect(emitTextMock).toHaveBeenCalledTimes(0);

      // R2b (the reachability row): the SOURCE CHARSET reached the wire
      // through the real screen handler, not through a hand-made emit. The
      // file's own CP437 bytes are on the socket - a value only the
      // source-charset path can produce, because a transcode would have
      // written '+---+' instead.
      const wire = socket.since(preamble);
      expect(wire.indexOf(CP437_ART)).toBeGreaterThan(-1);
      expect(wire.toString('latin1')).not.toContain('+---+');
      // Not "no 0x3F anywhere": displayScreen's own frame wraps the art in
      // `\x1b[?25l` / `\x1b[?25h`, whose '?' is 0x3F. The claim is about the
      // ART, and the exact-bytes assertion above is what carries it.
    } finally {
      emitTextMock.mockClear();
    }
  });

  it('the web path is byte-identical: the encoder hands back the same string', () => {
    const web = telnetSession(71, { connectionType: 'web' } as Partial<BBSSession>);
    const text = 'A·B─C';
    // toBe, not toEqual: the SAME instance, so nothing was re-encoded or
    // re-allocated on the way through. The 80-column walk itself is pinned by
    // tests/server/eighty-col-choke-identity.test.ts, which passes unedited.
    expect(encodeForWire(web, text)).toBe(text);
    expect(encodeForWire(web, text, fromCharset('cp437'))).toBe(text);
    // And a UTF-8 telnet caller is the same no-op.
    const utf8Telnet = telnetSession(71, { unicodeCapable: true } as Partial<BBSSession>);
    expect(encodeForWire(utf8Telnet, text)).toBe(text);
  });

  it('PRE_PACED still rides through, and now carries the charset too', () => {
    // The client contract is `meta?.prePaced === true` and it is unchanged.
    expect(PRE_PACED).toEqual({ prePaced: true });
    expect(pacedFromCharset('iso-8859-1')).toEqual({ prePaced: true, sourceCharset: 'iso-8859-1' });
    // Frozen, memoised singletons: a per-frame emit allocates nothing.
    expect(pacedFromCharset('cp437')).toBe(pacedFromCharset('cp437'));
    expect(fromCharset('cp437')).toBe(fromCharset('cp437'));
    expect(Object.isFrozen(fromCharset('cp437'))).toBe(true);

    // A wipe frame on the wire: paced AND from a known charset.
    const { socket, emitter, preamble } = realTelnetCaller(72, {
      wireCharset: 'cp437',
    } as Partial<BBSSession>);
    emitter.emit('ansi-output', iconv.decode(CP437_ART, 'cp437'), pacedFromCharset('cp437'));
    expect(Buffer.compare(socket.since(preamble), CP437_ART)).toBe(0);
  });

  it('substituteUnmappable scans code points and leaves an encodable string alone', () => {
    // The instance identity IS the "no allocation" claim for the common case.
    const ascii = 'Command: ';
    expect(substituteUnmappable(ascii, 'iso-8859-1')).toBe(ascii);
    const latin = 'café ·';
    expect(substituteUnmappable(latin, 'iso-8859-1')).toBe(latin);
    // CP437 holds box drawing, so nothing is substituted for a CP437 caller.
    const box = '╔═╗';
    expect(substituteUnmappable(box, 'cp437')).toBe(box);
    expect(substituteUnmappable(box, 'iso-8859-1')).toBe('+-+');
    // Shades: light, medium, dark.
    expect(substituteUnmappable('░▒▓', 'iso-8859-1')).toBe(' :#');
    // A character with no substitution is left for iconv to mark, not dropped.
    expect(encodeForWire(telnetSession(73), 'Ł')).toEqual(Buffer.from([0x3f]));
    // Called twice in a row, the scan gives the same answer - the state bug a
    // module-level /g RegExp with .test() would have introduced.
    expect(substituteUnmappable(box, 'iso-8859-1')).toBe('+-+');
    expect(substituteUnmappable(box, 'iso-8859-1')).toBe('+-+');
  });
});
