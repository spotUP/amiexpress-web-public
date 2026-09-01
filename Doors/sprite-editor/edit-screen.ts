/**
 * The edit screen: keys in, document ops through edit-doc, pixels out.
 *
 * Owns nothing clever: every mutation is an edit-doc call (tested there),
 * every save is writeSprite (guarded there), and the canvas paint is
 * bufferToTags over the current frame with a cursor overlay. The screen
 * object install/removes its OWN key handlers so the browser's come back
 * untouched - the same discipline as the door lifecycle rules.
 */

import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  Cell, Sprite, PALETTE,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import {
  EditDoc, openDoc, currentFrame, selectAnimation, selectFrame, addFrame,
  deleteFrame, moveFrame, setCell, setPixel, frameIsPixelEditable,
  setTicksPerFrame, toggleLoop, addAnimation, deleteAnimation, toSprite,
} from './edit-doc';
import { writeSprite } from './assets';
import { previewLines } from './preview';
import { buildBindingSet, BindingSet, StudioBinding } from './bindings';
import { LAYOUT } from './layout';
import { createStudioMenuBar } from './menu';

const GLYPHS = ['▀', '▄', '█', '▌', '▐', '░', '▒', '▓', '•', '►', '◄', '▲', '▼'];
const PLAYBACK_MS = 100;
const DISCARD_WINDOW_MS = 3000;

export class EditScreen {
  private screen: any;
  private door: string;
  private file: string;
  private onExit: () => void;

  private doc: EditDoc;
  private mode: 'cell' | 'pixel' = 'cell';
  private cursorRow = 0;   // cell coords in cell mode, pixel coords in pixel mode
  private cursorCol = 0;
  private fg = 11;
  private bg = 0;
  private glyph = 0;
  private tick = 0;
  private playback: ReturnType<typeof setInterval> | null = null;
  private statusFlash = '';
  private discardArmedAt = 0;
  private naming: string | null = null; // non-null while typing a new animation name

