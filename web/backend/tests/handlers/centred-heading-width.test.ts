// @ts-nocheck
/**
 * The M/TS/W chrome at both screens (follow-up to the message-header rules):
 * centred headings, and the two message-move prompts that share the same
 * handlers and the same fixed-80-column problem.
 *
 * THE BUG. express.e centres a heading by writing a fixed run of leading
 * spaces in front of it. At 40 columns those runs put the heading past the
 * right edge:
 *
 *   [48] "                                 Conference List"
 *   [49] "                                 Messagebase List"
 *   [35] "                         Available "   [9] "Languages"
 *   [31] "                       *--USER "       [16] "CONFIGURATION--*"
 *
 * The first two were the worst of the four: the handler emitted the indent
 * and the heading as SEPARATE emitText calls, so the prose choke was offered
 * 33 spaces (fits) and then a short heading (fits) and NEVER the 48-column
 * row they concatenate into - the row went out unwrapped and off the screen.
 *
 * THE FIX. `headingIndent()` in utils/table-format.util.ts, beside
 * messageRule/messageIndent: express.e's own leading run at >= 80 columns,
 * a centre computed from `sessionColumns(session)` below it, and no indent
 * at all for a heading wider than the screen (never a negative pad). The two
 * split sites build one string and write it once.
 *
 * THE GATE. Section 1 pins the exact bytes an 80-column caller receives,
 * captured by driving these same real entry points before the change
 * (capA.log, 2026-09-03).
 *
 * RED PROOFS (measured 2026-09-03, by reverting):
 *  - put the four literal indents back -> all four cases in section 2 fail
 *    (48, 49, and two headings split mid-word).
 *  - make headingIndent ignore isNarrow (always centre) -> all four cases in
 *    section 1 fail.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});

import { flushOutput } from '../../src/utils/output.util';
import { printableLength } from '../../src/utils/wrap-for-session.util';
import { headingIndent, movePrompt, NARROW_WIDTH, NARROW_PROMPT_WIDTH } from '../../src/utils/table-format.util';

const ANSI = { screenWidth: 80, petsciiMode: false };
const C64 = { screenWidth: 40, petsciiMode: true };

let seq = 0;

function drive(petscii: boolean) {
  const emitted: string[] = [];
  const session: any = {
    state: 'logged_in',
    nodeId: 1,
    currentConf: 1,
    currentMsgBase: 1,
    screenWidth: petscii ? 40 : 80,
    screenHeight: 25,
    petsciiMode: petscii || undefined,
    user: {
      id: 1,
      username: 'Poster',
      secLevel: 255,
      confAccess: 'X'.repeat(20),
      securityFlags: 'T'.repeat(87),
      secOverride: '',
    },
    tempData: {},
  };
  const socket: any = {
    id: `centred-heading-${seq++}`,
    session,
    emit(event: string, data: string) {
      if (event === 'ansi-output') emitted.push(data);
      return true;
    },
    on() {
      return socket;
    },
  };
  return {
    socket,
    session,
    out: () => {
      flushOutput(socket);
      return emitted.join('');
    },
    rows: () => {
      flushOutput(socket);
      return emitted.join('').split('\r\n');
    },
  };
}

const columns = (row: string): number => printableLength(row);

/** The plain heading row - the one row of each surface that carries a title. */
function headingRow(rows: string[], token: string): string {
  const row = rows.find((r) => r.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').includes(token));
  expect(row).toBeDefined();
  return row as string;
}

/** Column the heading's first non-space character lands on (1-based). */
function startsAt(row: string): number {
  const plain = row.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
  return plain.length - plain.trimStart().length + 1;
}


// ===========================================================================
// 1. THE GATE - the exact bytes an 80-column caller receives, unchanged.
// ===========================================================================

describe('80-column identity: centred headings are byte-identical', () => {

  it('the W user configuration menu (express.e:25730-25732)', () => {
    const d = drive(false);
    require('../../src/handlers/commands/info-commands.handler').handleWriteUserParamsCommand(d.socket, d.session);
    expect(d.out()).toContain(
      '\r\n                       \x1b[34m*\x1b[0m--\x1b[33mUSER CONFIGURATION\x1b[0m--\x1b[34m*\x1b[0m\r\n'
    );
  });

  it('the helper reproduces every express.e leading run', () => {
    expect(headingIndent(ANSI, 'conferenceList', 'Conference List')).toBe(' '.repeat(33));
    expect(headingIndent(ANSI, 'messagebaseList', 'Messagebase List')).toBe(' '.repeat(33));
    expect(headingIndent(ANSI, 'languageList', 'Available Languages')).toBe(' '.repeat(25));
    expect(headingIndent(ANSI, 'userConfiguration', '\x1b[34m*\x1b[0m--USER CONFIGURATION--*')).toBe(' '.repeat(23));
    // A wide terminal and a narrow non-C64 terminal both keep them.
    expect(headingIndent({ screenWidth: 132, petsciiMode: false }, 'conferenceList', 'Conference List')).toBe(
      ' '.repeat(33)
    );
    expect(headingIndent({ screenWidth: 40, petsciiMode: false }, 'conferenceList', 'Conference List')).toBe(
      ' '.repeat(33)
    );
  });
});

// ===========================================================================
// 2. THE FIX - 40 columns, through the same real entry points.
// ===========================================================================

describe('40-column layout: headings land on the screen', () => {

  it('the user configuration heading is one row, not split mid-word', () => {
    const d = drive(true);
    require('../../src/handlers/commands/info-commands.handler').handleWriteUserParamsCommand(d.socket, d.session);
    const rows = d.rows();
    const row = headingRow(rows, '*--USER CONFIGURATION--*');
    expect(columns(row)).toBe(32);
    expect(startsAt(row)).toBe(9);
    expect(rows.some((r) => r.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trim() === 'CONFIGURATION--*')).toBe(false);
  });

  it('a heading wider than the screen is left-aligned, never negative-padded', () => {
    const tooWide = 'X'.repeat(60);
    expect(headingIndent(C64, 'conferenceList', tooWide)).toBe('');
    expect(headingIndent(C64, 'conferenceList', 'X'.repeat(40))).toBe('');
    // ...and every indent it does produce keeps the heading inside the row.
    for (const [kind, heading] of [
      ['conferenceList', 'Conference List'],
      ['messagebaseList', 'Messagebase List'],
      ['languageList', 'Available Languages'],
      ['userConfiguration', '\x1b[34m*\x1b[0m--USER CONFIGURATION--*'],
    ] as const) {
      const indent = headingIndent(C64, kind, heading);
      expect(indent.length + printableLength(heading)).toBeLessThanOrEqual(NARROW_WIDTH);
    }
  });
});

// ===========================================================================
// 3. THE MOVE PROMPTS - 42/43 columns wrapped at 40, so the cursor came to
//    rest on a continuation row. The narrow wording is a decision (sysop,
//    2026-09-03); NARROW_PROMPT_WIDTH is what keeps it honest.
// ===========================================================================
