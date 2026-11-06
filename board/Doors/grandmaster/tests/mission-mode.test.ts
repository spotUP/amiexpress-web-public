/**
 * MISSION mode, end to end: the shipped pack, the menu entry, the engine's
 * lock report, the run's modifiers, and the record of who cleared what.
 *
 * The judge itself is pinned in mission-run.test.ts. What matters here is
 * REACHABILITY - a mission mode nobody can start, or one whose modifiers
 * never reach the engine, is exactly the failure this door has hit before.
 */

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { MenuScreen } from '../ui/menu';
import { GameEngine } from '../core/game';
import { GameScreen } from '../ui/game-screen';
import { filledCells } from './painted';
import { MissionRun, type LockEvent } from '../core/mission-run';
import { MissionProgress } from '../core/mission-progress';
import { loadMissionPack } from '../core/mission-pack';
import { missionRows, formatClearTime } from '../ui/mission-select';
import { MISSION_OBJECTIVES, type Mission } from '../core/mission-types';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const settings: any = {
  rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
  ghostPiece: true, lockDelay: 500, previewCount: 4,
  musicVolume: 0, sfxVolume: 0, keyBindings: {},
  blockGlow: false, glowIntensity: 0, clearStyle: 'instant', clearDirection: 'in',
  clearAnimationSpeed: 1, placementEffects: false, floatTextMode: 'off',
  b2bGlowEnabled: false, connectedBlocks: false, animationIntensity: 'normal',
};

const packPath = path.join(__dirname, '..', 'assets', 'missions', 'starter.json');

export async function theShippedPackLoadsAndEveryMissionIsPlayable(): Promise<void> {
  // It must be a TRACKED file. The pack first landed under data/, which this
  // repo gitignores wholesale for runtime state, so it would have shipped
  // missing and the mode would have opened on "could not load the pack".
  const { execFileSync } = await import('child_process');
  const tracked = execFileSync('git', ['ls-files', packPath], { encoding: 'utf8' }).trim();
  assert.ok(tracked, `${packPath} is not tracked by git - it will not reach the board`);

  const pack = loadMissionPack(packPath);

  assert.strictEqual(pack.missions.length, 30, 'the pack ships thirty, as HeborisCE packs do');
  const ids = new Set(pack.missions.map(m => m.id));
  assert.strictEqual(ids.size, 30, 'ids are unique');

  for (const mission of pack.missions) {
    assert.ok(MISSION_OBJECTIVES.includes(mission.objective),
      `${mission.name}: ${mission.objective} is not judgeable`);
    assert.ok(mission.name.length > 0 && mission.hint, `${mission.id} needs a name and a hint`);
    if (mission.objective === 'survive') {
      assert.ok(mission.timeLimitSeconds > 0, `${mission.name} must have a clock to outlast`);
    } else {
      assert.ok(mission.norm > 0 || mission.objective === 'cycle', `${mission.name} needs a norm`);
    }
  }

  // The pack should exercise the mode, not repeat one objective thirty times.
  const objectives = new Set(pack.missions.map(m => m.objective));
  assert.ok(objectives.size >= 8, `only ${objectives.size} kinds of objective in the pack`);
  assert.ok(pack.missions.some(m => m.modifiers.big), 'a BIG mission');
  assert.ok(pack.missions.some(m => m.modifiers.hideNext), 'a HIDE NEXT mission');
  assert.ok(pack.missions.some(m => m.modifiers.hidden), 'a HIDDEN mission');
  assert.ok(pack.missions.some(m => m.modifiers.rollRoll), 'a ROLL ROLL mission');
  assert.ok(pack.missions.some(m => m.garbageRows > 0), 'a dig mission');
}

export async function theMainMenuOffersMissions(): Promise<void> {
  // A mode nothing can reach is the failure this door keeps meeting.
  const screen: any = new Screen({ title: 'menu', width: 80, height: 25 });
  const state: any = { playerName: 'sysop', settings: {}, stats: {} };
  const menu: any = new MenuScreen(screen, state, sounds);
  try {
    void menu.show();
    await new Promise(r => setTimeout(r, 260));

    const list = screen.children
      .flatMap((c: any) => [c, ...(c.children ?? [])])
      .find((c: any) => Array.isArray(c.items) && c.items.length > 5);
    assert.ok(list, 'the mode list must exist');
    const labels: string[] = list.items.map((item: any) => String(item.content ?? item));
    assert.ok(labels.some(l => l.includes('MISSIONS')), `no MISSIONS entry in: ${labels.join(' | ')}`);
  } finally { screen.destroy(); }
}

export async function everyLockIsReportedWithWhatTheJudgeNeeds(): Promise<void> {
  const engine: any = new GameEngine('mission', settings, sounds);
  const events: LockEvent[] = [];
  engine.onLock((event: LockEvent) => events.push(event));
  engine.start();

  engine.hardDrop();

  assert.strictEqual(events.length, 1, 'one lock, one report');
  const [event] = events;
  assert.strictEqual(event.lineCount, 0, 'nothing was cleared');
  assert.strictEqual(event.tSpin, false);
  assert.strictEqual(event.allClear, false);
  assert.strictEqual(event.piecesPlaced, 1, 'the piece count is the engine\'s own');
  assert.strictEqual(typeof event.level, 'number');
  // The fields the ORDER and SPLIT families are judged on have to come from
  // the REAL engine, not only from a hand-built event in the judge's tests.
  assert.ok(['I', 'O', 'T', 'S', 'Z', 'J', 'L'].includes(event.pieceType),
    `the locked piece is named, got ${String(event.pieceType)}`);
  assert.strictEqual(event.cameFromHold, false, 'straight from the queue');
  assert.deepStrictEqual(event.clearedRows, [], 'nothing cleared, no rows');
  assert.strictEqual(event.tSpinFull, false);
  assert.strictEqual(event.comboIgnoringSingles, 0);
}

/**
 * The engine names the piece it locked, and says when it came out of hold.
 *
 * A judge reading `pieceType` is only as good as the engine filling it in -
 * and `cameFromHold` is engine state that nothing else in the door reads, so
 * this is the only thing standing between the ORDER family and a field that
 * is always false.
 */
export async function theEngineReportsThePieceAndWhetherItWasHeld(): Promise<void> {
  const engine: any = new GameEngine('mission', settings, sounds);
  const events: LockEvent[] = [];
  engine.onLock((event: LockEvent) => events.push(event));
  engine.start();

  /** A lock is followed by ARE: wait for the next piece the way the loop does. */
  const nextPiece = (): any => {
    for (let f = 0; f < 60 && !engine.getState().currentPiece; f++) engine.update(50);
    const piece = engine.getState().currentPiece;
    assert.ok(piece, 'a piece spawned after the lock');
    return piece;
  };

  // Hold the live piece: the first hold spawns a fresh one, so the piece that
  // locks came from the QUEUE.
  const first = engine.getState().currentPiece.type;
  engine.hold();
  const second = engine.getState().currentPiece.type;
  assert.strictEqual(engine.getState().holdPiece, first, 'the first piece is held');
  engine.hardDrop();
  assert.strictEqual(events[0].pieceType, second, 'the piece that locked is the one reported');
  assert.strictEqual(events[0].cameFromHold, false,
    'it came from the queue, not from hold');

  // The next piece swaps the held one back in: THAT one came from hold.
  nextPiece();
  engine.hold();
  assert.strictEqual(engine.getState().currentPiece.type, first, 'the held piece is back');
  engine.hardDrop();
  assert.strictEqual(events[1].pieceType, first);
  assert.strictEqual(events[1].cameFromHold, true, 'and it is reported as held');
}

