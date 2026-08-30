/**
 * Cross-door regression tests.
 *
 * These guard defects that were duplicated across many doors by copy-paste,
 * where a test living inside a single door would not have caught the other
 * eight instances.
 */

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * Doors whose main menu is driven by gameData.menuSelection + showMenu().
 * All nine shipped with the same bug (reported live 2026-08-30: "I can't
 * navigate the main menu in any of the 10 arcade games; arrow up/down does
 * nothing").
 */
const MENU_DOORS = [
  'joust', 'zoo-keeper', 'pengo', 'bubble-bobble', 'super-qix',
  'frogger', 'galaga', 'donkey-kong', 'pipe-dream',
];

/**
 * The bug: showMenu() unconditionally reset `menuSelection = 0`, and the
 * arrow-key handlers called showMenu() immediately after moving the
 * selection. The move was therefore wiped on every keypress and the
 * highlight never appeared to move.
 *
 * The fix split the two jobs: showMenu() enters the menu (resets, then
 * draws), renderMenu() only draws. Arrow handlers must call renderMenu().
 *
 * This test re-derives which functions reset the selection instead of
 * hardcoding the name "showMenu", so it still fires if the resetting
 * function is later renamed.
 */
export async function menuArrowHandlersDoNotResetTheSelection(): Promise<void> {
  const offenders: string[] = [];

  for (const door of MENU_DOORS) {
    const file = path.join(REPO_ROOT, 'Doors', door, 'index.ts');
    assert.ok(fs.existsSync(file), `${door}: index.ts not found at ${file}`);
    const src = fs.readFileSync(file, 'utf-8');

    // 1. Find every function that resets the menu selection to 0.
    const resetters = new Set<string>();
    const fnRe = /function\s+(\w+)\s*\([^)]*\)\s*:\s*\w+\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = fnRe.exec(src)) !== null) {
      const name = m[1];
      // Body = from the opening brace to the next top-level "\n}" line.
      const rest = src.slice(m.index);
      const end = rest.search(/\n\}/);
      const body = end === -1 ? rest : rest.slice(0, end);
      if (/menuSelection\s*=\s*0\s*;/.test(body)) {
        resetters.add(name);
      }
    }

    assert.ok(
      resetters.size > 0,
      `${door}: no function resets menuSelection to 0 - test's parser is stale, fix the test`
    );

    // 2. Every site that MOVES the selection must not then call a resetter.
    const moveRe = /menuSelection\s*=\s*Math\.(?:max|min)\([\s\S]{0,120}?;/g;
    let move: RegExpExecArray | null;
    let moveSites = 0;
    while ((move = moveRe.exec(src)) !== null) {
      moveSites++;
      // Look at the handful of lines immediately after the move.
      const after = src.slice(move.index + move[0].length, move.index + move[0].length + 200);
      const window = after.split('\n').slice(0, 4).join('\n');
      for (const resetter of resetters) {
        if (new RegExp(`\\b${resetter}\\s*\\(`).test(window)) {
          const line = src.slice(0, move.index).split('\n').length;
          offenders.push(
            `${door}/index.ts:${line} moves menuSelection then calls ${resetter}() which resets it to 0`
          );
        }
      }
    }

    assert.ok(
      moveSites > 0,
      `${door}: no menuSelection move sites found - test's parser is stale, fix the test`
    );
  }

  assert.deepStrictEqual(
    offenders, [],
    `Menu arrow keys are dead in these doors:\n  ${offenders.join('\n  ')}`
  );
}

/**
 * Every arcade door must drive movement from held keys, not from the
 * character stream.
 *
 * Reported live 2026-08-30: "all arcade games except arkanoid and gmaster
 * have key repeat/delay problems". blessed delivers characters, not presses
 * and releases, so a held key arrives as the client's auto-repeat - one
 * character, a ~400-500ms gap, then a burst. A door that moves on each
 * character inherits that stutter and cannot fix it locally.
 *
 * The fix each door must carry has two halves, and BOTH are required:
 * opting into held-key tracking, and guarding its character movement path
 * so it does not also move (which would double every step).
 */
export async function arcadeDoorsDriveMovementFromHeldKeys(): Promise<void> {
  const missingOptIn: string[] = [];
  const missingGuard: string[] = [];
  const missingPoll: string[] = [];

  for (const door of MENU_DOORS) {
    const file = path.join(REPO_ROOT, 'Doors', door, 'index.ts');
    const src = fs.readFileSync(file, 'utf-8');

    if (!/trackHeldKeys:\s*true/.test(src)) missingOptIn.push(door);

    // Something must consult the held state every tick.
    if (!/isHeld\(|consumeRepeat\(/.test(src)) missingPoll.push(door);

    // ...and the character path must stand down when key state is live.
    if (!/isKeyStateActive\(\)/.test(src)) missingGuard.push(door);
  }

  assert.deepStrictEqual(
    missingOptIn, [],
    `these doors never ask for held-key tracking, so they still stutter on the client's auto-repeat: ${missingOptIn.join(', ')}`
  );
  assert.deepStrictEqual(
    missingPoll, [],
    `these doors track held keys but never read them, so holding a key does nothing: ${missingPoll.join(', ')}`
  );
  assert.deepStrictEqual(
    missingGuard, [],
    `these doors read held keys but never guard the character path, so every press moves twice: ${missingGuard.join(', ')}`
  );
}

/**
 * Arkanoid wrote its highscores to a path built from process.cwd(). The
 * backend runs with cwd web/backend (Dockerfile sets WORKDIR
 * /app/web/backend), so scores landed in web/backend/Doors/arkanoid/ -
 * outside the Doors volume, in the container's ephemeral layer, wiped on
 * every deploy.
 *
 * The path must resolve inside the door's own directory under Doors/,
 * regardless of what cwd the backend happens to run with.
 */
export async function arkanoidHighscorePathIsNotCwdRelative(): Promise<void> {
  const serverSrc = path.join(REPO_ROOT, 'Doors', 'arkanoid', 'server.ts');
  const src = fs.readFileSync(serverSrc, 'utf-8');

  // The literal defect: a cwd-derived highscore path.
  const cwdPath = /process\.cwd\(\)[\s\S]{0,80}?highscores\.json/.test(src)
    || /getHighscorePath[\s\S]{0,300}?process\.cwd\(\)/.test(src);
  assert.strictEqual(
    cwdPath, false,
    'arkanoid/server.ts derives its highscore path from process.cwd() - ' +
    'the backend runs with cwd web/backend, so scores land outside the Doors volume'
  );

  // And the real resolved value, exercised from the backend's actual cwd.
  const originalCwd = process.cwd();
  try {
    process.chdir(path.join(REPO_ROOT, 'web', 'backend'));
    // Imported after chdir so any cwd-captured constant would be caught.
    const mod = require(serverSrc);
    const resolved: string = mod.getHighscorePath();

    const expected = path.join(REPO_ROOT, 'Doors', 'arkanoid', 'highscores.json');
    assert.strictEqual(
      resolved, expected,
      `arkanoid highscores resolve to ${resolved}, expected ${expected}`
    );
    assert.ok(
      !resolved.includes(path.join('web', 'backend')),
      `arkanoid highscores resolve under web/backend (${resolved}) - will not survive a deploy`
    );
  } finally {
    process.chdir(originalCwd);
  }
}
