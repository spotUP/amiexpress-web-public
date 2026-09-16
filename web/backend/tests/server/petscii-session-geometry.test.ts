/**
 * Regression: a PETSCII session keeps its 40x25 geometry when the client
 * reports a size.
 *
 * The bug: `terminal-size` (socket-handlers.ts) and telnet NAWS
 * (index.ts) both wrote `session.screenWidth` unconditionally. The web
 * frontend emits terminal-size {80,25} the moment a door asks for
 * terminal-mode 'fixed', and a C64 telnet client can announce 80 columns
 * over NAWS. Either one landing on a PETSCII session put the two halves of
 * the 40-column story in permanent disagreement: wrapForSession saw
 * `width >= 80` and returned identity, while doorScreenWidth() still
 * answered 40 - so prose ran off the right edge of a 40-column screen.
 *
 * Fix: applyClientReportedGeometry (amiga-emulation/xim/screen-width.util)
 * is the one gate both writes go through.
 *
 * src/index.ts is mocked away: socket-handlers.ts imports the BBSSession
 * type from it, and the real module boots a server on import.
 */
jest.mock('../../src/index', () => ({}));

import {
  applyClientReportedGeometry,
  applyTerminalTypeReport,
  applyWindowSizeReport,
} from '../../src/amiga-emulation/xim/screen-width.util';
import { wrapForSession } from '../../src/utils/wrap-for-session.util';
import { doorScreenWidth } from '../../src/amiga-emulation/xim/screen-width.util';
import { emitText } from '../../src/utils/ansi-buffer.util';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

type Handlers = Record<string, (...args: any[]) => void>;

function makeSocket(id: string) {
  const handlers: Handlers = {};
  const emitted: string[] = [];
  const socket: any = {
    id,
    handshake: { address: '127.0.0.1' },
    emitted,
    handlers,
    on(event: string, cb: (...args: any[]) => void) { handlers[event] = cb; return socket; },
    onAny() { return socket; },
    emit(event: string, data: any) { if (event === 'ansi-output') emitted.push(data); return true; },
    join() { return socket; },
    removeAllListeners() { return socket; },
  };
  return socket;
}

function register(socket: any, session: any) {
  // setSession refuses a session without a nodeId (and getSession would then
  // hand the handler `undefined`, making every assertion below vacuous).
  // require() after jest.mock so the module graph sees the stubbed index.
  const { setSession, deleteSession } = require('../../src/server/session-manager');
  const { registerSocketHandlers } = require('../../src/server/socket-handlers');
  setSession(socket.id, session);
  const io: any = { sockets: { sockets: new Map() }, emit() { return true; }, to() { return { emit() { return true; } }; } };
  registerSocketHandlers(io, socket);
  return () => deleteSession(socket.id);
}

describe('terminal-size never clobbers a PETSCII session (socket-handlers.ts)', () => {
  it('keeps 40x25 when the frontend reports 80x25 for a fixed-mode door', () => {
    const socket = makeSocket('petscii-geom-1');
    const session: any = { nodeId: 91, socketId: socket.id, petsciiMode: true, screenWidth: 40, screenHeight: 25 };
    const cleanup = register(socket, session);
    try {
      expect(require('../../src/server/session-manager').getSession(socket.id)).toBe(session); // the handler really sees it
      socket.handlers['terminal-size']({ cols: 80, rows: 25 });
      expect({ w: session.screenWidth, h: session.screenHeight }).toEqual({ w: 40, h: 25 });
      // ...and the door-side answer never disagrees with the wrap-side one.
      expect(doorScreenWidth(session)).toBe(40);
    } finally { cleanup(); }
  });

  it('still wraps prose at 40 through the real emitText path after the client reports 80', () => {
    const socket = makeSocket('petscii-geom-2');
    const session: any = { nodeId: 92, socketId: socket.id, petsciiMode: true, screenWidth: 40, screenHeight: 25 };
    const cleanup = register(socket, session);
    try {
      socket.handlers['terminal-size']({ cols: 80, rows: 25 });
      socket.emitted.length = 0;
      socket.session = session;
      emitText(socket, 'wrap this sixty character prose line right here now\r\n', true);
      const lines = socket.emitted.join('').split('\r\n');
      expect(lines.length).toBeGreaterThan(1); // it really did wrap
      for (const line of lines) {
        expect(line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length).toBeLessThanOrEqual(40);
      }
    } finally { cleanup(); }
  });

  it('takes the reported size for an ANSI session (80-column output is never degraded)', () => {
    const socket = makeSocket('petscii-geom-3');
    const session: any = { nodeId: 93, socketId: socket.id, petsciiMode: false, screenWidth: 80, screenHeight: 25 };
    const cleanup = register(socket, session);
    try {
      socket.handlers['terminal-size']({ cols: 132, rows: 50 });
      expect({ w: session.screenWidth, h: session.screenHeight }).toEqual({ w: 132, h: 50 });
    } finally { cleanup(); }
  });
});

