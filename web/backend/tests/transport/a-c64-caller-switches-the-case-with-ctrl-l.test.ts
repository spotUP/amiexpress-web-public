/**
 * REACHABILITY: a C64 caller on telnet presses CTRL+L, and his whole screen
 * goes to the upper case set; he presses it again and it comes back. In the
 * message editor, CTRL+W turns word wrap off - the C*Base keys, ported for
 * every PETSCII caller (sysop decisions D1 and D2, 2026-10-04; plan
 * `thoughts/shared/plans/2026-10-04-petscii-ctrl-l-case-toggle.md`).
 *
 * Driven through setupTelnetSSHHandler - the entry every telnet connection
 * takes - with the board's real handleCommand behind it, and read off the
 * bytes the connection writes to the wire.
 */
process.env.SKIP_DB_INIT = '1';

import { EventEmitter } from 'events';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { setupTelnetSSHHandler, type TransportSessionDeps } from '../../src/server/transport-session';
import { handleCommand } from '../../src/handlers/command.handler';
import { flushOutput } from '../../src/utils/output.util';
import * as sessionModel from '../../src/utils/petscii-session-model';

// Counted, not replaced: the real toggle runs.
jest.mock('../../src/utils/petscii-session-model', () => {
  const actual = jest.requireActual('../../src/utils/petscii-session-model');
  return { ...actual, togglePetsciiCase: jest.fn(actual.togglePetsciiCase) };
});
import type { TelnetConnection } from '../../src/server/telnet-server';

const tick = () => new Promise((r) => setTimeout(r, 20));

/** "word wrap off" in the upper case set: every letter on $41-$5A. */
const WORD_WRAP_OFF_UPPER = Array.from('WORD WRAP OFF', (c) => c.charCodeAt(0));

it('CTRL+L switches the caller\'s set, the board keeps printing in it, and CTRL+W reaches the editor', async () => {
  const toggle = sessionModel.togglePetsciiCase as jest.Mock;
  const wire: number[] = [];
  const connection: any = Object.assign(new EventEmitter(), {
    sessionId: `telnet-case-${Date.now()}`,
    nodeId: 62,
    write: (b: Buffer) => { wire.push(...b); },
    close: () => {},
    getRemoteAddress: () => '127.0.0.1',
  });
  connection.session = {
    state: BBSState.LOGGEDON, subState: LoggedOnSubState.POST_MESSAGE_BODY, nodeId: 62, currentConf: 1,
    user: { id: 62, username: 'N62', secLevel: 255, securityFlags: 'T'.repeat(90), secOverride: '' },
    connectionType: 'telnet', terminalType: 'c64', petsciiMode: true, screenWidth: 40, screenHeight: 25,
    inputBuffer: '',
    tempData: { messageEntry: { body: [], currentLine: 1, toUser: 'ALL', subject: 's', isPrivate: false } },
  };
  const commands = jest.fn(handleCommand);
  const deps: TransportSessionDeps = {
    io: {} as never, sessions: new Map(), nodeManager: { releaseSession: jest.fn(async () => undefined) }, handleCommand: commands as never,
  };
  setupTelnetSSHHandler(connection as unknown as TelnetConnection, 'telnet', deps);
  const emitter = connection.emitter;
  const since = (() => { let mark = 0; return () => { const d = wire.slice(mark); mark = wire.length; return d; }; })();

  emitter.emit('ansi-output', 'menu');
  expect(since()).toEqual([0x0E, 0x4D, 0x45, 0x4E, 0x55]);   // the board's own set, as before

  // CTRL+L: exactly the switch byte, nothing reprinted, nothing for the board to read.
  connection.emit('data', Buffer.from([0x0C]));
  await tick();
  expect(since()).toEqual([0x8E]);
  expect(toggle).toHaveBeenCalledTimes(1);
  expect(commands).not.toHaveBeenCalled();
  expect(connection.session.petsciiCaseBank).toBe(0);

  // The board's next line stays in his set: no $0E, letters on $41-$5A.
  emitter.emit('ansi-output', 'Hello');
  expect(since()).toEqual([0x48, 0x45, 0x4C, 0x4C, 0x4F]);

  // CTRL+W in the message editor: the C*Base prompt, printed in his set.
  connection.emit('data', Buffer.from([0x17]));
  await tick();
  flushOutput(emitter);
  const wrap = since();
  expect(commands).toHaveBeenCalled();
  expect(connection.session.tempData.messageEntry.wordWrap).toBe(false);
  expect(wrap).not.toContain(0x0E);
  expect(Buffer.from(wrap).includes(Buffer.from(WORD_WRAP_OFF_UPPER))).toBe(true);

  // CTRL+L again: back to the lower case set with one $0E.
  connection.emit('data', Buffer.from([0x0C]));
  await tick();
  expect(since()).toEqual([0x0E]);
  expect(toggle).toHaveBeenCalledTimes(2);
});
