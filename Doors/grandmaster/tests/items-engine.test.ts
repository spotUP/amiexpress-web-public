/**
 * TGM item system - engine + versus-screen integration tests.
 *
 * These drive the real GameEngine.lockPiece() / spawnPiece() paths (not
 * core/items.ts's pure functions in isolation - see items.test.ts for
 * those) so a passing test actually proves clearing a line with an item on
 * it collects and applies that item, the way it will happen in a live game.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { GameEngine } from '../core/game';
import { createBoard } from '../core/board';
import { AttackManager } from '../network/attack-system';
import { VersusAI } from '../ai/versus-ai';
import { VersusScreen } from '../ui/versus-screen';
import { HARD_BLOCK_ITEM } from '../core/items';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const settings: any = {
  rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
  ghostPiece: true, lockDelay: 500, previewCount: 4,
  musicVolume: 0, sfxVolume: 0, keyBindings: {},
};
const appState: any = { settings: { ...settings, blockGlow: false, glowIntensity: 0, clearStyle: 'instant' } };
const inputStub: any = { on() {}, off() {}, setEnabled() {} };

/**
 * Rig a bare engine so a hardDrop() completes exactly one line: fill the
 * bottom row's columns 0-5, then hand the engine a controlled horizontal
 * I-piece (SRS rotation 0, shape's filled row is row-index 1) carrying
 * `itemId` sitting over the remaining columns 6-9, y positioned so it is
 * already at rest (bottom row = the board's own floor).
 */
function rigOneLineClear(engine: GameEngine, itemId: number | null): void {
  const state = engine.getState();
  const board = state.board;
  const bottom = board.height - 1;
  for (let x = 0; x < 6; x++) {
    board.grid[bottom][x] = { filled: true, color: 'I', locked: true, item: null };
  }
  state.currentPiece = {
    type: 'I', rotation: 0, x: 6, y: bottom - 1, itemId,
  } as any;
}

function columnFilledRows(board: any, x: number): number[] {
  const rows: number[] = [];
  for (let y = 0; y < board.height; y++) if (board.grid[y][x].filled) rows.push(y);
  return rows;
}

// ============================================================================
// Collection + HUD banner
// ============================================================================

export async function clearingALineWithAnItemOnItCollectsAndShowsItsName(): Promise<void> {
  const engine: any = new GameEngine('versus', settings, sounds);
  engine.start();
  rigOneLineClear(engine, 28); // FREEFALL - self-targeted, no cross-engine wiring needed

  assert.strictEqual(engine.getState().itemBanner, null, 'no banner before the drop');
  engine.hardDrop();

  assert.ok(engine.getState().itemBanner, 'a banner appears once the item is collected');
  assert.strictEqual(engine.getState().itemBanner.name, 'FREEFALL');
}

export async function noItemMeansNoCollectionEvenWhenTheLineClears(): Promise<void> {
  const engine: any = new GameEngine('versus', settings, sounds);
  engine.start();
  rigOneLineClear(engine, null);
  engine.hardDrop();
  assert.strictEqual(engine.getState().itemBanner, null, 'plain line clears never show an item banner');
}

export async function itemBannerClearsAfterItsTtlExpires(): Promise<void> {
  const engine: any = new GameEngine('versus', settings, sounds);
  engine.start();
  rigOneLineClear(engine, 28);
  engine.hardDrop();
  assert.ok(engine.getState().itemBanner, 'banner is up right after collection');

  for (let i = 0; i < 20 && engine.getState().itemBanner; i++) {
    engine.update(200); // update() caps at 8 frames/call - many calls needed
  }
  assert.strictEqual(engine.getState().itemBanner, null, 'banner faded out');
}

// ============================================================================
// Self-targeted effect (17/18/19/28/29/30) - applied with no opponent
// ============================================================================