/** And it reports WHICH rows cleared, which is all the SPLIT family has. */
export async function theEngineReportsWhichRowsCleared(): Promise<void> {
  const engine: any = new GameEngine('mission', settings, sounds);
  const events: LockEvent[] = [];
  engine.onLock((event: LockEvent) => events.push(event));
  engine.start();

  const board = engine.getState().board;
  const bottom = board.height - 1;
  for (let x = 0; x < 6; x++) {
    board.grid[bottom][x] = { filled: true, color: 'I', locked: true, item: null };
  }
  engine.getState().currentPiece = { type: 'I', rotation: 0, x: 6, y: bottom - 1 };
  engine.hardDrop();

  assert.strictEqual(events[0].lineCount, 1);
  assert.deepStrictEqual(events[0].clearedRows, [bottom],
    'the row index, not just how many');
}

export async function aClearedLineReachesTheRunThroughTheEngine(): Promise<void> {
  // The full path: engine lock -> LockEvent -> MissionRun -> cleared.
  const mission: Mission = {
    id: 'x', name: 'ONE LINE', objective: 'lines', norm: 1,
    timeLimitSeconds: 0, startLevel: 0, garbageRows: 0, modifiers: {},
  };
  const run = new MissionRun(mission);
  const engine: any = new GameEngine('mission', settings, sounds);
  engine.onLock((event: LockEvent) => { run.onLock(event); });
  engine.start();

  // Fill the bottom row bar four columns, then drop a flat I piece into them.
  const board = engine.getState().board;
  const bottom = board.height - 1;
  for (let x = 0; x < 6; x++) {
    board.grid[bottom][x] = { filled: true, color: 'I', locked: true, item: null };
  }
  engine.getState().currentPiece = { type: 'I', rotation: 0, x: 6, y: bottom - 1 };

  engine.hardDrop();

  assert.strictEqual(run.getProgress().outcome, 'cleared', 'the line reached the mission');
}

export async function aMissionsModifiersReachTheEngine(): Promise<void> {
  const engine: any = new GameEngine('mission', settings, sounds);
  engine.setMissionModifiers({ big: true, hideNext: true, rollRoll: true });
  engine.start();

  const piece = engine.getState().currentPiece;
  const shape = engine.pieceManager.getShape(piece.type, piece.rotation, !!piece.big);
  const cells = shape.reduce((n: number, row: number[]) => n + row.filter((c: number) => c).length, 0);
  assert.strictEqual(cells, 16, 'BIG holds for the whole run, with no counter to run out');

  // ROLL ROLL turns the piece with no item timer behind it.
  engine.getState().currentPiece = { type: 'T', rotation: 0, x: 4, y: 5, big: false };
  for (let f = 0; f < 30; f++) engine.update(1000 / 60);
  assert.strictEqual(engine.getState().currentPiece.rotation, 1, 'the piece turned by itself');

  // And the preview is hidden without an item having been collected.
  const { nextIsHidden } = await import('../core/mission-run');
  assert.strictEqual(nextIsHidden(engine.getState()), true);
  assert.strictEqual(engine.getState().hideNextFrames, 0, 'no item timer was involved');
}

export async function theGameScreenPaintsTheObjective(): Promise<void> {
  const screen: any = new Screen({ title: 'mission', width: 80, height: 30 });
  try {
    const mission: Mission = {
      id: 'x', name: 'FOUR WIDE', objective: 'tetris', norm: 3,
      timeLimitSeconds: 0, startLevel: 0, garbageRows: 0, modifiers: {},
    };
    const run = new MissionRun(mission);
    const engine: any = new GameEngine('mission', settings, sounds);
    engine.start();
    const appState: any = { currentMode: 'mission', playerName: 'sysop', settings };
    const gameScreen: any = new GameScreen(screen, engine, null, sounds, appState, null, run);
    gameScreen.setupUI();
    gameScreen.render();

    const stats = gameScreen.statsBox.getContent();
    assert.ok(stats.includes('FOUR WIDE'), `the HUD must name the mission, got: ${stats}`);
    assert.ok(stats.includes('0/3'), 'and show progress toward it');
  } finally { screen.destroy(); }
}

export async function seededGarbageFillsTheBottomRowsWithHoles(): Promise<void> {
  const engine: any = new GameEngine('mission', settings, sounds);
  engine.start();
  engine.seedGarbageRows(6);

  const board = engine.getState().board;
  for (let i = 0; i < 6; i++) {
    const row = board.grid[board.height - 1 - i];
    const filled = row.filter((c: any) => c.filled).length;
    assert.strictEqual(filled, board.width - 1, `garbage row ${i} must have exactly one hole`);
  }
  const above = board.grid[board.height - 7];
  assert.strictEqual(above.filter((c: any) => c.filled).length, 0, 'and nothing above them');
}

export async function garbageRisesDsRandomAndStopsAtEighteen(): Promise<void> {
  // GARBAGE (21) raises its stack through the DS-RANDOM rise
  // (gamestart.c:8464-8502): the hole is carried from row to row and moves
  // only when a 0..9 roll is above 1. The rolls below pin each branch - a
  // stay, a move whose first pick collides with the old column, a stay.
  const { seedGarbageRows } = await import('../core/garbage');
  const { createBoard } = await import('../core/board');
  const board: any = createBoard(10, 24);
  board.grid[23][0] = { filled: true, color: 'I', locked: true };
  const rolls = [0.35, 0.15, 0.95, 0.35, 0.75, 0.05];
  seedGarbageRows(board, 3, () => rolls.shift()!);

  const holeOf = (y: number) => board.grid[y].findIndex((c: any) => !c.filled);
  assert.deepStrictEqual([holeOf(21), holeOf(22), holeOf(23)], [3, 3, 7],
    'oldest row on top: hole 3, kept on a roll of 1, then moved past 3 to 7');
  assert.strictEqual(rolls.length, 0, 'every roll spent: the collision was re-picked');
  assert.strictEqual(board.grid[20][0].color, 'I', 'the field already there is raised, not painted over');

  // The reference clamps the count to 18 (mission.c:1415-1416); through the
  // engine, the path app.ts takes when a mission starts.
  const engine: any = new GameEngine('mission', settings, sounds);
  engine.start();
  engine.seedGarbageRows(25);
  const grid = engine.getState().board.grid;
  const height = engine.getState().board.height;
  const garbage = grid.filter((row: any[]) => row.some((c: any) => c.filled)).length;
  assert.strictEqual(garbage, 18, 'a pack asking for 25 rows gets 18');
  assert.strictEqual(grid[height - 19].some((c: any) => c.filled), false);
}

export async function aClearIsRecordedAndTheBestTimeKept(): Promise<void> {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gm-missions-')), 'progress.json');
  const progress = new MissionProgress(file);

  assert.strictEqual(progress.getClear('sysop', 'STARTER', '01'), null, 'nothing cleared yet');

  progress.recordClear('sysop', 'STARTER', '01', 90);
  assert.strictEqual(progress.getClear('sysop', 'STARTER', '01')?.seconds, 90);

  progress.recordClear('sysop', 'STARTER', '01', 120);
  assert.strictEqual(progress.getClear('sysop', 'STARTER', '01')?.seconds, 90,
    'a slower repeat must not overwrite the best time');

  progress.recordClear('sysop', 'STARTER', '01', 61);
  assert.strictEqual(progress.getClear('sysop', 'STARTER', '01')?.seconds, 61, 'a faster one does');

  // It survives a reload, and it is per player.
  const reloaded = new MissionProgress(file);
  assert.strictEqual(reloaded.getClear('sysop', 'STARTER', '01')?.seconds, 61);
  assert.strictEqual(reloaded.getClear('someone-else', 'STARTER', '01'), null);
  assert.strictEqual(reloaded.countClears('sysop', 'STARTER'), 1);
}

