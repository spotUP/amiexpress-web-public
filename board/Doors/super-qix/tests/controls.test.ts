/**
 * The door's conveniences: the help screen, the redraw key, and remapping
 * the movement keys - plus the two persistence defects found on the way.
 *
 * Covers Q-5a (help lists every binding, generated from the live map),
 * Q-5b (Ctrl-D repaints), Q-5c (a remapped key moves the marker), Q-5d (the
 * arrow keys keep working after a remap), Q-5e (a remap survives leaving and
 * re-entering the door), Q-5f (high scores are written outside dist/),
 * Q-5g (a full BBS handle can be recorded) and Q-5h (the name is taken from
 * the session rather than typed).
 *
 * index.ts cannot be imported here - it constructs a door and pulls in
 * blessed - so the parts of it that matter are asserted against its SOURCE,
 * the same way everyLifeAwardGoesThroughOneFunction does. That is deliberate:
 * a key layer that is correct in game/controls.ts but not actually called by
 * the door would be a feature nobody can reach.
 */

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { QixEngine } from '../game/qix-engine';
import { SuperQixData, Direction, KeyMap } from '../game/types';
import {
  normalizeKey, directionForKey, canBindKey, keyLabel,
  helpControlLines, controlBindings, REDRAW_KEY, DEFAULT_KEY_MAP,
} from '../game/controls';
import { FIELD_WIDTH, FIELD_HEIGHT, STARTING_LIVES, MAX_NAME_LENGTH } from '../game/constants';

const DOOR_ROOT = path.join(__dirname, '..');

function doorSource(file: string): string {
  return fs.readFileSync(path.join(DOOR_ROOT, file), 'utf8');
}

function createData(): SuperQixData {
  return {
    state: 'menu', score: 0, lives: STARTING_LIVES, level: 1,
    claimedPercent: 0, targetPercent: 75, scoreMultiplier: 1,
    field: [], fieldWidth: FIELD_WIDTH, fieldHeight: FIELD_HEIGHT,
    marker: {
      x: 0, y: 0, isDrawing: false,
      hasShield: false, speedBoost: false, speedBoostTimer: 0,
    },
    currentStix: null,
    qixList: [], sparxList: [], fuse: null, qixIdCounter: 0, sparxIdCounter: 0,
    powerUps: [], powerUpIdCounter: 0, collectedLetters: [], levelWord: '',
    activeEffects: [], borderPath: [], internalLines: [],
    highscores: [], menuSelection: 0, playerName: '', playerNameCursor: 0,
    lastUpdateTime: Date.now(), frameCount: 0, levelStartTime: Date.now(),
    stopTimer: 0, gremlinsCaptured: 0, timeMeter: 0,
    keyMap: { ...DEFAULT_KEY_MAP }, remapDirection: 0, remapMessage: '',
    warp: null, transitionTimer: 0, transitionMessage: '',
  } as SuperQixData;
}

/* ------------------------------------------------------------------ 5a */

/**
 * Q-5a. The help screen lists every binding, and it is GENERATED from the
 * live key map rather than typed out.
 *
 * It was typed out, and it had drifted: the block still advertised
 * "Z - Slow Draw (2x points)" and "X - Fast Draw" long after FAQ 2.5.3 was
 * honoured and the door was given the single draw button it really has.
 */
export async function theHelpScreenListsEveryBinding(): Promise<void> {
  const lines = helpControlLines(DEFAULT_KEY_MAP).join('\n');

  for (const action of ['Move up', 'Move down', 'Move left', 'Move right',
                        'Draw', 'Pause', 'Redraw the screen', 'Quit to the menu']) {
    assert.ok(lines.includes(action), `the help screen should mention "${action}"`);
  }

  // Every direction's CURRENT key is named.
  for (const direction of ['up', 'down', 'left', 'right'] as Direction[]) {
    assert.ok(
      lines.includes(keyLabel(DEFAULT_KEY_MAP[direction])),
      `the help screen should name the key bound to ${direction}`
    );
  }

  // The two lies that were sitting in it are gone for good.
  assert.ok(!/Slow Draw/i.test(lines), 'Super Qix has no slow draw (FAQ 2.5.3)');
  assert.ok(!/Fast Draw/i.test(lines), 'Super Qix has no fast draw (FAQ 2.5.3)');
}

/** Q-5a. Remap a key and the help screen says so, with no edit to it. */
export async function theHelpScreenFollowsARemap(): Promise<void> {
  const remapped: KeyMap = { ...DEFAULT_KEY_MAP, up: 'i' };
  const lines = helpControlLines(remapped).join('\n');

  assert.ok(
    /^I\s+- Move up$/m.test(lines),
    `the help screen should say I moves up; it said:\n${lines}`
  );
  assert.ok(
    !/Arrow Up\s+- Move up/.test(lines),
    'and it should no longer claim the arrow key does'
  );
}

