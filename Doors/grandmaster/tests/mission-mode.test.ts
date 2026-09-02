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
