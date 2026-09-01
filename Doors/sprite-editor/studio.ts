/**
 * Sprite Studio: the ANSI editor door, forked and taught about sprites.
 *
 * This is a fork of `Doors/ansi-editor/index.ts`, which is what the design
 * doc asked for from the start ("the studio door is a fork of its door
 * wrapper reusing this engine wholesale") and what the sysop repeated after
 * seeing what was built instead: "everything should live inside the forked
 * ansi-edit; we transform it to a full sprite animation studio."
 *
 * So there is ONE application here, shaped like Deluxe Paint: a full-screen
 * editor with its own menu bar, its own colour/tool sidebar, its own status
 * line - and everything else is a REQUESTER that appears, does its job and
 * goes away. No browser screen, no docked panes, no second menu bar.
 *
 * What makes it a sprite studio rather than an ANSI editor:
 *   - the canvas IS the current frame (frameToCanvas/canvasToFrame),
 *   - Frame and Animation live in the editor's own menu bar (extraMenus),
 *   - File > Open picks a door, then a sprite, then closes,
 *   - the animation plays in a requester on C-p, never behind your hand.
 *
 * The document model (edit-doc), the asset I/O (assets), the animation
 * renderer (preview) and the requesters (dialogs) are unchanged modules -
 * they were always independent of the screen that used to wrap them.
 */

import type { DoorContext } from '@amiexpress/bbs-door-sdk';
import {
  Screen, ANSIEditor, List, Box,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { HostToolbarGroup } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { menuItemLabel } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createScreen, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import {
  createTerminalModeSwitch, type TerminalModeSwitch,
} from '@amiexpress/bbs-door-sdk/utils/terminal-mode';
import {
  Sprite, CellBuffer, frameToCanvas, canvasToFrame,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import {
  EditDoc, openDoc, currentFrame, selectAnimation, selectFrame, addFrame,
  deleteFrame, moveFrame, setFrame, setTicksPerFrame, toggleLoop, addAnimation,
  deleteAnimation, toSprite, resizeSprite,
} from './edit-doc';
import {
  listDoorsWithSprites, listSprites, readSprite, writeSprite,
  listArt, readArt, writeArt,
} from './assets';
import { previewLines } from './preview';
import { promptText, confirm } from './dialogs';
import { T, applyTheme } from './door-theme';

/**
 * One thing the door can do, in the one place that says so.
 *
 * `key` is the blessed name the screen binds; `show` is what the menu
 * prints when that name reads badly ('C-up' as 'C-Up'). No key at all is a
 * deliberate answer for the items that open a dialog: the editor and the
 * browser between them have taken most of the alphabet, and a menu item
 * promising a key that something else already owns is worse than one with
 * no key.
 */
export interface StudioCommand {
  label: string;
  key?: string;
  show?: string;
  run: () => void;
}

/** The editor's own sidebar width, subtracted before working out the zoom. */
export const SIDEBAR_COLS = 6;

/**
 * Magnification, in characters per sprite cell.
 *
 * ONE by default, on the sysop's instruction after seeing an auto-fitted
 * sprite fill the screen: "its super magnified make it 1:1 as default".
 * The art is what it is - a sprite drawn at the size the game draws it is
 * the honest view, and zooming is something you ask for, from the Zoom
 * menu, not something the door decides for you.
 */
export const DEFAULT_ZOOM = 1;

/**
 * Characters per cell ACROSS, at every zoom level.
 *
 * ONE, because that is what the GAME draws. cell-art's rowToTags emits one
 * character per cell, so a sprite cell on the board is a single character -
 * a tall rectangle, since a terminal character is about twice as tall as it
 * is wide. The editor must show the same thing.
 *
 * This was 2 for one commit, to make a pixel look square after "the blocks
 * are very tall something seems wrong". Putting SPRITED and Pengo side by
 * side killed it: the egg was twice as wide in the editor as in the game.
 * The tallness is real and the game has it too; an editor that corrects it
 * is lying about what you are drawing.
 */
export const CELL_ASPECT = 1;

/**
 * What the Zoom menu offers, in characters per cell.
 *
 * EVEN above 1, on the sysop's instruction: "if scaling is an issue use even
 * scaling so we always get correct aspect". A sprite cell holds TWO pixels
 * vertically when it is half-block art, so an odd scale cannot split it
 * evenly - at 3:1 the top pixel gets two rows and the bottom one, and the
 * art is distorted in a way that is hard to see and easy to draw against.
 * Even scales give each half exactly the same height.
 *
 * 1 stays, and is not a distortion: at actual size the cell is a single
 * character and the terminal's own font draws the two halves of '▀' evenly.
 */
export const ZOOM_STEPS = [1, 2, 4, 6, 8];

/** The two scales the editor is built with at a given zoom level. */
export function zoomScales(zoom: number): { x: number; y: number } {
  return { x: zoom * CELL_ASPECT, y: zoom };
}

/**
 * Wheel notches per zoom step.
 *
 * "the scrollwheel zooms to fast halve the speed" - one ladder step per
 * wheel EVENT is not one step per gesture: a trackpad reports a handful of
 * events for a single flick, so the zoom ran away up the ladder. Two
 * events per step, and each step rebuilds the editor, so this is cheaper
 * as well as calmer.
 */
export const WHEEL_NOTCHES_PER_STEP = 2;

/** The next step up or down, clamped - never off the end of the list. */
export function stepZoom(current: number, delta: 1 | -1): number {
  const i = ZOOM_STEPS.indexOf(current);
  const from = i === -1 ? 0 : i;
  return ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, from + delta))];
}

/**
 * The room the artwork has, in characters: the editor minus its chrome.
 *
 * Menu bar, F-key toolbar and status bar take a row each; the colour and
 * tool sidebar takes SIDEBAR_COLS.
 */
