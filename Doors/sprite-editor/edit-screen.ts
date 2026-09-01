/**
 * The edit screen: the SDK's ANSIEditor paints the frame, this file owns
 * everything the editor has no concept of - frames, animations, the
 * playback preview, and writing a .sprite file.
 *
 * The door used to paint cells itself: a hand-written canvas, its own
 * hit-test, its own tool/colour/glyph state and a toolbar that was a second
 * copy of the widget's sidebar. That was a recorded deviation from the
 * design doc's "the studio door is a fork of its door wrapper reusing this
 * engine wholesale", taken in studio 2b because the engine's canvas was
 * hardcoded 80x25 with no transparency and no working undo. The
 * ansi-editor-sprite-capable plan removed all three reasons and added
 * getCoreCanvas()/setCoreCanvas() for exactly this host; this file now
 * consumes them.
 *
 * The one invariant that replaces the old painter's: WHILE THE EDITOR IS
 * OPEN, THE WIDGET'S CANVAS IS THE CURRENT FRAME. `this.doc` is only
 * authoritative for frames other than the current one, so anything that
 * changes which frame is current - and every save - goes through
 * commitCanvasToDoc() first. Paint, press next-frame, lose the strokes is
 * the defect that would otherwise be built in by construction.
 */

import blessed, { ANSIEditor } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  Sprite, frameToCanvas, canvasToFrame,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import {
  EditDoc, openDoc, currentFrame, selectAnimation, selectFrame, addFrame,
  deleteFrame, moveFrame, setFrame, setTicksPerFrame, toggleLoop, addAnimation,
  deleteAnimation, toSprite,
} from './edit-doc';
import { writeSprite } from './assets';
import { previewLines } from './preview';
import { promptText, confirm } from './dialogs';
import { buildBindingSet, BindingSet, StudioBinding } from './bindings';
import { LAYOUT } from './layout';
import { createStudioMenuBar } from './menu';
import { makePanel, panelContentRect, resetPanelLayout } from './panels';
import { tokenAtColumn } from './token-strip';
import { T } from './door-theme';

const PLAYBACK_MS = 100;

/**
 * The ANSIEditor's own left sidebar width (its `sidebarWidth` when
 * showSidebar is on). The magnification below is sized against the columns
 * the CANVAS actually gets, not the panel's full width - otherwise a wide
 * sprite is drawn at a scale that does not fit and is clipped by the
 * sidebar it forgot to subtract.
 */
export const CANVAS_SIDEBAR_COLS = 6;

/**
 * How large one sprite cell is drawn, given the room available. A 5x2
 * sprite at one character per cell is a five-by-two smudge in a 44-column
 * panel; a 16-wide sprite gets a smaller magnification rather than a
 * clipped one. Exported so a test can assert the same number the screen
 * uses instead of recomputing it.
 */
export function canvasScale(sprite: Sprite, width: number, height: number): number {
  const drawable = width - CANVAS_SIDEBAR_COLS;
  return Math.max(1, Math.min(
    Math.floor(drawable / Math.max(1, sprite.cellW)),
    Math.floor(height / Math.max(1, sprite.cellH)),
  ));
}

export class EditScreen {
  private screen: any;
  private door: string;
  private file: string;
  private onExit: () => void;

  private doc: EditDoc;
  private tick = 0;
  private playback: ReturnType<typeof setInterval> | null = null;
  private statusFlash = '';

  private canvasPanel: any = null;
  private previewPanel: any = null;
  private framesPanel: any = null;
  private editor: any = null;
  private previewBox: any = null;
  private framesBox: any = null;
  private statusBar: any = null;
  private menuBar: any = null;
  private keyHandlers: Array<[string[], (...args: any[]) => void]> = [];
  private bindingSet!: BindingSet;

