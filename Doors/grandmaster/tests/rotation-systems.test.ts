/**
 * HeborisCE-authentic rotation systems: TI-ARS, ACE-ARS, TI-WORLD, ACE-SRS,
 * DS-WORLD, SRS-X.
 *
 * Before this change PieceManager only knew SRS / ARS / NRS / BARS. Every
 * assertion below is traced to a specific line range in
 * `Documentation/7-Reference Sources/HeborisCE-1.1.0/src/script/{classic,ars,world}.c`
 * (paths relative to the door's repo root), decoded by hand (see the
 * comments above CLASSIC_SHAPES / CLASSIC_ARS_KICKS / WORLD_KICKS /
 * SRS_X_KICKS in core/pieces.ts for the full derivation and citations).
 *
 * rots is 0-indexed HEBORIS/TI-ARS/TI-WORLD/ACE-SRS/ACE-ARS/ACE-ARS2/DS-WORLD/
 * SRS-X/DRS (config.c:1118-1126). None of these six are the same rotation
 * system as each other - HeborisCE gates real lock/landing behavior on rots,
 * not just the shape/kick tables. What this file pins in two parts:
 *
 *  1. Shared TABLES, deliberately pinned so a future edit to one half of a
 *     pair can't silently drift from the other:
 *      - TI-ARS and ACE-ARS run different HeborisCE functions (statCMove vs
 *        statAMove) but those functions execute textually the same kick
 *        logic for the transitions this file exercises, so their kick
 *        tables are pinned as equal, not just "both non-empty".
 *      - TI-WORLD, ACE-SRS and DS-WORLD all run statWMove and its rotation/
 *        kick block is not gated on which of the three it is running as, so
 *        their 90-degree kick tables are pinned as equal to each other too.
 *      - SRS-X reuses that same 90-degree table AND additionally exposes a
 *        dedicated 180-degree kick table (world.c's otherBlock180KickTable /
 *        iBlock180KickTable) the other WORLD-family systems do not have.
 *
 *  2. Behavioral differences HeborisCE gates on rots that this door DOES
 *     implement, despite the shared tables above:
 *      - DS-WORLD (rots==6) is exempted from the kick-count forced lock the
 *        rest of the WORLD family gets (world.c:425-426) - "infinite spin".
 *      - SRS-X (rots==7) locks instantly on down input once grounded,
 *        instead of just resetting the lock-delay timer (world.c:440).
 *
 *      - ACE-ARS (rots==4) turns the up key into a drop that LOCKS, and
 *        locks a piece that is already grounded on the spot (ars.c:331,
 *        361,389). Every other system's up key is a plain sonic drop.
 *
 * Not implemented, and said here rather than guessed: ACE-SRS/DS-WORLD's
 * distinct soft-drop gravity constant (world.c:405,452) would collide with
 * the player-configurable PlayerSettings.softDropSpeed multiplier this door
 * already has; ACE-ARS2's down-key instant lock (ars.c:320) and D.R.S are
 * out of scope entirely - ACE-ARS2 and D.R.S are not requested systems.
 */

import assert from 'assert';
import { PieceManager } from '../core/pieces';
import { GameEngine } from '../core/game';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const baseSettings: any = {
  rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
  ghostPiece: true, lockDelay: 500, previewCount: 4,
  musicVolume: 0, sfxVolume: 0, keyBindings: {},
};

// ---------------------------------------------------------------------------
// TI-ARS: classic.c's block-data table + "Ti-style" kicks
// (src/script/classic.c:3-23, 130-242)
// ---------------------------------------------------------------------------

