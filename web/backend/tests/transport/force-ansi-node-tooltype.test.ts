/**
 * Node tooltype FORCE_ANSI, express.e:29079-29089 and 29527: when the node's
 * icon carries the key at all, the graphics prompt is NOT asked (any
 * connection type) and the flags come from the value - N colour off, Q quick
 * logon, R RIP. Without the key the prompt is shown as before. Driven through
 * the connect pipeline (runPreLoginConnect) and the real connection emitter.
 */
process.env.SKIP_DB_INIT = '1';

const mockTooltypes = new Map<string, string>();
jest.mock('../../src/utils/node-tooltypes.util', () => ({
  ...jest.requireActual('../../src/utils/node-tooltypes.util'),
  nodeTooltype: (_node: number, key: string) => mockTooltypes.get(key),
}));
jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../src/services/bbs-config-file.service', () => ({
  loadBBSConfig: () => ({}),
}));

import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import { runPreLoginConnect } from '../../src/services/login-connect.service';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { emitText, flushOutput } from '../../src/utils/output.util';

const SGR = /\x1b\[[0-9;]*m/;

function caller(id: string, connectionType: string) {
  const writes: Buffer[] = [];
  const session: any = {
    state: 'awaiting', subState: LoggedOnSubState.DISPLAY_CONNECT, nodeId: 1, tempData: {},
    terminalType: 'modern', connectionType, petsciiMode: false, screenWidth: 80, screenHeight: 25,
  };
  const connection: any = {
    sessionId: id, session,
    write: (d: Buffer | string) => { writes.push(typeof d === 'string' ? Buffer.from(d, 'latin1') : Buffer.from(d)); },
    on: () => undefined, off: () => undefined, close: () => undefined,
  };
  const socket = buildConnectionEmitter(connection);
  const take = () => { flushOutput(socket); const t = Buffer.concat(writes).toString('latin1'); writes.length = 0; return t; };
  return { socket, session, take };
}

describe('node tooltype FORCE_ANSI', () => {
  beforeEach(() => mockTooltypes.clear());

  it.each(['telnet', 'web'])('N: no graphics prompt, colour off for the call (%s)', async (type) => {
    mockTooltypes.set('FORCE_ANSI', 'N');
    const c = caller('force-n-' + type, type);
    await runPreLoginConnect(c.socket as any, c.session, { socketId: 'force-n' });
    const connectOut = c.take();
    expect(connectOut).not.toMatch(/\(A\/r\/n\)|A\/R\/P/);
    expect(c.session.subState).not.toBe(LoggedOnSubState.ANSI_PROMPT);
    expect(c.session.ansiMode).toBe(false);
    emitText(c.socket, '\x1b[0;1;44;33m MAIN MENU \x1b[0m\r\n');
    const out = c.take();
    expect(out).toContain('MAIN MENU');
    expect(SGR.test(out)).toBe(false);
  });

  it('empty value: prompt still skipped, colour stays on', async () => {
    mockTooltypes.set('FORCE_ANSI', '');
    const c = caller('force-empty', 'telnet');
    await runPreLoginConnect(c.socket as any, c.session, { socketId: 'force-empty' });
    expect(c.take()).not.toMatch(/\(A\/r\/n\)|A\/R\/P/);
    expect(c.session.subState).not.toBe(LoggedOnSubState.ANSI_PROMPT);
    expect(c.session.ansiMode).toBe(true);
  });

  it('Q sets quick logon; P and T in the value are not FORCE_ANSI flags', async () => {
    mockTooltypes.set('FORCE_ANSI', 'QP');
    const c = caller('force-q', 'telnet');
    await runPreLoginConnect(c.socket as any, c.session, { socketId: 'force-q' });
    expect(c.session.quickFlag).toBe(true);
    expect(c.session.petsciiMode).toBe(false);
  });

  it('absent: the graphics prompt is still shown', async () => {
    const c = caller('force-absent', 'telnet');
    await runPreLoginConnect(c.socket as any, c.session, { socketId: 'force-absent' });
    expect(c.take()).toMatch(/A\/R\/P/);
    expect(c.session.subState).toBe(LoggedOnSubState.ANSI_PROMPT);
  });
});
