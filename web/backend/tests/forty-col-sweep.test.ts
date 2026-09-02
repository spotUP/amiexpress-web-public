/**
 * The 40-column sweep - C64/40-col plan, Task 8.
 *
 * One invariant, applied to every surface the plan adapted:
 *
 *   NO PRINTABLE ROW EMITTED FOR A petsciiMode SESSION EXCEEDS 40 COLUMNS
 *   (39 for a trailing prompt, the row the cursor rests on).
 *
 * The width ruling behind those two numbers (Task 5, from the transducer):
 * a CRLF-terminated row may use all forty columns - the PETSCII transducer
 * latches pendingWrap on the fortieth glyph and newline() consumes the
 * latch (sdk/petscii/ansi-to-petscii.ts:108, :259-303). A PROMPT, which no
 * CRLF follows, stops at 39 or the caller's first keystroke lands on the
 * next row.
 *
 * Each surface's OWN suite proves it is wired and that its 80-column bytes
 * are unchanged; this file is the sweep across all of them at once, driven
 * with adversarial data - 100-character names and descriptions, empty
 * strings, gigabyte sizes, six-figure message numbers - so that a builder
 * that fits the sample data and folds on a real one is caught here.
 *
 * It is deliberately a SWEEP and not a re-test: it asserts the one shared
 * invariant, never a layout. When it goes red, the surface's own suite says
 * what the layout was supposed to be.
 *
 * Adding a narrow surface? Add it here. A surface missing from this file is
 * a surface nobody sweeps.
 *
 * RED by construction, measured 2026-09-02: re-run with every builder given
 * its WIDE (80-column) branch and 22 of these 27 cases fail. The five that
 * do not are the ones with no wide branch to fail into - the two fixed
 * notices (art-skip, door refusal), the always-narrow primitives
 * (narrowFileLines, narrowField/narrowRule/narrowClip), and DOORMAN's
 * installed row, which is sized from its panel's text column and so is
 * ~20 cells wide at 80 too. Every builder that has a width to get wrong is
 * caught here.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../src/index', () => {
  const states = require('../src/constants/bbs-states');
  return {
    BBSState: states.BBSState,
    LoggedOnSubState: states.LoggedOnSubState,
    BBSSession: {},
  };
});

import { printableLength, wrapForSession, wrapDoorTextForSession } from '../src/utils/wrap-for-session.util';
import {
  narrowClip,
  narrowField,
  narrowFileLines,
  narrowMailRow,
  narrowRule,
  NARROW_WIDTH,
  NARROW_PROMPT_WIDTH,
} from '../src/utils/table-format.util';
import { buildMenuPrompt } from '../src/utils/menu-prompt.util';
import { ANSI_ART_SKIPPED_NOTICE } from '../src/utils/ansi-art-detect.util';
import { DOOR_NEEDS_80_NOTICE } from '../src/utils/door-min-columns.util';
import { wipeEffectsEnabled } from '../src/utils/screen-wipe.util';
import { buildFileSearchLines, buildNewFileLines } from '../src/handlers/file/file.handler';
import { buildWhoRow } from '../src/handlers/chat/chat-commands.handler';
import { buildRoomMemberRow } from '../src/handlers/chat/room-commands.handler';
import { buildNodeStatusRow } from '../src/handlers/message/message-commands.handler';
import { buildMsgListRow, buildMessageHeaderLines } from '../src/handlers/message/messaging.handler';
import { buildMailScanRow } from '../src/handlers/message/message-scan.handler';
import { buildProtocolMenuLines } from '../src/handlers/commands/info-commands.handler';
import { formatDoorLine } from '../src/handlers/door.handler';

/** The C64 session every narrow surface is asked about. */
const C64 = { screenWidth: 40, petsciiMode: true, screenHeight: 25 } as any;

/** Adversarial inputs: nothing here fits, and nothing here is well-behaved. */
const LONG = 'X'.repeat(100);
const LONG_WORDS = 'Supercalifragilistic ' + 'Y'.repeat(60) + ' tail';
const PROSE =
  'The sysop has left a message for you in conference two, and the new files ' +
  'listing has forty-one entries since your last call.';
const EMPTY = '';

/**
 * Printable width of one terminal row: ANSI escapes and blessed tags are
 * bytes on the wire, not columns on the screen.
 */
function columns(row: string): number {
  return printableLength(String(row).replace(/\{[^}]*\}/g, ''));
}

/** Every row of every string handed in fits `max` columns. */
function fits(lines: Array<string | null | undefined>, max: number = NARROW_WIDTH): void {
  for (const line of lines) {
    if (line === null || line === undefined) continue;
    for (const row of String(line).split(/\r\n|\n/)) {
      if (columns(row) > max) {
        throw new Error(`row of ${columns(row)} columns (max ${max}): ${JSON.stringify(row)}`);
      }
      expect(columns(row)).toBeLessThanOrEqual(max);
    }
  }
}