/** Q-5a. And the door actually draws its help from that function. */
export async function theDoorGeneratesItsHelpFromTheKeyMap(): Promise<void> {
  const index = doorSource('index.ts');

  assert.ok(
    /helpControlLines\(gameData\.keyMap\)/.test(index),
    'showHelp should generate its CONTROLS block from the live key map'
  );
  assert.ok(
    !/Slow Draw/i.test(index),
    'the stale hand-written controls block should be gone from the door'
  );
}

/* ------------------------------------------------------------------ 5b */

/** Q-5b. Ctrl-D arrives as its own token rather than as a stray character. */
export async function ctrlDIsRecognisedAsTheRedrawKey(): Promise<void> {
  assert.strictEqual(REDRAW_KEY, '\x04', 'Ctrl-D is 0x04 on the wire');
  assert.strictEqual(
    normalizeKey(REDRAW_KEY), 'ctrl-d',
    'the raw byte should normalise to the redraw token'
  );
  assert.strictEqual(
    directionForKey(normalizeKey(REDRAW_KEY), DEFAULT_KEY_MAP), null,
    'and it must not be mistaken for a movement key'
  );
}

/** Q-5b. And the door repaints BOTH the board and the frame around it. */
export async function theDoorRepaintsOnCtrlD(): Promise<void> {
  const index = doorSource('index.ts');

  assert.ok(
    /case "ctrl-d":\s*\n\s*redraw\(\);/.test(index),
    'the game input handler should act on ctrl-d'
  );

  const redrawBody = index.match(/function redraw\(\): void \{([\s\S]*?)\n\}/);
  assert.ok(redrawBody, 'there should be a redraw function');
  assert.ok(
    /engine\?\.render\(\)/.test(redrawBody![1]),
    'redraw should repaint the board'
  );
  assert.ok(
    /screen\?\.render\(\)/.test(redrawBody![1]),
    'redraw should repaint the frame too - one without the other leaves half a screen'
  );
}

/* ------------------------------------------------------------------ 5c */

/** Q-5c. A remapped key moves the marker. */
export async function aRemappedKeyMovesTheMarker(): Promise<void> {
  assert.strictEqual(
    directionForKey('i', DEFAULT_KEY_MAP), null,
    'I should mean nothing before it is bound'
  );

  const remapped: KeyMap = { ...DEFAULT_KEY_MAP, up: 'i' };
  assert.strictEqual(
    directionForKey('i', remapped), 'up',
    'once bound, I should move the marker up'
  );

  // ...and that direction really does move it, through the engine the door
  // hands it to.
  const data = createData();
  const engine = new QixEngine(data, () => {});
  engine.initLevel(1);
  data.state = 'playing';
  data.sparxList = [];
  data.qixList = [];

  const before = data.marker.y;
  const direction = directionForKey('i', remapped);
  assert.ok(direction);
  (engine as any).lastMoveTime = 0;
  engine.handleDirection(direction!);
  assert.strictEqual(
    data.marker.y, before - 1,
    'the marker should have taken one step up'
  );
}

/** Q-5c. And the door dispatches through the map rather than a bare switch. */
export async function theDoorDispatchesMovementThroughTheKeyMap(): Promise<void> {
  const index = doorSource('index.ts');

  assert.ok(
    /directionForKey\(key, gameData\.keyMap\)/.test(index),
    'handleGameInput should ask the key map which direction a key means'
  );
  assert.ok(
    /isHeld\(gameData\.keyMap\[dir\]\)/.test(index),
    'the held-key loop should ask for the BOUND key, or a remap does nothing ' +
    'on clients that report key-down and key-up'
  );
}

/* ------------------------------------------------------------------ 5d */

/**
 * Q-5d. The arrow keys keep working after a remap.
 *
 * The four direction tokens answer for themselves whatever the map says, so
 * a player who binds something odd can always fall back on the arrows - and
 * cannot lock themselves out of their own game.
 */
export async function theArrowKeysKeepWorkingAfterARemap(): Promise<void> {
  const remapped: KeyMap = { up: 'i', down: 'k', left: 'j', right: 'l' };

  for (const direction of ['up', 'down', 'left', 'right'] as Direction[]) {
    assert.strictEqual(
      directionForKey(direction, remapped), direction,
      `the arrow key for ${direction} should still move ${direction}`
    );
  }

  // WASD normalises to the same tokens, so it survives too.
  assert.strictEqual(directionForKey(normalizeKey('w'), remapped), 'up');
  assert.strictEqual(directionForKey(normalizeKey('a'), remapped), 'left');

  // And the new bindings work alongside them, not instead of them.
  assert.strictEqual(directionForKey('i', remapped), 'up');
  assert.strictEqual(directionForKey('l', remapped), 'right');
}

