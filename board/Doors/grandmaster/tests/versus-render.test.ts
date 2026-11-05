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

function harness(width: number, opponents: Opp[], height = 25) {
  const screen: any = new Screen({
    title: 'versus-render',
    responsive: width !== 80 || height !== 25,
    width,
    height,
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
    list: vs.listPanel,
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

/**
 * A CPU battle at 80 columns: ONE full board, the rest in miniature.
 *
 * This asserted "nobody gets a board" - three bots do not all fit in the 43
 * columns beside the player, so none of them was drawn and the room went
 * black. The sysop asked for the board that does fit: "we have room for one
 * full cpu playfield in ansimode for the cpu battle, add it and keep the
 * remaining ones as minimaps" (2026-09-06). Painted, not merely computed:
 * the layout said one board before this test did, and the screen still drew
 * none.
 */
export async function eightyColumnsGivesACpuBattleOneBoardAndMiniatures(): Promise<void> {
  const h = harness(80, [bot(1), bot(2), bot(3)]);
  try {
    const boards = h.boards();
    assert.strictEqual(boards.length, 1, 'the one board that fits is drawn');
    assert.strictEqual(boards[0].left, LEFT_PANEL_COLS);
    assert.strictEqual(boards[0].width, OPPONENT_BOARD_COLS);

    assert.strictEqual(h.minimap.hidden, false, 'and the other two are beside it');
    assert.strictEqual(h.minimap.left, LEFT_PANEL_COLS + OPPONENT_BOARD_COLS);
    assert.strictEqual(
      h.minimap.left + h.minimap.width, 80,
      'the miniatures use the rest of the screen rather than leaving it black',
    );
    assert.strictEqual(h.info.hidden, true);

    for (const name of ['BT2', 'BT3']) {
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

/**
 * Widening the terminal mid-match rebuilds the right side.
 *
 * The door only got an Alt+Enter switch on 2026-09-01, so until then the
 * width never changed while a match was running and this path had never
 * been exercised. The layout key includes the width for exactly this.
 */
export async function goingFullScreenMidMatchGivesEveryoneABoard(): Promise<void> {
  const h = harness(80, [human(1), human(2), human(3)]);
  try {
    assert.strictEqual(h.boards().length, 0, 'three opponents are miniatures at 80 columns');
    assert.strictEqual(h.minimap.hidden, false);

    h.screen.resize(120, 30);     // what Alt+Enter leads to
    h.vs.render();

    assert.strictEqual(h.boards().length, 3, 'and full boards once there is room');
    assert.deepStrictEqual(h.boards().map((b: any) => b.left), [37, 59, 81]);
    assert.strictEqual(h.minimap.hidden, true, 'with the grid gone');
  } finally { h.destroy(); }
}

export async function goingBackToEightyPutsTheGridBack(): Promise<void> {
  const h = harness(120, [human(1), human(2), human(3)]);
  try {
    assert.strictEqual(h.boards().length, 3);

    h.screen.resize(80, 25);
    h.vs.render();

    assert.strictEqual(h.boards().length, 0, 'the boards do not fit any more');
    assert.strictEqual(h.minimap.hidden, false);
    assert.strictEqual(h.minimap.width, 80 - LEFT_PANEL_COLS, 'and the grid takes the room back');
  } finally { h.destroy(); }
}

/**
 * The cascade, as the screen actually builds it.
 *
 * Three widgets, three groups, and every opponent in exactly one of them.
 */
/**
 * A 98-strong field with names that stay unique when the bucket bars cut
 * them to three characters - BT1 and BT10 are the same bar, and that is a
 * property of the display, not of the grouping under test.
 */
function bigField(): Opp[] {
  return Array.from({ length: 98 }, (_, i) => ({
    id: `b${i}`, name: `A${String(i + 1).padStart(2, '0')}`, isBot: true,
  }));
}

export async function aBattleRoyaleIsPlayfieldsAndAListBelow(): Promise<void> {
  // "the minimaps made no sense in gmaster battle royal, replace them with
  // full players and the list can be moved under the players playfield"
  // (2026-09-02).
  const field = bigField();
  const h = harness(160, field, 50);
  try {
    const boards = h.boards();
    assert.ok(boards.length >= 10, `the window fills with playfields, saw ${boards.length}`);
    assert.strictEqual(h.minimap.hidden, true, 'and no danger bars anywhere');
    assert.strictEqual(h.list.hidden, false, 'the rest are a leaderboard');

    // Under the player's own board, not beside the field.
    assert.strictEqual(h.list.left, 0);
    assert.strictEqual(h.list.top, 24);
    assert.strictEqual(h.list.width, LEFT_PANEL_COLS);
    assert.ok(String(h.list.getLabel?.() ?? '').includes('('), 'labelled with how many it holds');
  } finally { h.destroy(); }
}

export async function nobodyIsInTwoPlacesAtOnce(): Promise<void> {
  const field = bigField();
  const h = harness(160, field);
  try {
    const onBoards = h.boards().map((b: any) => String(b.getLabel?.() ?? '').trim());
    const inGrid = h.grid();
    for (const name of onBoards) {
      assert.ok(name.length > 0);
      assert.ok(!inGrid.includes(name),
        `${name} has a board and must not also be a bar`);
    }
  } finally { h.destroy(); }
}

export async function eightyColumnsDrawsABoardAndTheStandings(): Promise<void> {
  // 43 columns beside the player hold one board and a 21-column strip - the
  // same arithmetic the 1v1 VS panel uses. The screen used to draw the
  // standings across the whole right side with no board at all: "when
  // gmaster is in 80x25 mode i only see myself" (2026-09-02).
  const field = bigField();
  const h = harness(80, field);
  try {
    assert.strictEqual(h.boards().length, 1, 'one opponent is a real playfield');
    assert.strictEqual(h.list.hidden, false);
    assert.strictEqual(h.list.left, LEFT_PANEL_COLS + 22, 'the standings sit beside the board');
    assert.strictEqual(h.list.width, 80 - LEFT_PANEL_COLS - 22);
    assert.strictEqual(h.minimap.hidden, true);
  } finally { h.destroy(); }
}

/**
 * The field is complete before the countdown, so the layout never shuffles.
 *
 * "when starting battle royale... the playfields behind the counter shuffle
 * around a bit; all playfields should be there from the moment the
 * countdown starts with correct layout" (2026-09-02). The tracker filled up
 * as the first AI samples arrived, so the layout key changed on almost
 * every frame of the countdown and boards were created, moved and
 * destroyed underneath it.
 */
export async function everyOpponentExistsBeforeTheCountdown(): Promise<void> {
  const screen: any = new Screen({ title: 'seed', responsive: true, width: 160, height: 50 } as any);
  const attacks = new AttackManager();
  const engine: any = new GameEngine('versus', settings, sounds, attacks);
  engine.start();

  // A CPU battle's opponents exist the moment VersusAI built them.
  // setupAttackRouting() wires every opponent's own manager, so the stand-in
  // has to carry one - the door does.
  const ai: any = {
    getOpponents: () => Array.from({ length: 12 }, (_, i) => ({
      id: `ai-${i + 1}`, name: `CPU ${i + 1}`, alive: true,
      attackManager: new AttackManager(),
    })),
    update() {}, allDead: () => false,
  };
  const vs: any = new VersusScreen(screen, engine, inputStub, sounds, appState, null, attacks, ai, null);
  try {
    vs.seedOpponents();
    assert.strictEqual(vs.opponentTracker.getAliveOpponents().length, 12,
      'every CPU is in the tracker before a single frame is drawn');

    vs.render();
    const first = {
      boards: vs.opponentBoards.filter((b: any) => !b.hidden && !b.destroyed).length,
      grid: vs.minimapPanel.hidden,
      list: vs.listPanel.hidden,
    };

    // A frame later, with the real boards arriving, the layout must be the
    // same one - that is what "no shuffle" means.
    vs.render();
    const second = {
      boards: vs.opponentBoards.filter((b: any) => !b.hidden && !b.destroyed).length,
      grid: vs.minimapPanel.hidden,
      list: vs.listPanel.hidden,
    };
    assert.deepStrictEqual(second, first, 'the layout is settled from the first frame');
    assert.ok(first.boards > 0, 'and it has real playfields in it');
  } finally { screen.destroy(); }
}

export async function seedingIsHarmlessWithNoOpponents(): Promise<void> {
  const screen: any = new Screen({ title: 'seed0', responsive: true, width: 120, height: 30 } as any);
  const attacks = new AttackManager();
  const engine: any = new GameEngine('versus', settings, sounds, attacks);
  engine.start();
  const vs: any = new VersusScreen(screen, engine, inputStub, sounds, appState, null, attacks, undefined, null);
  try {
    vs.seedOpponents();
    assert.strictEqual(vs.opponentTracker.getAliveOpponents().length, 0);
  } finally { screen.destroy(); }
}

/**
 * A CPU battle on a C64 screen.
 *
 * The versus screen was 80-column furniture with hardcoded columns: the well
 * at 22 characters whatever a block cost, the next queue at column 22, the
 * garbage strip at 34, and every opponent widget from LEFT_PANEL_COLS = 37
 * onwards. On a 40-column screen that is a well twice as wide as the blocks
 * in it and four panels drawn past the right edge, which is what a caller
 * saw: "cpu battle has issues the playfield looks wider than it is and the
 * next pieces are too wide" (2026-09-06).
 */
export async function theCpuBattleFitsAFortyColumnScreen(): Promise<void> {
  const h = harness(40, [bot(1)], 25);
  try {
    const vs: any = h.vs;

    assert.strictEqual(vs.boardBox.width, 12, 'ten one-character blocks plus a border');
    assert.strictEqual(vs.nextBox.left, 12, 'the next queue starts where the well ends');

    for (const box of [vs.boardBox, vs.nextBox, vs.holdBox, vs.garbageIndicator, vs.statsBox]) {
      assert.ok(
        box.left + box.width <= 40,
        `a panel runs past the right edge: left ${box.left} + width ${box.width}`,
      );
    }

    // The opponent's own board is placed by the compact geometry - see
    // aFortyColumnCpuBattleShowsTheOpponent. What must stay hidden is the
    // 80-column FURNITURE around it, which starts at column 37 and would be
    // drawn off the edge as loose borders.
    assert.strictEqual(h.info.hidden, true, 'no VS panel');
    assert.strictEqual(h.minimap.hidden, true, 'no opponent grid');
    assert.strictEqual(h.list.hidden, true, 'no standings');
  } finally {
    h.destroy();
  }
}

/** The previews are drawn in the screen's own block width, from one table. */
export async function thePreviewsFollowTheBlockWidth(): Promise<void> {
  for (const [width, expected] of [[80, 8], [40, 4]] as Array<[number, number]>) {
    const h = harness(width, [bot(1)], 25);
    try {
      const vs: any = h.vs;
      vs.renderNextQueue(['I']);
      const row = String(vs.nextBox.getContent()).split('\n')[0].replace(/\{[^}]*\}/g, '');
      assert.strictEqual(
        row.length, expected,
        `an I piece is four blocks; at ${width} columns that is ${expected} characters, got ${row.length}`,
      );
    } finally {
      h.destroy();
    }
  }
}

/**
 * A CPU battle at forty columns shows the CPU.
 *
 * The opponent panels start at LEFT_PANEL_COLS - the width of an 80-column
 * player panel - which is off the right edge of a C64, so the first answer
 * was to hide them: a CPU battle with no CPU in it. Both wells are ten
 * blocks, which at one character each is twelve columns with a frame, so the
 * player, a middle column and the opponent all fit if the middle stops taking
 * whatever is left over: "cpu battle has broken layout make the middle
 * columns less wide and fit the full cpu playfield" (2026-09-06).
 */
export async function aFortyColumnCpuBattleShowsTheOpponent(): Promise<void> {
  const h = harness(40, [bot(1)], 25);
  try {
    const vs: any = h.vs;
    const boards = h.boards();

    assert.strictEqual(boards.length, 1, 'the opponent is drawn, not hidden');
    assert.strictEqual(boards[0].width, vs.boardBox.width, 'at the same size as the player');
    assert.ok(boards[0].height >= 20, 'and the full height of a field');
    assert.ok(
      boards[0].left >= vs.garbageIndicator.left + vs.garbageIndicator.width,
      'to the right of the middle column',
    );

    for (const box of [vs.boardBox, vs.nextBox, vs.garbageIndicator, boards[0]]) {
      assert.ok(
        box.left + box.width <= 40,
        `a panel runs past the right edge: ${box.left} + ${box.width}`,
      );
    }
  } finally {
    h.destroy();
  }
}

/**
 * A 40-column CPU battle draws the CPU's PIECES, not just its frame.
 *
 * versusLayout counts full boards from LEFT_PANEL_COLS, which is off a C64's
 * right edge, so it answers "no full boards" and puts every opponent in the
 * minimap grid - the grid the compact screen hides. The panel was drawn, the
 * name was set, and nothing was ever rendered into it: "i see no cpu pieces"
 * (2026-09-06).
 */
export async function theFortyColumnCpuBoardHasContent(): Promise<void> {
  const h = harness(40, [bot(1)], 25);
  try {
    const [board] = h.boards();
    assert.ok(board, 'the opponent panel exists');

    const painted = String(board.getContent?.() ?? '').replace(/\{[^}]*\}/g, '');
    assert.ok(
      painted.trim().length > 0 || painted.includes(' '),
      'the CPU board was never rendered into',
    );
    assert.ok(painted.length > 0, 'a board with no content at all is an empty frame');
  } finally {
    h.destroy();
  }
}

/** And an empty garbage strip is hidden rather than left as a mystery box. */
export async function theGarbageStripIsHiddenWhenNothingIsPending(): Promise<void> {
  const h = harness(40, [bot(1)], 25);
  try {
    const vs: any = h.vs;
    vs.renderGarbage(0);
    assert.strictEqual(vs.garbageIndicator.hidden, true, 'no garbage, no box');

    vs.renderGarbage(3);
    assert.strictEqual(vs.garbageIndicator.hidden, false, 'garbage coming, box back');
    assert.match(
      String(vs.garbageIndicator.getContent()).replace(/\{[^}]*\}/g, ''),
      /3/,
      'and it says how much',
    );
  } finally {
    h.destroy();
  }
}