export async function tiArsTSpawnsPointDownNotPointUp(): Promise<void> {
  // classic.c blkDataX/Y kind=4 (T), rot=0 decodes to row1 full + row2 col1 -
  // point-down, flat top. This is the real TGM/ARS T spawn orientation; SRS
  // (and this door's existing 'ARS' table) spawns point-up instead, so this
  // also proves TI-ARS is backed by its own table, not an alias of 'ARS'.
  const ti = new PieceManager('TI-ARS');
  const ars = new PieceManager('ARS');

  assert.deepStrictEqual(ti.getShape('T', 0), [
    [0, 0, 0, 0],
    [1, 1, 1, 0],
    [0, 1, 0, 0],
    [0, 0, 0, 0],
  ], 'classic.c T rot0 is point-down (flat top row, stem below)');

  assert.notDeepStrictEqual(
    ti.getShape('T', 0),
    ars.getShape('T', 0),
    'TI-ARS must not silently alias the existing ARS shape table'
  );
}

export async function tiArsJlszKicksTryRightBeforeLeft(): Promise<void> {
  // classic.c:139-142 (and ars.c:121-124) run two independent `if`s - "if
  // left works, move=-1" then "if right works, move=1" - so when BOTH sides
  // are open the second (right) assignment wins. To reproduce that with a
  // first-match-wins kick list, +1 must be listed before -1.
  const pm = new PieceManager('TI-ARS');
  assert.deepStrictEqual(pm.getKicks('J', 0, 1), [[0, 0], [1, 0], [-1, 0]]);
  assert.deepStrictEqual(pm.getKicks('L', 2, 3), [[0, 0], [1, 0], [-1, 0]]);
}

export async function tiArsTGetsAFloorKickOnlyIntoState2(): Promise<void> {
  // classic.c:162-165 (mirrored ars.c:144-147): the T-piece "cyan" floor
  // kick (offset y-1) only fires when the TARGET rotation (bak) is 2 - i.e.
  // only on transitions that land in the point-up state. Every other T
  // transition gets the plain left/right kick with no floor-kick candidate.
  const pm = new PieceManager('TI-ARS');
  assert.deepStrictEqual(pm.getKicks('T', 1, 2), [[0, 0], [1, 0], [-1, 0], [0, -1]]);
  assert.deepStrictEqual(pm.getKicks('T', 3, 2), [[0, 0], [1, 0], [-1, 0], [0, -1]]);
  assert.deepStrictEqual(pm.getKicks('T', 0, 1), [[0, 0], [1, 0], [-1, 0]]);
  assert.deepStrictEqual(pm.getKicks('T', 2, 3), [[0, 0], [1, 0], [-1, 0]]);
}

export async function tiArsIPieceHorizontalAndFloorKicks(): Promise<void> {
  // classic.c:188-222: I rotating INTO a horizontal state (bak 0 or 2) tries
  // x-1, x+1, x+2 in that order (else-if chain, so order is literal);
  // rotating INTO a vertical state (bak 1 or 3) tries a grounded-only floor
  // kick of y-1 then y-2.
  const pm = new PieceManager('TI-ARS');
  assert.deepStrictEqual(pm.getKicks('I', 1, 0), [[0, 0], [-1, 0], [1, 0], [2, 0]]);
  assert.deepStrictEqual(pm.getKicks('I', 3, 2), [[0, 0], [-1, 0], [1, 0], [2, 0]]);
  assert.deepStrictEqual(pm.getKicks('I', 0, 1), [[0, 0], [0, -1], [0, -2]]);
  assert.deepStrictEqual(pm.getKicks('I', 2, 3), [[0, 0], [0, -1], [0, -2]]);
}

// ---------------------------------------------------------------------------
// ACE-ARS: ars.c reuses classic.c's shapes and, because ars.c:83-234 runs the
// same three kick branches with no `rots` gate at all, computes the same
// kick offsets as TI-ARS for the transitions below. ACE-ARS is still its own
// rotation system - see the test above's comment for the lock/landing
// mechanic (up-key instant lock) that TI-ARS has no analog of at all.
// ---------------------------------------------------------------------------

