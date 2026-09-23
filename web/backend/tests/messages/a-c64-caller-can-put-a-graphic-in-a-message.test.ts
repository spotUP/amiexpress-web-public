/**
 * A CALLER DRAWS IN A MESSAGE, AND THE MESSAGE KEEPS IT.
 *
 * The editor took a single character only if it was `' '..'~'`, so every
 * PETSCII cell a caller typed was swallowed one keystroke before the body
 * array - the last of the four places a graphic died between a C64 keyboard
 * and the message base ("we want full petscii input <3", the sysop,
 * 2026-09-22).
 *
 * Driven through `handleCommand` - the board's own entry point for every
 * keystroke a caller makes - rather than through the gate itself: the gate
 * is a boolean, and what matters is whether the character reaches the line.
 */
process.env.SKIP_DB_INIT = '1';

import { handleCommand } from '../../src/handlers/command.handler';
import { messageBodyLineLimit } from '../../src/utils/table-format.util';
import { puaForScreenCode } from '@amiexpress/bbs-door-sdk/petscii';
import { BBSState, LoggedOnSubState } from '../../src/index';

/** A horizontal line, the cell a C64 rule is drawn with. */
const LINE = puaForScreenCode(0x40);
/** A bank-0 marker: the board runs one charset, so this must never land. */
const BANK0 = String.fromCodePoint(0xe040);

function makeSocket() {
  const wire: string[] = [];
  return {
    wire,
    socket: {
      id: 'body-gate',
      emit: (event: string, data: unknown) => {
        if (event === 'ansi-output' && typeof data === 'string') wire.push(data);
        return true;
      },
      on: () => {}, off: () => {}, removeListener: () => {},
    } as any,
  };
}

function bodySession(over: Record<string, unknown> = {}): any {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.POST_MESSAGE_BODY,
    petsciiMode: true,
    terminalType: 'c64',
    connectionType: 'web',
    screenWidth: 40,
    screenHeight: 25,
    nodeId: 1,
    currentConf: 1,
    inputBuffer: '',
    user: { id: 1, username: 'spot', secLevel: 255 },
    tempData: {
      messageEntry: { body: [], currentLine: 1, toUser: 'ALL', subject: 'art' },
    },
    ...over,
  };
}

/** Type these characters, then Enter, and answer with the stored line. */
async function typeLine(session: any, chars: string): Promise<string> {
  const { socket } = makeSocket();
  for (const ch of chars) {
    await handleCommand(socket, session, ch);
  }
  await handleCommand(socket, session, '\r');
  const body: string[] = session.tempData.messageEntry.body;
  return body[body.length - 1];
}

describe('a C64 caller writing a message', () => {
  it('keeps the cells he drew', async () => {
    const session = bodySession();

    const stored = await typeLine(session, `ab${LINE}${LINE}cd`);

    expect(stored).toBe(`ab${LINE}${LINE}cd`);
  });

  it('refuses a glyph from the charset bank the board does not run', async () => {
    const session = bodySession();

    const stored = await typeLine(session, `a${BANK0}b`);

    // The board runs one bank board-wide; a bank-0 glyph would make the
    // transducer emit $8E and reflow the caller's whole screen.
    expect(stored).toBe('ab');
  });

  it('cuts a line at the width of the screen he is looking at, not at 75', async () => {
    const session = bodySession();
    const limit = messageBodyLineLimit(session);

    expect(limit).toBeLessThan(75);
    const stored = await typeLine(session, 'x'.repeat(limit + 12));

    expect(stored.length).toBe(limit);
  });

  it('still gives an eighty-column caller the 75 express.e has always given', async () => {
    const wide = bodySession({ petsciiMode: false, terminalType: 'ansi', screenWidth: 80 });

    expect(messageBodyLineLimit(wide)).toBe(75);
    const stored = await typeLine(wide, 'y'.repeat(90));

    expect(stored.length).toBe(75);
  });
});
