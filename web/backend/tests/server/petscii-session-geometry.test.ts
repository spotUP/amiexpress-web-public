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

import { applyClientReportedGeometry } from '../../src/amiga-emulation/xim/screen-width.util';
import { doorScreenWidth } from '../../src/amiga-emulation/xim/screen-width.util';
import { emitText } from '../../src/utils/ansi-buffer.util';
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
});

describe('both reporters go through the one gate', () => {
  // index.ts boots a server on import, so its NAWS handler cannot be driven
  // from jest. This pin is what keeps it delegating instead of growing a
  // second unguarded write. socket-handlers.ts is driven for real above.
  it('index.ts window-size assigns no geometry of its own', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/index.ts'), 'utf8');
    const handler = src.slice(src.indexOf('connection.on("window-size"'));
    const body = handler.slice(0, handler.indexOf('\n  });'));
    expect(body).toContain('applyClientReportedGeometry(connection.session, width, height)');
    expect(body).not.toMatch(/session\.screenWidth\s*=/);
    expect(body).not.toMatch(/session\.screenHeight\s*=/);
  });
});