export async function aceArsAndTiArsShareShapeAndKickTablesOnly(): Promise<void> {
  // Table-level equality only - see core/pieces.ts's CLASSIC_ARS_KICKS
  // comment and tests below for the lock/landing behavior that still tells
  // ACE-ARS and TI-ARS apart (ACE-ARS's up-key instant lock, not implemented
  // here; not tested here either, since there is nothing to assert against).
  const ti = new PieceManager('TI-ARS');
  const ace = new PieceManager('ACE-ARS');

  for (const type of ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const) {
    for (let rot = 0; rot < 4; rot++) {
      assert.deepStrictEqual(
        ace.getShape(type, rot as 0 | 1 | 2 | 3),
        ti.getShape(type, rot as 0 | 1 | 2 | 3),
        `ACE-ARS ${type} rot${rot} must match TI-ARS (ars.c:1-2: block data reused from classic.c)`
      );
    }
  }

  // ars.c's three kick branches (112, 144-165, 168-223) are not gated on
  // rots, unlike classic.c's (which gates the T floor kick and I kick on
  // rots==1) - so for these specific transitions ACE-ARS computes exactly
  // what TI-ARS computes.
  const transitions: Array<[('I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'), number, number]> = [
    ['J', 0, 1], ['T', 1, 2], ['T', 0, 1], ['I', 0, 1], ['I', 1, 0],
  ];
  for (const [type, from, to] of transitions) {
    assert.deepStrictEqual(ace.getKicks(type, from, to), ti.getKicks(type, from, to));
  }
}

// ---------------------------------------------------------------------------
// TI-WORLD / ACE-SRS / DS-WORLD: world.c's block-data table is byte-for-byte
// SRS_SHAPES, and its rotation/kick block (world.c:203-357) is not gated on
// rots for the plain CW/CCW case, so these three systems share one kick
// table (world.c:29-37, 40-43 - the "回転補正" comment block).
// ---------------------------------------------------------------------------

export async function worldFamilyShapesEqualSrs(): Promise<void> {
  const srs = new PieceManager('SRS');
  for (const system of ['TI-WORLD', 'ACE-SRS', 'DS-WORLD', 'SRS-X'] as const) {
    const pm = new PieceManager(system);
    for (const type of ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const) {
      for (let rot = 0; rot < 4; rot++) {
        assert.deepStrictEqual(
          pm.getShape(type, rot as 0 | 1 | 2 | 3),
          srs.getShape(type, rot as 0 | 1 | 2 | 3),
          `${system} ${type} rot${rot} must equal SRS_SHAPES (world.c:52-72 decodes byte-identical to it)`
        );
      }
    }
  }
}

export async function worldFamilyNinetyDegreeKicksAreShared(): Promise<void> {
  const ti = new PieceManager('TI-WORLD');
  // world.c:29 "0>>1:(-1,0)>(-1,-1)>(0,+2)>(-1,+2)"
  assert.deepStrictEqual(ti.getKicks('T', 0, 1), [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]);
  // world.c:41 "1>>2:(-1,0)>(+2,0)>(-1,-2)>(+2,+1)" (I-only table, world_i_rot
  // defaults to 0 - game/gamestart.c:975 - so this is the symmetric variant)
  assert.deepStrictEqual(ti.getKicks('I', 1, 2), [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]]);

  for (const system of ['ACE-SRS', 'DS-WORLD', 'SRS-X'] as const) {
    const pm = new PieceManager(system);
    assert.deepStrictEqual(
      pm.getKicks('T', 0, 1), ti.getKicks('T', 0, 1),
      `${system}'s 90-degree T kicks must match TI-WORLD's (statWMove is shared, world.c:203-357)`
    );
    assert.deepStrictEqual(
      pm.getKicks('I', 1, 2), ti.getKicks('I', 1, 2),
      `${system}'s 90-degree I kicks must match TI-WORLD's`
    );
  }
}