export async function theSelectListShowsClearedTimes(): Promise<void> {
  const pack = loadMissionPack(packPath);
  const rows = missionRows(pack, { '01': { seconds: 75 } });

  assert.strictEqual(rows.length, 30);
  assert.ok(rows[0].includes('1:15'), `a cleared mission shows its time, got: ${rows[0]}`);
  assert.ok(rows[1].includes('-'), 'an uncleared one shows a dash');
  assert.strictEqual(formatClearTime(9), '0:09');
  assert.strictEqual(formatClearTime(605), '10:05');
}

export async function aRiseMovesTheStackUpAndBringsOneRowIn(): Promise<void> {
  // The other half of core/garbage.ts: Shirase's spawn rise, which the Death
  // mode has used since it landed and which had no test of its own.
  const { riseGarbageRow } = await import('../core/garbage');
  const { createBoard } = await import('../core/board');
  const board: any = createBoard(10, 24);
  board.grid[23][0] = { filled: true, color: 'I', locked: true };

  riseGarbageRow(board, () => 0.35);   // a fixed hole, so the row is checkable

  assert.strictEqual(board.grid[22][0].filled, true, 'what was on the floor moved up one');
  const bottom = board.grid[23];
  assert.strictEqual(bottom.filter((c: any) => c.filled).length, 9, 'the new row has one hole');
  assert.strictEqual(bottom[3].filled, false, 'and the hole is where the rng put it');
}

/**
 * The second shipped pack is REACHABLE, and so is a sysop's own.
 *
 * `listPacks` has read both since the day it landed and nothing called it:
 * `startMission` loaded `starter.json` by name, so a pack written with the
 * door's own editor could never be played, and a second shipped pack would
 * have been dead content. This drives the store the way the door does.
 */
export async function everyShippedPackIsOfferedNotJustTheFirst(): Promise<void> {
  const { listPacks, saveSysopPack } = await import('../core/mission-store');
  const os: typeof import('os') = await import('os');
  const doorRoot = path.join(__dirname, '..');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-packs-'));

  const shipped = listPacks(doorRoot, dataDir);
  assert.deepStrictEqual(shipped.problems, [], 'every shipped pack parses');
  const names = shipped.packs.map((p) => p.pack.name);
  assert.ok(names.includes('STARTER'), `STARTER is offered, got ${names.join(', ')}`);
  assert.ok(names.includes('ORDERS & SPLITS'),
    `the second shipped pack is offered too, got ${names.join(', ')}`);
  assert.ok(names.includes('TARGET, ERASER & SQUARE'),
    `and the third, got ${names.join(', ')}`);
  assert.ok(shipped.packs.every((p) => p.origin === 'shipped'));

  // And one the editor writes lands beside them.
  saveSysopPack(dataDir, { name: 'BOARD PACK', missions: [{
    id: '01', name: 'ONE', objective: 'lines', norm: 1,
    timeLimitSeconds: 0, startLevel: 0, garbageRows: 0, modifiers: {},
  }] });
  const withSysop = listPacks(doorRoot, dataDir);
  const sysop = withSysop.packs.find((p) => p.origin === 'sysop');
  assert.ok(sysop, 'the pack the editor wrote is offered');
  assert.strictEqual(sysop!.pack.name, 'BOARD PACK');
}

/**
 * A pack is thirty missions, and the new objectives are in one that ships.
 *
 * HeborisCE packs are thirty entries (mission.c:47-171) and this door keeps
 * that shape, so the objectives added on 2026-09-15 could not go into
 * STARTER without pushing it past thirty. They are a pack of their own -
 * and a judge nobody can reach from a pack is the failure this door has had
 * twice already.
 */
export async function theNewObjectivesAreReachableFromAShippedPack(): Promise<void> {
  const { listPacks } = await import('../core/mission-store');
  const os: typeof import('os') = await import('os');
  const doorRoot = path.join(__dirname, '..');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-packs2-'));
  const { packs } = listPacks(doorRoot, dataDir);

  for (const stored of packs) {
    assert.ok(stored.pack.missions.length <= 30,
      `${stored.pack.name} has ${stored.pack.missions.length} missions; a pack is thirty`);
  }

  const every = packs.flatMap((p) => p.pack.missions);
  const used = new Set(every.map((m) => m.objective));
  for (const objective of [
    'blockOrder', 'singleOrder', 'doubleOrder', 'tripleOrder', 'reTripleOrder',
    'splitDouble', 'splitTriple', 'splitDouble2',
    'square', 'goldSquare', 'eraser', 'eraserHeboris', 'target',
  ]) {
    assert.ok(used.has(objective as any),
      `${objective} is judged but no shipped mission asks for it`);
  }
  assert.ok(every.some((m) => m.strictness === 'atLeast'), 'the at-least grade is played');
  assert.ok(every.some((m) => m.strictness === 'exactOrReset'), 'and the resetting one');
  assert.ok(every.some((m) => m.ignoreSingles), "and COMBO's NOT1LINE");
  assert.ok(every.some((m) => m.requireHold), 'and HOLD USE');

  // The rules a mission can switch on are the same story: a modifier the
  // engine reads and no shipped mission asks for is a rule nobody plays.
  assert.ok(every.some((m) => m.modifiers.rotateLock), 'ROTATELOCK is played');
  assert.ok(every.some((m) => m.modifiers.blind), 'BLIND is played');
  assert.ok(every.some((m) => (m.modifiers.riseEveryPieces ?? 0) > 0),
    'and the rising floor');
  assert.ok(every.some((m) => (m.speed?.gravity ?? 0) >= 20),
    'a mission plays at 20G, which is what a speed of its own is for');
  assert.ok(every.some((m) => m.modifiers.reverse), 'and one plays them backwards');
  assert.ok(every.some((m) => m.modifiers.xray), 'X-RAY is played');
  assert.ok(every.some((m) => m.modifiers.mirror), 'and MIRROR');
  assert.ok(every.some((m) => m.modifiers.color), 'and COLOR');
  assert.ok(every.some((m) => m.modifiers.oldStyle), 'and OLD STYLE');
}

/**
 * ROTATELOCK: the piece cannot be turned, and it does not arrive upright.
 *
 * Reference type 17 (`mission.c:1369-1385`). Half of this rule is the half
 * that makes it a mode rather than an annoyance: a queue of six random
 * rotations hands the next one to every spawning piece
 * (`gamestart.c:3880-3887`), so the run is about placing what you are given.
 * A door that only refused rotation would be playing an easier game.
 */