export function canvasRoom(width: number, height: number): { w: number; h: number } {
  return { w: Math.max(1, width - SIDEBAR_COLS), h: Math.max(1, height - 3) };
}

/**
 * The biggest zoom on the ladder at which a sprite still FITS.
 *
 * A canvas larger than the room it is drawn in cannot be centred and
 * cannot be scrolled - it just runs off the right edge, which is what a
 * sprite loaded at the previous sprite's magnification looked like
 * ("it doesnt resize the canvas to the new anim loaded"). 1:1 is always
 * allowed: if the art does not fit even at actual size, clipping it is
 * still better than refusing to open it.
 */
export function zoomThatFits(
  cellW: number, cellH: number, room: { w: number; h: number },
): number {
  let best = ZOOM_STEPS[0];
  for (const z of ZOOM_STEPS) {
    if (cellW * z * CELL_ASPECT <= room.w && cellH * z <= room.h) best = z;
  }
  return best;
}

/** The title line: what is open, which animation, which frame. */
export function studioTitle(doc: EditDoc | null, door: string, file: string): string {
  if (!doc) return 'Sprite Studio';
  const anim = doc.sprite.animations[doc.animation];
  const dirty = doc.dirty ? '*' : '';
  return `${dirty}${door}/${file}  ${doc.animation}  ` +
    `frame ${doc.frame + 1}/${anim.frames.length}  ` +
    `${anim.ticksPerFrame}tpf ${anim.loop ? 'loop' : 'hold'}`;
}

export class SpriteStudioDoor {
  private ctx!: DoorContext;
  private screen!: Screen;
  private inputManager!: DoorInputManager;
  private editor: any = null;

  private doc: EditDoc | null = null;
  private zoom = DEFAULT_ZOOM;
  /** Onion skin: the previous frame, ghosted under the empty cells. */
  private onionSkin = false;
  /** The dim dot on a transparent cell. Off by default - it annotates art. */
  private guide = false;
  /** Wheel notches counted so far, and which way they were going. */
  private wheelNotches = 0;
  private wheelDirection: 1 | -1 = 1;
  /** One frame on the clipboard, for copying artwork between frames. */
  private frameClipboard: CellBuffer | null = null;
  /**
   * 80x25 like the board, or the caller's real terminal.
   *
   * The three parts of getting this right - ask the terminal to widen,
   * follow the resize, put the 80 columns back on exit - live in the SDK
   * now, because every door with a layout wants them and this one had to
   * learn each part the hard way.
   */
  private terminalMode: TerminalModeSwitch | null = null;
  /** Set when a .ans is open instead of a sprite - Save writes art then. */
  private artText: string | null = null;
  private playing = false;
  private playTimer: ReturnType<typeof setInterval> | null = null;
  /** How to stop playback from somewhere other than a keypress. */
  private stopPlay: (() => void) | null = null;
  private door = '';
  private file = '';
  private exitResolve: (() => void) | null = null;
  private keyHandlers: Array<[string[], (...args: any[]) => void]> = [];

  setContext(ctx: DoorContext): void {
    this.ctx = ctx;
  }

  async start(): Promise<void> {
    this.createUI();
    this.terminalMode = createTerminalModeSwitch({
      bbs: (this.ctx as any).bbs,
      screen: this.screen,
      // FIXED: "sprited alt+enter does nothing it opens in fullscreen in bbs
      // mode" (2026-09-02). Opening wide hid the toggle - the first press
      // took the room AWAY, which reads as nothing happening - and a door
      // should look like the board it opened from until asked otherwise.
      start: 'fixed',
      onRelayout: () => this.relayout(),
    });
    this.inputManager.enable();
    this.bindHotkeys();

    // Nothing is open yet, so the first thing a sysop sees is the requester
    // that opens something - the editor behind it would have no document.
    await this.openSpriteRequester();

    await new Promise<void>((resolve) => {
      this.exitResolve = resolve;
      this.screen.once('destroy', resolve);
    });
  }

  private createUI(): void {
    applyTheme((this.ctx as any).bbs);

    this.screen = createScreen((this.ctx as any).bbs, {
      dockBorders: false,
      title: 'Sprite Studio',
      responsive: true,
    });
    this.screen.program.write('\x1b[2J');
    this.screen.program.write('\x1b[H');
    this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
    this.screen.alloc();

    // enableGrabKeys MUST be false for blessed widgets - the fork base's
    // comment, and it is still true here.
    this.inputManager = new DoorInputManager(this.ctx as any, this.screen, {
      enableGameMode: false,
      enableGrabKeys: false,
      enableMouse: true,
      debug: false,
      debugName: 'SPRITED',
    });

    this.screen.render();
  }

  /**
   * Rebuild the editor at the screen's current size.
   *
   * The widget takes its geometry at construction, so a resize means
   * building it again - the same move setZoom makes. The canvas is
   * committed first and the frame put back afterwards, so nothing in
   * progress is lost to a window drag. Skipped while playing, which owns
   * the canvas until a key stops it.
   */
  private async relayout(): Promise<void> {
    if (this.playing) return;
    if (!this.doc && this.artText === null) return;
    if (this.doc) this.commit();
    await this.openEditor();
  }

  // ============================================
  // REQUESTERS
  // ============================================

  /**
   * Pick one of a list. The requester owns the screen while it is up and
   * takes itself down again - the black-screen rule the fork base learned
   * the hard way: whoever hides something owns showing it again.
   */
  /**
   * Give a requester the keyboard and keep it.
   *
   * Every dialog in this door goes through here. Focus alone loses to the
   * click that opened it; the trap survives that, and the SDK releases it
   * for us if the element is destroyed while it still holds one.
   */
  private trap(dialog: any): void {
    dialog.focus();
    (this.screen as any).trapFocus?.(dialog);
  }