// ---------------------------------------------------------------------------
// Behavioral differences the shared tables above do NOT capture. TI-WORLD,
// ACE-SRS, DS-WORLD and SRS-X share a shape table and a 90-degree kick
// table, but HeborisCE still gates real lock/landing behavior on which of
// the four is running - these are not the same rotation system, and this
// door models two of those differences.
// ---------------------------------------------------------------------------

export async function dsWorldNeverCapsOutOnKickCountTheWayTiWorldDoes(): Promise<void> {
  // world.c:425-426 explicitly excludes rots==6 (DS-WORLD) from the
  // kick-count forced lock every other WORLD-family system gets - HeborisCE's
  // "infinite spin". This door's analog of that forced lock is
  // moveResetCount/rotationResetCount capping out at maxMoveResets/
  // maxRotationResets (core/game.ts resetLockDelay(): once a count reaches
  // its cap, further rotations/moves stop refreshing the lock-delay timer).
  // DS-WORLD must never hit that cap; TI-WORLD must.
  const rotationsToTry = 20;
  const groundedO = { type: 'O' as const, rotation: 0 as const, x: 4, y: 22 };

  const dsWorld: any = new GameEngine('marathon', { ...baseSettings, rotationSystem: 'DS-WORLD' }, sounds);
  dsWorld.start();
  dsWorld.getState().currentPiece = { ...groundedO };
  for (let i = 0; i < rotationsToTry; i++) dsWorld.rotate(1);
  assert.strictEqual(
    dsWorld.getState().rotationResetCount, rotationsToTry,
    'DS-WORLD must keep counting resets past the Ti-style cap other systems hit'
  );

  const tiWorld: any = new GameEngine('marathon', { ...baseSettings, rotationSystem: 'TI-WORLD' }, sounds);
  tiWorld.start();
  tiWorld.getState().currentPiece = { ...groundedO };
  for (let i = 0; i < rotationsToTry; i++) tiWorld.rotate(1);
  assert.ok(
    tiWorld.getState().rotationResetCount < rotationsToTry,
    'TI-WORLD must actually cap out for this to be a meaningful contrast with DS-WORLD'
  );
  assert.strictEqual(
    tiWorld.getState().rotationResetCount, tiWorld.getState().maxRotationResets,
    'TI-WORLD must cap exactly at its own maxRotationResets'
  );
}

export async function srsXLocksInstantlyOnDownOnceGrounded(): Promise<void> {
  // world.c:440 ("if((rots[player] == 7) || (heboGB[player]!=0)) bk[player]
  // = 100;", commented "SRS-X即接着" i.e. "SRS-X instant lock"): pressing
  // down while already grounded locks the piece on the spot. Every other
  // WORLD-family system takes world.c:442's `else` branch instead, which
  // only nudges the lock timer (bk[player] += 1 + ...) - it does not lock.
  const srsX: any = new GameEngine('marathon', { ...baseSettings, rotationSystem: 'SRS-X' }, sounds);
  srsX.start();
  const state = srsX.getState();
  // SRS T rot0 at y=22: row1 (x,x+1,x+2 at y+1=23) is the board's last row,
  // so moving down one more is out of bounds - already grounded.
  state.currentPiece = { type: 'T', rotation: 0, x: 4, y: 22 };

  const result = srsX.softDrop();

  assert.strictEqual(result, true, 'softDrop must report success (it locked the piece)');
  assert.strictEqual(state.board.grid[23][4].filled, true, 'the piece must already be on the board');
  assert.strictEqual(state.board.grid[23][5].filled, true);
  assert.strictEqual(state.board.grid[23][6].filled, true);
}

export async function everyOtherWorldFamilySystemJustWaitsOutTheLockDelayOnDown(): Promise<void> {
  for (const system of ['TI-WORLD', 'ACE-SRS', 'DS-WORLD', 'SRS'] as const) {
    const engine: any = new GameEngine('marathon', { ...baseSettings, rotationSystem: system }, sounds);
    engine.start();
    const state = engine.getState();
    state.currentPiece = { type: 'T', rotation: 0, x: 4, y: 22 };

    const result = engine.softDrop();

    assert.strictEqual(result, false, `${system}'s soft-drop must not move (already grounded) or lock`);
    assert.strictEqual(state.board.grid[23][4].filled, false, `${system} must not lock instantly on down`);
    assert.ok(state.currentPiece, `${system}'s piece must still be the active piece, not locked`);
  }
}