  constructor(screen: any, door: string, file: string, sprite: Sprite, onExit: () => void) {
    this.screen = screen;
    this.door = door;
    this.file = file;
    this.onExit = onExit;
    this.doc = openDoc(sprite);

    // bindKeys() first: it builds this.bindingSet, which buildLayout()
    // needs to hand the menu bar its items. Neither touches a widget at
    // call time (handlers are closures, evaluated only once invoked).
    this.bindKeys();
    this.buildLayout();
    this.wireMouse();
    this.playback = setInterval(() => {
      this.tick++;
      this.paintPreview();
    }, PLAYBACK_MS);
    this.paint();
  }

  private buildLayout(): void {
    const { canvas, preview, frames, status } = LAYOUT.edit;

    this.canvasPanel = makePanel(this.screen, { key: 'canvas', title: ' Canvas ', rect: canvas });
    const canvasContent = panelContentRect(canvas);
    const scale = canvasScale(this.doc.sprite, canvasContent.width, canvasContent.height);
    this.editor = new ANSIEditor({
      parent: this.canvasPanel,
      top: canvasContent.top, left: canvasContent.left,
      width: canvasContent.width, height: canvasContent.height,
      initialMode: 'draw',
      canvasWidth: this.doc.sprite.cellW,
      canvasHeight: this.doc.sprite.cellH,
      cellScaleX: scale, cellScaleY: scale,
      // An erased sprite cell is a HOLE, not black: compositing skips it
      // and the game's background shows through. Without this the editor
      // would erase to an opaque black square and every sprite saved from
      // here would carry a black box around its artwork.
      transparentBackground: true,
      showSidebar: true,       // colours and tools - what toolbar.ts was a second copy of
      showToolbar: true,       // the F-key character sets
      showMenuBar: false,      // the studio's own menu bar owns the top row
      showStatusBar: false,    // the studio's own status bar owns the last row
      showLineNumbers: false,
      // The widget binds Ctrl+S and ESC itself and calls these; the studio
      // deliberately does NOT also bind them (see buildOpBindings) or the
      // save would run twice and ESC would open two dialogs.
      onSave: async () => { this.save(); return true; },
      onExit: () => { void this.closeEditor(); },
    } as any);
    this.loadFrameIntoEditor();

    this.previewPanel = makePanel(this.screen, { key: 'preview', title: ' Preview ', rect: preview });
    const previewContent = panelContentRect(preview);
    this.previewBox = blessed.box({
      parent: this.previewPanel,
      top: previewContent.top, left: previewContent.left, width: previewContent.width, height: previewContent.height,
      border: { type: 'none' }, tags: true,
    });
    this.framesPanel = makePanel(this.screen, { key: 'frames', title: ' Frames ', rect: frames });
    const framesContent = panelContentRect(frames);
    this.framesBox = blessed.box({
      parent: this.framesPanel,
      top: framesContent.top, left: framesContent.left, width: framesContent.width, height: framesContent.height,
      border: { type: 'none' }, tags: true, mouse: true,
    });
    this.statusBar = blessed.box({
      parent: this.screen,
      top: status.top, left: status.left, width: status.width, height: status.height, tags: true,
    });
    // Created LAST so it renders above its siblings.
    this.menuBar = createStudioMenuBar(this.screen, this.bindingSet.menuItems());
  }

  /**
   * The widget's canvas IS the current frame while the editor is open;
   * this is the only place its content re-enters the sprite. Called before
   * anything that changes which frame is current, and before every save -
   * otherwise the strokes since the last transfer are on screen and
   * nowhere else.
   */
  private commitCanvasToDoc(): void {
    const canvas = this.editor?.getCoreCanvas();
    if (!canvas) return;
    // Through edit-doc like every other mutation, not by reaching into
    // this.doc.sprite here - setFrame is where the size invariant lives.
    this.doc = setFrame(this.doc, canvasToFrame(canvas));
  }

  /**
   * The current frame becomes the widget's canvas. setCoreCanvas clears
   * the widget's draw-mode undo history on purpose: a different frame is a
   * new undo timeline, not a continuation of the old canvas's.
   */
  private loadFrameIntoEditor(): void {
    if (!this.editor) return;
    this.editor.setCoreCanvas(frameToCanvas(currentFrame(this.doc)));
    // setCoreCanvas marks the widget modified - correct for a host that
    // swapped the canvas as an EDIT, wrong here: loading a frame is not
    // user work. Left set, a freshly opened sprite reads as dirty and ESC
    // asks to discard changes nobody made. What is unsaved is tracked by
    // doc.dirty; editor.modified means "strokes since this frame loaded".
    this.editor.modified = false;
  }

