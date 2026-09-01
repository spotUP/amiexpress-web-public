/**
 * The versus screen's right side, as it is actually PAINTED.
 *
 * `versus-layout.ts` decides how many opponents fit; these tests drive the
 * real render path and check the widgets that decision produces. The
 * decision was already tested and the screen still drew one board at
 * column 37 - a layout nobody could see is not a layout.
 *
 * The 80-column cases come first: everything a caller sees today has to
 * survive, because widening a layout is where regressions hide for the
 * people who never widen anything.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { GameEngine } from '../core/game';
import { AttackManager } from '../network/attack-system';
import { VersusScreen } from '../ui/versus-screen';
import { MinimapRenderer } from '../ui/minimap';
import { LEFT_PANEL_COLS, OPPONENT_BOARD_COLS, VS_INFO_COLS } from '../ui/versus-layout';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const settings: any = {
  rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
  ghostPiece: true, lockDelay: 500, previewCount: 4,
  musicVolume: 0, sfxVolume: 0, keyBindings: {},
};
const appState: any = { settings: { ...settings, blockGlow: false, glowIntensity: 0, clearStyle: 'instant' } };
const inputStub: any = { on() {}, off() {}, setEnabled() {} };

/** A board with nothing on it - the geometry is what these tests read. */
function emptyBoard(): any {
  const grid: any[] = [];
  for (let y = 0; y < 22; y++) {
    grid.push(Array.from({ length: 10 }, () => ({ filled: false, color: '' })));
  }
  return { width: 10, height: 22, grid };
}

interface Opp { id: string; name: string; isBot: boolean }

function harness(width: number, opponents: Opp[]) {
  const screen: any = new Screen({
    title: 'versus-render',
    responsive: width !== 80,
    width,
    height: 25,
  });
  const attacks = new AttackManager();
  const engine: any = new GameEngine('versus', settings, sounds, attacks);
  engine.start();
  const vs: any = new VersusScreen(
    screen, engine, inputStub, sounds, appState, null, attacks, undefined, null,
  );
  for (const opp of opponents) {
    vs.opponentTracker.updateOpponent(opp.id, {
      id: opp.id,
      name: opp.name,
      board: emptyBoard(),
      level: 1,
      grade: '9',
      alive: true,
      isBot: opp.isBot,
    });
  }
  vs.render();
  return {
    vs,
    screen,
    boards: (): any[] => vs.opponentBoards.filter((b: any) => !b.hidden && !b.destroyed),
    info: vs.opponentInfoBox,
    minimap: vs.minimapPanel,
    grid: (): string => String(vs.minimapContainer.getContent?.() ?? ''),
    destroy: () => screen.destroy(),
  };
}

// Grid names are cut to three columns by the bucket bars, so the test names
// stay distinct at three: HU1 and BT1 read differently there, HUMAN1 and
// HUMAN2 do not.
function human(n: number): Opp { return { id: `h${n}`, name: `HU${n}`, isBot: false }; }
function bot(n: number): Opp { return { id: `b${n}`, name: `BT${n}`, isBot: true }; }

export async function eightyColumnsStillDrawsTheClassicBoardAndVsPanel(): Promise<void> {
  const h = harness(80, [human(1)]);
  try {
    const boards = h.boards();
    assert.strictEqual(boards.length, 1, 'one opponent, one board');
    assert.strictEqual(boards[0].left, LEFT_PANEL_COLS);
    assert.strictEqual(boards[0].width, OPPONENT_BOARD_COLS);
    assert.strictEqual(h.info.hidden, false, 'the VS panel sits beside it');
    assert.strictEqual(h.info.left, LEFT_PANEL_COLS + OPPONENT_BOARD_COLS);
    assert.strictEqual(h.info.width, VS_INFO_COLS);
    assert.strictEqual(h.minimap.hidden, true, 'no grid in a 1v1');
  } finally { h.destroy(); }
}

export async function eightyColumnsStillSendsACpuBattleToTheGrid(): Promise<void> {
  // Three bots do not fit as boards in 43 columns, and no human opponent
  // outranks them - exactly what the screen did by counting.
  const h = harness(80, [bot(1), bot(2), bot(3)]);
  try {
    assert.strictEqual(h.boards().length, 0, 'nobody gets a board');
    assert.strictEqual(h.minimap.hidden, false);
    assert.strictEqual(h.minimap.left, LEFT_PANEL_COLS);
    assert.strictEqual(h.minimap.width, 80 - LEFT_PANEL_COLS);
    assert.strictEqual(h.info.hidden, true);
    for (const name of ['BT1', 'BT2', 'BT3']) {
      assert.ok(h.grid().includes(name), `${name} is in the grid`);
    }
  } finally { h.destroy(); }
}

export async function theHumanKeepsTheBoardWhenBotsWouldNotFit(): Promise<void> {
  // The case the old count could not express: one person and two CPUs in 80
  // columns used to send all three to miniatures.
  const h = harness(80, [human(1), bot(1), bot(2)]);
  try {
    const boards = h.boards();
    assert.strictEqual(boards.length, 1, 'the human gets the board');
    assert.strictEqual(boards[0].left, LEFT_PANEL_COLS);
    assert.ok(String(boards[0].getLabel?.() ?? '').includes('HU1'),
      'and the board is labelled with their name');
    assert.strictEqual(h.minimap.hidden, false, 'the bots get the grid');
    assert.strictEqual(h.minimap.left, LEFT_PANEL_COLS + OPPONENT_BOARD_COLS);
    assert.strictEqual(h.minimap.width, 80 - (LEFT_PANEL_COLS + OPPONENT_BOARD_COLS));
    const grid = h.grid();
    assert.ok(grid.includes('BT1') && grid.includes('BT2'), 'both bots listed');
    assert.ok(!grid.includes('HU1'), 'the human is not listed twice');
    assert.strictEqual(h.info.hidden, true, 'no VS panel - the grid has that column');
  } finally { h.destroy(); }
}