export async function freefallCollectionCompactsAFloatingBlockToTheFloor(): Promise<void> {
  const engine: any = new GameEngine('versus', settings, sounds);
  engine.start();
  const board = engine.getState().board;

  // A floating block far from the row that is about to clear.
  board.grid[10][0] = { filled: true, color: 'I', locked: true, item: null };

  rigOneLineClear(engine, 28); // FREEFALL
  engine.hardDrop();

  assert.deepStrictEqual(
    columnFilledRows(board, 0), [board.height - 1],
    'the floating block fell to the floor once FREEFALL applied'
  );
}

// ============================================================================
// HARD BLOCK (25) - a row carrying it can never clear
// ============================================================================

export async function hardBlockCollectedByOwnLineNeverClearsThatRow(): Promise<void> {
  // Not a real pickup path (HARD is enemy-targeted) - this exercises
  // setPendingItem()/insertHardBlockNext()'s effect directly: the very next
  // piece to spawn carries the hard-block sentinel, and any row it completes
  // must survive.
  const engine: any = new GameEngine('versus', settings, sounds);
  engine.setPendingItem(HARD_BLOCK_ITEM);
  engine.start(); // spawnPiece() consumes the override for the very first piece
  assert.strictEqual(engine.getState().currentPiece.itemId, HARD_BLOCK_ITEM);

  rigOneLineClear(engine, HARD_BLOCK_ITEM);
  const linesBefore = engine.getState().lines;

  engine.hardDrop();

  const board = engine.getState().board;
  const bottom = board.height - 1;
  let filledCount = 0;
  for (let x = 0; x < board.width; x++) if (board.grid[bottom][x].filled) filledCount++;
  assert.strictEqual(filledCount, 10, 'the hard-blocked row stayed fully filled instead of clearing');
  assert.strictEqual(engine.getState().lines, linesBefore, 'no line was credited either');
}

// ============================================================================
// Enemy-targeted effect, routed by VersusScreen (setupItemRouting)
// ============================================================================

function battle() {
  const screen: any = new Screen({ title: 'items-test' });
  const attackManager = new AttackManager();
  const humanEngine: any = new GameEngine('versus', settings, sounds, attackManager);
  const ai = new VersusAI();
  const opponents = ai.createOpponents(1, 5, settings, sounds);
  humanEngine.start();
  const vs: any = new VersusScreen(screen, humanEngine, inputStub, sounds, appState, null, attackManager, ai, null);
  const done = () => screen.destroy();
  return { humanEngine, opponents, vs, done };
}

export async function mirrorCollectedByTheHumanFlipsTheOpponentsBoardNotTheHumans(): Promise<void> {
  const b = battle();
  try {
    const oppBoard = b.opponents[0].engine.getBoard();
    oppBoard.grid[20][0] = { filled: true, color: 'I', locked: true, item: null };
    oppBoard.grid[20][3] = { filled: true, color: 'I', locked: true, item: null };

    rigOneLineClear(b.humanEngine, 1); // MIRROR - enemy-targeted
    b.humanEngine.hardDrop();

    const xs: number[] = [];
    for (let x = 0; x < oppBoard.width; x++) if (oppBoard.grid[20][x].filled) xs.push(x);
    assert.deepStrictEqual(xs, [6, 9], 'opponent board mirrored left-right (width 10: x -> 9-x)');
  } finally { b.done(); }
}

export async function hardBlockCollectedByTheHumanReachesTheOpponentsNextPiece(): Promise<void> {
  const b = battle();
  try {
    rigOneLineClear(b.humanEngine, 25); // HARD - enemy-targeted
    b.humanEngine.hardDrop();

    // insertHardBlockNext() sets a private override consumed by the
    // opponent's next spawnPiece(); check that wiring landed rather than
    // re-deriving the effect (already proven directly above).
    assert.strictEqual(
      (b.opponents[0].engine as any).pendingItemOverride, HARD_BLOCK_ITEM,
      'VersusScreen routed the HARD pickup to the opponent engine'
    );
  } finally { b.done(); }
}

