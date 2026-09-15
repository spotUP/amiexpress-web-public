/**
 * GRANDMASTER follows the caller's theme, and `classic` is untouched.
 *
 * The door held 259 literal colour names across app.ts and ui/ - every
 * dialog, every HUD panel border, every selected row - so it looked the same
 * whatever theme the caller had chosen. They are tokens now.
 *
 * The migration rests on one claim: each literal became the TOKEN THAT WAS
 * STANDING BEHIND IT, so classic renders exactly as before (classic's tokens
 * ARE those names) and every other theme is followed. That claim is only
 * worth anything if something drives the real screens and reads the real
 * widgets, which is what this does - the menu and the game HUD are built
 * here the way the door builds them.
 *
 * Two things deliberately do NOT move, and are pinned as such:
 *   - piece and cell colours, which are game art
 *   - the Panels family's magenta, which no classic token IS (see
 *     door-theme.ts; mapping it would repaint Panels under classic)
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { themeById } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { MenuScreen } from '../ui/menu';
import { GameScreen } from '../ui/game-screen';
import { GameEngine } from '../core/game';
import { PIECE_COLORS } from '../core/pieces';
import { missionRows } from '../ui/mission-select';
import { MENU_ITEMS } from '../ui/menu';
import { loadMissionPack } from '../core/mission-pack';
import * as path from 'path';
import { applyTheme } from '../door-theme';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const state: any = { playerName: 'sysop', settings: {}, stats: {} };
const inputStub: any = { on() {}, off() {}, setEnabled() {} };

const gameSettings: any = {
  rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
  ghostPiece: true, lockDelay: 500, previewCount: 4,
  musicVolume: 0, sfxVolume: 0, keyBindings: {},
  blockGlow: false, glowIntensity: 0, clearStyle: 'instant', clearDirection: 'in',
  clearAnimationSpeed: 1, placementEffects: false, floatTextMode: 'off',
  b2bGlowEnabled: false, connectedBlocks: false, animationIntensity: 'normal',
};

/** The classic default, so one test cannot theme the next one. */
function backToClassic(): void {
  applyTheme(themeById('classic'));
}

/** The menu, built the way the door builds it, with its widgets reachable. */
async function openMenu(width = 80, height = 25) {
  const screen: any = new Screen({
    title: 'theme', responsive: width !== 80 || height !== 25, width, height,
  } as any);
  const menu: any = new MenuScreen(screen, state, sounds);
  void menu.show();
  // show() clears the terminal and waits for that to propagate (modem speeds)
  // before it builds anything.
  await new Promise(r => setTimeout(r, 260));
  const boxes = (): any[] => screen.children.filter((c: any) => !c.hidden);
  const labelled = (label: string): any =>
    boxes().find((c: any) => String(c.options?.label ?? '').includes(label));
  return { screen, boxes, labelled, destroy: () => screen.destroy() };
}

/** The game screen and its HUD panels, built headless. */
function openGame(width = 80) {
  const screen: any = new Screen({
    title: 'theme-hud', responsive: width !== 80, width, height: 25,
  } as any);
  const engine: any = new GameEngine('marathon', gameSettings, sounds, null as any);
  engine.start();
  const game: any = new GameScreen(
    screen, engine, inputStub, sounds, { settings: gameSettings }, null, null,
  );
  game.setupUI();
  return { screen, game, engine, destroy: () => screen.destroy() };
}

const borderOf = (widget: any): string => widget?.style?.border?.fg;

/**
 * The migration's promise: a caller on classic sees the door they had.
 *
 * Every value here is the literal that stood in the source before the
 * migration, read back off the real widget.
 */
export async function classicIsExactlyTheDoorThatWasThereBefore(): Promise<void> {
  backToClassic();
  const h = await openMenu();
  try {
    assert.strictEqual(borderOf(h.labelled('SELECT MODE')), 'cyan',
      'the mode panel was cyan and must still be');
    assert.strictEqual(borderOf(h.labelled('DESCRIPTION')), 'gray',
      'the description panel was gray');
    assert.strictEqual(borderOf(h.labelled('PLAYER')), 'gray',
      'the player panel was gray');
  } finally { h.destroy(); }

  const g = openGame();
  try {
    assert.strictEqual(borderOf(g.game.nextBox), 'cyan', 'NEXT was cyan');
    assert.strictEqual(borderOf(g.game.gradeBox), 'yellow', 'GRADE was yellow');
    assert.strictEqual(borderOf(g.game.statsBox), 'green', 'STATS was green');
    assert.strictEqual(borderOf(g.game.boardBox), 'white', 'the well was white');
  } finally { g.destroy(); }
}

/**
 * And the point of the whole exercise: another theme actually arrives.
 *
 * quiet-phosphor is the hardest case - it is one of the two themes that draw
 * no panel border at all - so its chrome token is what a border must take.
 */
export async function aThemeReachesTheMenuAndTheHud(): Promise<void> {
  const phosphor = themeById('quiet-phosphor');
  applyTheme(phosphor);
  try {
    const h = await openMenu();
    try {
      assert.strictEqual(borderOf(h.labelled('SELECT MODE')), phosphor.tokens.chrome,
        'the mode panel takes the theme chrome');
      assert.notStrictEqual(borderOf(h.labelled('SELECT MODE')), 'cyan',
        'and is no longer the classic literal');
      assert.strictEqual(borderOf(h.labelled('DESCRIPTION')), phosphor.tokens.dim,
        'a quiet panel takes dim');
    } finally { h.destroy(); }

    const g = openGame();
    try {
      assert.strictEqual(borderOf(g.game.nextBox), phosphor.tokens.chrome);
      assert.strictEqual(borderOf(g.game.gradeBox), phosphor.tokens.accent);
      assert.strictEqual(borderOf(g.game.statsBox), phosphor.tokens.ok);
      assert.strictEqual(borderOf(g.game.boardBox), phosphor.tokens.ink);
    } finally { g.destroy(); }
  } finally { backToClassic(); }
}