export async function rotateLockRefusesRotationAndSpawnsTurnedPieces(): Promise<void> {
  const engine: any = new GameEngine('mission', settings, sounds);
  engine.setMissionModifiers({ rotateLock: true });
  engine.start();

  assert.strictEqual(engine.rotate(1), false, 'the piece cannot be turned');
  assert.strictEqual(engine.rotate(-1), false, 'in either direction');

  const seen = new Set<number>([engine.getState().currentPiece.rotation]);
  for (let piece = 0; piece < 20; piece++) {
    engine.hardDrop();
    for (let f = 0; f < 60 && !engine.getState().currentPiece; f++) engine.update(50);
    const live = engine.getState().currentPiece;
    if (!live) break;
    seen.add(live.rotation);
  }
  assert.ok(seen.size > 1,
    `pieces arrive in different orientations, saw only ${[...seen].join(', ')}`);

  // And an ordinary mission is untouched: upright, and turnable.
  const plain: any = new GameEngine('mission', settings, sounds);
  plain.setMissionModifiers({ big: false });
  plain.start();
  assert.strictEqual(plain.getState().currentPiece.rotation, 0, 'upright');
  assert.strictEqual(plain.rotate(1), true, 'and it turns');
}

/**
 * The rising floor of DEVIL 800: one row every N pieces LOCKED.
 *
 * `mission.c:1394-1399` paces it by the piece count, not by a clock, so the
 * only timer a player has is their own placing.
 */
export async function theFloorRisesEveryNPieces(): Promise<void> {
  /*
   * A row with ONE hole, which is the only kind that survives a lock: a
   * solid row is cleared the moment a piece lands, so it cannot mark
   * anything. The hole is at column 0 and the rest is filled.
   */
  const MARKER_HOLE = 0;
  const layMarker = (engine: any, y: number): void => {
    const board = engine.getState().board;
    for (let x = 0; x < board.width; x++) {
      board.grid[y][x] = x === MARKER_HOLE
        ? { filled: false, color: null, locked: false, item: null }
        : { filled: true, color: 'I', locked: true, item: null };
    }
  };
  const markerRow = (engine: any): number => {
    const board = engine.getState().board;
    for (let y = 0; y < board.height; y++) {
      const row = board.grid[y];
      const holes = row.filter((c: any) => !c.filled).length;
      if (holes === 1 && !row[MARKER_HOLE].filled) return y;
    }
    return -1;
  };

  const withRise: any = new GameEngine('mission', settings, sounds);
  withRise.setMissionModifiers({ riseEveryPieces: 2 });
  withRise.start();
  // A solid row is unmistakable: it can only move by the floor rising,
  // because a full row would otherwise be cleared.
  const start = withRise.getState().board.height - 3;
  layMarker(withRise, start);
  assert.strictEqual(markerRow(withRise), start);

  withRise.hardDrop();
  for (let f = 0; f < 60 && !withRise.getState().currentPiece; f++) withRise.update(50);
  assert.strictEqual(markerRow(withRise), start,
    'one piece in, nothing has risen yet');

  withRise.hardDrop();
  assert.strictEqual(markerRow(withRise), start - 1,
    'the second lock pushes the whole stack up one row');

  // And a mission that did not ask for it keeps its floor where it is.
  const plain: any = new GameEngine('mission', settings, sounds);
  plain.setMissionModifiers({ big: false });
  plain.start();
  layMarker(plain, start);
  plain.hardDrop();
  for (let f = 0; f < 60 && !plain.getState().currentPiece; f++) plain.update(50);
  plain.hardDrop();
  assert.strictEqual(markerRow(plain), start, 'no rise was asked for, none happens');
}

/**
 * BLIND: the stack is not DRAWN, and is still there.
 *
 * Reference type 25 (`mission.c:1326-1332`, hidden at `view.c:1647`). The
 * collision path is untouched, which is the whole difficulty - a mode that
 * also removed the blocks would be easier, not harder.
 */
export async function blindHidesTheStackButNotTheBoard(): Promise<void> {
  /** Paint one scene - a solid row near the floor - with and without BLIND. */
  const paint = (modifiers: any): string => {
    const screen: any = new Screen({ title: 'blind', width: 80, height: 25 } as any);
    const engine: any = new GameEngine('mission', settings, sounds);
    engine.setMissionModifiers(modifiers);
    engine.start();
    const board = engine.getState().board;
    const row = board.height - 1;
    for (let x = 0; x < board.width; x++) {
      board.grid[row][x] = { filled: true, color: 'I', locked: true, item: null };
    }
    const game: any = new GameScreen(
      screen, engine, { on() {}, off() {}, setEnabled() {} } as any,
      sounds, { settings }, null, null,
    );
    try {
      game.setupUI();
      game.renderBoard(engine.getState());
      return String(game.boardBox.getContent());
    } finally { screen.destroy(); }
  };

  // A filled cell is a BACKGROUND COLOUR here, not a block glyph - `█` is
  // not an Amiga character and the telnet wire turns it into `?`
  // (ui/block-width.ts, and tests/painted.ts counts both forms).
  const blocks = (painted: string) => filledCells(painted);

  const seeing = paint({ big: false });
  const blind = paint({ blind: true });

  assert.ok(blocks(seeing) > 0, 'the ordinary run draws the stack');
  assert.strictEqual(blocks(blind), 0,
    `a blind run draws none of it, got ${blocks(blind)} block glyphs`);
}

/**
 * A mission's own timings reach the engine, and only that mission's.
 *
 * The reference gives six of its types a speed table apiece
 * (`mission.c:1192-1308`); here the PACK says it, so what has to be proved is
 * that the numbers a pack writes are the numbers the engine plays at - and
 * that a mission naming one timing still gets the mode's curve for the rest.
 */
export async function aMissionPlaysAtItsOwnSpeed(): Promise<void> {
  const plain: any = new GameEngine('mission', settings, sounds);
  plain.start();
  const modeGravity = plain.getState().gravity;
  const modeLockDelay = plain.getState().lockDelay;

  const fast: any = new GameEngine('mission', settings, sounds);
  fast.setMissionSpeed({ gravity: 20, lockDelay: 12, are: 8 });
  fast.start();
  assert.strictEqual(fast.getState().gravity, 20, '20G, from the first piece');
  assert.strictEqual(fast.getState().lockDelay, (12 / 60) * 1000,
    'twelve frames, in the milliseconds the engine counts');
  assert.notStrictEqual(fast.getState().gravity, modeGravity);

  // It SURVIVES a lock: the engine re-reads the curve for every piece, and a
  // mission speed that only held until the first placement would be worse
  // than none at all.
  fast.hardDrop();
  for (let f = 0; f < 60 && !fast.getState().currentPiece; f++) fast.update(50);
  assert.strictEqual(fast.getState().gravity, 20, 'still 20G after a lock');
  assert.strictEqual(fast.getState().lockDelay, (12 / 60) * 1000);

  // And a mission that names ONE timing keeps the mode's own for the others.
  const partial: any = new GameEngine('mission', settings, sounds);
  partial.setMissionSpeed({ gravity: 20 });
  partial.start();
  assert.strictEqual(partial.getState().gravity, 20);
  assert.strictEqual(partial.getState().lockDelay, modeLockDelay,
    "what the mission did not ask for is the mode's own");
}

/**
 * REVERSE turns the controls around, both ways.
 *
 * Reference type 24 (`mission.c:1436-1442`) sets BOTH `isLRreverse` and
 * `isUDreverse`: left is right (`ars.c:238`) and the two press states trade
 * places (`gamestart.c:10036-10037`), so the soft drop key does what the
 * sonic drop key did. The door already had the left/right half as a TGM item
 * with a timer; the mission is the same rule for a whole run.
 */