  /** Bind one screen-key group, remembered so destroy can remove it. */
  private key(keys: string[], handler: (...args: any[]) => void): void {
    this.screen.key(keys, handler);
    this.keyHandlers.push([keys, handler]);
  }

  /**
   * Bind a key that must do nothing while a modal dialog owns the
   * keyboard. `screen.dialogOpen` is owned entirely by dialogs.ts. As of
   * bindings.ts's `isBlocked` parameter every binding this is called with
   * is already wrapped with the same check; the second layer costs nothing
   * and documents the invariant locally.
   */
  private opKey(keys: string[], handler: (...args: any[]) => void): void {
    this.key(keys, (...args: any[]) => {
      if (this.screen.dialogOpen) return;
      handler(...args);
    });
  }

  /**
   * The op table. Every key here is NON-PRINTABLE, and that is a hard
   * invariant (pinned by edit-screen-bindings.test.ts), not a style
   * choice: in draw mode the widget types any printable character onto the
   * canvas, so a single-letter binding would both fire the op AND paint
   * the letter. This replaces studio 2c's derived glyph-exclusion set -
   * there is no longer a set of letters the canvas must refuse, because
   * the studio claims none of them.
   *
   * Most ops are therefore menu-only (`keys: []`, which bindings.ts
   * supports), with Ctrl hotkeys for the three most frequent. The menus
   * are the primary surface, which is the user's own directive ("the whole
   * sprited app need to be menu driven"), and menu-coverage.test.ts still
   * fails if any registered key lacks a menu entry.
   *
   * Cursor movement, colours, glyphs, tools and undo are absent: they are
   * the widget's, on its sidebar and its own keys.
   */
  private buildOpBindings(): StudioBinding[] {
    return [
      { id: 'frame.prev', keys: ['C-p'], hotkeyHint: 'C-p', menu: 'Frame', label: 'Previous Frame',
        handler: () => this.applyAfterCommit(d => selectFrame(d, d.frame - 1)) },
      { id: 'frame.next', keys: ['C-f'], hotkeyHint: 'C-f', menu: 'Frame', label: 'Next Frame',
        handler: () => this.applyAfterCommit(d => selectFrame(d, d.frame + 1)) },
      { id: 'frame.new', keys: [], hotkeyHint: '', menu: 'Frame', label: 'New Frame',
        handler: () => this.tryOp(d => addFrame(d, 'blank')) },
      { id: 'frame.duplicate', keys: [], hotkeyHint: '', menu: 'Frame', label: 'Duplicate Frame',
        handler: () => this.tryOp(d => addFrame(d, 'duplicate')) },
      { id: 'frame.delete', keys: [], hotkeyHint: '', menu: 'Frame', label: 'Delete Frame',
        handler: async () => {
          if (await confirm(this.screen, 'Delete this frame?')) this.tryOp(d => deleteFrame(d));
        } },
      { id: 'frame.moveEarlier', keys: [], hotkeyHint: '', menu: 'Frame', label: 'Move Frame Earlier',
        handler: () => this.applyAfterCommit(d => moveFrame(d, -1)) },
      { id: 'frame.moveLater', keys: [], hotkeyHint: '', menu: 'Frame', label: 'Move Frame Later',
        handler: () => this.applyAfterCommit(d => moveFrame(d, 1)) },

      { id: 'animation.next', keys: ['C-e'], hotkeyHint: 'C-e', menu: 'Animation', label: 'Next Animation',
        handler: () => {
          const names = Object.keys(this.doc.sprite.animations).sort();
          const next = names[(names.indexOf(this.doc.animation) + 1) % names.length];
          this.applyAfterCommit(d => selectAnimation(d, next));
        } },
      { id: 'animation.new', keys: [], hotkeyHint: '', menu: 'Animation', label: 'New Animation',
        handler: async () => {
          const name = await promptText(this.screen, 'New animation name');
          if (name === null) return; // ESC cancelled - the document is untouched
          this.tryOp(d => addAnimation(d, name));
        } },
      { id: 'animation.slower', keys: [], hotkeyHint: '', menu: 'Animation', label: 'Slower',
        handler: () => this.applyAfterCommit(d => setTicksPerFrame(d, -1)) },
      { id: 'animation.faster', keys: [], hotkeyHint: '', menu: 'Animation', label: 'Faster',
        handler: () => this.applyAfterCommit(d => setTicksPerFrame(d, +1)) },
      { id: 'animation.toggleLoop', keys: [], hotkeyHint: '', menu: 'Animation', label: 'Toggle Loop',
        handler: () => this.applyAfterCommit(d => toggleLoop(d)) },
      { id: 'animation.delete', keys: [], hotkeyHint: '', menu: 'Animation', label: 'Delete Animation',
        handler: async () => {
          const message = `Delete animation "${this.doc.animation}"?`;
          if (await confirm(this.screen, message)) this.tryOp(d => deleteAnimation(d));
        } },

      // Menu-only WITH a hotkey hint: the widget already binds Ctrl+S and
      // calls our onSave. Binding it here too would save twice.
      { id: 'file.save', keys: [], hotkeyHint: 'C-s', menu: 'File', label: 'Save',
        handler: () => this.save() },
      // Likewise ESC, which the widget binds and routes to our onExit.
      // C-q stays as the second, explicit route out.
      { id: 'file.closeEditor', keys: ['C-q'], hotkeyHint: 'esc/C-q', menu: 'File', label: 'Close Editor',
        handler: () => { void this.closeEditor(); } },

      { id: 'studio.help', keys: [], hotkeyHint: '', menu: 'Help', label: 'Keyboard Shortcuts',
        handler: () => {
          this.statusFlash = 'C-p/C-f frame  C-e animation  C-s save  ESC back  - drawing keys belong to the editor';
          this.paint();
        } },

      { id: 'view.resetLayout', keys: [], hotkeyHint: '', menu: 'View', label: 'Reset Layout',
        handler: () => {
          resetPanelLayout(this.canvasPanel, LAYOUT.edit.canvas);
          resetPanelLayout(this.previewPanel, LAYOUT.edit.preview);
          resetPanelLayout(this.framesPanel, LAYOUT.edit.frames);
        } },
    ];
  }

