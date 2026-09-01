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
import { SpriteStudioDoor, canvasScale, studioTitle, SIDEBAR_COLS } from '../studio';
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
  assert.ok(/width: '100%', height: '100%'/.test(source),
    'the editor must fill the screen - nothing wraps it');
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
  assert.deepStrictEqual(menus.map((m: any) => m.label), ['Frame', 'Animation'],
    'the door contributes exactly Frame and Animation, into the editor bar');
  assert.ok(source.includes('extraMenus: this.buildMenus()'),
    'they must be handed to the editor as extraMenus, not drawn separately');

  const frame = menus[0].items.filter((i: any) => !i.separator).map((i: any) => i.label);
  for (const needed of ['New Frame', 'Duplicate Frame', 'Delete Frame']) {
    assert.ok(frame.some((l: string) => l.startsWith(needed)), `Frame menu needs ${needed}`);
  }
  const animation = menus[1].items.filter((i: any) => !i.separator).map((i: any) => i.label);
  for (const needed of ['Play', 'Next', 'New...', 'Delete', 'Slower', 'Faster', 'Toggle Loop']) {
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
  const bind = source.slice(source.indexOf('private bindHotkeys'), source.indexOf('destroy(): void {'));
  const keys = [...bind.matchAll(/key\(\['([^']+)'\]/g)].map(m => m[1]);
  assert.ok(keys.length > 0, 'the hotkeys must be readable from bindHotkeys');
  const editorsOwn = new Set(['C-s', 'C-m', 'C-z', 'C-y', 'C-h']);
  for (const k of keys) {
    assert.ok(!(k.length === 1 && k >= ' '),
      `'${k}' is printable - in draw mode it would run the op AND paint the character`);
    assert.ok(!editorsOwn.has(k), `'${k}' collides with the editor's own control key`);
  }
}

export async function theMagnificationLeavesRoomForTheSidebar(): Promise<void> {
  const sprite = makeSprite();
  const scale = canvasScale(sprite, 80, 23);
  assert.ok(scale > 1, 'a 3x2 sprite on an 80-column screen must be magnified');
  assert.ok(scale * sprite.cellW <= 80 - SIDEBAR_COLS,
    `scale ${scale} overflows the columns left by the editor's sidebar`);
}

export async function aWideSpriteGetsASmallerScaleNotAClippedOne(): Promise<void> {
  const wide = { ...makeSprite(), cellW: 70 } as Sprite;
  assert.strictEqual(canvasScale(wide, 80, 23), 1,
    'a 70-wide sprite in 74 drawable columns can only be drawn 1:1');
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