export async function reverseSwapsBothAxesForTheWholeRun(): Promise<void> {
  const engine: any = new GameEngine('mission', settings, sounds);
  engine.setMissionModifiers({ reverse: true });
  engine.start();

  const startX = engine.getState().currentPiece.x;
  engine.move(1);
  assert.strictEqual(engine.getState().currentPiece.x, startX - 1,
    'right moves the piece left');
  engine.move(-1);
  assert.strictEqual(engine.getState().currentPiece.x, startX, 'and back again');

  /*
   * UP AND DOWN SWAP AT THE KEY, NOT IN THE ENGINE. The sysop found the
   * first version of this by playing it - "up/down is not switched" - and
   * the reason is the binding: the down key is the soft drop in every scheme
   * this door ships, but the UP key is the HARD drop by default and the
   * SONIC drop under WASD, so an engine that traded softDrop for sonicDrop
   * swapped neither of the keys a player actually presses. The swap is in
   * ui/game-screen.ts's action handlers now, and what the ENGINE must do is
   * leave its two drops alone.
   */
  const before = engine.getState().currentPiece.y;
  engine.softDrop();
  assert.strictEqual(engine.getState().currentPiece.y, before + 1,
    'the engine soft drop is one row under REVERSE too - the keys swap, not the drops');

  const plain: any = new GameEngine('mission', settings, sounds);
  plain.setMissionModifiers({ big: false });
  plain.start();
  const plainStart = plain.getState().currentPiece.x;
  plain.move(1);
  assert.strictEqual(plain.getState().currentPiece.x, plainStart + 1,
    'and an ordinary mission is untouched');
  const plainY = plain.getState().currentPiece.y;
  plain.softDrop();
  assert.strictEqual(plain.getState().currentPiece.y, plainY + 1, 'one row, as always');
}

/**
 * MIRROR flips the stack after every piece.
 *
 * Reference type 15 (`mission.c:1362-1366`), and in MISSION mode the flip
 * fires after EVERY piece rather than on a timer (`gamestart.c:9055`). The
 * reference animates it column by column; a door repainting over a modem
 * cannot afford that, so the flip is instant and the animation is the
 * written exemption.
 */
export async function mirrorFlipsTheStackAfterEveryPiece(): Promise<void> {
  const engine: any = new GameEngine('mission', settings, sounds);
  engine.setMissionModifiers({ mirror: true });
  engine.start();

  // An unmistakable stack: one cell in the leftmost column, nothing else.
  const board = engine.getState().board;
  const row = board.height - 1;
  board.grid[row][0] = { filled: true, color: 'I', locked: true, item: null };
  assert.ok(board.grid[row][0].filled && !board.grid[row][board.width - 1].filled);

  engine.hardDrop();

  const after = engine.getState().board;
  assert.ok(after.grid[row][after.width - 1].filled,
    'the cell that was on the left is on the right');
  assert.ok(!after.grid[row][0].filled, 'and is no longer where it was');

  // A mission that did not ask for it keeps its stack where it is.
  const plain: any = new GameEngine('mission', settings, sounds);
  plain.setMissionModifiers({ big: false });
  plain.start();
  const plainBoard = plain.getState().board;
  plainBoard.grid[row][0] = { filled: true, color: 'I', locked: true, item: null };
  plain.hardDrop();
  assert.ok(plain.getState().board.grid[row][0].filled, 'nothing flipped');
}

/**
 * X-RAY lights one column at a time, and rests between sweeps.
 *
 * The cadence is `core/xray.ts`'s: the reference's 36-frame cycle kept in
 * time, because a door cannot count the terminal's frames.
 */
export async function xrayLightsOneColumnAtATime(): Promise<void> {
  const { xrayVisibleColumn, XRAY_CYCLE_MS, XRAY_FRAMES } = await import('../core/xray');

  // Through one whole cycle, frame by frame in the reference's own units:
  // every column comes up exactly once, in order, and the rest is dark.
  const seen: number[] = [];
  for (let frame = 0; frame < XRAY_FRAMES; frame++) {
    seen.push(xrayVisibleColumn((frame * XRAY_CYCLE_MS) / XRAY_FRAMES, 10));
  }
  const lit = seen.filter((c) => c >= 0);
  assert.deepStrictEqual(lit, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    'one sweep of ten columns, in order');
  assert.ok(seen.filter((c) => c === -1).length > lit.length,
    'and more of the cycle is dark than is lit, as the reference has it');

  // A narrower field sweeps in fewer steps and rests for longer.
  const narrow = [];
  for (let frame = 0; frame < XRAY_FRAMES; frame++) {
    narrow.push(xrayVisibleColumn((frame * XRAY_CYCLE_MS) / XRAY_FRAMES, 4));
  }
  assert.deepStrictEqual(narrow.filter((c) => c >= 0), [0, 1, 2, 3]);
}

/**
 * COLOR washes the stack in a rolling rainbow.
 *
 * Reference type 13 (`view.c:1621-1626`): the bands run diagonally, because
 * the column term is mirrored about the middle of the field and the row term
 * counts up from the floor, and the whole thing rolls with a counter. The
 * palette and the per-frame roll are this door's (`core/color-wash.ts` says
 * why); the SHAPE is the reference's, and that is what is pinned.
 */
export async function colourWashRollsDiagonallyAndInTime(): Promise<void> {
  const { washColour, WASH_STEP_MS } = await import('../core/color-wash');

  // Mirrored about the middle: column 0 and column 9 wash the same.
  assert.strictEqual(washColour(0, 10, 10, 0), washColour(9, 10, 10, 0),
    'the column term folds about the middle of the field');
  assert.strictEqual(washColour(1, 10, 10, 0), washColour(8, 10, 10, 0));

  // DIAGONAL, which is the whole look of it: the band is
  // ((20 - row) + column) * 4, so one column across and one row DOWN cancel
  // out and land on the same colour.
  assert.strictEqual(washColour(1, 11, 10, 0), washColour(0, 10, 10, 0),
    'a step right and a step down is the same band');
  assert.strictEqual(washColour(2, 12, 10, 0), washColour(1, 11, 10, 0));
  assert.notStrictEqual(washColour(1, 10, 10, 0), washColour(0, 10, 10, 0),
    'while a step across alone is not');

  // And it ROLLS: the same cell is a different colour a few steps later, and
  // comes back round.
  const start = washColour(3, 12, 10, 0);
  const moved = washColour(3, 12, 10, WASH_STEP_MS * 1);
  assert.notStrictEqual(start, moved, 'one step of the roll changes the cell');
  const wrapped = washColour(3, 12, 10, WASH_STEP_MS * 7);
  assert.strictEqual(start, wrapped, 'seven steps is a whole turn of the wash');
}

/**
 * OLD STYLE takes the modern conveniences away.
 *
 * Reference type 22 (`mission.c:1427-1434`) sets `heboGB`, and that one flag
 * is a ruleset: no hold (`gamestart.c:7645`), no initial rotation or hold,
 * no back-to-back ("old stlye hass no back to back", `gamestart.c:10310`,
 * in the reference's own spelling), and a NEXT queue of plain blocks
 * (`c_nblk[i] = 8`). The speed that comes with it is the pack's to write,
 * like every mission speed.
 */