describe('40-column sweep: the choke', () => {
  it('prose wrapped for the session', () => {
    fits(wrapForSession(PROSE, C64).split('\r\n'));
  });

  it('a single unbreakable 100-character word', () => {
    fits(wrapForSession(LONG, C64).split('\r\n'));
  });

  it('mixed long words and prose', () => {
    fits(wrapForSession(LONG_WORDS + '\r\n' + PROSE, C64).split('\r\n'));
  });

  it("a door's own prose (BBSApi.write)", () => {
    fits(wrapDoorTextForSession(PROSE, C64).split('\r\n'));
    fits(wrapDoorTextForSession(LONG_WORDS, C64).split('\r\n'));
    // ...and at the stale-80 width a browser reports before `P` is answered.
    fits(wrapDoorTextForSession(PROSE, { petsciiMode: true, screenWidth: 80 } as any).split('\r\n'));
  });
});

describe('40-column sweep: tables', () => {
  it('file rows (name/size, description stacked)', () => {
    fits(narrowFileLines({ filename: LONG, sizeKB: 999999, description: LONG }));
    fits(narrowFileLines({ filename: EMPTY, sizeKB: 0, description: EMPTY }));
  });

  it('fields, rules and clips', () => {
    fits([narrowField(LONG, LONG), narrowField(EMPTY, EMPTY), narrowRule(), narrowRule('='), narrowClip(LONG)]);
  });

  it('file search results', () => {
    fits(
      buildFileSearchLines(C64, {
        filename: LONG,
        size: 1 << 30,
        uploaddate: Date.now(),
        uploader: LONG,
        description: LONG,
        areaname: LONG,
      })
    );
  });

  it('new-file listing rows', () => {
    fits(
      buildNewFileLines(C64, {
        filename: LONG,
        size: 1 << 30,
        uploaddate: Date.now(),
        uploader: LONG,
        description: LONG,
      })
    );
  });

  it('WHO rows', () => {
    fits([
      buildWhoRow({ username: LONG, realname: LONG }, 'Not Available', true),
      buildWhoRow({ username: EMPTY }, 'In A Door', true),
    ]);
  });

  it('room member rows', () => {
    fits([buildRoomMemberRow({ username: LONG }, '[MOD] [MUTED]', 'Joined 12:00', true)]);
  });

  it('node status rows', () => {
    fits(buildNodeStatusRow('24', LONG, LONG, LONG, LONG, true));
  });

  it('message list rows', () => {
    fits(buildMsgListRow({ msgNum: 123456, isPrivate: true, from: LONG, subject: LONG }, true));
  });

  it('mail scan rows', () => {
    fits(buildMailScanRow({ msgNum: 999999, isPrivate: false, from: LONG, subject: LONG }, true));
  });

  it('message header fields', () => {
    fits(
      buildMessageHeaderLines(
        {
          dateStr: LONG,
          msgNumber: 123456,
          toDisplay: LONG,
          recvd: LONG,
          from: LONG,
          statusStr: LONG,
          subject: LONG,
        },
        true
      )
    );
  });

  it('the protocol menu', () => {
    // Its last entry is the trailing prompt, so the whole block is held to
    // the prompt width - the strictest of the two.
    fits(buildProtocolMenuLines(true), NARROW_PROMPT_WIDTH);
  });

  it('door list rows', () => {
    fits([
      formatDoorLine({ name: LONG, command: LONG, type: 'XIM', toolTypes: { MIN_COLUMNS: '40' } }, false, true)
        .replace(/\x1b\[2K/g, ''),
      formatDoorLine({ name: LONG, command: LONG, type: 'XIM', toolTypes: { C64_ADAPT: 'yes' } }, true, true)
        .replace(/\x1b\[2K/g, ''),
      formatDoorLine({ name: EMPTY, command: EMPTY, type: 'TS' }, false, true).replace(/\x1b\[2K/g, ''),
    ]);
  });
});

describe('40-column sweep: prompts', () => {
  it('the main command prompt stops one column short', () => {
    fits(
      [
        buildMenuPrompt(
          { bbsName: LONG, relConfNum: 24, confDisplayName: LONG, timeLeft: 1440 },
          C64
        ),
        buildMenuPrompt({ bbsName: EMPTY, relConfNum: 1, confDisplayName: EMPTY, timeLeft: 0 }, C64),
      ],
      NARROW_PROMPT_WIDTH
    );
  });
});

describe('40-column sweep: screens', () => {
  it('the art-skip token', () => {
    fits([ANSI_ART_SKIPPED_NOTICE]);
  });

  it('a reflowed text screen', () => {
    const screen = [LONG_WORDS, PROSE, '', '-'.repeat(78)].join('\r\n');
    fits(wrapForSession(screen, C64).split('\r\n'));
  });

  it('wipe effects do not run at all on a C64', () => {
    // The frames are composed 80 wide and bypass the choke; the surface's
    // answer is not to fit them but to not play them.
    expect(wipeEffectsEnabled(C64)).toBe(false);
    expect(wipeEffectsEnabled({ screenWidth: 80 })).toBe(true);
  });
});

describe('40-column sweep: the door gate', () => {
  it('the refusal notice', () => {
    fits([DOOR_NEEDS_80_NOTICE]);
  });
});

describe('40-column sweep: the six adapted doors', () => {
  it('ami-stripper: banner, rule, listing row', () => {
    const {
      stripperHeader,
      stripperRule,
      pathColumn,
      fitToWidth,
    } = require('../../../Doors/ami-stripper/layout');
    const col = pathColumn(38, 40);
    fits([
      stripperHeader('12', 40),
      stripperRule(40),
      `  ${'x'.repeat(col)} ${'240 KB'.padStart(7)}`,
      fitToWidth(LONG, 40),
    ]);
  });

  it('doors-menu: category rows, door rows, footer', () => {
    const { buildCategoryRow, buildDoorRow, buildFooterContent } = require('../../../Doors/doors-menu/app');
    fits([
      buildCategoryRow(LONG, 999, true, PLAIN_STYLES, 40),
      buildCategoryRow(EMPTY, 0, false, PLAIN_STYLES, 40),
      buildDoorRow({ type: 'XIM', command: LONG, name: LONG, size: 1 << 30 }, PLAIN_STYLES, 40),
      buildFooterContent(PLAIN_STYLES, 40),
    ]);
  });

  it('theme-picker: theme rows, note, footer hints', () => {
    const { getCompactProfile } = require('../../../sdk/engines/ui/blessed/core/responsive-constants');
    const { buildThemeItems, buildNote, buildFooterHints } = require('../../../Doors/theme-picker/app');
    const compact = getCompactProfile(40);
    fits(buildThemeItems([{ id: 'a', name: LONG, blurb: LONG }], 'a', PLAIN_STYLES, compact, 40));
    fits([buildNote(PLAIN_STYLES, compact)]);
    fits(buildFooterHints(compact).map((h: any) => `${h.key}: ${h.does}`));
  });

  it('bug-tracker: bug title and chrome strips', () => {
    const { CompactLayout } = require('../../../Doors/bug-tracker/layout');
    const layout = new CompactLayout(() => 40);
    fits([
      `#0001 [NEW] ${layout.bugTitle(LONG, 6)}[+99]`,
      layout.stripText(LONG, 'Bugs: 12 open'),
      layout.fit(LONG, 4),
      '#'.repeat(layout.barWidth(40, 12)),
    ]);
  });

  it('DOORMAN: an installed row on a real 40x25 screen', () => {
    const { Screen } = require('../../../sdk/engines/ui/blessed');
    const { DoormanLayout } = require('../../../Doors/door-manager/doorman-layout');
    const screen = new Screen({ width: 40, height: 25, responsive: true } as any);
    const layout = new DoormanLayout(screen, 1);
    try {
      fits([
        layout.installedRow({ type: 'XIM', name: LONG, size: 1 << 30, enabled: true }),
        layout.installedRow({ type: 'TS', name: EMPTY, size: 0, enabled: false }),
      ]);
    } finally {
      try { layout.stopMasthead?.(); } catch { /* leaving anyway */ }
      try { screen.destroy(); } catch { /* leaving anyway */ }
    }
  });

  it('phreakwars: every emitted row goes through say()', () => {
    const ui = require('../../../Doors/phreakwars/lib/ui');
    const rows: string[] = [];
    const socket = { emit: (_e: string, data: string) => rows.push(String(data)) };
    const gameState = { terminalWidth: 40 };
    ui.say(socket, gameState, PROSE);
    ui.say(socket, gameState, LONG_WORDS);
    for (const row of ui.titleBox([{ text: LONG, colour: '\x1b[32m' }], 40)) {
      ui.say(socket, gameState, row);
    }
    fits(rows);
  });
});

/**
 * Identity styles. These assertions are about LAYOUT, not about which theme
 * is active, and a styled string's escapes are not columns.
 */
const PLAIN_STYLES = {
  accent: (t: string) => t,
  accentAlt: (t: string) => t,
  ink: (t: string) => t,
  ok: (t: string) => t,
  dim: (t: string) => t,
  key: (t: string) => t,
  rail: '////////',
};