describe('applyClientReportedGeometry (the shared gate, also used by telnet NAWS)', () => {
  it('refuses a C64 client that announces 80 columns over NAWS', () => {
    const session: any = { petsciiMode: true, screenWidth: 40, screenHeight: 25 };
    expect(applyClientReportedGeometry(session, 80, 25)).toBe(false);
    expect({ w: session.screenWidth, h: session.screenHeight }).toEqual({ w: 40, h: 25 });
  });

  it('accepts and writes the size for every non-PETSCII session', () => {
    const session: any = { petsciiMode: false, screenWidth: 80, screenHeight: 24 };
    expect(applyClientReportedGeometry(session, 100, 40)).toBe(true);
    expect({ w: session.screenWidth, h: session.screenHeight }).toEqual({ w: 100, h: 40 });
    const undetected: any = {};
    expect(applyClientReportedGeometry(undetected, 132, 50)).toBe(true);
    expect(undetected.screenWidth).toBe(132);
  });

  it('is inert without a session', () => {
    expect(applyClientReportedGeometry(undefined, 80, 25)).toBe(false);
    expect(applyClientReportedGeometry(null, 80, 25)).toBe(false);
  });

  /**
   * The wire width is the terminal's real size, and it is recorded even when
   * the geometry itself is refused, because the wire fold needs it after the
   * graphics prompt has reset screenWidth to the board's 80-column model.
   * Measured 2026-09-07: a telnet caller reported 200, answered A, and the
   * title emitted at screenWidth 80 - the fold read 80 and never fired.
   */
  it('records the terminal width for the fold, even for a PETSCII session it refuses', () => {
    const c64: any = { petsciiMode: true, screenWidth: 40, screenHeight: 25 };
    expect(applyClientReportedGeometry(c64, 200, 66)).toBe(false);
    expect({ model: c64.screenWidth, wire: c64.wireWidth }).toEqual({ model: 40, wire: 200 });
  });

  it('records the terminal width beside the model for a modern session', () => {
    const session: any = { petsciiMode: false, screenWidth: 80, screenHeight: 24 };
    applyClientReportedGeometry(session, 200, 66);
    expect({ model: session.screenWidth, wire: session.wireWidth }).toEqual({ model: 200, wire: 200 });
  });
});

/**
 * The two index.ts listeners, DRIVEN (whole-run review, I13).
 *
 * They used to be asserted by regex over index.ts's text, justified because
 * the module boots a server on import. A source pin proves a call exists, not
 * that it works - so the bodies were extracted into screen-width.util.ts
 * (where applyClientReportedGeometry already lives) and index.ts calls them.
 * These are the real drives; the source pins below now only keep index.ts
 * delegating rather than growing a second unguarded write.
 */
