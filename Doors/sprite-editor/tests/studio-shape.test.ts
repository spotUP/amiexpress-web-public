/**
 * The studio is ONE application: the forked ANSI editor.
 *
 * These exist because the door was built the other way round twice in one
 * day - a studio shell that hosted the editor as a widget, first in a
 * quarter of the screen and then in all of it, with the studio's own menu
 * bar above the editor's own switched off. The sysop's verdict both times
 * was that it read as two applications bolted together. What follows pins
 * the shape so that cannot come back quietly.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { SpriteStudioDoor, studioTitle, DEFAULT_ZOOM, ZOOM_STEPS, stepZoom, zoomScales, CELL_ASPECT } from '../studio';
import { openDoc } from '../edit-doc';

const source = readFileSync(join(__dirname, '..', 'studio.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

function makeSprite(): Sprite {
  const blank = () => [[null, null, null], [null, null, null]];
  return {
    name: 'fixture', cellW: 3, cellH: 2,
    animations: {
      idle: { ticksPerFrame: 4, loop: true, frames: [blank(), blank()] },
      walk: { ticksPerFrame: 6, loop: true, frames: [blank()] },
    },
  } as Sprite;
}

export async function theEditorOwnsTheScreenAndItsOwnChrome(): Promise<void> {
  assert.ok(source.includes("width: this.terminalMode?.mode() === 'fixed' ? 80 : '100%'"),
    'the editor must fill the screen - nothing wraps it - unless it is ' +
    'deliberately pinned to the 80x25 the board serves');
  for (const on of ['showMenuBar: true', 'showToolbar: true', 'showSidebar: true', 'showStatusBar: true']) {
    assert.ok(source.includes(on),
      `the editor's own chrome must be ON (${on}) - the door does not draw its own`);
  }
}

export async function theDoorDrawsNoChromeOfItsOwn(): Promise<void> {
  // The exact machinery of the shape that was wrong: a panel to wrap the
  // editor in, and a second menu bar to sit above it.
  for (const gone of ['makePanel', 'DockablePanel', 'createStudioMenuBar', 'panelContentRect', 'LAYOUT']) {
    assert.ok(!source.includes(gone),
      `${gone} must not come back - it is what made this read as two apps`);
  }
}

export async function frameAndAnimationLiveInTheEditorsOwnMenuBar(): Promise<void> {
  const studio: any = new SpriteStudioDoor();
  const menus = studio.buildMenus();
  assert.deepStrictEqual(menus.map((m: any) => m.label), ['Frame', 'Sprite', 'Zoom', 'Animation'],
    'the door contributes Frame, Sprite, Zoom and Animation into the editor bar');
  assert.ok(source.includes('extraMenus: this.buildMenus()'),
    'they must be handed to the editor as extraMenus, not drawn separately');

  const frame = menus[0].items.filter((i: any) => !i.separator).map((i: any) => i.label);
  for (const needed of ['New Frame', 'Duplicate Frame', 'Delete Frame']) {
    assert.ok(frame.some((l: string) => l.startsWith(needed)), `Frame menu needs ${needed}`);
  }
  const animation = menus[3].items.filter((i: any) => !i.separator).map((i: any) => i.label);
  for (const needed of ['Play', 'Next Animation', 'New Animation...', 'Delete Animation',
    'Slower', 'Faster', 'Loop / Hold']) {
    assert.ok(animation.some((l: string) => l.startsWith(needed)), `Animation menu needs ${needed}`);
  }
}

export async function everyMenuItemHasAnAction(): Promise<void> {
  const studio: any = new SpriteStudioDoor();
  for (const menu of studio.buildMenus()) {
    for (const item of menu.items) {
      if (item.separator) continue;
      assert.strictEqual(typeof item.action, 'function',
        `${menu.label} > ${item.label} has no action - it would be dead in the menu`);
    }
  }
}

export async function thePreviewIsARequesterNotAPane(): Promise<void> {
  // "it cant play when i draw i need a panel and hotkeys so i can play it
  // when i need" - so nothing may animate behind the drawing hand.
  assert.ok(source.includes('previewRequester'), 'the preview must be a requester');
  assert.ok(/box\.key\(\['escape', 'enter', 'space', 'q'\], close\)/.test(source),
    'any key must take the preview away again');
  assert.ok(/clearInterval\(timer\)/.test(source),
    'closing the preview must stop its timer - otherwise it plays on invisibly');
  const openEditor = source.slice(source.indexOf('private async openEditor'), source.indexOf('private buildMenus'));
  assert.ok(!openEditor.includes('setInterval'),
    'the editor must start no timer - the animation only runs while the requester is up');
}

export async function theOpenPathIsARequesterNotAScreen(): Promise<void> {
  assert.ok(source.includes('onOpen: async () => { await this.openSpriteRequester(); }'),
    "File > Open must open the requester - the browser screen is gone");
  assert.ok(!source.includes('BrowserState'),
    'the three-pane browser must not come back as a screen');
}

export async function everyHotkeyIsNonPrintableAndNotTheEditorsOwn(): Promise<void> {
  // The full clash rules live in tests/hotkeys.test.ts, which reads the
  // same table; this keeps the two oldest rules next to the shape they
  // belong to.
  const studio: any = new SpriteStudioDoor();
  const keys = Object.values(studio.commands())
    .map((c: any) => c.key).filter(Boolean) as string[];
  assert.ok(keys.length > 0, 'the hotkeys must be readable from the command table');
  const editorsOwn = new Set(['C-s', 'C-m', 'C-z', 'C-y', 'C-h']);
  for (const k of keys) {
    assert.ok(!(k.length === 1 && k >= ' '),
      `'${k}' is printable - in draw mode it would run the op AND paint the character`);
    assert.ok(!editorsOwn.has(k), `'${k}' collides with the editor's own control key`);
  }
}

export async function theDefaultIsOneToOne(): Promise<void> {
  // "its super magnified make it 1:1 as default" - the door must not decide
  // a magnification for the artist by fitting the sprite to the screen.
  assert.strictEqual(DEFAULT_ZOOM, 1, 'a sprite opens at actual size');
  assert.ok(source.includes('cellScaleX: sprite ? zoomScales(this.zoom).x : 1'),
    'a sprite is built at the current zoom, not at a fitted one; a .ans is ' +
    'always 1:1, having no cells to magnify');
  assert.deepStrictEqual(zoomScales(1), { x: 1, y: 1 },
    'actual size is ONE character per cell, which is what the game draws - ' +
    'cell-art rowToTags emits one character per cell, so an editor that ' +
    'widened it would be lying about the sprite');
  assert.deepStrictEqual(zoomScales(4), { x: 4, y: 4 }, 'zoom scales both axes together');
  assert.strictEqual(CELL_ASPECT, 1);
  assert.ok(!source.includes('canvasScale('),
    'the auto-fit must be gone, not merely unused');
}

export async function zoomIsSomethingYouAskFor(): Promise<void> {
  const studio: any = new SpriteStudioDoor();
  const zoom = studio.buildMenus().find((m: any) => m.label === 'Zoom');
  assert.ok(zoom, 'there must be a Zoom menu');
  assert.deepStrictEqual(
    zoom.items.filter((i: any) => !i.separator).map((i: any) => i.label.trim()).slice(1),
    ['1:1  (actual size)', '2:1', '4:1', '6:1', '8:1'],
    'the steps a sysop can pick, actual size first');
  assert.ok(zoom.items[0].label.startsWith('Zoom In'),
    'with the key that walks the ladder at the top of the menu');
  for (const z of ZOOM_STEPS) {
    assert.ok(z === 1 || z % 2 === 0,
      `${z}:1 is odd - a half-block cell holds two pixels vertically, so an ` +
      'odd scale gives one of them more rows than the other and distorts the art');
  }
}

export async function steppingZoomStopsAtTheEnds(): Promise<void> {
  assert.strictEqual(stepZoom(1, -1), 1, 'cannot go below actual size');
  assert.strictEqual(stepZoom(1, 1), 2);
  assert.strictEqual(stepZoom(2, 1), 4, 'the odd step is gone from the ladder');
  assert.strictEqual(stepZoom(ZOOM_STEPS[ZOOM_STEPS.length - 1], 1), 8, 'cannot go past the top');
  assert.strictEqual(stepZoom(99, -1), 1, 'an unknown zoom falls back to the first step');
}

export async function theTitleSaysWhatIsOpenAndWhereYouAre(): Promise<void> {
  const doc = openDoc(makeSprite());
  const title = studioTitle(doc, 'pengo', 'penguin.sprite.json');
  assert.ok(title.includes('pengo/penguin.sprite.json'), 'the title names the file');
  assert.ok(title.includes('idle'), 'and the animation');
  assert.ok(title.includes('frame 1/2'), 'and which frame of how many');
  assert.ok(!title.startsWith('*'), 'a freshly opened sprite is not dirty');
  assert.ok(studioTitle({ ...doc, dirty: true }, 'pengo', 'p.sprite.json').startsWith('*'),
    'unsaved work is marked');
}

export async function theCanvasIsCommittedBeforeAnythingChangesTheFrame(): Promise<void> {
  // The defect this shape could build in: paint, change frame, lose the
  // strokes. op() is the single funnel, and it must commit first.
  const op = source.slice(source.indexOf('private op('), source.indexOf('private step('));
  assert.ok(op.indexOf('this.commit()') < op.indexOf('fn(this.doc)'),
    'op() must commit the canvas BEFORE running the document op');
  const save = source.slice(source.indexOf('private async save('), source.indexOf('private isDirty('));
  assert.ok(save.indexOf('this.commit()') < save.indexOf('writeSprite'),
    'save() must commit the canvas before writing the sprite');
}

// ============================================================
// The animation studio, not just an editor that opens a sprite
// ============================================================

export async function onionSkinShowsThePreviousFrameAndOnlyAsAGhost(): Promise<void> {
  assert.ok(source.includes('private onionSkinCanvas()'), 'onion skin must exist');
  assert.ok(source.includes('this.editor.setUnderlay(this.onionSkinCanvas())'),
    'it must go to the editor as an UNDERLAY - never merged into the canvas, ' +
    'or the previous frame would be saved into this one');
  const fn = source.slice(source.indexOf('private onionSkinCanvas('), source.indexOf('private toggleOnionSkin('));
  assert.ok(fn.includes('anim.loop'),
    'on frame 0 of a looping animation the previous frame is the LAST one - ' +
    'that is the join the loop actually makes');
  const studio: any = new SpriteStudioDoor();
  assert.strictEqual(studio.commands().onionSkin.key, 'C-o', 'and a hotkey to toggle it');
}

export async function playingHappensOnTheCanvasAndStopsOnAnyKey(): Promise<void> {
  const fn = source.slice(source.indexOf('private playInPlace('), source.indexOf('private async newAnimationAsked('));
  assert.ok(fn.includes('this.commit()'),
    'playback must commit first - it swaps the canvas, so an uncommitted stroke would be eaten');
  assert.ok(fn.includes("this.screen.on('keypress', stop)"), 'any key stops it');
  assert.ok(fn.includes('clearInterval'), 'and stopping kills the timer');
  assert.ok(fn.includes('this.loadFrame()'), 'and puts the edited frame back');
  assert.ok(fn.includes('ticksPerFrame') && fn.includes('100'),
    'it must play at the speed the board will - ticksPerFrame at 100ms a game tick');
}

export async function theFrameClipboardCarriesArtworkBetweenFrames(): Promise<void> {
  const copy = source.slice(source.indexOf('private copyFrame('), source.indexOf('private pasteFrame('));
  assert.ok(copy.includes('this.commit()'), 'copy must take what is on the canvas, not the last commit');
  assert.ok(copy.includes('{ ...c }'), 'and copy the cells, not alias them');
  const paste = source.slice(source.indexOf('private pasteFrame('), source.indexOf("/** A one-shot note"));
  assert.ok(paste.includes('this.op('), 'paste goes through op() like every other document change');
}

export async function aSpriteCanBeMadeFromNothing(): Promise<void> {
  const fn = source.slice(source.indexOf('private async newSpriteAsked('), source.indexOf('private async saveAsAsked('));
  assert.ok(fn.includes('/^[a-z0-9-]+$/'), 'the name is validated');
  assert.ok(fn.includes('cellW < 1 || cellH < 1'), 'and the size');
  assert.ok(fn.includes('await this.save()'), 'a new sprite reaches disk immediately, or it is not real');
}

export async function artFilesOpenInTheSameEditor(): Promise<void> {
  assert.ok(source.includes('private async openArtRequester('), 'art must be openable');
  assert.ok(!source.includes('ArtSession'), 'and NOT through a screen of its own');
  assert.ok(source.includes("Buffer.from(text, 'latin1')"),
    'art round-trips as latin1 - utf8 would mangle every high-bit character');
  assert.ok(source.includes('transparentBackground: Boolean(sprite)'),
    "a .ans has no transparency: erasing there is a black space, not a hole");
}

export async function theSizeToggleShowsWhatTheBoardWillShow(): Promise<void> {
  assert.ok(source.includes('private toggleFixedSize('), 'the toggle must exist');
  assert.ok(source.includes("height: this.terminalMode?.mode() === 'fixed' ? 25 : '100%'"),
    'pinned to 80x25, which is what a caller on the board sees');
}

export async function theTitleReportsTheTimingSoSlowerAndFasterAreNotBlind(): Promise<void> {
  const doc = openDoc(makeSprite());
  const title = studioTitle(doc, 'pengo', 'egg.sprite.json');
  assert.ok(title.includes('4tpf'), 'the title says ticks per frame');
  assert.ok(title.includes('loop'), 'and whether it loops');
}

export async function theEditorFollowsTheTerminalWhenItResizes(): Promise<void> {
  // "i switched to responsive now it did not resize to my browser window."
  // The listening lives in the shared switch now (its own suite pins that
  // it hooks and unhooks 'resize'); what stays this door's job is what a
  // relayout MEANS - the ANSIEditor takes its geometry at construction, so
  // following a resize means rebuilding it without losing work.
  const fn = source.slice(source.indexOf('private async relayout('), source.indexOf('// ============================================\n  // REQUESTERS'));
  assert.ok(fn.includes('if (this.playing) return;'),
    'a resize during playback must not fight it for the canvas');
  assert.ok(fn.includes('this.commit()'),
    'a window drag must not eat work in progress');
  assert.ok(fn.includes('await this.openEditor()'), 'and the editor is rebuilt at the new size');
}

export async function theTransparencyGuideIsOffUntilAskedFor(): Promise<void> {
  // "the guide should be togglabe default off" - a hole and an opaque black
  // cell look identical without it, but the marks sit on top of the art.
  assert.ok(source.includes('private guide = false;'), 'the guide starts off');
  assert.ok(source.includes('showTransparencyGuide: this.guide'),
    'and the editor is built with whatever it currently is');
  const guided: any = new SpriteStudioDoor();
  assert.strictEqual(guided.commands().guide.key, 'C-g', 'with a hotkey');
  const studio: any = new SpriteStudioDoor();
  const sprite = studio.buildMenus().find((m: any) => m.label === 'Frame');
  assert.ok(sprite.items.some((i: any) => i.label.startsWith('Transparency Guide')),
    'and a menu entry, since every hotkey has one');
}

export async function responsiveAsksTheTerminalNotJustTheEditor(): Promise<void> {
  // "when i select responsive mode it doesnt resize to the browser size."
  // The browser terminal starts FIXED at 80x25 and only widens when a door
  // asks (BBSTerminal: "DON'T auto-fit on mount"), so sizing the editor to
  // 100% filled a terminal that never grew. The three parts of getting it
  // right live in the SDK now - this door uses them rather than owning them.
  assert.ok(source.includes('createTerminalModeSwitch({'),
    'the door must use the shared switch, not its own copy of the dance');
  const start = source.slice(source.indexOf('async start('), source.indexOf('private createUI('));
  assert.ok(start.includes('createTerminalModeSwitch'),
    'and build it at startup, so the terminal is wide before anything is drawn');
  assert.ok(source.includes('onRelayout: () => this.relayout()'),
    'with the door supplying what re-layout MEANS for it - here, rebuilding ' +
    'a widget that took its geometry at construction');
  const destroy = source.slice(source.indexOf('destroy(): void {'));
  assert.ok(destroy.includes('this.terminalMode?.dispose()'),
    'and disposing it, which restores the board 80 columns and unhooks resize');
}

export async function theWheelStepsTheZoomLadder(): Promise<void> {
  // "can we add support for scrollwheel for zooming?" The editor reports
  // the turn; the door owns the ladder, so the door decides what it means.
  assert.ok(source.includes("this.editor.on('canvas-wheel'"),
    'the studio must listen for the wheel the editor reports');
  assert.ok(source.includes("this.wheelZoom(d.direction === 'up' ? 1 : -1)"),
    'up zooms in, down zooms out, along the same clamped ladder the menu uses ' +
    '- at half speed, see toolbar.test.ts');
  // And the ladder itself already refuses to run off either end.
  assert.strictEqual(stepZoom(1, -1), 1);
  assert.strictEqual(stepZoom(8, 1), 8);
}

