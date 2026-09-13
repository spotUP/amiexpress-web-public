/**
 * The wrap-climbing backspace, driven through handleCommand.
 *
 * rewrapEcho is unit-tested, and it was right - but the sysop reported the
 * cursor "gets stuck at the left edge" on the live board with that code
 * running, which means the RUNTIME never reached it. A rule tested in
 * isolation proves nothing about the branch that is supposed to call it.
 *
 * So this drives the real thing: displayMenuPrompt prints the prompt (and
 * records where it leaves the cursor), then keystrokes go through
 * handleCommand in READ_COMMAND exactly as a caller's do.
 *
 * The menu prompt is 53 columns wide, so on an 80-column terminal a line
 * wraps after 27 typed characters - this is the ordinary case, not a corner.
 */
import 'reflect-metadata';

jest.mock('../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));
jest.mock('../../src/services/CallersLogManager');

import { handleCommand } from '../../src/handlers/command.handler';
import { displayMenuPrompt } from '../../src/handlers/command-handler/menu';
import { LoggedOnSubState, BBSState } from '../../src/constants/bbs-states';
import { flushOutput } from '../../src/utils/output.util';

function makeSocket() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    id: `wrap-socket-${Math.random()}`,
    emitted,
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
  };
}

const wire = (socket: any) =>
  socket.emitted
    .filter((e: any) => e.event === 'ansi-output' || e.event === 'petscii-output')
    .map((e: any) => String(e.data ?? ''))
    .join('');

function makeSession(): any {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.READ_COMMAND,
    inputBuffer: '',
    currentConf: 0,
    relConfNum: 0,
    currentConfName: 'General',
    screenWidth: 80,
    wireWidth: 80,
    user: { id: 1, username: 'sysop', secLevel: 255, name: 'sysop' },
    tempData: {},
  };
}