export async function oldStyleHasNoHoldAndNoBackToBack(): Promise<void> {
  const engine: any = new GameEngine('mission', settings, sounds);
  engine.setMissionModifiers({ oldStyle: true });
  engine.start();

  assert.strictEqual(engine.hold(), false, 'the handheld had no hold button');
  assert.strictEqual(engine.getState().holdPiece, null, 'and nothing was held');
  assert.strictEqual(engine.setIHS(), false, 'nor an initial hold');

  // A tetris, then another: the second must not be scored as back-to-back.
  const fillFor = (engine: any, gap: number) => {
    const board = engine.getState().board;
    const bottom = board.height - 1;
    for (let y = bottom - 3; y <= bottom; y++) {
      for (let x = 0; x < board.width; x++) {
        if (x === gap) continue;
        board.grid[y][x] = { filled: true, color: 'J', locked: true, item: null };
      }
    }
    // A vertical I has its cells in column 2 of its 4x4 box (rotation 1), so
    // the piece's x is two left of the column it will fill.
    engine.getState().currentPiece = { type: 'I', rotation: 1, x: gap - 2, y: 0 };
  };

  fillFor(engine, 9);
  engine.hardDrop();
  assert.strictEqual(engine.getState().backToBack, false,
    'a tetris does not even arm the chain under OLD STYLE');

  // And an ordinary mission still arms it, so the flag is what turned it off.
  const plain: any = new GameEngine('mission', settings, sounds);
  plain.setMissionModifiers({ big: false });
  plain.start();
  fillFor(plain, 9);
  plain.hardDrop();
  assert.strictEqual(plain.getState().backToBack, true, 'the chain is armed as usual');

  // And hold works for an ordinary mission - asked of a piece that is LIVE,
  // since the piece above has just locked and the next one is still in ARE.
  const holder: any = new GameEngine('mission', settings, sounds);
  holder.setMissionModifiers({ big: false });
  holder.start();
  assert.strictEqual(holder.hold(), true, 'hold works when the mission allows it');
}

/**
 * SQUARE: a four-by-four block of PIECES that reaches nowhere outside itself.
 *
 * `gamestart.c:10453-10503`. The clever half of the reference's test is the
 * border check: it compares the piece id of each edge cell with its
 * neighbour one step out, so a placement that straddles the border - four
 * cells of one piece, two in and two out - disqualifies the block. That is
 * why the board has to remember which piece each cell came from.
 */
export async function aSquareIsFourPiecesThatReachNowhereElse(): Promise<void> {
  const { checkSquare, makeSquares } = await import('../core/square');
  const { createBoard } = await import('../core/board');

  /** Lay a 2x2 patch of one piece id, the shape an O piece locks in. */
  const lay = (board: any, x: number, y: number, id: number, color: string) => {
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        board.grid[y + j][x + i] = {
          filled: true, color, locked: true, item: null, pieceId: id,
        };
      }
    }
  };

  // Four O pieces in a 4x4: the reference's own example of a square.
  const board: any = createBoard(10, 24);
  lay(board, 0, 20, 1, 'O'); lay(board, 2, 20, 2, 'O');
  lay(board, 0, 22, 3, 'O'); lay(board, 2, 22, 4, 'O');
  assert.strictEqual(checkSquare(board, 0, 20, false), true, 'four pieces, nothing outside');
  assert.strictEqual(checkSquare(board, 0, 20, true), true, 'and all one colour, so GOLD');

  // Two colours: a square, but not a gold one.
  const mixed: any = createBoard(10, 24);
  lay(mixed, 0, 20, 1, 'O'); lay(mixed, 2, 20, 2, 'I');
  lay(mixed, 0, 22, 3, 'O'); lay(mixed, 2, 22, 4, 'O');
  assert.strictEqual(checkSquare(mixed, 0, 20, false), true);
  assert.strictEqual(checkSquare(mixed, 0, 20, true), false, 'a gold square is one colour');

  // A piece that STRADDLES the border: the same id inside and outside.
  const straddling: any = createBoard(10, 24);
  lay(straddling, 0, 20, 1, 'O'); lay(straddling, 2, 20, 2, 'O');
  lay(straddling, 0, 22, 3, 'O');
  lay(straddling, 2, 22, 4, 'O');
  // Piece 4's twin cells outside the block, on the row below.
  straddling.grid[23 + 1] = straddling.grid[23]; // guard: board is 24 tall
  lay(straddling, 2, 22, 4, 'O');
  straddling.grid[22][4] = {
    filled: true, color: 'O', locked: true, item: null, pieceId: 4,
  };
  assert.strictEqual(checkSquare(straddling, 0, 20, false), false,
    'a piece reaching out of the block disqualifies it');

  // Garbage cannot be part of one: it has no piece id at all.
  const withGarbage: any = createBoard(10, 24);
  lay(withGarbage, 0, 20, 1, 'O'); lay(withGarbage, 2, 20, 2, 'O');
  lay(withGarbage, 0, 22, 3, 'O');
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      withGarbage.grid[22 + j][2 + i] = {
        filled: true, color: 'I', locked: true, item: null,
      };
    }
  }
  assert.strictEqual(checkSquare(withGarbage, 0, 20, false), false,
    'garbage has no piece behind it');

  // The scan marks what it counts, so nothing is counted twice.
  assert.strictEqual(makeSquares(board), 2, 'gold');
  assert.strictEqual(makeSquares(board), 0, 'and not again');
}

/**
 * And it reaches the judge through a real lock.
 *
 * The scan runs AFTER the clears (gamestart.c:8678-8683), so a square broken
 * up by the line it completed does not count.
 */
export async function aSquareBuiltInPlayClearsTheMission(): Promise<void> {
  const mission: Mission = {
    id: 'sq', name: 'SQUARE', objective: 'square', norm: 1,
    timeLimitSeconds: 0, startLevel: 0, garbageRows: 0, modifiers: {},
  };
  const run = new MissionRun(mission);
  const engine: any = new GameEngine('mission', settings, sounds);
  engine.setSquareMode(true);
  engine.onLock((event: LockEvent) => { run.onLock(event); });
  engine.start();

  // Three O pieces of a 4x4 already down, and the fourth in the player's hand.
  const board = engine.getState().board;
  const top = board.height - 4;
  const lay = (x: number, y: number, id: number) => {
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        board.grid[y + j][x + i] = {
          filled: true, color: 'O', locked: true, item: null, pieceId: id,
        };
      }
    }
  };
  // The hole is the TOP-RIGHT quarter, so the last piece can reach it: a
  // block walled in on three sides is one no player could have built.
  lay(0, top, 101); lay(0, top + 2, 103); lay(2, top + 2, 104);
  // An O piece occupies columns 1 and 2 of its own box, so x is one left of
  // the columns it fills.
  engine.getState().currentPiece = { type: 'O', rotation: 0, x: 1, y: 0 };

  engine.hardDrop();

  assert.strictEqual(run.getProgress().outcome, 'cleared',
    'the fourth piece closed the square, and the mission with it');
}

/**
 * ERASER: the row has to be cleared BY A PIECE SITTING IN IT.
 *
 * `mission.c:905-947` walks the four cells of the piece that just locked, and
 * a marked row only counts when the piece was in it and the row is being
 * erased. That is the whole difficulty of the mode - the rows are easy to
 * clear and hard to clear the way it asks.
 */
