/**
 * The R reader, as express.e's readMSG (11972-12300) runs it.
 *
 * The parity survey (2026-09-29) found the port's reader:
 *   - opened on the first message; express.e opens on the "Msg. Options"
 *     prompt, whose ( n+high ) names the message <CR> reads (12007-12022);
 *   - stopped after ONE message on `R NS` - it drew the prompt after the
 *     first message and waited; express.e never prompts under NS and reads
 *     to the end (12080-12085), then leaves with a blank line;
 *   - printed "The last message in this conference is n" on <CR> past the
 *     end, where <CR> sets noDirF and noMorePlus says nothing (12082, 12302);
 *   - answered commands with "No such command!!"; readMSG re-prompts.
 *
 * Driven through R's entry point with three public messages on the board.
 */
process.env.SKIP_DB_INIT = '1';

const BODIES: Record<number, { subject: string; body: string }> = {
  1: { subject: 'first', body: 'BODY-ONE' },
  2: { subject: 'second', body: 'BODY-TWO' },
  3: { subject: 'third', body: 'BODY-THREE' },
};

jest.mock('../../../src/utils/message-file.util', () => ({
  ...jest.requireActual('../../../src/utils/message-file.util'),
  getAllMessageIds: jest.fn(async () => [1, 2, 3]),
  readMessageFile: jest.fn(async (_conf: number, n: number) => ({
    msgNum: n, from: 'sysop', to: 'ALL', subject: BODIES[n]!.subject, body: BODIES[n]!.body,
    date: new Date('2026-09-01T12:00:00Z'), isPrivate: false,
  })),
  readAttachList: jest.fn(async () => null),
  markMessageReceived: jest.fn(async () => undefined),
}));

import { LoggedOnSubState } from '../../../src/constants/bbs-states';
import {
  handleMessageReaderNav,
  handleReadMessagesFullCommand,
  setMessagingDependencies,
} from '../../../src/handlers/message/messaging.handler';
import { flushOutput } from '../../../src/utils/output.util';

const updateReadPointer = jest.fn(async () => undefined);

beforeAll(() => {
  setMessagingDependencies({ db: { updateReadPointer } });
});

function aCaller() {
  const out: string[] = [];
  const socket: any = {
    id: `r-reader-${Math.random()}`,
    emit: (event: string, payload: unknown) => { if (event === 'ansi-output') out.push(String(payload)); return true; },
    on: () => socket,
  };
  const session: any = {
    nodeId: 1,
    currentConf: 1,
    currentMsgBase: 1,
    lastMsgReadConf: 0,
    subState: LoggedOnSubState.READ_COMMAND,
    user: { id: 7, username: 'reader', secLevel: 255, securityFlags: 'T'.repeat(100), lineLength: 0 },
  };
  // emitText buffers per socket; read what has reached the wire.
  const said = () => { flushOutput(socket); return out.join(''); };
  return { socket, session, said, clear: () => { flushOutput(socket); out.length = 0; } };
}

describe('R reads like express.e readMSG', () => {
  test('bare R opens on the prompt; <CR> reads the message it names', async () => {
    const c = aCaller();
    await handleReadMessagesFullCommand(c.socket, c.session, '');
    expect(c.said()).toContain('Msg. Options');
    expect(c.said().replace(/\x1b\[[0-9;]*m/g, '')).toContain('( 1+3 )>: ');
    expect(c.said()).not.toContain('BODY-ONE');

    // Nothing read yet: A (again) has no message to act on - just the prompt.
    c.clear();
    await handleMessageReaderNav(c.socket, c.session, 'A');
    expect(c.said()).not.toContain('BODY');
    expect(c.said()).toContain('Msg. Options');

    c.clear();
    await handleMessageReaderNav(c.socket, c.session, '');
    expect(c.said()).toContain('BODY-ONE');
  });

  test('R NS reads every message without a prompt, then leaves', async () => {
    const c = aCaller();
    await handleReadMessagesFullCommand(c.socket, c.session, 'NS');
    const out = c.said();
    expect(out).toContain('BODY-ONE');
    expect(out).toContain('BODY-TWO');
    expect(out).toContain('BODY-THREE');
    expect(out).not.toContain('Msg. Options');
    expect(c.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(c.session.lastMsgReadConf).toBe(3);
  });

  test('NS typed at the prompt reads the rest the same way', async () => {
    const c = aCaller();
    await handleReadMessagesFullCommand(c.socket, c.session, '1');
    expect(c.said()).toContain('BODY-ONE');

    c.clear();
    await handleMessageReaderNav(c.socket, c.session, 'NS');
    expect(c.said()).toContain('BODY-TWO');
    expect(c.said()).toContain('BODY-THREE');
    expect(c.said()).not.toContain('Msg. Options');
    expect(c.said()).not.toContain('Non-stop mode enabled');
    expect(c.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  test('<CR> past the last message leaves quietly; a number past it names the last', async () => {
    const quiet = aCaller();
    await handleReadMessagesFullCommand(quiet.socket, quiet.session, '3');
    quiet.clear();
    await handleMessageReaderNav(quiet.socket, quiet.session, '');
    expect(quiet.said()).not.toContain('The last message');
    expect(quiet.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);

    const named = aCaller();
    await handleReadMessagesFullCommand(named.socket, named.session, '1');
    named.clear();
    await handleMessageReaderNav(named.socket, named.session, '99');
    expect(named.said()).toContain('The last message in this conference is 3');
    expect(named.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  test('an unknown command re-prompts without "No such command!!"', async () => {
    const c = aCaller();
    await handleReadMessagesFullCommand(c.socket, c.session, '1');
    c.clear();
    await handleMessageReaderNav(c.socket, c.session, 'ZZ');
    expect(c.said()).not.toContain('No such command');
    expect(c.said()).toContain('Msg. Options');
  });
});