// ---------------------------------------------------------------------------
// SRS-X: the only WORLD-family system with real 180-degree kicks
// (world.c:118-135, gated to rots==7 by world.c:211).
// ---------------------------------------------------------------------------

export async function srsXHasDedicated180DegreeKicks(): Promise<void> {
  const pm = new PieceManager('SRS-X');
  // world.c:122, row "0>>2": (1,0)(2,0)(1,1)(2,1)(-1,0)(-2,0)(-1,1)(-2,1)(0,-1)(3,0)(-3,0)
  assert.deepStrictEqual(pm.getKicks('T', 0, 2), [
    [0, 0], [1, 0], [2, 0], [1, 1], [2, 1],
    [-1, 0], [-2, 0], [-1, 1], [-2, 1], [0, -1], [3, 0], [-3, 0],
  ]);
  // world.c:131, row "0>>2": (-1,0)(-2,0)(1,0)(2,0)(0,1) (trailing (0,0) padding dropped)
  assert.deepStrictEqual(pm.getKicks('I', 0, 2), [
    [0, 0], [-1, 0], [-2, 0], [1, 0], [2, 0], [0, 1],
  ]);
}

export async function onlySrsXHasThe180DegreeTable(): Promise<void> {
  // TI-WORLD/ACE-SRS/DS-WORLD have no move==2 branch (world.c:211 gates it to
  // rots==7), so a 180 lookup on them must fall through to the [[0,0]]
  // no-kick default rather than silently reusing SRS-X's table.
  for (const system of ['TI-WORLD', 'ACE-SRS', 'DS-WORLD'] as const) {
    const pm = new PieceManager(system);
    assert.deepStrictEqual(pm.getKicks('T', 0, 2), [[0, 0]]);
  }
}

export async function gameScreenGivesOnlySrsXATrue180Rotation(): Promise<void> {
  // ui/game-screen.ts's rotate_180 handler: every other rotation system
  // approximates 180 as two 90-degree rotate(1) calls (no dedicated table to
  // use), but SRS-X calls engine.rotate(2) once so it goes through the real
  // world.c 180 kick table pinned above.
  const { readFileSync } = await import('fs');
  const { join } = await import('path');
  const source = readFileSync(join(__dirname, '..', 'ui', 'game-screen.ts'), 'utf8');
  const handlerStart = source.indexOf("on('rotate_180'");
  const handlerEnd = source.indexOf('\n    });', handlerStart);
  const body = source.slice(handlerStart, handlerEnd);

  assert.ok(body.includes("'SRS-X'"), 'rotate_180 handler must branch on SRS-X');
  assert.ok(body.includes('rotate(2)'), 'SRS-X branch must call the single-step 180 rotation');
}

// ---------------------------------------------------------------------------
// End-to-end wiring: PlayerSettings.rotationSystem -> GameEngine -> real
// collision-checked rotation, not just PieceManager tables in isolation.
// ---------------------------------------------------------------------------

export async function tiArsEngineWiringKicksAJPieceOffTheLeftWall(): Promise<void> {
  const engine: any = new GameEngine('marathon', { ...baseSettings, rotationSystem: 'TI-ARS' }, sounds);
  engine.start();

  // classic.c J rot0 -> rot1: [[0,0,0,0],[1,1,1,0],[0,0,1,0]] -> [[0,1,0,0],
  // [0,1,0,0],[1,1,0,0]]. At x=-1 the target shape's row2 col0 lands at
  // board column -1 - out of bounds - so the in-place [0,0] test must fail
  // and the [1,0] (right) kick candidate must be what succeeds.
  const state = engine.getState();
  state.currentPiece = { type: 'J', rotation: 0, x: -1, y: 5 };

  const rotated = engine.rotate(1);

  assert.strictEqual(rotated, true, 'the +1 wall kick must let the rotation through');
  assert.strictEqual(state.currentPiece.rotation, 1);
  assert.strictEqual(state.currentPiece.x, 0, 'kicked one cell right, off the wall');
}