  private bindKeys(): void {
    // buildBindingSet's `isBlocked` wraps every handler with the same
    // dialogOpen check BEFORE either consumer sees it, so this loop
    // (screen.key() registration) and menuItems()'s action (dispatched by
    // a real mouse click through dropdown-menu.ts) share the identical
    // guarded function.
    this.bindingSet = buildBindingSet(this.buildOpBindings(), () => this.screen.dialogOpen);
    for (const binding of this.bindingSet.bindings) this.opKey(binding.keys, binding.handler);
  }

  /** Commit what is on the canvas, then run a document op. */
  private applyAfterCommit(op: (doc: EditDoc) => EditDoc): void {
    this.commitCanvasToDoc();
    this.apply(op(this.doc));
  }

  private apply(next: EditDoc): void {
    if (next === this.doc) return;
    this.doc = next;
    this.loadFrameIntoEditor();
    this.paint();
  }

  /** Commit, then run an op that may refuse - a refusal flashes, not throws. */
  private tryOp(op: (doc: EditDoc) => EditDoc): void {
    this.commitCanvasToDoc();
    try {
      this.apply(op(this.doc));
    } catch (error) {
      this.statusFlash = String((error as Error).message);
      this.paint();
    }
  }

  private save(): void {
    this.commitCanvasToDoc();
    try {
      writeSprite(this.door, this.file, toSprite(this.doc));
      this.doc = { ...this.doc, dirty: false };
      // The widget's own modified flag has to be cleared too, or the next
      // dirty check reports unsaved work immediately after a save.
      if (this.editor) this.editor.modified = false;
      this.statusFlash = `saved ${this.file}`;
    } catch (error) {
      this.statusFlash = `SAVE FAILED: ${(error as Error).message}`;
    }
    this.paint();
  }

