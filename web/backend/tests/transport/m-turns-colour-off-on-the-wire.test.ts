/**
 * M at the main prompt turns ANSI colour off - and the board then stops
 * sending colour. The sysop, 2026-10-15: pressing M "does nothing in the BBS".
 *
 * The command flipped the flag and printed "Ansi Color Off", but the one
 * filter that read the flag (an emit() wrapper login installed) was replaced a
 * line later by the modem pacer's emit() wrapper, which sends to the raw
 * emitter. So every later screen kept its colour. express.e filters in
 * aePuts2 (1663-1690): ansiColour FALSE -> stripAnsi (MiscFuncs.e:656), which
 * removes SGR (`ESC[..m`) and leaves cursor sequences alone.
 *
 * Driven through the real command entry (processBBSCommand 'M'), the real
 * connection emitter with the modem pacer installed the way login installs it,
 * and a fake wire. Output is sent both through emitText (the buffered funnel
 * a menu draw uses) and straight at the socket (the door / inline-MCI path).
 */
process.env.SKIP_DB_INIT = '1';

import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import { getModemEmulator } from '../../src/utils/modem-emulator.util';
import { processBBSCommand } from '../../src/handlers/command.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { emitText, flushOutput } from '../../src/utils/output.util';
import { AnsiUtil } from '../../src/utils/ansi.util';

const SGR = /\x1b\[[0-9;]*m/;
const MENU = '\x1b[2J\x1b[1;1H\x1b[0;1;44;33m MAIN MENU \x1b[5;3H\x1b[38;2;170;85;0mM  Colour Mode\x1b[0m\r\n';

function caller(id: string) {
  const writes: Buffer[] = [];
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1, currentMsgBase: 1, tempData: {},
    terminalType: 'modern', petsciiMode: false, screenWidth: 80, screenHeight: 25,
    ansiMode: true,
    user: { id: 1, username: id, secLevel: 255, securityFlags: 'F'.repeat(100), confAccess: 'X', ansi: true },
  };
  const connection: any = {
    sessionId: id, session,
    write: (d: Buffer | string) => { writes.push(typeof d === 'string' ? Buffer.from(d, 'latin1') : Buffer.from(d)); },
    on: () => undefined, off: () => undefined, close: () => undefined,
  };
  const socket = buildConnectionEmitter(connection);
  getModemEmulator(socket).install(); // as login-post does, after everything else
  const take = () => { flushOutput(socket); const t = Buffer.concat(writes).toString('latin1'); writes.length = 0; return t; };
  const draw = () => { emitText(socket, MENU); socket.emit('ansi-output', MENU); return take(); };
  return { socket, session, take, draw };
}

describe('M turns ANSI colour off on the wire', () => {
  it('after M the menu draw carries no colour codes, by either route, and keeps its cursor moves', async () => {
    const c = caller('m-off');
    expect(SGR.test(c.draw())).toBe(true); // colour is on to begin with
    await processBBSCommand(c.socket, c.session, 'M', '');
    expect(c.take()).toContain('Ansi Color Off');
    const after = c.draw();
    expect(after).toContain('MAIN MENU');
    expect(SGR.test(after)).toBe(false);
    expect(after).toContain('\x1b[2J');
    expect(after).toContain('\x1b[5;3H');
  });

  it('M again turns colour back on', async () => {
    const c = caller('m-on');
    await processBBSCommand(c.socket, c.session, 'M', '');
    c.take();
    await processBBSCommand(c.socket, c.session, 'M', '');
    expect(c.take()).toContain('Ansi Color On');
    expect(SGR.test(c.draw())).toBe(true);
  });

  it('M changes this call only: the account flag is not touched', async () => {
    const c = caller('m-session-only');
    await processBBSCommand(c.socket, c.session, 'M', '');
    expect(c.session.ansiMode).toBe(false);
    expect(c.session.user.ansi).toBe(true);
  });

  it('another caller who never pressed M keeps his colour', async () => {
    const off = caller('m-a');
    const on = caller('m-b');
    await processBBSCommand(off.socket, off.session, 'M', '');
    expect(SGR.test(on.draw())).toBe(true);
  });
});

describe('AnsiUtil.forCaller', () => {
  it('strips colour only for ansiMode false, and passes binary payloads through', () => {
    const buf = Buffer.from('\x1b[31mx');
    expect(AnsiUtil.forCaller({ ansiMode: false }, '\x1b[31mred\x1b[0m\x1b[2J')).toBe('red\x1b[2J');
    expect(AnsiUtil.forCaller({ ansiMode: true }, '\x1b[31mred')).toBe('\x1b[31mred');
    expect(AnsiUtil.forCaller({}, '\x1b[31mred')).toBe('\x1b[31mred');
    expect(AnsiUtil.forCaller({ ansiMode: false }, buf)).toBe(buf);
  });
});