export async function srsXEngineWiringDoesARealSingleStep180(): Promise<void> {
  const engine: any = new GameEngine('marathon', { ...baseSettings, rotationSystem: 'SRS-X' }, sounds);
  engine.start();

  // SRS T rot0 -> rot2: [[0,1,0,0],[1,1,1,0],...] -> [[0,0,0,0],[1,1,1,0],
  // [0,1,0,0],...]. At x=-1 rot2's row1 spans columns -1,0,1 - out of bounds
  // - so [0,0] fails and the 180 table's [1,0] candidate must be what
  // succeeds (world.c:122, "0>>2" row's first non-center-only candidate).
  const state = engine.getState();
  state.currentPiece = { type: 'T', rotation: 0, x: -1, y: 5 };

  const rotated = engine.rotate(2);

  assert.strictEqual(rotated, true, 'the SRS-X 180 kick table must let this through');
  assert.strictEqual(state.currentPiece.rotation, 2);
  assert.strictEqual(state.currentPiece.x, 0, 'kicked one cell right per the 180 table');
}

export async function newSystemsAreSelectableInTheSettingsCycle(): Promise<void> {
  const source = (await import('fs')).readFileSync(
    (await import('path')).join(__dirname, '..', 'ui', 'settings-screen.ts'),
    'utf8'
  );
  for (const system of ['TI-ARS', 'TI-WORLD', 'ACE-ARS', 'ACE-SRS', 'SRS-X', 'DS-WORLD']) {
    assert.ok(
      source.includes(`'${system}'`),
      `settings-screen's rotation system cycle must include ${system}`
    );
  }
}

// ---------------------------------------------------------------------------
// ACE-ARS: the up key drops AND locks (ars.c:331, 361-389, rots==4 only).
//
// HeborisCE's up key is one key with two branches. Airborne (the T.L.S.
// branch, ars.c:361-389) ACE-ARS drops the piece to the floor and locks it in
// the same frame - `by[player] = bottom - 1`, then the lock block. Grounded
// (ars.c:331) the same key adds a full lock delay to bk[player], which the
// `bk > lockT` test on the next line turns into an immediate lock. Every
// other rots takes the else branches, where the up key is a sonic drop that
// leaves the piece live on the floor.
//
// This door models that key as the sonic_drop action (declared since the
// input config was written, wired to nothing until now).
// ---------------------------------------------------------------------------

/** Cells the board is holding, i.e. cells belonging to locked pieces. */
function filledCells(engine: any): number {
  return engine.getState().board.grid
    .reduce((n: number, row: any[]) => n + row.filter(c => c.filled).length, 0);
}

export async function aceArsUpKeyDropsToTheFloorAndLocks(): Promise<void> {
  const engine: any = new GameEngine('marathon', { ...baseSettings, rotationSystem: 'ACE-ARS' }, sounds);
  engine.start();
  const state = engine.getState();
  const startY = state.currentPiece.y;

  const result = engine.sonicDrop();

  assert.strictEqual(result, true, 'ACE-ARS sonic drop must report that it did something');
  assert.strictEqual(filledCells(engine), 4, 'the piece must be locked into the board (ars.c:361-389)');
  assert.strictEqual(
    state.currentPiece, null,
    'the piece is off the field - locked, with the next one waiting out ARE'
  );
  assert.ok(
    state.board.grid[state.board.height - 1].some((c: any) => c.filled),
    `the piece landed on the floor, not where it started (row ${startY})`
  );
}