describe('backspace climbs the wrap at the menu prompt', () => {
  it('records where the prompt leaves the cursor', () => {
    const socket = makeSocket();
    const session = makeSession();
    displayMenuPrompt(socket as any, session);
    flushOutput(socket as any);

    // Without this the wrap can never be detected: a 53-column prompt plus
    // 30 typed characters is 83, over the edge, but measured from column 0
    // it reads as 30 and looks like it fits.
    expect(typeof session.promptColumn).toBe('number');
    expect(session.promptColumn).toBeGreaterThan(0);
  });

  it('redraws instead of stepping back when the typed line has wrapped', async () => {
    const socket = makeSocket();
    const session = makeSession();
    displayMenuPrompt(socket as any, session);

    // Past the wrap: 53 + 30 = 83 on an 80-column terminal.
    for (const ch of 'a'.repeat(30)) {
      await handleCommand(socket as any, session, ch);
    }
    const before = socket.emitted.length;
    await handleCommand(socket as any, session, '\x7f');
    flushOutput(socket as any);

    const out = socket.emitted.slice(before)
      .filter((e: any) => e.event === 'ansi-output')
      .map((e: any) => String(e.data ?? '')).join('');

    expect(session.inputBuffer).toBe('a'.repeat(29));
    // The redraw addresses the cursor absolutely. A bare BS here is the bug:
    // it cannot cross the row boundary and the first row stays stranded.
    expect(out).toMatch(/\x1b\[\d+G/);
    expect(out).toContain('\x1b[0J');
  });

  it('leaves a short line on the cheap path, byte for byte', async () => {
    const socket = makeSocket();
    const session = makeSession();
    displayMenuPrompt(socket as any, session);

    for (const ch of 'abc') await handleCommand(socket as any, session, ch);
    const before = socket.emitted.length;
    await handleCommand(socket as any, session, '\x7f');
    flushOutput(socket as any);

    const out = socket.emitted.slice(before)
      .filter((e: any) => e.event === 'ansi-output')
      .map((e: any) => String(e.data ?? '')).join('');

    expect(session.inputBuffer).toBe('ab');
    // Unchanged behaviour for the common case: no repaint for one keystroke.
    expect(out).toContain('\b');
    expect(out).not.toContain('\x1b[0J');
  });
});

/**
 * The same, at the prompt the sysop was actually sitting at.
 *
 * "it gets stuck at the left edge" came while the session was at
 * ansi_prompt, not the menu - and only the menu line had been taught to
 * climb. The graphics question is 34 columns wide, so on a narrow terminal
 * its own ten-character answer reaches the edge, and every prompt that
 * erases with a bare `\b \b` strands whatever is on the first row.
 */
describe('the graphics prompt climbs the wrap too', () => {
  const {
    recordPromptColumn, backspaceEcho, visibleColumns,
  } = require('../../src/utils/line-input.util');

  const PROMPT = '\r\nANSI, RIP or No graphics (A/r/n)? ';

  it('knows the prompt is 34 columns, whatever the terminal', () => {
    expect(visibleColumns(PROMPT)).toBe(34);
  });

  it('redraws on a narrow terminal, where the answer passes the edge', () => {
    const session: any = { wireWidth: 40, screenWidth: 40 };
    recordPromptColumn(session, PROMPT);
    expect(session.promptColumn).toBe(34);

    // 34 + 8 = 42 on a 40-column terminal: the answer has wrapped.
    const out = backspaceEcho('AAAAAAAA', 'AAAAAAA', session);
    expect(out).not.toBe('\b \b');
    expect(out).toContain('\x1b[0J');
  });

  it('keeps the plain erase on a terminal where it fits', () => {
    const session: any = { wireWidth: 80, screenWidth: 80 };
    recordPromptColumn(session, PROMPT);
    // 34 + 8 = 42, well inside 80.
    expect(backspaceEcho('AAAAAAAA', 'AAAAAAA', session)).toBe('\b \b');
  });

  it('leaves a PETSCII caller the erase it has always had', () => {
    const session: any = { wireWidth: 40, screenWidth: 40, petsciiMode: true };
    recordPromptColumn(session, PROMPT);
    expect(backspaceEcho('AAAAAAAA', 'AAAAAAA', session)).toBe('\b \b');
  });
});

/**
 * The branch that actually serves the connect question.
 *
 * There were FOUR copies of this prompt's input loop - pre-login.ts,
 * core.ts, login-connect.service.ts and this one - and the first three are
 * the ones I converted while the sysop kept reporting the bug. Only
 * command.handler.ts's own branch runs for a web caller, which is why two
 * rounds of unit tests passed against a board that never changed.
 *
 * So this drives handleCommand at ANSI_PROMPT and reads the wire.
 */
describe('the connect question climbs the wrap', () => {
  const { ANSI_GRAPHICS_PROMPT } = require('../../src/services/login-connect.service');
  const { visibleColumns } = require('../../src/utils/line-input.util');

  it('is 79 columns on its last row, so it wraps on an 80-column terminal at once', () => {
    // Measured, not assumed: this is why every keystroke was already past
    // the edge and the first row could never be reached.
    expect(visibleColumns(ANSI_GRAPHICS_PROMPT)).toBeGreaterThan(70);
  });

  it('redraws rather than sending a bare backspace', async () => {
    const socket = makeSocket();
    const session: any = {
      state: BBSState.AWAIT,
      subState: LoggedOnSubState.ANSI_PROMPT,
      screenWidth: 80,
      wireWidth: 80,
      tempData: { inputBuffer: '' },
      promptColumn: visibleColumns(ANSI_GRAPHICS_PROMPT) % 80,
    };

    for (const ch of 'AAAAA') await handleCommand(socket as any, session, ch);
    const before = socket.emitted.length;
    await handleCommand(socket as any, session, '\x7f');
    flushOutput(socket as any);

    const out = socket.emitted.slice(before)
      .filter((e: any) => e.event === 'ansi-output')
      .map((e: any) => String(e.data ?? '')).join('');

    expect(session.tempData.inputBuffer).toBe('AAAA');
    // Up a row, to the input's column, clear, reprint, place the cursor.
    expect(out).toContain('\x1b[0J');
    expect(out).toMatch(/\x1b\[\d+A/);
    expect(out).toMatch(/\x1b\[\d+G/);
  });

  it('still refuses the eleventh character (express.e:29530)', async () => {
    const socket = makeSocket();
    const session: any = {
      state: BBSState.AWAIT,
      subState: LoggedOnSubState.ANSI_PROMPT,
      screenWidth: 80, wireWidth: 80,
      tempData: { inputBuffer: '' },
      promptColumn: 0,
    };
    for (const ch of 'ABCDEFGHIJKLMNO') await handleCommand(socket as any, session, ch);
    expect(session.tempData.inputBuffer).toBe('ABCDEFGHIJ');
  });
});