/**
 * The trap this migration nearly walked into.
 *
 * `updateRainbowBorders` REPAINTS the same HUD borders every frame, and its
 * non-rainbow branch wrote the literals back - so tokenising the creation
 * alone would have themed the HUD for exactly as long as it took the first
 * frame to land, and then reverted it to cyan under every theme.
 */
export async function theFrameLoopRepaintsTheThemeAndNotTheLiterals(): Promise<void> {
  const phosphor = themeById('quiet-phosphor');
  applyTheme(phosphor);
  const g = openGame();
  try {
    // Not GM, not the credit roll: the branch that restores the resting
    // colours, which is the one that runs for almost every player.
    g.game.updateRainbowBorders();
    assert.strictEqual(borderOf(g.game.nextBox), phosphor.tokens.chrome,
      'the repaint puts the THEME back, not cyan');
    assert.strictEqual(borderOf(g.game.gradeBox), phosphor.tokens.accent);
    assert.strictEqual(borderOf(g.game.statsBox), phosphor.tokens.ok);
    assert.strictEqual(borderOf(g.game.boardBox), phosphor.tokens.ink);
  } finally { g.destroy(); backToClassic(); }
}

/**
 * A tetris piece is art, not chrome.
 *
 * The migration's whole risk in this door: its literals mix piece colours,
 * which carry the game's meaning and must not move, with dialog chrome,
 * which must.
 */
export async function thePiecesKeepTheirOwnColoursUnderEveryTheme(): Promise<void> {
  const before = JSON.stringify(PIECE_COLORS);
  try {
    for (const id of ['quiet-phosphor', 'uprough-neon', 'slate-slash']) {
      applyTheme(themeById(id));
      assert.strictEqual(JSON.stringify(PIECE_COLORS), before,
        `${id} must not repaint the pieces`);
    }
  } finally { backToClassic(); }
}

/**
 * The chrome, not only the colours.
 *
 * Sysop, 2026-09-03: "only colors makes no great theme". The menu is the one
 * screen with a spare row, so the SDK's masthead and rail ride there.
 */
export async function theMenuCarriesTheSdkMasthead(): Promise<void> {
  applyTheme(themeById('uprough-neon'));
  try {
    const h = await openMenu();
    try {
      const row0 = h.boxes().find((c: any) => c.position?.top === 0 && c.position?.height === 1);
      assert.ok(row0, 'the menu has a one-row masthead at the top');
      const painted = String(row0.getContent() ?? '');
      assert.ok(painted.includes('GRANDMASTER'),
        `the masthead carries the door's name, got ${JSON.stringify(painted)}`);
    } finally { h.destroy(); }
  } finally { backToClassic(); }
}

/**
 * The COLOUR TAGS follow too, not just the widget styles.
 *
 * Half the door's colour lived in blessed tags inside painted strings -
 * `{cyan-fg}`, `{gray-fg}`, `{green-fg}` - and a door whose borders take the
 * theme while its labels stay classic-cyan is a door with two palettes on
 * one screen. `missionRows` is the pure one, so it is the one that can be
 * read straight.
 */
export async function thePaintedTagsFollowTheThemeAsWell(): Promise<void> {
  const packPath = path.join(__dirname, '..', 'assets', 'missions', 'starter.json');
  const pack = loadMissionPack(packPath);
  const first = pack.missions[0].id;

  const phosphor = themeById('quiet-phosphor');
  applyTheme(phosphor);
  try {
    const rows = missionRows(pack, { [first]: { seconds: 75 } });
    const cleared = rows[0];
    assert.ok(cleared.includes(`{${phosphor.tokens.ok}-fg}`),
      `a cleared mission's mark takes the theme's ok colour, got ${cleared}`);
    assert.ok(!cleared.includes('{green-fg}'),
      'and not the classic literal it was written with');
    const open = cleared.match(/\{[^/{}]+-fg\}/g) ?? [];
    const close = cleared.match(/\{\/[^{}]+-fg\}/g) ?? [];
    assert.strictEqual(open.length, close.length,
      'every tag the rewrite opened is closed, or the colour runs on down the list');
  } finally { backToClassic(); }

  // And classic still paints the literal it always did.
  const classicRows = missionRows(pack, { [first]: { seconds: 75 } });
  assert.ok(classicRows[0].includes('{green-fg}'),
    'classic is unchanged: the mark is still green');
}

/**
 * A module-level `const` must never carry a token.
 *
 * MENU_ITEMS is built at IMPORT time, which is before `applyTheme` has run,
 * so a token written into it would freeze at classic and follow nothing ever
 * after - the quiet failure this migration could most easily have shipped.
 * Its per-mode colours are identity art anyway, so the rule and the art
 * agree: the literals stay.
 */
export async function theMenuItemsStayLiteralBecauseTheyAreBuiltBeforeTheThemeIs(): Promise<void> {
  applyTheme(themeById('quiet-phosphor'));
  try {
    const joined = MENU_ITEMS.join('|');
    assert.ok(joined.includes('{yellow-fg}TETRINET{/yellow-fg}'),
      'the mode labels are literal art, and must not be tokenised into a const');
    const phosphor = themeById('quiet-phosphor');
    for (const token of [phosphor.tokens.accent, phosphor.tokens.chrome, phosphor.tokens.ok]) {
      assert.ok(!joined.includes(token),
        `a theme colour (${token}) in a module-level const is frozen at whatever `
        + 'theme was loaded first - make it a function before tokenising it');
    }
  } finally { backToClassic(); }
}