export async function aceArsUpKeyLocksAPieceThatIsAlreadyGrounded(): Promise<void> {
  // ars.c:331 - the grounded branch. Walk the piece down with soft drops
  // first (shape-agnostic: it stops when the floor is reached), then press up.
  const engine: any = new GameEngine('marathon', { ...baseSettings, rotationSystem: 'ACE-ARS' }, sounds);
  engine.start();
  while (engine.softDrop()) { /* fall to the floor */ }
  assert.strictEqual(filledCells(engine), 0, 'soft drop must not have locked it - that is SRS-X only');

  const result = engine.sonicDrop();

  assert.strictEqual(result, true, 'the grounded up key must report the lock');
  assert.strictEqual(filledCells(engine), 4, 'a grounded ACE-ARS piece locks on the up key');
}

export async function everyOtherSystemSonicDropsWithoutLocking(): Promise<void> {
  for (const system of ['ARS', 'TI-ARS', 'SRS', 'TI-WORLD', 'ACE-SRS', 'DS-WORLD', 'SRS-X'] as const) {
    const engine: any = new GameEngine('marathon', { ...baseSettings, rotationSystem: system }, sounds);
    engine.start();
    const state = engine.getState();
    const type = state.currentPiece.type;
    const startY = state.currentPiece.y;

    const result = engine.sonicDrop();

    assert.strictEqual(result, true, `${system}: a sonic drop from the spawn row moves the piece`);
    assert.strictEqual(filledCells(engine), 0, `${system} must NOT lock on a sonic drop`);
    assert.ok(state.currentPiece.y > startY, `${system}: the piece must have fallen`);
    assert.strictEqual(state.currentPiece.type, type, `${system}: still the same live piece`);

    // Grounded now: a second press has nothing to do and must not lock either.
    assert.strictEqual(engine.sonicDrop(), false, `${system}: a grounded sonic drop is a no-op`);
    assert.strictEqual(filledCells(engine), 0, `${system} must still not have locked`);
  }
}

export async function sonicDropIsBoundAndReachesTheEngine(): Promise<void> {
  // End to end through the real dispatch: a key the player can actually
  // press -> keyToAction -> InputHandler.triggerAction -> GameScreen's
  // handler -> GameEngine. A binding nothing listens to is what this
  // action was before (declared in KeyConfig, handled nowhere).
  const { Screen } = await import('@amiexpress/bbs-door-sdk/engines/ui/blessed');
  const { InputHandler } = await import('../input/handler');
  const { GameScreen } = await import('../ui/game-screen');
  const { DEFAULT_KEYS, keyToAction } = await import('../input/config');

  assert.strictEqual(
    keyToAction('w', DEFAULT_KEYS), 'sonic_drop',
    'the default layout must bind sonic drop to a key'
  );

  let down: ((key: string) => void) | null = null;
  const session: any = {
    bbs: {
      onKeyDown: (cb: (key: string) => void) => { down = cb; },
      onKeyUp: () => {},
    },
  };
  const screen: any = new Screen({ title: 'sonic', width: 80, height: 30 });
  const engine: any = new GameEngine('marathon', { ...baseSettings, rotationSystem: 'ACE-ARS' }, sounds);
  engine.start();
  const input: any = new InputHandler(screen, session);
  const appState: any = { currentMode: 'marathon', playerName: 'sysop', settings: { ...baseSettings, rotationSystem: 'ACE-ARS' } };
  const gameScreen: any = new GameScreen(screen, engine, input, sounds, appState, null);
  gameScreen.setupUI();
  gameScreen.setupInput();

  assert.ok(down, 'the input handler must have registered a key-down listener');
  down!('w');

  assert.strictEqual(filledCells(engine), 4, 'pressing the sonic-drop key must reach the engine');

  gameScreen.destroy?.();
  input.destroy?.();
  screen.destroy?.();
}
