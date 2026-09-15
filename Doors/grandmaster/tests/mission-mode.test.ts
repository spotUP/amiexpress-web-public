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