  private pick(title: string, items: string[]): Promise<number | null> {
    return new Promise((resolve) => {
      if (items.length === 0) { resolve(null); return; }

      const list = new List({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width: 44,
        height: Math.min(items.length + 2, 18),
        fixed: true,
        border: { type: 'line' },
        label: ` ${title} `,
        items,
        keys: true,
        mouse: true,
        tags: true,
        style: {
          fg: T.ink, bg: T.bar,
          border: { fg: T.accent },
          selected: { bg: T.accent, fg: T.bar },
        },
      } as any);

      const done = (value: number | null) => {
        (this.screen as any).dialogOpen = false;
        (this.screen as any).releaseFocusTrap?.(list);
        list.destroy();
        this.editor?.focus();
        this.screen.render();
        resolve(value);
      };

      (this.screen as any).dialogOpen = true;
      list.on('select', (_item: any, index: number) => done(index));
      list.key(['escape', 'q'], () => done(null));
      this.trap(list);
      this.screen.render();
    });
  }

  /** File > Open: a door, then one of its sprites. Then it is gone. */
  private async openSpriteRequester(): Promise<void> {
    const doors = listDoorsWithSprites();
    if (doors.length === 0) {
      await this.message('No sprites', 'No door on this board has a sprites/ directory.');
      return;
    }

    const d = await this.pick('Open - which door', doors);
    if (d === null) return;

    const sprites = listSprites(doors[d]);
    if (sprites.length === 0) {
      await this.message('No sprites', `${doors[d]} has no sprite files.`);
      return;
    }

    const s = await this.pick(`Open - ${doors[d]}`, sprites.map(f => f.replace(/\.sprite\.json$/, '')));
    if (s === null) return;

    this.door = doors[d];
    this.file = sprites[s];
    this.artText = null;
    this.doc = openDoc(readSprite(this.door, this.file));
    this.resetZoomForDocument();
    await this.openEditor();
  }

  /**
   * Open a .ans file in the same editor.
   *
   * Art mode was a separate screen in the old studio and went out with it.
   * It does not need a screen: a .ans is just another thing this editor
   * opens - the difference is only what Save writes, so the door remembers
   * which kind of document is loaded and nothing else changes.
   *
   * Read and written as latin1, never utf8: the widget moves cell chars 1:1
   * through the string with no re-encoding, so the round trip has to be
   * byte-preserving or every high-bit character is mangled.
   */
  private async openArtRequester(): Promise<void> {
    const doors = listDoorsWithSprites();
    const d = await this.pick('Open art - which door', doors);
    if (d === null) return;

    const files = listArt(doors[d]);
    if (files.length === 0) {
      await this.message('No art', `${doors[d]} has no art files.`);
      return;
    }
    const f = await this.pick(`Open art - ${doors[d]}`, files);
    if (f === null) return;

    this.door = doors[d];
    this.file = files[f];
    this.doc = null;
    this.artText = readArt(this.door, this.file).toString('latin1');
    this.resetZoomForDocument();
    await this.openEditor();
  }

