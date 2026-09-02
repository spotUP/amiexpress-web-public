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
 * Two families, four "identical by trace" facts pinned deliberately:
 *  - TI-ARS and ACE-ARS run different HeborisCE functions (statCMove vs
 *    statAMove) but those functions execute textually the same kick logic
 *    for the transitions this file exercises, so their kick tables are
 *    pinned as equal, not just "both non-empty" - if a future edit only
 *    updates one of the two, this test catches the drift.
 *  - TI-WORLD, ACE-SRS and DS-WORLD all run statWMove and its rotation/kick
 *    block is not gated on which of the three it is running as, so their
 *    90-degree kick tables are pinned as equal to each other too.
 *  - SRS-X reuses that same 90-degree table AND additionally exposes a
 *    dedicated 180-degree kick table (world.c's otherBlock180KickTable /
 *    iBlock180KickTable) that the other WORLD-family systems do not have.
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
// same three kick branches with no `rots` gate at all, ends up with the
// exact same kick data as TI-ARS.
// ---------------------------------------------------------------------------

export async function aceArsSharesTiArssShapesAndKicks(): Promise<void> {
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
  // rots==1) - so ACE-ARS gets exactly what TI-ARS gets for every transition.
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