export async function aWideTerminalDrawsABoardPerOpponent(): Promise<void> {
  const h = harness(120, [human(1), human(2), human(3)]);
  try {
    const boards = h.boards();
    assert.strictEqual(boards.length, 3, '83 spare columns hold three boards');
    assert.deepStrictEqual(boards.map((b: any) => b.left), [37, 59, 81]);
    assert.deepStrictEqual(boards.map((b: any) => b.width), [22, 22, 22]);
    assert.strictEqual(h.minimap.hidden, true);
    assert.strictEqual(h.info.hidden, true, 'the VS panel is a 1v1 thing');
  } finally { h.destroy(); }
}

export async function aWideTerminalPutsTheGridAfterTheBoards(): Promise<void> {
  const h = harness(120, [human(1), human(2), human(3), bot(1), bot(2)]);
  try {
    const boards = h.boards();
    assert.strictEqual(boards.length, 3, 'the humans fit, the five do not');
    assert.strictEqual(h.minimap.hidden, false);
    assert.strictEqual(h.minimap.left, 37 + 3 * OPPONENT_BOARD_COLS, 'grid starts after board three');
    assert.strictEqual(h.minimap.width, 120 - (37 + 3 * OPPONENT_BOARD_COLS));
    const grid = h.grid();
    assert.ok(grid.includes('BT1') && grid.includes('BT2'), 'the bots are in it');
    assert.ok(!grid.includes('HU'), 'the humans are not');
  } finally { h.destroy(); }
}

export async function theBoardsAreActuallyPaintedSideBySide(): Promise<void> {
  // Geometry on a widget nobody paints proves nothing. Read the screen.
  const h = harness(120, [human(1), human(2), human(3)]);
  try {
    h.screen.render();
    const row = h.screen.buffer[1]?.map((c: [number, string]) => c[1]).join('') ?? '';
    // Top border row: each board contributes a corner at its left column.
    for (const left of [37, 59, 81]) {
      assert.notStrictEqual(row[left]?.trim(), '', `board at column ${left} is painted`);
      assert.notStrictEqual(row[left + OPPONENT_BOARD_COLS - 1]?.trim(), '',
        `board at column ${left} is painted to its full width`);
    }
  } finally { h.destroy(); }
}

export async function boardsDisappearWhenOpponentsDo(): Promise<void> {
  // A tracker that empties must not leave three framed rectangles behind.
  const h = harness(120, [human(1), human(2), human(3)]);
  try {
    assert.strictEqual(h.boards().length, 3);
    h.vs.opponentTracker.removeOpponent('h2');
    h.vs.opponentTracker.removeOpponent('h3');
    h.vs.render();
    assert.strictEqual(h.boards().length, 1, 'two boards were taken down');
    // One opponent in 120 columns is a 1v1 again, so the VS panel comes back
    // at column 59 - the frames that must be gone are the ones after it.
    assert.strictEqual(h.info.hidden, false);
    h.screen.render();
    const row = h.screen.buffer[1]?.map((c: [number, string]) => c[1]).join('') ?? '';
    assert.strictEqual(row.slice(59 + VS_INFO_COLS).trim(), '',
      'and the third board is off the screen');
  } finally { h.destroy(); }
}

export async function anEmptyTrackerKeepsTheOneVsOneShell(): Promise<void> {
  // Between the countdown and the first opponent update there is nobody in
  // the tracker; the screen showed an empty CPU board there and should keep
  // doing so rather than flashing a bare column.
  const h = harness(80, []);
  try {
    assert.strictEqual(h.boards().length, 1);
    assert.strictEqual(h.info.hidden, false);
    assert.strictEqual(h.minimap.hidden, true);
  } finally { h.destroy(); }
}

export async function theGridFitsTheColumnsItIsGiven(): Promise<void> {
  // The bucket panel used to assume 41 columns because that is what 80
  // columns left over. A grid squeezed beside full boards has fewer.
  const renderer = new MinimapRenderer({ height: 10, compact: true });
  const opponents = Array.from({ length: 5 }, (_, i) => ({
    id: `b${i}`, name: `BOT${i}`, board: emptyBoard(), level: 1, grade: '9',
    alive: true, isBot: true,
  }));
  const captured: string[] = [];
  const container: any = { width: 41, setContent: (c: string) => captured.push(c), screen: null };

  renderer.renderBuckets(container, opponents as any, 41);
  assert.ok(captured[0].includes('·') || captured[0].includes('█'),
    'five bars fit in 41 columns, so bars is what 80 columns still shows');

  renderer.renderBuckets(container, opponents as any, 15);
  assert.ok(!captured[1].includes('·'), 'five 4-column bars do not fit in 15');
  for (const line of captured[1].split('\n')) {
    const printable = line.replace(/\{[^}]*\}/g, '');
    assert.ok(printable.length <= 15, `"${printable}" (${printable.length}) fits in 15 columns`);
  }
  assert.ok(captured[1].includes('BOT'), 'and it still says who is out there');
}
