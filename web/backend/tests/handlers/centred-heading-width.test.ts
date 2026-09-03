// @ts-nocheck
/**
 * Centred headings at both screens (follow-up to the message-header rules).
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
import { headingIndent, NARROW_WIDTH } from '../../src/utils/table-format.util';

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
    tempData: {
      moveDestConf: 1,
      msgReaderMessages: [
        {
          id: 1,
          msgNumber: 1,
          author: 'A',
          toUser: 'ALL',
          subject: 's',
          body: 'b',
          isPrivate: false,
          createdAt: new Date(0),
        },
      ],
      msgReaderIndex: 0,
    },
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

const sysop = () => require('../../src/handlers/message/messaging-sysop');
const withConferences = () =>
  sysop().setMoveEditDependencies({
    conferences: [{ id: 1, name: 'Amiga' }],
    messageBases: [{ id: 1, conferenceId: 1, name: 'Default' }],
  });

// ===========================================================================
// 1. THE GATE - the exact bytes an 80-column caller receives, unchanged.
// ===========================================================================

describe('80-column identity: centred headings are byte-identical', () => {
  it('the M command conference list (express.e:27030-27034)', async () => {
    const d = drive(false);
    withConferences();
    await sysop().handleMsgMoveConfInput(d.socket, d.session, 'L');
    expect(d.out()).toBe(
      '\r\n                                 \x1b[32mConference List\x1b[0m\r\n\r\n' +
        '    1 - Amiga\r\n\r\nConference Number to move to (L to List): '
    );
  });

  it('the M command message base list (express.e:27064-27071)', async () => {
    const d = drive(false);
    withConferences();
    await sysop().handleMsgMoveMsgBaseInput(d.socket, d.session, 'L');
    expect(d.out()).toBe(
      '\r\n                                 \x1b[32mMessagebase List\x1b[0m\r\n\r\n' +
        '    1 - Default\r\n\r\nMessagebase Number to move to (L to List): '
    );
  });

  it('the TS language list (express.e:11395-11397)', async () => {
    const d = drive(false);
    await require('../../src/handlers/message/messaging-translation').handleTranslationCommand(
      d.socket,
      d.session,
      'TS'
    );
    expect(d.out()).toContain('\r\n\x1b[32m                         Available Languages\x1b[0m\r\n\r\n');
  });

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
  it('the conference list heading is one row, centred', async () => {
    const d = drive(true);
    withConferences();
    await sysop().handleMsgMoveConfInput(d.socket, d.session, 'L');
    const rows = d.rows();
    const row = headingRow(rows, 'Conference List');
    expect(columns(row)).toBe(27);
    expect(startsAt(row)).toBe(13);
    // The pre-fix bug: 33 spaces then the heading, unwrapped, off the edge.
    expect(rows.some((r) => /^\s{20,}/.test(r.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')))).toBe(false);
    for (const r of rows) expect(columns(r)).toBeLessThanOrEqual(NARROW_WIDTH);
  });

  it('the message base list heading is one row, centred', async () => {
    const d = drive(true);
    withConferences();
    await sysop().handleMsgMoveMsgBaseInput(d.socket, d.session, 'L');
    const rows = d.rows();
    const row = headingRow(rows, 'Messagebase List');
    expect(columns(row)).toBe(28);
    expect(startsAt(row)).toBe(13);
    for (const r of rows) expect(columns(r)).toBeLessThanOrEqual(NARROW_WIDTH);
  });

  it('the language list heading is one row, not split mid-word', async () => {
    const d = drive(true);
    await require('../../src/handlers/message/messaging-translation').handleTranslationCommand(
      d.socket,
      d.session,
      'TS'
    );
    const rows = d.rows();
    const row = headingRow(rows, 'Available Languages');
    expect(columns(row)).toBe(29);
    expect(startsAt(row)).toBe(11);
    // The pre-fix bug wrapped it into "... Available " + "Languages".
    expect(rows.some((r) => r.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trim() === 'Languages')).toBe(false);
    for (const r of rows) expect(columns(r)).toBeLessThanOrEqual(NARROW_WIDTH);
  });

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