export async function noOpponentFallsBackToTheCollectorPerTheReferencesOwnRule(): Promise<void> {
  // gamestart.c:14358-14365: "enemy = 1 - player, falling back to enemy =
  // player" when there is no second player. Same engine wired with no
  // versusAI/opponents at all - an enemy-targeted item must not throw and
  // must land somewhere (the collector).
  const screen: any = new Screen({ title: 'items-solo' });
  const attackManager = new AttackManager();
  const humanEngine: any = new GameEngine('versus', settings, sounds, attackManager);
  humanEngine.start();
  const vs: any = new VersusScreen(screen, humanEngine, inputStub, sounds, appState, null, attackManager, undefined, null);
  try {
    // Seeded one row above the bottom, which is where rigOneLineClear()
    // completes and clears a line: clearing the board's LAST row shifts
    // every row above it down by one (splice the tail, unshift a blank at
    // the top), so this pattern lands at row 21 by the time MIRROR runs.
    humanEngine.getBoard().grid[20][0] = { filled: true, color: 'I', locked: true, item: null };
    humanEngine.getBoard().grid[20][3] = { filled: true, color: 'I', locked: true, item: null };

    rigOneLineClear(humanEngine, 1); // MIRROR
    assert.doesNotThrow(() => humanEngine.hardDrop());

    const xs: number[] = [];
    for (let x = 0; x < 10; x++) if (humanEngine.getBoard().grid[21][x].filled) xs.push(x);
    assert.deepStrictEqual(xs, [6, 9], 'with no opponent, the mirror applied to the collector\'s own board');
  } finally { screen.destroy(); }
}

// ============================================================================
// Selection wired into the real spawn loop
// ============================================================================

export async function spawnedPiecesEventuallyCarryAnItemOnceTheGaugeFills(): Promise<void> {
  // gamestart.c:834 item_interval = 20 - the 21st spawn (gauge 1..20 no
  // item, gauge 21 draws) should carry one. Board is reset to empty between
  // drops so stacking never tops the game out before that happens - this
  // test is about the gauge/draw wiring, not survivable play.
  const engine: any = new GameEngine('versus', settings, sounds);
  engine.enableItems('TGM');
  engine.start();

  let sawItem = engine.getState().currentPiece.itemId != null;
  for (let i = 0; i < 24 && !sawItem; i++) {
    engine.getState().board.grid = createBoard(engine.getState().board.width, engine.getState().board.height).grid;
    engine.hardDrop();
    for (let f = 0; f < 30 && !engine.getState().currentPiece && engine.getState().status === 'playing'; f++) {
      engine.update(50);
    }
    if (engine.getState().status !== 'playing') break;
    sawItem = engine.getState().currentPiece?.itemId != null;
  }
  assert.ok(sawItem, 'no spawned piece carried an item within the expected gauge window');
}

// ============================================================================
// The item SETTING - HeborisCE's other half of the gate.
//
// gamestart.c:6994 reads `gameMode[player] == 4 || item_mode[player]`: versus
// ALWAYS has items, and any other mode has them when the player turned
// item_mode on. This door implemented the versus half only, so items were
// unreachable in Master, Death, Marathon and Sprint - reported by the sysop
// on 2026-09-02 ("i saw no items i tried grandmaster mode").
// ============================================================================

export async function theItemSettingTurnsItemsOnOutsideVersus(): Promise<void> {
  const off: any = new GameEngine('master', settings, sounds);
  assert.strictEqual(off.itemsEnabled(), false, 'items stay off when the setting is absent');

  const explicitlyOff: any = new GameEngine('master', { ...settings, itemMode: 'OFF' }, sounds);
  assert.strictEqual(explicitlyOff.itemsEnabled(), false, "'OFF' means off");

  for (const preset of ['TGM', 'ALL', 'FEW', 'DS'] as const) {
    const on: any = new GameEngine('master', { ...settings, itemMode: preset }, sounds);
    assert.strictEqual(on.itemsEnabled(), true, `${preset} must enable items in a single-player mode`);
  }
}

