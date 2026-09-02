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
 * navigate the main menu in any of the arcade games; arrow up/down does
 * nothing").
 */
const MENU_DOORS = [
  'joust', 'zoo-keeper', 'pengo', 'super-qix',
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
    // Any assignment to menuSelection that is not the reset itself. This used
    // to look for `Math.max(` / `Math.min(` literally, and went stale the day
    // the arcade doors moved that arithmetic into a `moveSelection()` helper:
    // the test then reported "no menuSelection move sites found" for joust and
    // failed in CI while the doors were fine.
    const moveRe = /menuSelection\s*=\s*(?!0\s*;)[^;\n]{0,160};/g;
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

/**
 * A one-row box may not carry a border.
 *
 * `createBox` and `blessed.box` both build a `Panel`, and Panel draws a line
 * border whenever the caller passes no `border` key
 * (sdk/engines/ui/blessed/widgets/panel.ts:53). A box one row high has no
 * interior once a frame takes its top and bottom rows, so its content never
 * renders - the door paints a rule where the text was supposed to be.
 *
 * Found four times in one day, in four unrelated doors: GRANDMASTER's
 * full-screen backgrounds, Scrollwars' footer, the widget showcase's header
 * and status bars, and WHIP's four new-project field labels. None of them had
 * ever shown a character.
 *
 * The doors below still contain the shape. They belong to other sessions'
 * work in flight, so they are recorded rather than fixed - this test fails
 * when the count in any of them CHANGES, in either direction: a new one is a
 * new invisible bar, and a removed one means the entry should go.
 */
const THIN_BOX_BACKLOG: Record<string, number> = {
  // Its four modal backdrops were fixed in 4a0d0aa29; these three are bars.
  'Doors/bug-tracker/app.ts': 2,
  'Doors/bug-tracker/dialogs.ts': 1,
  // The busiest door on the board - eight of them, including the channel
  // header and the user-status line.
  'Doors/livechat/server.ts': 1,
  'Doors/livechat/ui/channel-header.ts': 1,
  'Doors/livechat/ui/user-status.ts': 1,
  'Doors/livechat/ui/video-tile.ts': 1,
  'Doors/livechat/overlays/settings-checkboxes-events.ts': 1,
  'Doors/livechat/overlays/settings-overlay.ts': 1,
  'Doors/livechat/features/drawing-canvas.ts': 1,
  'Doors/livechat/features/video-grid.ts': 1,
  'Doors/rip-browser/app.ts': 1,
  // GRANDMASTER's remaining three, in the TetriNET screens.
  'Doors/grandmaster/app.ts': 2,
  'Doors/grandmaster/ui/menu.ts': 1,
};

/** Every `.ts` under Doors/, excluding builds and dependencies. */
function doorSources(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      doorSources(full, found);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      found.push(full);
    }
  }
  return found;
}

/**
 * The object literal a factory call opens, balanced by brace depth.
 * A regex cannot do this: these literals nest style and border objects.
 */
function objectLiteralAt(src: string, from: number): string {
  const open = src.indexOf('{', from);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return '';
}

export async function oneRowBoxesDoNotCarryAFrame(): Promise<void> {
  const factory = /\b(createBox|blessed\.box|createDockablePanel|createPanel)\s*\(\s*\{/g;
  const counts: Record<string, number> = {};

  for (const file of doorSources(path.join(REPO_ROOT, 'Doors'))) {
    const src = fs.readFileSync(file, 'utf-8');
    factory.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = factory.exec(src)) !== null) {
      const body = objectLiteralAt(src, m.index + m[0].length - 1);
      if (/\bborder\s*:/.test(body)) continue;
      if (!/\bheight\s*:\s*(1|'1'|"1")\s*[,}]/.test(body)) continue;
      const rel = path.relative(REPO_ROOT, file);
      counts[rel] = (counts[rel] ?? 0) + 1;
    }
  }

  const problems: string[] = [];
  for (const [file, count] of Object.entries(counts)) {
    const known = THIN_BOX_BACKLOG[file];
    if (known === undefined) {
      problems.push(`${file}: ${count} one-row box(es) with no border key - Panel frames them, and a framed one-row box paints no content. Pass border: undefined.`);
    } else if (count !== known) {
      problems.push(`${file}: ${count} one-row unbordered boxes, backlog says ${known} - update THIN_BOX_BACKLOG.`);
    }
  }
  for (const file of Object.keys(THIN_BOX_BACKLOG)) {
    if (counts[file] === undefined) {
      problems.push(`${file}: fixed - remove it from THIN_BOX_BACKLOG.`);
    }
  }

  assert.strictEqual(problems.length, 0, `\n  ${problems.join('\n  ')}`);
}