export async function anEraserRowCountsOnlyWhenThePieceWasInIt(): Promise<void> {
  const { claimMarkedRows, chooseMarkedRows } = await import('../core/eraser');

  // The piece sat in row 20 and rows 20 and 21 both cleared: one claim.
  const both = claimMarkedRows([20, 21], [19, 20], [20, 21]);
  assert.deepStrictEqual(both.claimed, [20], 'only the row the piece was in');
  assert.deepStrictEqual(both.remaining, [21], 'and the other stays marked');

  // A marked row cleared by a piece that landed elsewhere claims nothing.
  const elsewhere = claimMarkedRows([20], [10, 11], [20]);
  assert.deepStrictEqual(elsewhere.claimed, []);
  assert.deepStrictEqual(elsewhere.remaining, [20], 'still marked');

  // The pattern never marks more rows than the mission still needs, and
  // never more than the reference's four.
  const capped = chooseMarkedRows({ lines: 4, min: 18, max: 23 }, 2, 24);
  assert.strictEqual(capped.length, 2, 'two left to do, two rows marked');
  const four = chooseMarkedRows({ lines: 9, min: 0, max: 23 }, 9, 24);
  assert.strictEqual(four.length, 4, 'four is the reference cap');
  // Every row is inside the band, and no row is marked twice.
  for (const row of four) assert.ok(row >= 0 && row <= 23);
  assert.strictEqual(new Set(four).size, four.length, 'no duplicates');

  // A band narrower than the ask marks what it can rather than spinning.
  const narrow = chooseMarkedRows({ lines: 4, min: 22, max: 23 }, 4, 24);
  assert.strictEqual(narrow.length, 2, 'two rows in the band, two rows marked');
}

/** And the engine claims them through a real lock, then marks a fresh set. */
export async function theEngineClaimsMarkedRowsAndMarksMore(): Promise<void> {
  const mission: Mission = {
    id: 'er', name: 'ERASER', objective: 'eraser', norm: 2,
    eraser: { lines: 1, min: 23, max: 23 },
    timeLimitSeconds: 0, startLevel: 0, garbageRows: 0, modifiers: {},
  };
  const run = new MissionRun(mission);
  const engine: any = new GameEngine('mission', settings, sounds);
  engine.onLock((event: LockEvent) => { run.onLock(event); });
  engine.start();
  engine.setEraserPattern(mission.eraser!, mission.norm);

  assert.deepStrictEqual(engine.getState().markedRows, [23],
    'the bottom row is marked, because the band says so');

  // Fill the bottom row bar one column and drop a piece into the gap: the
  // piece is IN the row it clears.
  const board = engine.getState().board;
  const bottom = board.height - 1;
  for (let x = 0; x < board.width - 2; x++) {
    board.grid[bottom][x] = { filled: true, color: 'J', locked: true, item: null };
  }
  engine.getState().currentPiece = { type: 'O', rotation: 0, x: board.width - 3, y: 0 };
  engine.hardDrop();

  assert.strictEqual(run.getProgress().current, 1, 'the marked row was claimed');
  assert.deepStrictEqual(engine.getState().markedRows, [23],
    'and a fresh set is marked, because the norm is not met');
}

/**
 * TARGET: the stage is cleared when its bright blocks are gone.
 *
 * Reference type 6 (`mission.c:882-902`, counted at `tomoyo.c:334-352`). The
 * 173 stages are the reference's own, converted into assets/stages by
 * dev/scripts/convert-heboris-stages.py - so the first thing to prove is that
 * the conversion produced stages this engine can lay out and finish.
 */
export async function aTargetStageIsClearedWhenItsPlatinumIsGone(): Promise<void> {
  const { loadStages, applyStage, platinumLeft, stageOrder } = await import('../core/stage');

  const stages = loadStages(path.join(__dirname, '..', 'assets', 'stages', 'stages.json'));
  assert.strictEqual(stages.length, 173, 'every shipped stage converted');
  for (const stage of stages) {
    assert.strictEqual(stage.rows.length, 21, `${stage.id} is 21 rows`);
    for (const row of stage.rows) assert.strictEqual(row.length, 10, `${stage.id} is 10 wide`);
  }

  const engine: any = new GameEngine('mission', settings, sounds);
  engine.start();
  const board = engine.getState().board;

  applyStage(board, stages[0]);
  assert.ok(platinumLeft(board) > 0, 'the first stage has blocks to clear');
  assert.ok(stages.every((s: any) => {
    applyStage(board, s);
    return platinumLeft(board) > 0;
  }), 'and so does every one of them - a stage with none is already cleared');

  // The order a mission plays: in sequence, or drawn from the band.
  const inOrder = stageOrder(stages, 0, 4, 3);
  assert.deepStrictEqual(inOrder.map((s: any) => s.id), ['000', '001', '002']);
  const wrapped = stageOrder(stages, 0, 1, 3);
  assert.deepStrictEqual(wrapped.map((s: any) => s.id), ['000', '001', '000'],
    'a band shorter than the norm comes round again');
  const drawn = stageOrder(stages, 0, 9, 4, () => 0.5);
  assert.strictEqual(drawn.length, 4);
  assert.ok(drawn.every((s: any) => Number(s.id) >= 0 && Number(s.id) <= 9),
    'a random draw stays inside the band');
}

/** And the engine clears a stage, then lays out the next one. */
export async function clearingAStageAdvancesToTheNext(): Promise<void> {
  const { loadStages } = await import('../core/stage');
  const stages = loadStages(path.join(__dirname, '..', 'assets', 'stages', 'stages.json'));

  const mission: Mission = {
    id: 'tg', name: 'TARGET', objective: 'target', norm: 2,
    stages: { min: 0, max: 1 },
    timeLimitSeconds: 0, startLevel: 0, garbageRows: 0, modifiers: {},
  };
  const run = new MissionRun(mission);
  const engine: any = new GameEngine('mission', settings, sounds);
  engine.onLock((event: LockEvent) => { run.onLock(event); });
  engine.start();
  engine.setStages([stages[0], stages[1]]);

  assert.strictEqual(engine.getStage().id, '000', 'the first stage is on the board');

  // Take the platinum off by hand - what is being proved here is the
  // ADVANCE, not a player's ability to clear stage 0.
  const board = engine.getState().board;
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.grid[y][x].platinum) {
        board.grid[y][x] = { filled: false, color: null, locked: false };
      }
    }
  }
  engine.hardDrop();

  assert.strictEqual(run.getProgress().current, 1, 'the stage counted');
  assert.strictEqual(engine.getStage().id, '001', 'and the next one is up');
}

/**
 * REVERSE swaps the KEYS, which is the only way the sysop could have found
 * it: "4, all works except EVERYTHING BACK, up/down is not switched".
 *
 * The first version traded the engine's softDrop for its sonicDrop. The down
 * key IS the soft drop in every scheme this door ships - but the UP key is
 * the HARD drop by default (input/config.ts: `hardDrop: ['up', ...]`) and the
 * sonic drop only under WASD, so swapping those two engine methods swapped
 * neither key a player presses. The swap belongs where the binding has
 * already been resolved into an action, and this drives it there.
 */
