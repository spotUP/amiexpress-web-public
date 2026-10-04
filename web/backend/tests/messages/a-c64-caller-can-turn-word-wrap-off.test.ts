/**
 * CTRL+W in the message editor turns word wrap off and on - C*Base's key,
 * ported for PETSCII callers (sysop decision D2, 2026-10-04; plan
 * `thoughts/shared/plans/2026-10-04-petscii-ctrl-l-case-toggle.md`).
 *
 * C*Base 3.3.7: `src/ml0123.a65:1993-2006` flips `wordwrap` and prints
 * prompt 50/51, "Word wrap on" / "Word wrap off"; `bbs.bas` pokes it ON
 * (`poke994,1`) every time the Message-Maker opens; `wrapit` (2116-2145)
 * carries the last word down only while it is on.
 *
 * An ANSI caller keeps express.e: edit() drops every code below 32 (10293).
 *
 * Typed through handleCommand, the entry point every keystroke takes.
 */
process.env.SKIP_DB_INIT = '1';

import { handleCommand } from '../../src/handlers/command.handler';
import { BBSState, LoggedOnSubState } from '../../src/index';
import { flushOutput } from '../../src/utils/output.util';
import { messageBodyLineLimit } from '../../src/utils/table-format.util';

const tick = () => new Promise((r) => setTimeout(r, 5));
const CTRL_W = '\x17';

function drive(columns: 40 | 80) {
  const out: string[] = [];
  const socket: any = {
    id: `wrap-${Math.random()}`,
    emit: (event: string, text: unknown) => { if (event === 'ansi-output') out.push(String(text)); return true; },
    on() {}, off() {}, removeListener() {},
  };
  const session: any = {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.POST_MESSAGE_BODY,
    petsciiMode: columns === 40,
    terminalType: columns === 40 ? 'c64' : 'ansi',
    connectionType: 'web',
    screenWidth: columns,
    screenHeight: 25,
    nodeId: 1,
    currentConf: 1,
    inputBuffer: '',
    user: { id: 1, username: 'spot', secLevel: 255, securityFlags: 'T'.repeat(90), secOverride: '' },
    tempData: { messageEntry: { body: [], currentLine: 1, toUser: 'ALL', subject: 's', isPrivate: false } },
  };
  let mark = 0;
  const screen = () => { flushOutput(socket); return out.join(''); };
  return {
    session,
    body: (): string[] => session.tempData.messageEntry.body,
    type: async (keys: string) => {
      for (const key of Array.from(keys)) {
        await handleCommand(socket, session, key);
        await tick();
      }
    },
    since: () => { const s = screen(); const d = s.slice(mark); mark = s.length; return d; },
  };
}

describe('CTRL+W in the message editor (C*Base word wrap)', () => {
  it('says "Word wrap off", keeps the line being typed, and puts it back on the prompt', async () => {
    const d = drive(40);
    await d.type('abc');
    d.since();
    await d.type(CTRL_W);
    expect(d.since()).toBe('\r\nWord wrap off\r\n 1> abc');
    expect(d.session.inputBuffer).toBe('abc');
    expect(d.body()).toEqual([]);
  });

  it('with word wrap off a full line breaks where it stands instead of carrying its last word', async () => {
    const d = drive(40);
    const limit = messageBodyLineLimit(d.session);
    const head = 'x'.repeat(limit - 5) + ' hell';
    await d.type(CTRL_W);
    await d.type(head + 'o');
    expect(d.body()).toEqual([head + 'o']);
    expect(d.session.inputBuffer).toBe('');
  });

  it('a second CTRL+W says "Word wrap on" and the last word is carried down again', async () => {
    const d = drive(40);
    const limit = messageBodyLineLimit(d.session);
    await d.type(CTRL_W + CTRL_W);
    expect(d.since()).toContain('\r\nWord wrap on\r\n');
    await d.type('x'.repeat(limit - 5) + ' hello');
    expect(d.body()).toEqual(['x'.repeat(limit - 5)]);
    expect(d.session.inputBuffer).toBe('hello');
  });

  it('an ANSI caller keeps express.e: CTRL+W does nothing', async () => {
    const d = drive(80);
    await d.type('abc');
    d.since();
    await d.type(CTRL_W);
    expect(d.since()).toBe('');
    expect(d.session.inputBuffer).toBe('abc');
  });
});