  /**
   * The animation, played on demand.
   *
   * Deliberately a requester and not a pane: the sysop's instruction was
   * "it cant play when i draw i need a panel and hotkeys so i can play it
   * when i need". So nothing animates behind the drawing hand - this opens
   * on C-p, plays, and any key takes it away.
   */
  private previewRequester(): void {
    if (!this.doc) return;
    const doc = this.doc;
    const anim = doc.sprite.animations[doc.animation];

    const box = new Box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: Math.max(24, doc.sprite.cellW * 2 + 6),
      height: doc.sprite.cellH * 2 + 4,
      fixed: true,
      border: { type: 'line' },
      label: ` ${doc.animation} - ${anim.frames.length}f ${anim.ticksPerFrame}tpf ${anim.loop ? 'loop' : 'hold'} `,
      tags: true,
      keys: true,
      focusable: true,
      style: { fg: T.ink, bg: T.bar, border: { fg: T.accent } },
    } as any);

    let tick = 0;
    const timer = setInterval(() => {
      box.setContent(previewLines(doc.sprite, doc.animation, tick++, 2).join('\n'));
      this.screen.render();
    }, 100);

    const close = () => {
      clearInterval(timer);
      (this.screen as any).dialogOpen = false;
      box.destroy();
      this.editor?.focus();
      this.screen.render();
    };

    (this.screen as any).dialogOpen = true;
    box.key(['escape', 'enter', 'space', 'q'], close);
    box.on('click', close);
    box.focus();
    this.screen.render();
  }

  private message(title: string, text: string): Promise<void> {
    return new Promise((resolve) => {
      const box = new Box({
        parent: this.screen,
        top: 'center', left: 'center', width: 60, height: 7,
        fixed: true,
        border: { type: 'line' },
        label: ` ${title} `,
        content: text,
        tags: true, keys: true, focusable: true,
        padding: { left: 2, right: 2, top: 1, bottom: 1 },
        style: { fg: T.ink, bg: T.bar, border: { fg: T.alert } },
      } as any);
      const close = () => {
        (this.screen as any).dialogOpen = false;
        (this.screen as any).releaseFocusTrap?.(box);
        box.destroy();
        this.editor?.focus();
        this.screen.render();
        resolve();
      };
      (this.screen as any).dialogOpen = true;
      box.key(['escape', 'enter', 'space', 'q'], close);
      // Focusing is not enough when the dialog was opened by a CLICK: the
      // same mouse dispatch carries on to the elements underneath, and the
      // editor's canvas takes focus straight back - so Escape went to the
      // canvas and the dialog could not be dismissed at all (reported live
      // 2026-09-01 from the strip's play button). A trap reasserts itself
      // whenever focus is outside it.
      this.trap(box);
      this.screen.render();
    });
  }

  // ============================================
  // THE EDITOR - the whole application
  // ============================================

  private async openEditor(): Promise<void> {
    // "i cant load a new anim when an anim plays even if i havent edited
    // it" - the play timer holds `this.editor` and a frame list from the
    // OLD document, so a new editor built under it was painted over a
    // frame at a time. File > Open is a mouse path and a keypress was the
    // only thing that stopped playback.
    this.stopPlayback();
    if (!this.doc && this.artText === null) return;

    if (this.editor) {
      this.editor.destroy();
      this.editor = null;
    }

    // Art is a full-screen 80x25 ANSI document; a sprite is its own small
    // canvas. Everything else about the editor is identical, which is the
    // point of art not needing a screen of its own.
    const sprite = this.doc?.sprite;

    this.editor = new ANSIEditor({
      parent: this.screen,
      top: 0, left: 0,
      width: this.terminalMode?.mode() === 'fixed' ? 80 : '100%',
      height: this.terminalMode?.mode() === 'fixed' ? 25 : '100%',
      title: this.doc
        ? studioTitle(this.doc, this.door, this.file)
        : `${this.door}/${this.file}  (art)`,
      initialMode: 'draw',
      canvasWidth: sprite ? sprite.cellW : 80,
      canvasHeight: sprite ? sprite.cellH : 25,
      initialContent: this.artText ?? undefined,
      cellScaleX: sprite ? zoomScales(this.zoom).x : 1,
      cellScaleY: sprite ? zoomScales(this.zoom).y : 1,
      // An erased sprite cell is a HOLE - compositing skips it and the
      // game's background shows through. Without this every sprite saved
      // here would carry a black box around its artwork.
      // A sprite's erased cell is a HOLE; a .ans has no such concept and
      // erasing there means a black space, as every other ANSI editor does.
      transparentBackground: Boolean(sprite),
      showTransparencyGuide: this.guide,
      showLineNumbers: false,
      showMenuBar: true,
      showToolbar: true,
      showSidebar: true,
      showStatusBar: true,
      extraMenus: this.buildMenus(),
      extraToolbar: this.doc ? this.buildToolbar() : undefined,
      onSave: async () => { await this.save(); return true; },
      onOpen: async () => { await this.openSpriteRequester(); },
      // File > New and File > Save As used to call callbacks this door
      // never supplied, so they did nothing at all; and the widget's own
      // "new document" would have blanked the canvas while leaving this
      // door's sprite open behind it.
      onNew: () => { void this.newSpriteAsked(); },
      onSaveAs: async () => { await this.saveAsAsked(); },
      onResize: () => { void this.resizeSpriteAsked(); },
      onExit: () => { void this.close(); },
    } as any);

    // The wheel over the canvas steps the zoom ladder. The editor reports
    // the turn; this decides what it means, because this is the only place
    // that knows there IS a ladder. Sprites only - a .ans has no cells to
    // magnify and is always drawn 1:1.
    this.editor.on('canvas-wheel', (d: any) => {
      if (!this.doc) return;
      this.wheelZoom(d.direction === 'up' ? 1 : -1);
    });

    if (this.doc) this.loadFrame();
    this.editor.focus();
    this.screen.render();
  }

  /**
   * Everything this door can do, with the key that does it.
   *
   * ONE table, because a command has three faces - a menu item, a hotkey and
   * sometimes a button in the footer - and three lists is how a menu comes
   * to promise a key that is bound to something else. The menus, the key
   * bindings and the footer strip are all built from this.
   *
   * The keys are Ctrl combinations, and which ones are free is not a matter
   * of taste. The EDITOR owns Ctrl+S/M/Z/Y/H/D, Alt+C/B/H, F1-F12, Tab,
   * Escape and every printable character (in draw mode a letter paints a
   * letter), and the BROWSER keeps Ctrl+N, Ctrl+T and Ctrl+W whatever the
   * page says. What is left is the alphabet minus all of that - which is
   * why some of these are positional rather than mnemonic, and why the
   * dialog-opening items further down have no key at all rather than a
   * clashing one. tests/hotkeys.test.ts holds the reserved list.
   */
  private commands(): Record<string, StudioCommand> {
    const frames = (): number => {
      if (!this.doc) return 0;
      return this.doc.sprite.animations[this.doc.animation].frames.length;
    };
    return {
      nextFrame:   { label: 'Next Frame', key: 'C-f', run: () => this.step(+1) },
      prevFrame:   { label: 'Previous Frame', key: 'C-b', run: () => this.step(-1) },
      firstFrame:  { label: 'First Frame', key: 'C-a', run: () => this.op(d => selectFrame(d, 0)) },
      lastFrame:   { label: 'Last Frame', key: 'C-l', run: () => this.op(d => selectFrame(d, frames() - 1)) },
      newFrame:    { label: 'New Frame', key: 'C-k', run: () => this.op(d => addFrame(d, 'blank')) },
      dupFrame:    { label: 'Duplicate Frame', key: 'C-r', run: () => this.op(d => addFrame(d, 'duplicate')) },
      delFrame:    { label: 'Delete Frame', key: 'C-x', run: () => void this.deleteFrameAsked() },
      moveEarlier: { label: 'Move Earlier', key: 'C-up', show: 'C-Up', run: () => this.op(d => moveFrame(d, -1)) },
      moveLater:   { label: 'Move Later', key: 'C-down', show: 'C-Dn', run: () => this.op(d => moveFrame(d, 1)) },
      copyFrame:   { label: 'Copy Frame', key: 'C-c', run: () => this.copyFrame() },
      pasteFrame:  { label: 'Paste Frame', key: 'C-v', run: () => this.pasteFrame() },
      onionSkin:   { label: 'Onion Skin', key: 'C-o', run: () => this.toggleOnionSkin() },
      guide:       { label: 'Transparency Guide', key: 'C-g', run: () => this.toggleGuide() },

      play:        { label: 'Play / Stop', key: 'C-p', run: () => this.togglePlay() },
      playBox:     { label: 'Play in a box', run: () => this.previewRequester() },
      nextAnim:    { label: 'Next Animation', key: 'C-e', run: () => this.cycleAnimation() },
      slower:      { label: 'Slower', key: 'C-left', show: 'C-Lt', run: () => this.op(d => setTicksPerFrame(d, -1)) },
      faster:      { label: 'Faster', key: 'C-right', show: 'C-Rt', run: () => this.op(d => setTicksPerFrame(d, +1)) },
      toggleLoop:  { label: 'Loop / Hold', key: 'C-u', run: () => this.op(d => toggleLoop(d)) },
      newAnim:     { label: 'New Animation...', run: () => void this.newAnimationAsked() },
      renameAnim:  { label: 'Rename Animation...', run: () => void this.renameAnimationAsked() },
      deleteAnim:  { label: 'Delete Animation', run: () => void this.deleteAnimationAsked() },

      zoomCycle:   { label: 'Zoom In (wraps)', key: 'C-q', run: () => this.cycleZoom() },
      size:        {
        label: '80x25 / Responsive', key: 'M-enter', show: 'A-Ent',
        run: () => this.toggleFixedSize(),
      },

      newSprite:   { label: 'New Sprite...', run: () => void this.newSpriteAsked() },
      saveAs:      { label: 'Save As...', run: () => void this.saveAsAsked() },
      resize:      { label: 'Sprite Size...', run: () => void this.resizeSpriteAsked() },
      openArt:     { label: 'Open Art (.ans)...', run: () => void this.openArtRequester() },
    };
  }

  /** How a menu prints one of them: the label, then the key, right-aligned. */
  private menuItem(id: string): { label: string; action: () => void } {
    const cmd = this.commands()[id];
    return {
      label: menuItemLabel(cmd.label, cmd.show ?? cmd.key),
      action: () => cmd.run(),
    };
  }

  /**
   * The footer strip: what a hand reaches for while animating.
   *
   * The same commands as the menus, one click away instead of a dropdown.
   * Sprites only - a .ans has no frames, no animation and no cells to
   * magnify, and a strip of controls that do nothing is worse than none.
   */
  private buildToolbar(): HostToolbarGroup[] {
    const cmd = this.commands();
    const frames = (): number => {
      if (!this.doc) return 0;
      return this.doc.sprite.animations[this.doc.animation].frames.length;
    };
    return [
      [
        { label: '|<', action: cmd.firstFrame.run },
        { label: '<<', action: cmd.prevFrame.run },
        { label: () => (this.playing ? '[]' : '|>'), action: cmd.play.run },
        { label: '>>', action: cmd.nextFrame.run },
        { label: '>|', action: cmd.lastFrame.run },
      ],
      [
        { label: () => `${(this.doc?.frame ?? 0) + 1}/${frames()}` },
        { label: '[+]', action: cmd.dupFrame.run },
        { label: '[-]', action: cmd.delFrame.run },
      ],
      [
        { label: () => `ONION ${this.onionSkin ? 'on' : 'off'}`, action: cmd.onionSkin.run },
      ],
      [
        { label: () => `${this.zoom}x`, action: cmd.zoomCycle.run },
      ],
    ];
  }

  /**
   * The wheel, at half speed.
   *
   * The accumulator lives on the door rather than the editor because
   * changing zoom REBUILDS the editor - a counter kept in the widget would
   * be thrown away by the very step it just counted.
   */
  private wheelZoom(direction: 1 | -1): void {
    if (direction !== this.wheelDirection) {
      this.wheelDirection = direction;
      this.wheelNotches = 0;
    }
    if (++this.wheelNotches < WHEEL_NOTCHES_PER_STEP) return;
    this.wheelNotches = 0;
    void this.setZoom(stepZoom(this.zoom, direction));
  }

  /** One step up the zoom ladder, back to 1:1 from the top. */
  private cycleZoom(): void {
    const top = ZOOM_STEPS[ZOOM_STEPS.length - 1];
    void this.setZoom(this.zoom === top ? ZOOM_STEPS[0] : stepZoom(this.zoom, 1));
  }

  /** Frame and Animation, in the editor's OWN menu bar. */
  private buildMenus(): Array<{ label: string; items: Array<{ label: string; action?: () => void; separator?: boolean }> }> {
    const line = { label: '────────────────', separator: true };
    return [
      {
        label: 'Frame',
        items: [
          this.menuItem('nextFrame'),
          this.menuItem('prevFrame'),
          this.menuItem('firstFrame'),
          this.menuItem('lastFrame'),
          line,
          this.menuItem('newFrame'),
          this.menuItem('dupFrame'),
          this.menuItem('delFrame'),
          line,
          this.menuItem('moveEarlier'),
          this.menuItem('moveLater'),
          line,
          this.menuItem('copyFrame'),
          this.menuItem('pasteFrame'),
          line,
          this.menuItem('onionSkin'),
          this.menuItem('guide'),
        ],
      },
      {
        label: 'Sprite',
        items: [
          this.menuItem('newSprite'),
          this.menuItem('saveAs'),
          this.menuItem('resize'),
          line,
          this.menuItem('openArt'),
          line,
          this.menuItem('size'),
        ],
      },
      {
        label: 'Zoom',
        items: [
          this.menuItem('zoomCycle'),
          line,
          ...ZOOM_STEPS.map(z => ({
            label: z === 1 ? '1:1  (actual size)' : `${z}:1`,
            action: () => void this.setZoom(z),
          })),
        ],
      },
      {
        label: 'Animation',
        items: [
          this.menuItem('play'),
          this.menuItem('playBox'),
          this.menuItem('nextAnim'),
          line,
          this.menuItem('newAnim'),
          this.menuItem('renameAnim'),
          this.menuItem('deleteAnim'),
          line,
          this.menuItem('slower'),
          this.menuItem('faster'),
          this.menuItem('toggleLoop'),
        ],
      },
    ];
  }

  // ============================================
  // THE CANVAS IS THE CURRENT FRAME
  // ============================================

  /**
   * The widget's canvas holds the current frame while the editor is open,
   * so it has to come back into the document before anything changes WHICH
   * frame is current, and before every save. Paint, next frame, lose the
   * strokes is the defect this prevents.
   */
  private commit(): void {
    // Playback owns the canvas while it runs, so reading the canvas back
    // into the document has to stop it first - otherwise a save mid-play
    // writes whichever frame happened to be on screen into the one being
    // edited. Stopping restores the edited frame, which is what gets read.
    this.stopPlayback();
    if (!this.doc || !this.editor) return;
    const canvas = this.editor.getCoreCanvas();
    if (!canvas) return;
    this.doc = setFrame(this.doc, canvasToFrame(canvas));
  }

  private loadFrame(): void {
    if (!this.doc || !this.editor) return;
    this.editor.setCoreCanvas(frameToCanvas(currentFrame(this.doc)));
    this.editor.setUnderlay(this.onionSkinCanvas());
    // setCoreCanvas marks the widget modified; loading a frame is not user
    // work, and left set a freshly opened sprite reads as dirty.
    this.editor.modified = false;
    this.editor.setLabel?.(` ${studioTitle(this.doc, this.door, this.file)} `);
    // The strip's frame readout is only true until the frame changes.
    this.editor.refreshExtraToolbar?.();
    this.screen.render();
  }

  /**
   * The frame BEFORE this one, as a ghost - or nothing.
   *
   * The previous frame is what you are animating away from, so it is the
   * one worth seeing through the holes. On the first frame of a looping
   * animation that is the LAST frame, because that is the join the loop
   * actually makes.
   */
  private onionSkinCanvas(): any {
    if (!this.onionSkin || !this.doc) return null;
    const anim = this.doc.sprite.animations[this.doc.animation];
    if (anim.frames.length < 2) return null;
    const prev = this.doc.frame === 0
      ? (anim.loop ? anim.frames.length - 1 : -1)
      : this.doc.frame - 1;
    if (prev < 0) return null;
    return frameToCanvas(anim.frames[prev]);
  }

  /**
   * Show or hide the marks on transparent cells.
   *
   * Off by default, on the sysop's call: a hole and an opaque black cell
   * look identical without it, but the marks sit on top of the art and the
   * art is what you are judging. Turn it on when a hole is in question.
   */
  private toggleGuide(): void {
    this.guide = !this.guide;
    this.editor?.setTransparencyGuide(this.guide);
    this.flash(this.guide ? 'Transparency guide on' : 'Transparency guide off');
  }

  private toggleOnionSkin(): void {
    this.onionSkin = !this.onionSkin;
    this.editor?.setUnderlay(this.onionSkinCanvas());
    this.editor?.refreshExtraToolbar?.();
    this.screen.render();
  }

  /** Commit, run a document op, put the new frame on the canvas. */
  private op(fn: (doc: EditDoc) => EditDoc): void {
    if (!this.doc) return;
    this.commit();
    try {
      const next = fn(this.doc);
      if (next !== this.doc) {
        this.doc = next;
        this.loadFrame();
      }
    } catch (error) {
      void this.message('Refused', String((error as Error).message));
    }
  }

  /**
   * Redraw at a new magnification.
   *
   * The widget takes its scale at construction, so this commits what is on
   * the canvas, rebuilds the editor and puts the same frame back - the
   * document never notices.
   */
  /**
   * 80x25 like the board, or the caller's real terminal.
   *
   * A sprite drawn in a 200-column window can look right there and wrong on
   * the 80x25 the BBS actually serves, so the studio has to be able to show
   * both. The screen is created responsive; this pins the editor to 80x25
   * inside it, which is what a caller on a real board will see.
   */
  private toggleFixedSize(): void {
    this.terminalMode?.toggle();
    this.flash(this.terminalMode?.mode() === 'fixed'
      ? '80x25 (as the board serves it)'
      : 'Responsive (your terminal)');
  }

  /**
   * The room this door's editor has for artwork, right now.
   *
   * 80x25 when pinned to what the board serves, the caller's real terminal
   * otherwise - the same two sizes openEditor builds the editor at.
   */
  private room(): { w: number; h: number } {
    const fixed = this.terminalMode?.mode() === 'fixed';
    return canvasRoom(
      fixed ? 80 : (this.screen?.width ?? 80),
      fixed ? 25 : (this.screen?.height ?? 25),
    );
  }

  /**
   * A newly opened document opens at actual size, like the first one did.
   *
   * Zoom is something you ask for, and you asked for it about the sprite
   * you were looking at - carrying it to the next one drew a 20-cell log at
   * the 8x you had chosen for a 5-cell egg, which runs off the screen.
   */
  private resetZoomForDocument(): void {
    this.zoom = this.doc
      ? Math.min(DEFAULT_ZOOM, zoomThatFits(this.doc.sprite.cellW, this.doc.sprite.cellH, this.room()))
      : DEFAULT_ZOOM;
    this.wheelNotches = 0;
  }

  private async setZoom(zoom: number): Promise<void> {
    // Never past what fits: the canvas cannot scroll, so a step too far
    // just pushes the artwork off the right-hand side.
    const capped = this.doc
      ? Math.min(zoom, zoomThatFits(this.doc.sprite.cellW, this.doc.sprite.cellH, this.room()))
      : zoom;
    if (capped === this.zoom) return;
    this.commit();
    this.zoom = capped;
    await this.openEditor();
  }

  private step(delta: number): void {
    this.op(d => selectFrame(d, d.frame + delta));
  }

  private cycleAnimation(): void {
    this.op(d => {
      const names = Object.keys(d.sprite.animations).sort();
      const next = names[(names.indexOf(d.animation) + 1) % names.length];
      return selectAnimation(d, next);
    });
  }

  // ============================================
  // FRAME CLIPBOARD
  // ============================================

  /**
   * Copy and paste whole frames.
   *
   * Duplicate makes the NEXT frame a copy; this carries artwork to a frame
   * that already exists, anywhere in any animation of the sprite - which is
   * how a walk cycle borrows from an idle pose. Refused across sprites of a
   * different cell size, because setFrame would reject it anyway and a
   * refusal that explains itself beats one that throws.
   */
  private copyFrame(): void {
    if (!this.doc) return;
    this.commit();
    this.frameClipboard = currentFrame(this.doc).map(row => row.map(c => (c ? { ...c } : null)));
    this.flash('Frame copied');
  }

  private pasteFrame(): void {
    if (!this.doc || !this.frameClipboard) {
      void this.message('Paste', 'No frame has been copied yet.');
      return;
    }
    const clip = this.frameClipboard;
    this.op(d => setFrame(d, clip.map(row => row.map(c => (c ? { ...c } : null)))));
  }

  /** A one-shot note in the title bar - no dialog for something this small. */
  private flash(text: string): void {
    if (!this.editor) return;
    this.editor.setLabel?.(` ${text} `);
    this.screen.render();
    setTimeout(() => {
      if (this.doc) this.editor?.setLabel?.(` ${studioTitle(this.doc, this.door, this.file)} `);
      this.screen.render();
    }, 1200);
  }

  // ============================================
  // PLAY IN PLACE
  // ============================================

  /**
   * Play the animation ON the canvas, not in a box over it.
   *
   * "it cant play when i draw i need a panel and hotkeys so i can play it
   * when i need" - so it never runs by itself, and any key stops it. The
   * canvas is restored to the frame being edited afterwards, and the work
   * is committed first so playback cannot eat an uncommitted stroke.
   */
  /** The strip's one play button, which has to be able to stop it too. */
  private togglePlay(): void {
    if (this.playing) this.stopPlayback();
    else this.playInPlace();
  }

  /**
   * Stop playback from anywhere, not only from a keypress.
   *
   * Everything that replaces what the canvas shows - a document op, a
   * rebuilt editor, a commit - goes through here first. Harmless when
   * nothing is playing.
   */
  private stopPlayback(): void {
    this.stopPlay?.();
  }

  private playInPlace(): void {
    if (!this.doc || !this.editor || this.playing) return;
    this.commit();
    const doc = this.doc;
    const anim = doc.sprite.animations[doc.animation];
    if (anim.frames.length < 2) {
      // Not an error and not worth a modal - nothing has gone wrong, there
      // is simply nothing to play. A modal here was also the one the sysop
      // could not dismiss, because it opened from a click.
      this.flash('Only one frame in this animation');
      return;
    }

    this.playing = true;
    this.editor.refreshExtraToolbar?.();
    // "when anims play the cursor/caret must be hidden" - it sat on the art
    // through every frame otherwise.
    this.editor.setCursorVisible?.(false);
    this.editor.setUnderlay(null);
    let i = 0;
    const showFrame = () => {
      this.editor.setCoreCanvas(frameToCanvas(anim.frames[i % anim.frames.length]));
      this.editor.modified = false;
      this.editor.setLabel?.(` PLAYING - any key stops - frame ${(i % anim.frames.length) + 1}/${anim.frames.length} `);
      this.screen.render();
      i++;
    };
    showFrame();
    // ticksPerFrame is in GAME ticks; the game runs at 100ms a tick, so the
    // studio plays at the speed the board will.
    this.playTimer = setInterval(showFrame, Math.max(1, anim.ticksPerFrame) * 100);

    const stop = () => {
      if (!this.playing) return;
      this.playing = false;
      this.stopPlay = null;
      if (this.playTimer) { clearInterval(this.playTimer); this.playTimer = null; }
      this.screen.removeListener('keypress', stop);
      this.editor?.setCursorVisible?.(true);
      this.loadFrame();
    };
    this.stopPlay = stop;
    this.screen.on('keypress', stop);
  }

  private async newAnimationAsked(): Promise<void> {
    const name = await promptText(this.screen, 'New animation name');
    if (name === null) return;
    this.op(d => addAnimation(d, name));
  }

  private async deleteFrameAsked(): Promise<void> {
    if (await confirm(this.screen, 'Delete this frame?')) this.op(d => deleteFrame(d));
  }

  private async deleteAnimationAsked(): Promise<void> {
    if (!this.doc) return;
    if (await confirm(this.screen, `Delete animation "${this.doc.animation}"?`)) {
      this.op(d => deleteAnimation(d));
    }
  }

  // ============================================
  // MAKING AND NAMING THINGS
  // ============================================

  /**
   * A new sprite, from nothing.
   *
   * Until now the studio could only open what already existed, which made
   * it an editor of other people's files rather than a place to start one.
   */
  private async newSpriteAsked(): Promise<void> {
    const doors = listDoorsWithSprites();
    const d = await this.pick('New sprite - which door', doors);
    if (d === null) return;

    const name = await promptText(this.screen, 'Sprite name (lowercase, dashes)');
    if (!name) return;
    if (!/^[a-z0-9-]+$/.test(name)) {
      await this.message('Refused', 'A sprite name is lowercase letters, digits and dashes.');
      return;
    }

    const size = await promptText(this.screen, 'Size in cells, WxH', '5x2');
    const match = /^(\d+)x(\d+)$/.exec((size || '').trim());
    if (!match) {
      await this.message('Refused', 'Size must look like 5x2 - width by height, in cells.');
      return;
    }
    const cellW = Number(match[1]);
    const cellH = Number(match[2]);
    if (cellW < 1 || cellH < 1 || cellW > 80 || cellH > 25) {
      await this.message('Refused', 'A sprite is between 1x1 and 80x25 cells.');
      return;
    }

    const blank = () => Array.from({ length: cellH }, () =>
      Array.from({ length: cellW }, () => null)) as CellBuffer;
    const sprite = {
      name, cellW, cellH,
      animations: { idle: { ticksPerFrame: 4, loop: true, frames: [blank()] } },
    } as Sprite;

    this.door = doors[d];
    this.file = `${name}.sprite.json`;
    this.doc = openDoc(sprite);
    this.resetZoomForDocument();
    await this.openEditor();
    await this.save();
  }

  /**
   * Change the sprite's cell size.
   *
   * The door owns this, not the editor: a sprite's size is a property of
   * the DOCUMENT - every frame of every animation shares it - so resizing
   * the editor's canvas alone would leave the sprite behind.
   */
  private async resizeSpriteAsked(): Promise<void> {
    if (!this.doc) return;
    this.commit();
    const answer = await promptText(
      this.screen, 'Size in cells, WxH', `${this.doc.sprite.cellW}x${this.doc.sprite.cellH}`,
    );
    if (!answer) return;
    const match = /^\s*(\d+)\s*[xX*]\s*(\d+)\s*$/.exec(answer);
    if (!match) {
      await this.message('Refused', 'Size must look like 5x2 - width by height, in cells.');
      return;
    }
    try {
      this.doc = resizeSprite(this.doc, Number(match[1]), Number(match[2]));
      this.resetZoomForDocument();
      await this.openEditor();
      this.flash(`Sprite is now ${this.doc.sprite.cellW}x${this.doc.sprite.cellH}`);
    } catch (error) {
      await this.message('Refused', String((error as Error).message));
    }
  }

  /** Save under another name, in the same door. */
  private async saveAsAsked(): Promise<void> {
    if (!this.doc) return;
    const name = await promptText(this.screen, 'Save as (sprite name)',
      this.file.replace(/\.sprite\.json$/, ''));
    if (!name) return;
    if (!/^[a-z0-9-]+$/.test(name)) {
      await this.message('Refused', 'A sprite name is lowercase letters, digits and dashes.');
      return;
    }
    this.file = `${name}.sprite.json`;
    this.doc = { ...this.doc, sprite: { ...this.doc.sprite, name } };
    await this.save();
  }

  /**
   * Rename the current animation.
   *
   * edit-doc has no rename op and does not need one: an animation is a key
   * in a record, so this is addAnimation + carry the frames + delete the
   * old, done through the same ops everything else uses so the refusals
   * (bad name, name taken, last animation) still apply.
   */
  private async renameAnimationAsked(): Promise<void> {
    if (!this.doc) return;
    const from = this.doc.animation;
    const to = await promptText(this.screen, `Rename "${from}" to`, from);
    if (!to || to === from) return;

    this.commit();
    try {
      const frames = this.doc.sprite.animations[from].frames;
      const anim = this.doc.sprite.animations[from];
      let next = addAnimation(this.doc, to);
      const sprite = JSON.parse(JSON.stringify(next.sprite)) as Sprite;
      sprite.animations[to] = { ticksPerFrame: anim.ticksPerFrame, loop: anim.loop, frames };
      next = { ...next, sprite, animation: from, frame: 0 };
      next = deleteAnimation(next);
      this.doc = { ...next, animation: to, frame: 0, dirty: true };
      this.loadFrame();
    } catch (error) {
      await this.message('Refused', String((error as Error).message));
    }
  }

  private async save(): Promise<void> {
    if (this.artText !== null && !this.doc) {
      try {
        const text = this.editor.getContent();
        writeArt(this.door, this.file, Buffer.from(text, 'latin1'));
        this.artText = text;
        if (this.editor) this.editor.modified = false;
        this.flash(`Saved ${this.file}`);
      } catch (error) {
        await this.message('Save failed', String((error as Error).message));
      }
      return;
    }
    if (!this.doc) return;
    this.commit();
    try {
      writeSprite(this.door, this.file, toSprite(this.doc));
      this.doc = { ...this.doc, dirty: false };
      if (this.editor) this.editor.modified = false;
      this.loadFrame();
    } catch (error) {
      await this.message('Save failed', String((error as Error).message));
    }
  }

  private isDirty(): boolean {
    return Boolean(this.doc?.dirty) || Boolean(this.editor?.isModified());
  }

  private async close(): Promise<void> {
    if (this.isDirty() && !(await confirm(this.screen, 'Discard unsaved changes?'))) return;
    this.destroy();
    this.exitResolve?.();
  }

  // ============================================
  // HOTKEYS
  // ============================================

  /**
   * Only what a hand reaches for while drawing. Everything is also in a
   * menu, and every key here is NON-PRINTABLE: in draw mode the editor
   * types printable characters onto the canvas, so a letter hotkey would
   * both run the command AND paint the letter. C-s/C-m/C-z/C-y/C-h are the
   * editor's own and are left alone.
   */
  private bindHotkeys(): void {
    for (const cmd of Object.values(this.commands())) {
      if (!cmd.key) continue;
      // Alt+Enter belongs to the SDK's terminal-mode switch, which binds it
      // itself; binding it here too would toggle twice per press.
      if (cmd.key === 'M-enter') continue;
      const keys = [cmd.key];
      const guarded = () => {
        if ((this.screen as any).dialogOpen) return;
        cmd.run();
        // TRUE means handled, so the editor never sees it. That matters for
        // the arrow combinations: the editor's draw handler reads the arrow
        // name without looking at Ctrl, so Ctrl+Up would move the frame AND
        // walk the cursor up a row.
        return true;
      };
      this.screen.key(keys, guarded);
      this.keyHandlers.push([keys, guarded]);
    }
  }

  destroy(): void {
    // Restores the board's 80 columns and drops the resize listener.
    this.terminalMode?.dispose();
    this.terminalMode = null;
    if (this.playTimer) { clearInterval(this.playTimer); this.playTimer = null; }
    for (const [keys, handler] of this.keyHandlers) this.screen.unkey(keys, handler);
    this.keyHandlers = [];
    this.editor?.destroy();
    this.editor = null;
    this.screen?.destroy();
  }
}
