/**
 * Answering N at the login graphics prompt turns ANSI colour off for the whole
 * call (sysop, 2026-11-08: N still showed coloured ANSI). express.e 29538
 * `IF 'N' ansiColour:=FALSE`; aePuts2 (1663-1690) then strips SGR from every
 * string. The answer used to set only session.ansiEnabled, which the output
 * choke never reads. Driven through handleCommand at ANSI_PROMPT and the real
 * connection emitter.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(true),
}));

import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import { handleCommand } from '../../src/handlers/command.handler';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { emitText, flushOutput } from '../../src/utils/output.util';

const SGR = /\x1b\[[0-9;]*m/;
const SCREEN = '\x1b[0;1;44;33m MAIN MENU \x1b[0m\r\n';

function caller(id: string) {
  const writes: Buffer[] = [];
  const session: any = {
    state: BBSState.AWAIT, subState: LoggedOnSubState.ANSI_PROMPT, nodeId: 1, tempData: { inputBuffer: '' },
    terminalType: 'modern', connectionType: 'telnet', petsciiMode: false, screenWidth: 80, screenHeight: 25,
  };
  const connection: any = {
    sessionId: id, session,
    write: (d: Buffer | string) => { writes.push(typeof d === 'string' ? Buffer.from(d, 'latin1') : Buffer.from(d)); },
    on: () => undefined, off: () => undefined, close: () => undefined,
  };
  const socket = buildConnectionEmitter(connection);
  const take = () => { flushOutput(socket); const t = Buffer.concat(writes).toString('latin1'); writes.length = 0; return t; };
  const draw = () => { emitText(socket, SCREEN); socket.emit('ansi-output', SCREEN); return take(); };
  return { socket, session, draw };
}

async function answer(c: ReturnType<typeof caller>, text: string) {
  for (const ch of text) await handleCommand(c.socket, c.session, ch);
  await handleCommand(c.socket, c.session, '\r');
}

describe('graphics prompt answer N', () => {
  it('sends no colour codes afterwards, by either output route', async () => {
    const c = caller('n-answer');
    await answer(c, 'N');
    expect(c.session.ansiMode).toBe(false);
    const out = c.draw();
    expect(out).toContain('MAIN MENU');
    expect(SGR.test(out)).toBe(false);
  });

  it('an empty answer keeps colour', async () => {
    const c = caller('enter-answer');
    await answer(c, '');
    expect(SGR.test(c.draw())).toBe(true);
  });
});