export async function aSinglePlayerPickupLandsOnTheCollector(): Promise<void> {
  // gamestart.c:14358-14365 - "enemy = 1 - player, falling back to enemy =
  // player". Single player has no VersusScreen to route through, so the
  // engine itself must apply an enemy-targeted item to the collector rather
  // than dropping it (which is what an unhandled callback did).
  const engine: any = new GameEngine('master', { ...settings, itemMode: 'TGM' }, sounds);
  engine.start();

  // Same seeding as the versus fallback test: one row above the bottom,
  // because clearing the last row shifts everything down by one.
  engine.getBoard().grid[20][0] = { filled: true, color: 'I', locked: true, item: null };
  engine.getBoard().grid[20][3] = { filled: true, color: 'I', locked: true, item: null };

  rigOneLineClear(engine, 1); // MIRROR - enemy-targeted
  assert.doesNotThrow(() => engine.hardDrop());

  const xs: number[] = [];
  for (let x = 0; x < 10; x++) if (engine.getBoard().grid[21][x].filled) xs.push(x);
  assert.deepStrictEqual(xs, [6, 9], 'the mirror applied to the collector\'s own board');
  assert.ok(engine.getState().itemBanner, 'and the HUD said which item it was');
}

export async function theItemModeIsOnTheSettingsMenu(): Promise<void> {
  const { SettingsScreen } = await import('../ui/settings-screen');
  const screen: any = new Screen({ title: 'items-settings' });
  try {
    const state: any = {
      ...appState,
      settings: {
        ...appState.settings,
        itemMode: 'TGM',
        clearDirection: 'in',
        placementEffects: false,
        floatTextMode: 'off',
        b2bGlowEnabled: false,
        connectedBlocks: false,
        gamepadBindings: {},
      },
    };
    const settingsScreen: any = new SettingsScreen(screen, state, sounds, null);
    const items: string[] = settingsScreen.getMenuItems();
    const row = items.find(i => i.toLowerCase().includes('item'));
    assert.ok(row, 'the settings menu must offer the item mode');
    assert.ok(row!.includes('TGM'), `the row must show the current value, got: ${row}`);
  } finally { screen.destroy(); }
}

// ============================================================================
// The two timed items - DEATH BLOCK (3) and ROLL ROLL (2).
//
// Both were on the "no live code path" list and both turned out to have one.
// They are counted in PIECES, the way HeborisCE spends item_t
// (gamestart.c:7092-7100), not in seconds.
// ============================================================================

/** Cells the ACTIVE piece occupies, from the engine's own shape lookup. */
function activePieceCells(engine: any): number {
  const piece = engine.getState().currentPiece;
  const shape = (engine as any).pieceManager.getShape(piece.type, piece.rotation, !!piece.big);
  return shape.reduce((n: number, row: number[]) => n + row.filter((c: number) => c).length, 0);
}

export async function deathBlockMakesTheNextPiecesBig(): Promise<void> {
  const engine: any = new GameEngine('master', { ...settings, itemMode: 'TGM' }, sounds);
  engine.start();
  assert.strictEqual(activePieceCells(engine), 4, 'a normal piece is four cells');

  // gamestart.c:13502 - eraseItem sets IsBig on the target.
  engine.applyItemEffectResult({ bigPieces: 2 });
  assert.strictEqual(engine.getState().bigPiecesRemaining, 2);

  const sizes: number[] = [];
  for (let piece = 0; piece < 3; piece++) {
    engine.getState().board.grid =
      createBoard(engine.getState().board.width, engine.getState().board.height).grid;
    engine.hardDrop();
    for (let f = 0; f < 40 && !engine.getState().currentPiece; f++) engine.update(50);
    assert.ok(engine.getState().currentPiece, 'a piece must have spawned');
    sizes.push(activePieceCells(engine));
  }

  assert.deepStrictEqual(sizes, [16, 16, 4],
    'two BIG pieces (each cell a 2x2 block), then back to normal - item_t > 1');
}