describe('applyTerminalTypeReport (index.ts TTYPE listener body)', () => {
  it('a C64 TTYPE answer makes a PETSCII session and takes NO reported geometry', () => {
    const session: any = { screenWidth: 80, screenHeight: 24 };
    expect(applyTerminalTypeReport(session, { terminalType: 'c64', isC64: true, width: 80, height: 25 })).toBe(false);
    expect(session.petsciiMode).toBe(true);
    expect(session.terminalType).toBe('c64');
    // The listener does NOT stamp 40 - and this is exactly the window I1
    // closed: every reader gets the width from doorScreenWidth() instead.
    expect(session.screenWidth).toBe(80);
    expect(doorScreenWidth(session, 80)).toBe(40);
  });

  it('the session it produces is wrapped at 40 by the prose choke, stale 80 and all', () => {
    const session: any = { screenWidth: 80, screenHeight: 24 };
    applyTerminalTypeReport(session, { terminalType: 'c64', isC64: true, width: 80, height: 25 });
    const prose = 'word '.repeat(30).trim();
    const out = wrapForSession(prose, session);
    expect(out).not.toBe(prose);
    for (const row of out.split('\r\n')) expect(row.length).toBeLessThanOrEqual(40);
  });

  it('a modern TTYPE answer takes the reported geometry and leaves petsciiMode off', () => {
    const session: any = {};
    expect(applyTerminalTypeReport(session, { terminalType: 'xterm', isC64: false, width: 132, height: 50 })).toBe(true);
    expect(session.petsciiMode).toBe(false);
    expect(session.terminalType).toBe('modern');
    expect({ w: session.screenWidth, h: session.screenHeight }).toEqual({ w: 132, h: 50 });
  });

  it('is inert without a session', () => {
    expect(applyTerminalTypeReport(undefined, { terminalType: 'c64', isC64: true, width: 40, height: 25 })).toBe(false);
  });
});

describe('applyWindowSizeReport (index.ts NAWS listener body)', () => {
  it('a PETSCII session takes neither the geometry nor a re-detection', () => {
    const session: any = { petsciiMode: true, terminalType: 'c64', screenWidth: 40, screenHeight: 25 };
    expect(applyWindowSizeReport(session, 80, 25)).toEqual({ geometryTaken: false, detectedFromSize: false });
    expect({ w: session.screenWidth, h: session.screenHeight }).toEqual({ w: 40, h: 25 });
    expect(session.petsciiMode).toBe(true);
  });

  it('40x25 from an undetected terminal is read as a C64', () => {
    const session: any = {};
    expect(applyWindowSizeReport(session, 40, 25)).toEqual({ geometryTaken: true, detectedFromSize: true });
    expect(session.petsciiMode).toBe(true);
    expect(session.terminalType).toBe('c64');
    expect(doorScreenWidth(session, 80)).toBe(40);
  });

  it('any other size from an undetected terminal is a modern terminal', () => {
    const session: any = { terminalType: 'unknown' };
    expect(applyWindowSizeReport(session, 132, 50)).toEqual({ geometryTaken: true, detectedFromSize: true });
    expect(session.petsciiMode).toBe(false);
    expect({ w: session.screenWidth, h: session.screenHeight }).toEqual({ w: 132, h: 50 });
  });

  it('an already-detected terminal keeps its type and only resizes', () => {
    const session: any = { terminalType: 'modern', petsciiMode: false };
    expect(applyWindowSizeReport(session, 40, 25)).toEqual({ geometryTaken: true, detectedFromSize: false });
    expect(session.terminalType).toBe('modern');
    expect(session.petsciiMode).toBe(false);
    expect(session.screenWidth).toBe(40);
  });

  it('is inert without a session', () => {
    expect(applyWindowSizeReport(null, 40, 25)).toEqual({ geometryTaken: false, detectedFromSize: false });
  });
});

