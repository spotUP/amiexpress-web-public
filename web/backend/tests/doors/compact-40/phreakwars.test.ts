/**
 * phreakwars at 40 columns (C64/PETSCII XXS tier) - C64 40-col plan, Task 6,
 * plus the review round of 2026-09-02.
 *
 * RED, from the door's REAL display functions driven at width 40:
 *
 *   '+==============================================================+'  (64)
 *   '[P] Phreaking - Learn phone manipulation techniques'              (51)
 *   '[B] BBS Exploration - Connect to underground systems'             (52)
 *   '[3] Faster Modem (300 baud upgrade) - $100'                       (42)
 *
 * This door writes through BBSApi.write(), which emits straight to the
 * socket and never passes the backend's wrapForSession - so those rows do
 * not soft-wrap on a C64, they hard-wrap mid-word and eat the row beneath.
 *
 * Every display function is now driven here through a fake socket at 40 and
 * at 80: at 40 no emitted row exceeds 40 printable columns; at 80 the bytes
 * are byte-for-byte what they were before (say() is a straight pass-through
 * at 80 and wider), pinned below on the two rows that used to be widest.
 */

/**
 * `export {}` makes this file a MODULE. Without it a test file that only
 * `require()`s is a global script, and its top-level `const printable` collides
 * with the identical helper in its sibling suites - which is what broke the
 * repo's `typecheck:tests` (jest strips types and never noticed).
 */
export {};

const ui = require('../../../../../Doors/phreakwars/lib/ui');
const { createNewGameState } = require('../../../../../Doors/phreakwars/lib/player');

/** A socket that records payloads, and splits them into terminal rows. */
function recordingSocket() {
  const payloads: string[] = [];
  return {
    payloads,
    emit(event: string, data: string) { if (event === 'ansi-output') payloads.push(data); },
    /** Every row the terminal would show, escapes removed. */
    rows(): string[] {
      return payloads.join('')
        .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
        .split('\r\n');
    },
  };
}

function stateAt(width: number): any {
  const state = createNewGameState();
  state.player.handle = 'PHR34K';
  state.terminalWidth = width;
  return state;
}

const SCREENS = [
  'displayMainMenu', 'displayUpgradesMenu', 'displayHelp', 'displayStats',
  'displayPhreakingMenu', 'displayProgrammingMenu', 'displayTradingMenu',
  'displayBBSExploration', 'displayRomanceMenu', 'displayMultiplayerMenu',
];

describe('phreakwars at 40 columns', () => {
  it.each(SCREENS)('%s: every row it emits fits 40 columns', (screen) => {
    const socket = recordingSocket();
    ui[screen](socket as any, stateAt(40));
    const rows = socket.rows();
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(row.length).toBeLessThanOrEqual(40);
    }
  });

  it('the menu rows that used to run to 51 columns are still readable, not cut', () => {
    const socket = recordingSocket();
    ui.displayHelp(socket as any, stateAt(40));
    const text = socket.rows().join(' ');
    // Wrapped, not truncated: every word of the longest hint survives.
    expect(text).toContain('Phreaking');
    expect(text).toContain('phone manipulation techniques');
  });

  it('a prompt keeps the cursor on its own row (no break appended)', () => {
    const socket = recordingSocket();
    ui.displayMainMenu(socket as any, stateAt(40));
    const last = socket.payloads[socket.payloads.length - 1];
    expect(last).toContain('Choice:');
    expect(last.endsWith('\r\n')).toBe(false);
  });

  it('80 columns: the bytes are exactly what the door emitted before', () => {
    const socket = recordingSocket();
    ui.displayHelp(socket as any, stateAt(80));
    const joined = socket.payloads.join('');
    // The two widest lines, unwrapped and unchanged.
    expect(joined).toContain(
      'Become a master hacker by progressing from novice to legendary status.'
    );
    expect(joined).toContain('[B]\x1b[0m BBS Exploration - Connect to underground systems');
    const upgrades = recordingSocket();
    ui.displayUpgradesMenu(upgrades as any, stateAt(80));
    expect(upgrades.payloads.join('')).toContain('[3]\x1b[0m Faster Modem (300 baud upgrade) - $100');
  });
});

describe('phreakwars title box', () => {
  const LINES = [
    { text: 'PHREAK WARS', colour: '\x1b[32m' },
    { text: 'THE UNDERGROUND BBS EMPIRE', colour: '\x1b[33m' },
  ];
  const printable = (s: string): number =>
    s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r\n$/, '').length;

  it('fits a 40-column screen, frame included', () => {
    const rows = ui.titleBox(LINES, 40);
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(printable(row)).toBe(40);
  });

  it('a title longer than the box is clipped, not folded', () => {
    const [, wide] = ui.titleBox([{ text: 'A'.repeat(80), colour: '' }], 40);
    expect(printable(wide)).toBe(40);
  });

  it('the frame closes on both sides at every width', () => {
    for (const width of [40, 64, 80]) {
      for (const row of ui.titleBox(LINES, width)) {
        const bare = row.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r\n$/, '');
        expect(bare[0]).toMatch(/[+|]/);
        expect(bare[bare.length - 1]).toMatch(/[+|]/);
      }
    }
  });

  it('80 columns: the box is the 64-wide one the door has always drawn', () => {
    const rows = ui.titleBox(LINES, 80);
    for (const row of rows) expect(printable(row)).toBe(64);
    const bare = rows[0].replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r\n$/, '');
    expect(bare).toBe('+' + '='.repeat(62) + '+');
  });

  it('a state with no recorded width falls back to the board default', () => {
    expect(ui.stateWidth({})).toBe(80);
    expect(ui.stateWidth({ terminalWidth: 40 })).toBe(40);
  });
});