/**
 * Q-5d. A player cannot bind a direction to a key that would strand them,
 * nor to one that already means a DIFFERENT direction - binding "up" to A
 * would have silently moved the marker left.
 */
export async function aRemapRefusesKeysTheGameAlreadyNeeds(): Promise<void> {
  for (const reserved of ['q', 'escape', 'p', 'space']) {
    const verdict = canBindKey(reserved, 'up');
    assert.strictEqual(verdict.ok, false, `${reserved} should be refused`);
    assert.ok(verdict.reason, 'and it should say why');
  }

  const conflict = canBindKey('left', 'up');
  assert.strictEqual(conflict.ok, false, 'binding up to the left arrow should be refused');
  assert.ok(/already moves left/.test(conflict.reason ?? ''), conflict.reason);

  assert.strictEqual(canBindKey('i', 'up').ok, true, 'an ordinary letter should be allowed');
  assert.strictEqual(
    canBindKey('up', 'up').ok, true,
    'rebinding a direction to its own arrow is a no-op, not a conflict'
  );
}

/* ------------------------------------------------------------------ 5e */

/**
 * Q-5e. A remap survives leaving and re-entering the door.
 *
 * Saved and loaded through the real RPC pair, against a real file in a
 * temporary door root, keyed by BBS handle so two players keep their own.
 */
export async function aRemapSurvivesLeavingAndReenteringTheDoor(): Promise<void> {
  const { rpcHandlers, getSettingsPath } = await import('../server');

  const settingsPath = getSettingsPath();
  const existed = fs.existsSync(settingsPath);
  const backup = existed ? fs.readFileSync(settingsPath, 'utf8') : null;

  try {
    const mine: KeyMap = { up: 'i', down: 'k', left: 'j', right: 'l' };
    const saved = await rpcHandlers.saveSettings({ user: 'SPOTUP', keyMap: mine });
    assert.strictEqual(saved.success, true, 'the settings should have been written');

    // Coming back into the door: a fresh read, as onStart does.
    const loaded = await rpcHandlers.getSettings({ user: 'SPOTUP' });
    assert.deepStrictEqual(
      loaded.keyMap, mine,
      'the bindings should come back exactly as they were left'
    );

    // Another player on the same board keeps the defaults.
    const other = await rpcHandlers.getSettings({ user: 'SOMEONE-ELSE' });
    assert.deepStrictEqual(
      other.keyMap, DEFAULT_KEY_MAP,
      'one player\'s remap must not follow another player around'
    );

    // A hand-edited or corrupt entry cannot put rubbish into the dispatch map.
    await rpcHandlers.saveSettings({
      user: 'BADFILE',
      keyMap: { up: 42, down: null, left: 'j', right: 'l' } as any,
    });
    const cleaned = await rpcHandlers.getSettings({ user: 'BADFILE' });
    assert.strictEqual(cleaned.keyMap.up, DEFAULT_KEY_MAP.up, 'a non-string is dropped');
    assert.strictEqual(cleaned.keyMap.down, DEFAULT_KEY_MAP.down, 'so is a null');
    assert.strictEqual(cleaned.keyMap.left, 'j', 'and the good entries survive');
  } finally {
    if (backup === null) {
      if (fs.existsSync(settingsPath)) fs.unlinkSync(settingsPath);
    } else {
      fs.writeFileSync(settingsPath, backup);
    }
  }
}