export async function reverseSwapsTheKeysAPlayerActuallyPresses(): Promise<void> {
  const screen: any = new Screen({ title: 'rev-keys', width: 80, height: 25 } as any);
  const actions = new Map<string, () => void>();
  const input: any = {
    on: (action: string, cb: () => void) => actions.set(action, cb),
    off() {}, setEnabled() {},
  };
  const engine: any = new GameEngine('mission', settings, sounds);
  engine.setMissionModifiers({ reverse: true });
  engine.start();

  const game: any = new GameScreen(screen, engine, input, sounds, { settings }, null, null);
  try {
    game.setupUI();
    game.setupInput();
    assert.ok(actions.has('soft_drop') && actions.has('hard_drop'),
      'both drop actions are bound');

    // DOWN under REVERSE does what UP does: the piece goes to the floor and
    // locks, so the live piece is gone.
    const start = engine.getState().currentPiece;
    assert.ok(start, 'a piece is live');
    actions.get('soft_drop')!();
    assert.strictEqual(engine.getState().currentPiece, null,
      'the down key HARD DROPPED the piece, which is what the up key does');

    // And UP does what DOWN does: one row, piece still live.
    for (let f = 0; f < 60 && !engine.getState().currentPiece; f++) engine.update(50);
    const live = engine.getState().currentPiece;
    assert.ok(live, 'the next piece spawned');
    const y = live.y;
    actions.get('hard_drop')!();
    assert.ok(engine.getState().currentPiece, 'the up key did NOT lock the piece');
    assert.strictEqual(engine.getState().currentPiece.y, y + 1, 'it moved one row, like a soft drop');
  } finally { screen.destroy(); }

  // An ordinary mission is untouched: down is one row, up locks.
  const plainScreen: any = new Screen({ title: 'plain-keys', width: 80, height: 25 } as any);
  const plainActions = new Map<string, () => void>();
  const plainInput: any = {
    on: (action: string, cb: () => void) => plainActions.set(action, cb),
    off() {}, setEnabled() {},
  };
  const plain: any = new GameEngine('mission', settings, sounds);
  plain.setMissionModifiers({ big: false });
  plain.start();
  const plainGame: any = new GameScreen(
    plainScreen, plain, plainInput, sounds, { settings }, null, null,
  );
  try {
    plainGame.setupUI();
    plainGame.setupInput();
    const y = plain.getState().currentPiece.y;
    plainActions.get('soft_drop')!();
    assert.strictEqual(plain.getState().currentPiece.y, y + 1, 'down is one row');
    plainActions.get('hard_drop')!();
    assert.strictEqual(plain.getState().currentPiece, null, 'and up locks it');
  } finally { plainScreen.destroy(); }
}

/**
 * A pack's NAME has to be true, because the name is how a mission is found.
 *
 * Sysop, 2026-09-15: "i could not find four by four". It was mission 29 of
 * ORDERS & SPLITS while the pack called TARGET, ERASER & SQUARE held no
 * square mission at all - so the one place a player would look for it was
 * the one place it was not. It lives in the pack that promises it now, and
 * this is the check that keeps every pack's name honest.
 */
export async function eachPackHoldsWhatItsNamePromises(): Promise<void> {
  const { listPacks } = await import('../core/mission-store');
  const os: typeof import('os') = await import('os');
  const { packs } = listPacks(path.join(__dirname, '..'), fs.mkdtempSync(path.join(os.tmpdir(), 'gm-names-')));

  /** A word in a pack's name, and an objective that word promises. */
  const PROMISES: Array<[string, (objective: string) => boolean]> = [
    ['SQUARE', (o) => o === 'square' || o === 'goldSquare'],
    ['ERASER', (o) => o === 'eraser' || o === 'eraserHeboris'],
    ['TARGET', (o) => o === 'target'],
    ['ORDERS', (o) => o.endsWith('Order')],
    ['SPLITS', (o) => o.startsWith('split')],
  ];

  for (const stored of packs) {
    const name = stored.pack.name.toUpperCase();
    const objectives = stored.pack.missions.map((m) => m.objective);
    for (const [word, promised] of PROMISES) {
      if (!name.includes(word)) continue;
      assert.ok(objectives.some(promised),
        `${stored.pack.name} says ${word} and has no mission that is one`);
    }
  }

  // And the specific case the sysop hit: the square missions are in the pack
  // whose name says SQUARE.
  const squares = packs.find((p) => p.pack.missions.some((m) => m.objective === 'square'));
  assert.ok(squares, 'some pack has a SQUARE mission');
  assert.ok(squares!.pack.name.toUpperCase().includes('SQUARE'),
    `they are in ${squares!.pack.name}, which does not say so`);
}

/**
 * A stage brings its OWN rules, and takes them away again.
 *
 * Eleven of the converted stages carry one - MIRROR, X-RAY, COLOR, ROLL ROLL,
 * BIG, BLIND, HIDE NEXT (`tomoyo.c:1420-1448`) - and they were being STORED
 * and never applied, which is a rule nobody plays. They belong to the stage,
 * so the mission's own modifiers stay underneath and come back when the next
 * stage has none.
 */
export async function aStageBringsItsOwnRulesAndTakesThemAway(): Promise<void> {
  const { loadStages } = await import('../core/stage');
  const stages = loadStages(path.join(__dirname, '..', 'assets', 'stages', 'stages.json'));

  const withRules = stages.find((s: any) => s.rules?.mirror);
  const plainStage = stages.find((s: any) => !s.rules);
  assert.ok(withRules && plainStage, 'the shipped set has both kinds');

  const engine: any = new GameEngine('mission', settings, sounds);
  engine.start();
  // The MISSION asked for BLIND; the STAGE asks for MIRROR.
  engine.setMissionModifiers({ blind: true });
  engine.setStages([withRules, plainStage]);

  assert.strictEqual(engine.getState().missionModifiers.mirror, true,
    "the stage's own rule is on");
  assert.strictEqual(engine.getState().missionModifiers.blind, true,
    "and the mission's rule is still underneath it");

  // Clear the stage: the next one has no rules, so MIRROR goes with it.
  const board = engine.getState().board;
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.grid[y][x].platinum) board.grid[y][x] = { filled: false, color: null, locked: false };
    }
  }
  engine.hardDrop();

  assert.strictEqual(engine.getState().missionModifiers.mirror, undefined,
    'the rule left with the stage that brought it');
  assert.strictEqual(engine.getState().missionModifiers.blind, true,
    "and the mission's own is untouched");
}

/**
 * A stage's floor rises with the stage's OWN rows, in order.
 *
 * Four of the converted stages carry a rising field and three name an
 * interval; the rows were stored and never raised. The reference spends them
 * oldest-first (`gamestart.c:8348-8360`) and counts the interval in PIECES -
 * `statBlock` is the per-piece handler (`gamestart.c:6908`), which is what
 * makes its small numbers (3, 5, 7) mean anything at all.
 */
export async function aStageRisesWithItsOwnRows(): Promise<void> {
  const { loadStages, riseRow } = await import('../core/stage');
  const stages = loadStages(path.join(__dirname, '..', 'assets', 'stages', 'stages.json'));
  const rising = stages.find((s: any) => s.rise && s.riseEveryPieces);
  assert.ok(rising, 'a shipped stage rises');
  assert.strictEqual(rising!.riseEveryPieces! > 0, true);

  const engine: any = new GameEngine('mission', settings, sounds);
  engine.start();
  engine.setStages([rising]);

  const bottomRow = () => {
    const board = engine.getState().board;
    return board.grid[board.height - 1].map((c: any) => (c.filled ? (c.platinum ? 'P' : '#') : '.')).join('');
  };
  const expected = riseRow(rising!, 0)!
    .map((c: any) => (c.filled ? (c.platinum ? 'P' : '#') : '.')).join('');

  const before = bottomRow();
  for (let piece = 0; piece < rising!.riseEveryPieces!; piece++) {
    engine.hardDrop();
    for (let f = 0; f < 60 && !engine.getState().currentPiece; f++) engine.update(50);
  }

  assert.notStrictEqual(bottomRow(), before, 'the floor came up');
  assert.strictEqual(bottomRow(), expected,
    "and what came up is the stage's own first rising row, not garbage");
}