  /** True when there is work neither saved nor already folded into the doc. */
  private isDirty(): boolean {
    return this.doc.dirty || Boolean(this.editor?.isModified());
  }

  private async closeEditor(): Promise<void> {
    if (this.screen.dialogOpen) return;
    if (!this.isDirty()) { this.exit(); return; }
    const discard = await confirm(this.screen, 'Discard unsaved changes?');
    if (discard) this.exit();
  }

  private handleFramesClick(data: { x: number; y: number }): void {
    if (this.screen.dialogOpen) return; // don't reinterpret a click while a dialog is open
    const coords = (this.framesBox as any)._getCoords();
    if (!coords) return;
    const localX = data.x - coords.xi;
    const localY = data.y - coords.yi;
    if (localY !== 0) return; // the frames strip is a single row
    const index = tokenAtColumn(this.frameTokens(), localX);
    if (index === -1) return;
    // The same op C-p/C-f call, through the same commit-first path - a
    // click that skipped the commit would drop the strokes on the frame
    // being left.
    this.applyAfterCommit(d => selectFrame(d, index));
  }

  private wireMouse(): void {
    this.framesBox.on('click', (data: any) => this.handleFramesClick(data));
  }

  private paintPreview(): void {
    const anim = this.doc.sprite.animations[this.doc.animation];
    const lines = previewLines(this.doc.sprite, this.doc.animation, this.tick, 2);
    this.previewBox.setContent(
      lines.join('\n') +
      `\n\n {${T.dim}-fg}${this.doc.animation} - ${anim.frames.length}f ` +
      `${anim.ticksPerFrame}tpf ${anim.loop ? 'loop' : 'hold'}{/}`
    );
    this.screen.render();
  }

  /**
   * The frames strip's plain (untagged) per-frame tokens, in display
   * order - one source both paintFrames() and handleFramesClick() read, so
   * a click can never disagree with what is on screen.
   */
  private frameTokens(): string[] {
    const anim = this.doc.sprite.animations[this.doc.animation];
    return anim.frames.map((_, i) => (i === this.doc.frame ? `[${i + 1}]` : ` ${i + 1} `));
  }

  private paintFrames(): void {
    const strip = this.frameTokens()
      .map((text, i) => (i === this.doc.frame ? `{${T.bar}-bg}{${T.accent}-fg}${text}{/}` : text))
      .join(' ');
    this.framesBox.setContent(strip);
  }

  private paint(): void {
    this.paintFrames();
    const dirty = this.isDirty() ? `{${T.alert}-fg}*{/} ` : '';
    const flash = this.statusFlash ? `  {${T.accent}-fg}${this.statusFlash}{/}` : '';
    this.statusFlash = '';
    this.statusBar.setContent(
      `${dirty}{${T.ink}-fg}${this.doc.sprite.name}{/} ${this.doc.animation} ` +
      `f${this.doc.frame + 1}${flash}` +
      `  {${T.dim}-fg}C-p/C-f frame  C-e animation  C-s save  ESC back{/}`
    );
    this.paintPreview();
  }

  private exit(): void {
    this.destroy();
    this.onExit();
  }

  destroy(): void {
    if (this.playback) {
      clearInterval(this.playback);
      this.playback = null;
    }
    for (const [keys, handler] of this.keyHandlers) {
      this.screen.unkey(keys, handler);
    }
    this.keyHandlers = [];
    // Destroy the PANELS, not just their nested content: a panel's
    // destroy() cascades to its children, so this tears down the editor,
    // previewBox and framesBox too. Destroying only the content would
    // orphan an empty, still-draggable panel shell on screen.
    for (const widget of [this.canvasPanel, this.previewPanel, this.framesPanel,
                          this.statusBar, this.menuBar]) {
      widget?.destroy();
    }
    this.canvasPanel = this.previewPanel = this.framesPanel = null;
    this.editor = this.previewBox = this.framesBox = this.statusBar = this.menuBar = null;
  }
}