  private canvasBox: any = null;
  private previewBox: any = null;
  private framesBox: any = null;
  private paletteBox: any = null;
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
    // call time (handlers are closures, evaluated only once invoked), so
    // the reorder is safe - screen.children order (and every index the
    // behavior tests pin) is decided solely by buildLayout()'s own
    // box-creation order, which is unchanged.
    this.bindKeys();
    this.buildLayout();
    this.playback = setInterval(() => {
      this.tick++;
      this.paintPreview();
    }, PLAYBACK_MS);
    this.paint();
  }

  private buildLayout(): void {
    const { canvas, preview, frames, toolbar, status } = LAYOUT.edit;
    this.canvasBox = blessed.box({
      parent: this.screen,
      top: canvas.top, left: canvas.left, width: canvas.width, height: canvas.height,
      label: ' Canvas ',
      border: { type: 'line' }, tags: true,
      style: { border: { fg: 'lightyellow' } },
    });
    this.previewBox = blessed.box({
      parent: this.screen,
      top: preview.top, left: preview.left, width: preview.width, height: preview.height,
      label: ' Preview ',
      border: { type: 'line' }, tags: true,
      style: { border: { fg: 'green' } },
    });
    this.framesBox = blessed.box({
      parent: this.screen,
      top: frames.top, left: frames.left, width: frames.width, height: frames.height,
      label: ' Frames ',
      border: { type: 'line' }, tags: true,
      style: { border: { fg: 'cyan' } },
    });
    this.paletteBox = blessed.box({
      parent: this.screen,
      top: toolbar.top, left: toolbar.left, width: toolbar.width, height: toolbar.height,
      label: ' Paint ',
      border: { type: 'line' }, tags: true,
      style: { border: { fg: 'cyan' } },
    });
    this.statusBar = blessed.box({
      parent: this.screen,
      top: status.top, left: status.left, width: status.width, height: status.height, tags: true,
    });
    // Created LAST so the five indices above (canvasBox..statusBar) keep
    // the exact screen.children[N] positions edit-screen-behavior.test.ts
    // pins - the menu bar is purely additive.
    this.menuBar = createStudioMenuBar(this.screen, this.bindingSet.menuItems());
  }

  /** Bind one screen-key group, remembered so destroy can remove it. */
  private key(keys: string[], handler: (...args: any[]) => void): void {
    this.screen.key(keys, handler);
    this.keyHandlers.push([keys, handler]);
  }

  /**
   * Bind a key that MUTATES THE DOCUMENT OR VIEW STATE and must do nothing
   * while a name is being typed. blessed fires the registered key handler
   * AND emits 'keypress' for the same physical key, so every one of these
   * would otherwise double as a letter in the typed name - naming "spin"
   * saved to disk (s) and inserted a blank frame (n) before this guard
   * existed. space/delete/enter/escape/+ are NOT routed through here: they
   * handle the naming state themselves (typing into the name, submitting,
   * cancelling). Routed through one wrapper so the guard exists exactly
   * once, per finding-1's review note.
   */
  private opKey(keys: string[], handler: (...args: any[]) => void): void {
    this.key(keys, (...args: any[]) => {
      if (this.naming !== null) return;
      handler(...args);
    });
  }

  /**
   * The op table: every opKey-guarded binding, plus 'paint' (space), which
   * is naming-aware itself and so is wired separately below (see opKey's
   * own doc comment for why space/delete/enter/escape/+ don't share the
   * outer guard). Handler bodies are unchanged from before the table -
   * only where they are declared moved. This one table is also the single
   * source for the glyph-typing exclusion set below, replacing a
   * hand-written string that had already drifted once (missing 'X' for
   * S-x, caught by shiftXDoesNotTypeIntoTheCell).
   */
  private buildOpBindings(): StudioBinding[] {
    return [
      // Cursor movement, cell/pixel mode, and the paint tool's own
      // glyph/fg/bg settings all group under one 'Mode' menu: they are
      // the controls for what happens when the paint key runs next,
      // which is the same reason the studio-2c menu plan names it
      // 'Mode' rather than splitting it into a 'View' and a 'Paint'.
      { id: 'cursor.up', keys: ['up'], hotkeyHint: 'up', menu: 'Mode', label: 'Move Up',
        handler: () => this.moveCursor(-1, 0) },
      { id: 'cursor.down', keys: ['down'], hotkeyHint: 'down', menu: 'Mode', label: 'Move Down',
        handler: () => this.moveCursor(1, 0) },
      { id: 'cursor.left', keys: ['left'], hotkeyHint: 'left', menu: 'Mode', label: 'Move Left',
        handler: () => this.moveCursor(0, -1) },
      { id: 'cursor.right', keys: ['right'], hotkeyHint: 'right', menu: 'Mode', label: 'Move Right',
        handler: () => this.moveCursor(0, 1) },
      { id: 'view.toggleMode', keys: ['tab'], hotkeyHint: 'tab', menu: 'Mode', label: 'Toggle Cell/Pixel Mode',
        handler: () => {
          if (this.mode === 'cell' && frameIsPixelEditable(this.doc)) {
            this.mode = 'pixel';
            this.cursorRow = Math.min(this.cursorRow * 2, this.doc.sprite.cellH * 2 - 1);
          } else {
            if (this.mode === 'pixel') this.cursorRow = Math.floor(this.cursorRow / 2);
            this.mode = 'cell';
          }
          this.paint();
        } },

      { id: 'paint.nextGlyph', keys: ['g'], hotkeyHint: 'g', menu: 'Mode', label: 'Next Glyph',
        handler: () => { this.glyph = (this.glyph + 1) % GLYPHS.length; this.paint(); } },
      { id: 'paint.nextFg', keys: ['f'], hotkeyHint: 'f', menu: 'Mode', label: 'Next Foreground',
        handler: () => { this.fg = (this.fg + 1) % 16; this.paint(); } },
      { id: 'paint.prevFg', keys: ['S-f'], hotkeyHint: 'S-f', menu: 'Mode', label: 'Previous Foreground',
        handler: () => { this.fg = (this.fg + 15) % 16; this.paint(); } },
      { id: 'paint.nextBg', keys: ['b'], hotkeyHint: 'b', menu: 'Mode', label: 'Next Background',
        handler: () => { this.bg = (this.bg + 1) % 16; this.paint(); } },
      { id: 'paint.prevBg', keys: ['S-b'], hotkeyHint: 'S-b', menu: 'Mode', label: 'Previous Background',
        handler: () => { this.bg = (this.bg + 15) % 16; this.paint(); } },

      { id: 'frame.prev', keys: [','], hotkeyHint: ',', menu: 'Frame', label: 'Previous Frame',
        handler: () => this.apply(selectFrame(this.doc, this.doc.frame - 1)) },
      { id: 'frame.next', keys: ['.'], hotkeyHint: '.', menu: 'Frame', label: 'Next Frame',
        handler: () => this.apply(selectFrame(this.doc, this.doc.frame + 1)) },
      { id: 'frame.new', keys: ['n'], hotkeyHint: 'n', menu: 'Frame', label: 'New Frame',
        handler: () => this.tryOp(() => addFrame(this.doc, 'blank')) },
      { id: 'frame.duplicate', keys: ['c'], hotkeyHint: 'c', menu: 'Frame', label: 'Duplicate Frame',
        handler: () => this.tryOp(() => addFrame(this.doc, 'duplicate')) },
      { id: 'frame.delete', keys: ['x'], hotkeyHint: 'x', menu: 'Frame', label: 'Delete Frame',
        handler: () => this.tryOp(() => deleteFrame(this.doc)) },
      { id: 'frame.moveEarlier', keys: ['S-,'], hotkeyHint: 'S-,', menu: 'Frame', label: 'Move Frame Earlier',
        handler: () => this.apply(moveFrame(this.doc, -1)) },
      { id: 'frame.moveLater', keys: ['S-.'], hotkeyHint: 'S-.', menu: 'Frame', label: 'Move Frame Later',
        handler: () => this.apply(moveFrame(this.doc, 1)) },

      { id: 'animation.next', keys: ['a'], hotkeyHint: 'a', menu: 'Animation', label: 'Next Animation',
        handler: () => {
          const names = Object.keys(this.doc.sprite.animations).sort();
          const next = names[(names.indexOf(this.doc.animation) + 1) % names.length];
          this.apply(selectAnimation(this.doc, next));
        } },
      { id: 'animation.new', keys: ['+'], hotkeyHint: '+', menu: 'Animation', label: 'New Animation',
        handler: () => { this.naming = ''; this.paint(); } },
      { id: 'animation.slower', keys: ['t'], hotkeyHint: 't', menu: 'Animation', label: 'Slower',
        handler: () => this.apply(setTicksPerFrame(this.doc, -1)) },
      { id: 'animation.faster', keys: ['S-t'], hotkeyHint: 'S-t', menu: 'Animation', label: 'Faster',
        handler: () => this.apply(setTicksPerFrame(this.doc, +1)) },
      { id: 'animation.toggleLoop', keys: ['l'], hotkeyHint: 'l', menu: 'Animation', label: 'Toggle Loop',
        handler: () => this.apply(toggleLoop(this.doc)) },
      { id: 'animation.delete', keys: ['S-x'], hotkeyHint: 'S-x', menu: 'Animation', label: 'Delete Animation',
        handler: () => this.tryOp(() => deleteAnimation(this.doc)) },

      { id: 'file.save', keys: ['s'], hotkeyHint: 's', menu: 'File', label: 'Save',
        handler: () => this.save() },

      // Menu-only (keys: [] - the pattern bindings.ts/anEmptyKeysBindingIsMenuOnly
      // pins): reuses the existing statusFlash+paint plumbing every other
      // op's refusal already uses, so there is no new display mechanism,
      // just a Help menu entry that fills it in.
      { id: 'studio.help', keys: [], hotkeyHint: '', menu: 'Help', label: 'Keyboard Shortcuts',
        handler: () => {
          this.statusFlash = 'g/f/S-f/b/S-b paint  n/c/x/S-,/S-. frames  a/+/t/S-t/l/S-x animation  TAB mode  s save  ESC back';
          this.paint();
        } },
    ];
  }

  private bindKeys(): void {
    const opBindings = this.buildOpBindings();
    for (const binding of opBindings) this.opKey(binding.keys, binding.handler);

    // Paint (space) is naming-aware itself (it types a space into the name
    // while naming, rather than doing nothing like every opKey binding),
    // so it is wired directly with this.key(), not opKey() - but it still
    // needs a table entry so its key contributes to the exclusion set
    // below, the same as every opKey binding does.
    const paintBinding: StudioBinding = {
      id: 'paint.paint', keys: ['space'], hotkeyHint: 'space', menu: 'Paint', label: 'Paint',
      handler: () => {
        if (this.naming !== null) { this.typeName(' '); return; }
        this.tryOp(() => this.mode === 'pixel'
          ? setPixel(this.doc, this.cursorRow, this.cursorCol, this.fg)
          : setCell(this.doc, this.cursorRow, this.cursorCol,
              { char: GLYPHS[this.glyph], fg: this.fg, bg: this.bg }));
      },
    };
    this.key(paintBinding.keys, paintBinding.handler);

    this.bindingSet = buildBindingSet([...opBindings, paintBinding]);

    this.key(['delete', 'backspace'], () => {
      if (this.naming !== null) { this.naming = this.naming.slice(0, -1); this.paint(); return; }
      this.tryOp(() => this.mode === 'pixel'
        ? setPixel(this.doc, this.cursorRow, this.cursorCol, null)
        : setCell(this.doc, this.cursorRow, this.cursorCol, null));
    });

    this.key(['enter'], () => {
      if (this.naming !== null) {
        const name = this.naming;
        this.naming = null;
        this.tryOp(() => addAnimation(this.doc, name));
      }
    });
    this.key(['escape'], () => {
      if (this.naming !== null) { this.naming = null; this.paint(); return; }
      if (this.doc.dirty && Date.now() - this.discardArmedAt > DISCARD_WINDOW_MS) {
        this.discardArmedAt = Date.now();
        this.statusFlash = 'UNSAVED - escape again to discard, s to save';
        this.paint();
        return;
      }
      this.exit();
    });

    // Typed characters set the cell's char in cell mode, or extend the
    // animation name while naming. Screen keypress, filtered to printables.
    const onKeypress = (ch: string) => {
      if (!ch || ch.length !== 1 || ch < ' ' || ch === '\x7f') return;
      if (this.naming !== null) { this.typeName(ch); return; }
      if (this.mode !== 'cell') return;
      if (this.bindingSet.excludedGlyphKeys.has(ch)) return; // bound keys keep their meaning
      if (ch === '{' || ch === '}') return; // the two characters the format refuses
      this.apply(setCell(this.doc, this.cursorRow, this.cursorCol,
        { char: ch, fg: this.fg, bg: this.bg }));
    };
    this.screen.on('keypress', onKeypress);
    this.keyHandlers.push([['__keypress__'], onKeypress]);
  }

  private typeName(ch: string): void {
    if (this.naming === null) return;
    if (/[a-z0-9-]/.test(ch)) this.naming += ch;
    this.paint();
  }

  private moveCursor(dr: number, dc: number): void {
    const rows = this.mode === 'pixel' ? this.doc.sprite.cellH * 2 : this.doc.sprite.cellH;
    const cols = this.doc.sprite.cellW;
    this.cursorRow = Math.max(0, Math.min(rows - 1, this.cursorRow + dr));
    this.cursorCol = Math.max(0, Math.min(cols - 1, this.cursorCol + dc));
    this.paint();
  }

  private apply(next: EditDoc): void {
    if (next === this.doc) return;
    this.doc = next;
    // Every state change funnels through here, so this is the one place
    // that needs to know: pixel mode is only valid for a half-block frame,
    // and frame/animation selection (or a frame add/delete that shifts
    // which frame is current) can land on one that is not. Left unchecked,
    // 'space' calls setPixel on a non-half-block frame and edit-doc.ts
    // throws out of the key handler.
    if (this.mode === 'pixel' && !frameIsPixelEditable(this.doc)) {
      this.mode = 'cell';
      this.cursorRow = Math.floor(this.cursorRow / 2);
    }
    this.paint();
  }

  private tryOp(op: () => EditDoc): void {
    try {
      this.apply(op());
    } catch (error) {
      this.statusFlash = String((error as Error).message);
      this.paint();
    }
  }

  private save(): void {
    try {
      writeSprite(this.door, this.file, toSprite(this.doc));
      this.doc = { ...this.doc, dirty: false };
      this.statusFlash = `saved ${this.file}`;
    } catch (error) {
      this.statusFlash = `SAVE FAILED: ${(error as Error).message}`;
    }
    this.paint();
  }

  /** The frame, scale 2, with the cursor cell/pixel inverted. */
  private paintCanvas(): void {
    const frame = currentFrame(this.doc);
    const rows: string[] = [];
    for (let r = 0; r < frame.length; r++) {
      let line = '';
      for (let c = 0; c < frame[r].length; c++) {
        const cell = frame[r][c] as Cell | null;
        const isCursor = this.mode === 'cell'
          ? (r === this.cursorRow && c === this.cursorCol)
          : (Math.floor(this.cursorRow / 2) === r && this.cursorCol === c);
        const char = cell ? cell.char : ' ';
        const fg = cell ? PALETTE[cell.fg] : 'gray';
        const bg = cell ? PALETTE[cell.bg] : 'black';
        const body = `${char}${char}`;
        line += isCursor
          ? `{${bg}-fg}{${fg}-bg}${body}{/}`   // inverted = the cursor
          : `{${fg}-fg}{${bg}-bg}${body}{/}`;
      }
      rows.push(line);
    }
    const modeLine = this.mode === 'pixel'
      ? `{lightgreen-fg}PIXEL{/} row ${this.cursorRow} col ${this.cursorCol}`
      : `{lightyellow-fg}CELL{/} row ${this.cursorRow} col ${this.cursorCol}`;
    this.canvasBox.setContent('\n ' + rows.join('\n ') + '\n\n ' + modeLine);
  }

  private paintPreview(): void {
    const anim = this.doc.sprite.animations[this.doc.animation];
    const lines = previewLines(this.doc.sprite, this.doc.animation, this.tick, 2);
    this.previewBox.setContent(
      '\n ' + lines.join('\n ') +
      `\n\n {gray-fg}${this.doc.animation} - ${anim.frames.length}f ` +
      `${anim.ticksPerFrame}tpf ${anim.loop ? 'loop' : 'hold'}{/}`
    );
    this.screen.render();
  }

  private paintFrames(): void {
    const anim = this.doc.sprite.animations[this.doc.animation];
    const strip = anim.frames
      .map((_, i) => (i === this.doc.frame ? `{blue-bg}{lightyellow-fg}[${i + 1}]{/}` : ` ${i + 1} `))
      .join(' ');
    const naming = this.naming !== null
      ? `\n new animation: {lightyellow-fg}${this.naming}{/}_ (enter/escape)`
      : '';
    this.framesBox.setContent(`\n ${strip}${naming}`);
  }

  private paintPalette(): void {
    const swatches = PALETTE
      .map((name, i) => {
        const marker = i === this.fg ? 'F' : i === this.bg ? 'B' : ' ';
        return `{${name}-bg}{${i === 0 ? 'white' : 'black'}-fg}${marker}{/}`;
      })
      .join('');
    this.paletteBox.setContent(
      `\n ${swatches}\n glyph: ${GLYPHS[this.glyph]}  ` +
      `fg {${PALETTE[this.fg]}-fg}${this.fg}{/}  bg {${PALETTE[this.bg]}-fg}${this.bg}{/}`
    );
  }

  private paint(): void {
    this.paintCanvas();
    this.paintFrames();
    this.paintPalette();
    const dirty = this.doc.dirty ? '{lightred-fg}*{/} ' : '';
    const flash = this.statusFlash ? `  {lightyellow-fg}${this.statusFlash}{/}` : '';
    this.statusFlash = '';
    this.statusBar.setContent(
      `${dirty}{white-fg}${this.doc.sprite.name}{/} ${this.doc.animation} ` +
      `f${this.doc.frame + 1}${flash}` +
      '  {gray-fg}SPACE paint  DEL clear  TAB mode  s save  ESC back{/}'
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
      if (keys[0] === '__keypress__') this.screen.removeListener('keypress', handler);
      else this.screen.unkey(keys, handler);
    }
    this.keyHandlers = [];
    for (const widget of [this.canvasBox, this.previewBox, this.framesBox,
                          this.paletteBox, this.statusBar, this.menuBar]) {
      widget?.destroy();
    }
    this.canvasBox = this.previewBox = this.framesBox = this.paletteBox = this.statusBar = this.menuBar = null;
  }
}
