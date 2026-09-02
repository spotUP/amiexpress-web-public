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