export async function aBigPieceLocksSixteenCells(): Promise<void> {
  const engine: any = new GameEngine('master', settings, sounds);
  engine.start();
  engine.applyItemEffectResult({ bigPieces: 1 });
  engine.hardDrop();                                   // spend the normal piece
  for (let f = 0; f < 40 && !engine.getState().currentPiece; f++) engine.update(50);
  engine.getState().board.grid =
    createBoard(engine.getState().board.width, engine.getState().board.height).grid;

  assert.strictEqual(activePieceCells(engine), 16, 'the spawned piece is BIG');
  engine.hardDrop();

  const filled = engine.getState().board.grid
    .reduce((n: number, row: any[]) => n + row.filter(c => c.filled).length, 0);
  assert.strictEqual(filled, 16, 'and it locks all sixteen cells (setBigBlock)');
}

export async function rollRollTurnsThePieceByItself(): Promise<void> {
  // ars.c:66-70 - in versus and item mode, `gametime % p_rollroll_timer == 0`,
  // p_rollroll_timer being 30 (init.c:729). The rotation is the same CW one
  // the player's key would ask for: `move = (BTN_B || rolling) - ...`.
  const engine: any = new GameEngine('master', settings, sounds);
  engine.start();
  engine.getState().currentPiece = { type: 'T', rotation: 0, x: 4, y: 5 };

  engine.applyItemEffectResult({ rollRollPieces: 4 });

  for (let frame = 0; frame < 29; frame++) engine.update(1000 / 60);
  assert.strictEqual(engine.getState().currentPiece.rotation, 0, 'nothing turns before 30 frames');

  engine.update(1000 / 60);
  assert.strictEqual(engine.getState().currentPiece.rotation, 1, 'the 30th frame turns it clockwise');
}

export async function rollRollStopsAfterFourPieces(): Promise<void> {
  const engine: any = new GameEngine('master', settings, sounds);
  engine.start();
  engine.applyItemEffectResult({ rollRollPieces: 4 });

  for (let piece = 0; piece < 4; piece++) {
    engine.getState().board.grid =
      createBoard(engine.getState().board.width, engine.getState().board.height).grid;
    engine.hardDrop();
    for (let f = 0; f < 40 && !engine.getState().currentPiece; f++) engine.update(50);
  }
  assert.strictEqual(engine.getState().rollRollPiecesRemaining, 0, 'four pieces spend it');

  const piece = engine.getState().currentPiece;
  piece.type = 'T'; piece.rotation = 0; piece.x = 4; piece.y = 5;
  for (let frame = 0; frame < 60; frame++) engine.update(1000 / 60);
  assert.strictEqual(engine.getState().currentPiece.rotation, 0, 'and then it turns no more');
}

export async function aBigPieceSpawnsInsideTheBoard(): Promise<void> {
  // A doubled I piece is eight columns wide; the ordinary I spawn column
  // puts its right-hand cells past a 10-wide field, which used to top the
  // game out at spawn (intermittently - it depends which piece is next).
  for (const type of ['I', 'O', 'T', 'L', 'J', 'S', 'Z'] as const) {
    const engine: any = new GameEngine('master', settings, sounds);
    engine.start();
    engine.applyItemEffectResult({ bigPieces: 4 });
    engine.getState().nextQueue = [type, type, type, type, type, type];
    engine.getState().board.grid =
      createBoard(engine.getState().board.width, engine.getState().board.height).grid;
    engine.hardDrop();
    for (let f = 0; f < 40 && !engine.getState().currentPiece; f++) engine.update(50);

    const state = engine.getState();
    assert.strictEqual(state.status, 'playing', `a BIG ${type} must not top the game out at spawn`);
    const piece = state.currentPiece;
    const shape = (engine as any).pieceManager.getShape(piece.type, piece.rotation, true);
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        assert.ok(piece.x + x >= 0 && piece.x + x < state.board.width,
          `BIG ${type} cell at column ${piece.x + x} is off a ${state.board.width}-wide board`);
      }
    }
  }
}