describe('both reporters go through the one gate', () => {
  /*
   * REWRITTEN 2026-09-16. These two used to read `transport-session.ts`,
   * slice it at a string literal, and assert the text in between mentioned
   * the gate and contained no `session.screenWidth =`. The slice depends on
   * the exact spelling of an event registration, the regexes on the exact
   * spelling of an assignment, and neither proves the handler RUNS the gate.
   *
   * It can be driven. `setupTelnetSSHHandler` is exported and starts no
   * server on import - the comment inside it saying otherwise describes
   * `index.ts`, which is where these handlers used to live (TP-2). So the
   * test hands it a connection, fires the event a telnet client fires, and
   * watches what happens to the session.
   *
   * The gate itself is STUBBED, deliberately: with it doing nothing, any
   * geometry the session ends up with was written by the handler - which is
   * the second unguarded write these tests exist to forbid. The gate's own
   * behaviour is driven for real by the tests above.
   */
  const drive = (event: 'window-size' | 'terminal-type', payload: unknown[]) => {
    jest.resetModules();

    const applyWindowSize = jest.fn(() => ({ geometryTaken: false, detectedFromSize: false }));
    const applyTerminalType = jest.fn();
    jest.doMock('../../src/amiga-emulation/xim/screen-width.util', () => ({
      ...jest.requireActual('../../src/amiga-emulation/xim/screen-width.util'),
      applyWindowSizeReport: applyWindowSize,
      applyTerminalTypeReport: applyTerminalType,
    }));

    // A PETSCII session, which is the one a reported size must never move.
    const session: any = {
      id: 'geometry-drive', nodeId: 1,
      petsciiMode: true, screenWidth: 40, screenHeight: 25,
    };

    const connection = new EventEmitter() as any;
    connection.nodeId = 1;
    connection.session = session;
    connection.getRemoteAddress = () => '10.0.0.1';
    connection.write = () => {};
    connection.end = () => {};
    connection.socket = { write: () => {} };

    const deps: any = {
      io: { sockets: { sockets: new Map() } },
      sessions: new Map(),
      nodeManager: { releaseSession: async () => undefined },
      handleCommand: async () => undefined,
    };

    const { setupTelnetSSHHandler } = require('../../src/server/transport-session');
    setupTelnetSSHHandler(connection, 'telnet', deps);
    connection.emit(event, ...payload);

    return { session, applyWindowSize, applyTerminalType };
  };

  it('hands a NAWS report to the gate, and writes no geometry of its own', () => {
    const { session, applyWindowSize } = drive('window-size', [132, 50]);

    expect(applyWindowSize).toHaveBeenCalledWith(session, 132, 50);
    // The gate declined (that is what the stub says), so 132x50 must be
    // nowhere on the session - a direct write would have put it there.
    expect(session.screenWidth).toBe(40);
    expect(session.screenHeight).toBe(25);
    expect(session.petsciiMode).toBe(true);
  });

  it('hands a TTYPE report to the gate, and writes no geometry of its own', () => {
    const info = { terminalType: 'ANSI', isC64: false, width: 80, height: 25 };
    const { session, applyTerminalType } = drive('terminal-type', [info]);

    expect(applyTerminalType).toHaveBeenCalledWith(session, info);
    expect(session.screenWidth).toBe(40);
    expect(session.screenHeight).toBe(25);
    // An ANSI TTYPE on a PETSCII session is exactly the case that used to
    // flip this flag behind the gate's back.
    expect(session.petsciiMode).toBe(true);
  });

  it('index.ts no longer carries a copy of either handler', () => {
    // The move is only a move if the old body is gone: two copies would drift.
    const indexSrc = fs.readFileSync(path.resolve(__dirname, '../../src/index.ts'), 'utf8');
    expect(indexSrc).not.toContain('connection.on("window-size"');
    expect(indexSrc).not.toContain('connection.on(\n    "terminal-type"');
    expect(indexSrc).not.toContain('function setupTelnetSSHHandler');
  });
});