/** Q-5e. And the door loads them on the way in and saves them on the way out. */
export async function theDoorLoadsAndSavesTheBindings(): Promise<void> {
  const index = doorSource('index.ts');

  assert.ok(
    /rpcHandlers\.getSettings\(\{\s*user: bbsUsername\s*\}\)/.test(index),
    'onStart should load this player\'s bindings'
  );
  assert.ok(
    /rpcHandlers\.saveSettings\(/.test(index),
    'finishing the remap should save them'
  );
}

/* ------------------------------------------------------------------ 5f */

/**
 * Q-5f. High scores are written OUTSIDE dist/.
 *
 * They were written to path.join(__dirname, 'highscores.json'), and under
 * the compiled door __dirname is dist/ - which every deploy rebuilds, so
 * the board was wiped each time. Arkanoid was fixed for exactly this and
 * Super Qix never was.
 */
export async function highScoresAreWrittenOutsideDist(): Promise<void> {
  const { getHighscorePath, getSettingsPath, getDoorRoot } = await import('../server');

  // The decisive check, and it has to be made against a tree of our own.
  //
  // Under tsx __dirname already IS the door root, so both the fixed and the
  // broken version resolve to the same place here - measured: asserting on
  // getHighscorePath() alone passed just as happily on the bug. Against a
  // synthetic door somewhere else entirely, a walk that ignores where it was
  // told to start cannot possibly land in the right place.
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'qix-doorroot-'));
  try {
    const fakeDoor = path.join(sandbox, 'super-qix');
    const fakeDist = path.join(fakeDoor, 'dist');
    fs.mkdirSync(fakeDist, { recursive: true });
    fs.writeFileSync(path.join(fakeDoor, 'package.json'), '{"name":"super-qix"}');

    assert.strictEqual(
      getDoorRoot(fakeDist), fakeDoor,
      'a door running from dist/ must resolve to the directory holding its ' +
      'package.json - that is what climbs the scores back out of the ' +
      'directory every deploy rebuilds'
    );
    assert.strictEqual(
      getDoorRoot(fakeDoor), fakeDoor,
      'and running from source resolves to the same place, so dev and the ' +
      'live board share one file'
    );

    // No package.json anywhere above: fall back rather than climb out of the
    // door and write somewhere unrelated.
    const orphan = path.join(sandbox, 'nowhere');
    fs.mkdirSync(orphan);
    const stray = getDoorRoot(orphan);
    assert.ok(
      stray === orphan || fs.existsSync(path.join(stray, 'package.json')),
      `the walk should stop somewhere sensible, it gave ${stray}`
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }

  // And the scores are actually built on that walk, not on __dirname.
  const serverSource = doorSource('server.ts')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.ok(
    /path\.join\(getDoorRoot\(\), 'highscores\.json'\)/.test(serverSource),
    'getHighscorePath should be built on getDoorRoot(), not __dirname'
  );

  for (const [what, resolved] of [
    ['high scores', getHighscorePath()],
    ['settings', getSettingsPath()],
  ] as const) {
    assert.ok(
      !resolved.split(path.sep).includes('dist'),
      `${what} must not be written inside dist/, which every deploy replaces: ${resolved}`
    );
    assert.strictEqual(
      path.dirname(resolved), DOOR_ROOT,
      `${what} should live in the door's own directory, not ${path.dirname(resolved)}`
    );
  }

  // The path must not be derived from the working directory either: the
  // backend runs with cwd web/backend, outside the Doors volume entirely.
  //
  // Comments are stripped first - server.ts explains at length why cwd is
  // wrong, and a scan that counted the explanation would fail on the very
  // document warning against it.
  const server = doorSource('server.ts')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.ok(
    !/process\.cwd\(\)/.test(server),
    'the door root must not be derived from cwd - the backend does not run in it'
  );
}

/* ------------------------------------------------------------ 5g / 5h */

/**
 * Q-5g. A full BBS handle can be recorded.
 *
 * The save RPC used to REJECT any name longer than three characters, so a
 * player called SPOTUP simply could not get onto the board.
 */
export async function aFullBbsHandleCanBeRecorded(): Promise<void> {
  const { rpcHandlers, getHighscorePath } = await import('../server');

  const scoresPath = getHighscorePath();
  const existed = fs.existsSync(scoresPath);
  const backup = existed ? fs.readFileSync(scoresPath, 'utf8') : null;

  try {
    assert.ok(MAX_NAME_LENGTH > 3, 'a BBS handle is not three characters');

    const handle = 'SPOTUP';
    const result = await rpcHandlers.saveHighscore({
      name: handle, score: 999_999, level: 9, maxPercent: 99,
    });
    assert.strictEqual(
      result.success, true,
      `a ${handle.length}-character handle should be accepted`
    );

    const board = await rpcHandlers.getHighscores();
    assert.ok(
      board.some(entry => entry.name === handle),
      `the board should carry ${handle} in full, it had: ${board.map(e => e.name).join(', ')}`
    );
  } finally {
    if (backup === null) {
      if (fs.existsSync(scoresPath)) fs.unlinkSync(scoresPath);
    } else {
      fs.writeFileSync(scoresPath, backup);
    }
  }
}

/** Q-5h. The name comes from the session, so nobody types their own in. */
export async function theHighScoreNameComesFromTheSession(): Promise<void> {
  const index = doorSource('index.ts');

  assert.ok(
    /bbsUsername = ctx\?\.session\?\.user\?\.username \|\| ""/.test(index),
    'the door should take the handle from the session, as Frogger does'
  );
  assert.ok(
    /gameData\.playerName = bbsUsername\.toUpperCase\(\)\.substring\(0, MAX_NAME_LENGTH\)/
      .test(index),
    'and the name entry should arrive pre-filled with it'
  );
  assert.ok(
    !/padEnd\(3, "_"\)/.test(index),
    'the three-initial entry box should be gone'
  );
  assert.ok(
    !/playerName\.length < 3\b/.test(index),
    'and so should the three-character typing cap'
  );
}
