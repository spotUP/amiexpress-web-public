// @ts-nocheck
/**
 * The message-header chrome at both screens (sysop bug, live, 2026-09-03).
 *
 * THE BUG. A PETSCII (40-column) caller pressed `E`. express.e's msgToHeader
 * rule is 55 columns wide, so the prose choke word-wrapped it:
 *
 *   [24] "                       ("
 *   [31] "------------------------------)"
 *   [24] "     To: (Enter)='ALL'? "
 *
 * - the rule broken across two rows with the To: prompt sitting under its
 * tail, and the prompt itself still indented for an 80-column screen. The
 * body ruler (80 columns) and the Edit Line rule (80) folded the same way.
 *
 * THE FIX. `messageRule()` / `messageIndent()` in utils/table-format.util.ts:
 * one shared case table of express.e's geometry, rebuilt at
 * `sessionColumns(session)`. Every rule and every fixed header indent in the
 * message family goes through it.
 *
 * THE GATE. Section 1 pins the EXACT BYTES an 80-column caller receives,
 * captured from the code before the change (cap1.log, 2026-09-03) by driving
 * these same real entry points. Nothing in this pass may move them.
 *
 * RED PROOFS (measured 2026-09-03, by reverting):
 *  - put the literals back at the call sites -> every case in section 2
 *    fails: the E rule is 2 rows of 24/31 columns, the ruler 2 rows of 40,
 *    the Edit Line rule 2 rows of 40, the To: prompt 24 columns.
 *  - make `messageRule` ignore `isNarrow` (always narrow) -> all four cases
 *    in section 1 fail.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../../src/index', () => {
  const states = require('../../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});

import { flushOutput } from '../../../src/utils/output.util';
import { printableLength } from '../../../src/utils/wrap-for-session.util';
import { messageIndent, messageRule, NARROW_WIDTH, NARROW_PROMPT_WIDTH } from '../../../src/utils/table-format.util';

const ANSI = { screenWidth: 80, petsciiMode: false };
const C64 = { screenWidth: 40, petsciiMode: true };

let seq = 0;

/** The stub socket the 40-column sweep uses: the session hangs off the socket,
 *  which is where the emitText choke reads it from (ansi-buffer.util.ts:198). */
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
    tempData: { messageEntry: { toUser: '', subject: '', isPrivate: false, body: [] } },
  };
  const socket: any = {
    id: `msg-header-width-${seq++}`,
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
    /** Everything the caller received, as one payload. */
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

/** Printable columns of one row - ANSI escapes are bytes, not columns. */
const columns = (row: string): number => printableLength(row);

/** The `E` command: express.e internalCommandE -> msgToHeader(). */
function enterMessage(d: any, params = '') {
  const m = require('../../../src/handlers/message/messaging.handler');
  m.setMessagingDependencies({ setEnvStat: () => {} });
  m.handleEnterMessageFullCommand(d.socket, d.session, params);
}

/** A message sitting in the reader, so `R` and `F` can be driven for real. */
function seatReader(d: any) {
  d.session.tempData.msgReaderMessages = [
    {
      id: 12,
      msgNumber: 12,
      author: 'Zaphod',
      toUser: 'ALL',
      subject: 'Hello',
      body: 'a line',
      isPrivate: false,
      createdAt: new Date(0),
    },
  ];
  d.session.tempData.msgReaderIndex = 0;
}

// ===========================================================================
// 1. THE GATE - the exact bytes an 80-column caller receives, unchanged.
// ===========================================================================

describe('80-column identity: the message header is byte-identical', () => {
  it('the E command header box and To: prompt (express.e:9998-10001)', () => {
    const d = drive(false);
    enterMessage(d);
    expect(d.out()).toBe(
      '\r\n                       \x1b[32m(\x1b[33m------------------------------\x1b[32m)\x1b[0m\r\n' +
        "     \x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m'\x1b[33mALL\x1b[32m'\x1b[32m?\x1b[0m "
    );
  });

  it('the body editor ruler (express.e:10150-10152)', () => {
    const d = drive(false);
    require('../../../src/handlers/message/message-entry.handler').promptForMessageBody(d.socket, d.session);
    expect(d.out()).toBe(
      '\r\n   Enter your text. (Enter) alone to end. (75 chars/line)\r\n' +
        '   (|-------|-------|-------|-------|-------|-------|-------|-------|-------|--)\r\n' +
        ' 1> '
    );
  });

  it('the Edit Line rule and its pre-fill indent (express.e:10486-10489)', () => {
    const d = drive(false);
    d.session.tempData.messageEntry.body = ['hello world'];
    require('../../../src/handlers/message/message-entry.handler').handleMessageEditLineInput(d.socket, d.session, '1');
    expect(d.out()).toBe(
      '\r\n    Edit Line\r\n' +
        '   (---------------------------------------------------------------------------)\r\n' +
        '    hello world'
    );
  });

  it('the Private prompt indent (express.e:10861)', async () => {
    const d = drive(false);
    d.session.tempData.messageEntry.toUser = 'Alice';
    await require('../../../src/handlers/message/message-entry.handler').handleMessageSubjectInput(
      d.socket,
      d.session,
      'Hi there'
    );
    expect(d.out()).toBe('\r\n         \x1b[36mPrivate \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)?\x1b[0m ');
  });

  it('the reply header box (express.e:9881-9884)', async () => {
    const d = drive(false);
    seatReader(d);
    await require('../../../src/handlers/message/messaging.handler').handleMessageReaderNav(d.socket, d.session, 'R');
    expect(d.out()).toContain(
      '\r\n                       \x1b[32m(\x1b[33m------------------------------\x1b[32m)\x1b[0m\r\n' +
        "     \x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m'\x1b[33mALL\x1b[32m'\x1b[32m?\x1b[0m Zaphod\r\n"
    );
  });

  it('the forward header box (express.e:9816)', async () => {
    const d = drive(false);
    seatReader(d);
    await require('../../../src/handlers/message/messaging.handler').handleMessageReaderNav(d.socket, d.session, 'F');
    expect(d.out()).toContain(
      '\r\n                       \x1b[32m(\x1b[33m------------------------------\x1b[32m)\x1b[0m\r\n' +
        "     \x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m'\x1b[33mALL\x1b[32m'\x1b[32m?\x1b[0m "
    );
  });

  it('the helper itself reproduces every express.e literal', () => {
    expect(messageRule(ANSI, 'headerBox')).toBe(
      '                       \x1b[32m(\x1b[33m------------------------------\x1b[32m)\x1b[0m'
    );
    expect(messageRule(ANSI, 'editLine')).toBe(`   (${'-'.repeat(75)})`);
    expect(messageRule(ANSI, 'bodyRuler')).toBe(
      '   (|-------|-------|-------|-------|-------|-------|-------|-------|-------|--)'
    );
    expect(messageIndent(ANSI, 'to')).toBe('     ');
    expect(messageIndent(ANSI, 'private')).toBe('         ');
    expect(messageIndent(ANSI, 'editLine')).toBe('    ');
  });

  it('a wider terminal keeps the express.e geometry (the legacy path)', () => {
    const wide = { screenWidth: 132, petsciiMode: false };
    expect(messageRule(wide, 'headerBox')).toBe(messageRule(ANSI, 'headerBox'));
    expect(messageRule(wide, 'bodyRuler')).toBe(messageRule(ANSI, 'bodyRuler'));
    // A phone reporting 40 columns over NAWS is NOT a C64 - sessionColumns
    // floors it at 80, so it keeps the express.e bytes too.
    const phone = { screenWidth: 40, petsciiMode: false };
    expect(messageRule(phone, 'headerBox')).toBe(messageRule(ANSI, 'headerBox'));
    expect(messageIndent(phone, 'to')).toBe('     ');
  });
});

// ===========================================================================
// 2. THE FIX - 40 columns, through the same real entry points.
// ===========================================================================

describe('40-column layout: nothing folds', () => {
  it('the E command draws ONE rule row of forty columns, not two', () => {
    const d = drive(true);
    enterMessage(d);
    const rows = d.rows();

    const rule = rows.find((r) => /^\s*\x1b\[32m\(/.test(r));
    expect(rule).toBeDefined();
    expect(columns(rule as string)).toBe(NARROW_WIDTH);
    // The pre-fix bug: the rule arrived as `(` alone, then `----...)` on the
    // next row, with the To: prompt under that tail.
    expect(rows.some((r) => /^-+\)/.test(r.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')))).toBe(false);

    for (const row of rows) {
      expect(columns(row)).toBeLessThanOrEqual(NARROW_WIDTH);
    }
  });

  it('the To: prompt fits with room to answer in', () => {
    const d = drive(true);
    enterMessage(d);
    const rows = d.rows();
    const prompt = rows[rows.length - 1];
    const plain = prompt.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

    expect(plain).toBe(" To: (Enter)='ALL'? ");
    expect(columns(prompt)).toBeLessThanOrEqual(NARROW_PROMPT_WIDTH);
    // express.e takes a recipient of up to 30 characters (lineInput max=30);
    // the caller must have somewhere to type at least part of one without
    // the prompt itself having eaten the row.
    expect(NARROW_PROMPT_WIDTH - columns(prompt)).toBeGreaterThanOrEqual(19);
  });

  it('the body editor ruler is one row', () => {
    const d = drive(true);
    require('../../../src/handlers/message/message-entry.handler').promptForMessageBody(d.socket, d.session);
    const rows = d.rows();
    const ruler = rows.find((r) => r.includes('|-------'));
    expect(ruler).toBe(' (|-------|-------|-------|-------|----)');
    expect(columns(ruler as string)).toBe(NARROW_WIDTH);
    for (const row of rows) {
      expect(columns(row)).toBeLessThanOrEqual(NARROW_WIDTH);
    }
  });

  it('the Edit Line rule is one row and its pre-fill is indented for forty', () => {
    const d = drive(true);
    d.session.tempData.messageEntry.body = ['hello world'];
    require('../../../src/handlers/message/message-entry.handler').handleMessageEditLineInput(d.socket, d.session, '1');
    const rows = d.rows();
    expect(rows).toContain(` (${'-'.repeat(37)})`);
    expect(rows).toContain('  hello world');
    for (const row of rows) {
      expect(columns(row)).toBeLessThanOrEqual(NARROW_WIDTH);
    }
  });

  it('the Private prompt is indented for forty', async () => {
    const d = drive(true);
    d.session.tempData.messageEntry.toUser = 'Alice';
    await require('../../../src/handlers/message/message-entry.handler').handleMessageSubjectInput(
      d.socket,
      d.session,
      'Hi there'
    );
    const rows = d.rows();
    const prompt = rows[rows.length - 1];
    expect(prompt.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')).toBe(' Private (y/N)? ');
    expect(columns(prompt)).toBeLessThanOrEqual(NARROW_PROMPT_WIDTH);
  });

  it('the reply and forward headers fit too', async () => {
    for (const command of ['R', 'F']) {
      const d = drive(true);
      seatReader(d);
      await require('../../../src/handlers/message/messaging.handler').handleMessageReaderNav(
        d.socket,
        d.session,
        command
      );
      for (const row of d.rows()) {
        if (columns(row) > NARROW_WIDTH) {
          throw new Error(`${command}: row of ${columns(row)} columns: ${JSON.stringify(row)}`);
        }
      }
      expect(d.rows()).toContain(` \x1b[32m(\x1b[33m${'-'.repeat(37)}\x1b[32m)\x1b[0m`);
    }
  });

  it('the helper fills the row exactly at forty, whatever the shape', () => {
    for (const kind of ['headerBox', 'editLine', 'bodyRuler'] as const) {
      const rule = messageRule(C64, kind);
      expect(columns(rule)).toBe(NARROW_WIDTH);
      expect(rule.split('\r\n')).toHaveLength(1);
    }
    expect(messageIndent(C64, 'to')).toBe(' ');
    expect(messageIndent(C64, 'private')).toBe(' ');
    expect(messageIndent(C64, 'editLine')).toBe('  ');
  });
});
