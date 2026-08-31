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
  private keyHandlers: Array<[string[], (...args: any[]) => void]> = [];

  constructor(screen: any, door: string, file: string, sprite: Sprite, onExit: () => void) {
    this.screen = screen;
    this.door = door;
    this.file = file;
    this.onExit = onExit;
    this.doc = openDoc(sprite);

    this.buildLayout();
    this.bindKeys();
    this.playback = setInterval(() => {
      this.tick++;
      this.paintPreview();
    }, PLAYBACK_MS);
    this.paint();
  }

  private buildLayout(): void {
    this.canvasBox = blessed.box({
      parent: this.screen,
      top: 0, left: 0, width: '55%', height: '90%',
      label: ' Canvas ',
      border: { type: 'line' }, tags: true,
      style: { border: { fg: 'lightyellow' } },
    });
    this.previewBox = blessed.box({
      parent: this.screen,
      top: 0, left: '55%', width: '45%', height: '45%',
      label: ' Preview ',
      border: { type: 'line' }, tags: true,
      style: { border: { fg: 'green' } },
    });
    this.framesBox = blessed.box({
      parent: this.screen,
      top: '45%', left: '55%', width: '45%', height: '30%',
      label: ' Frames ',
      border: { type: 'line' }, tags: true,
      style: { border: { fg: 'cyan' } },
    });
    this.paletteBox = blessed.box({
      parent: this.screen,
      top: '75%', left: '55%', width: '45%', height: '15%',
      label: ' Paint ',
      border: { type: 'line' }, tags: true,
      style: { border: { fg: 'cyan' } },
    });
    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 0, left: 0, width: '100%', height: 1, tags: true,
    });
  }

  /** Bind one screen-key group, remembered so destroy can remove it. */
  private key(keys: string[], handler: (...args: any[]) => void): void {
    this.screen.key(keys, handler);
    this.keyHandlers.push([keys, handler]);
  }

  private bindKeys(): void {
    this.key(['up'], () => this.moveCursor(-1, 0));
    this.key(['down'], () => this.moveCursor(1, 0));
    this.key(['left'], () => this.moveCursor(0, -1));
    this.key(['right'], () => this.moveCursor(0, 1));
    this.key(['tab'], () => {
      if (this.mode === 'cell' && frameIsPixelEditable(this.doc)) {
        this.mode = 'pixel';
        this.cursorRow = Math.min(this.cursorRow * 2, this.doc.sprite.cellH * 2 - 1);
      } else {
        if (this.mode === 'pixel') this.cursorRow = Math.floor(this.cursorRow / 2);
        this.mode = 'cell';
      }
      this.paint();
    });
    this.key(['space'], () => {
      if (this.naming !== null) { this.typeName(' '); return; }
      this.apply(this.mode === 'pixel'
        ? setPixel(this.doc, this.cursorRow, this.cursorCol, this.fg)
        : setCell(this.doc, this.cursorRow, this.cursorCol,
            { char: GLYPHS[this.glyph], fg: this.fg, bg: this.bg }));
    });
    this.key(['delete', 'backspace'], () => {
      if (this.naming !== null) { this.naming = this.naming.slice(0, -1); this.paint(); return; }
      this.apply(this.mode === 'pixel'
        ? setPixel(this.doc, this.cursorRow, this.cursorCol, null)
        : setCell(this.doc, this.cursorRow, this.cursorCol, null));
    });

    this.key(['g'], () => { this.glyph = (this.glyph + 1) % GLYPHS.length; this.paint(); });
    this.key(['f'], () => { this.fg = (this.fg + 1) % 16; this.paint(); });
    this.key(['S-f'], () => { this.fg = (this.fg + 15) % 16; this.paint(); });
    this.key(['b'], () => { this.bg = (this.bg + 1) % 16; this.paint(); });
    this.key(['S-b'], () => { this.bg = (this.bg + 15) % 16; this.paint(); });

    this.key([','], () => this.apply(selectFrame(this.doc, this.doc.frame - 1)));
    this.key(['.'], () => this.apply(selectFrame(this.doc, this.doc.frame + 1)));
    this.key(['n'], () => this.tryOp(() => addFrame(this.doc, 'blank')));
    this.key(['c'], () => this.tryOp(() => addFrame(this.doc, 'duplicate')));
    this.key(['x'], () => this.tryOp(() => deleteFrame(this.doc)));
    this.key(['S-,'], () => this.apply(moveFrame(this.doc, -1)));
    this.key(['S-.'], () => this.apply(moveFrame(this.doc, 1)));

    this.key(['a'], () => {
      const names = Object.keys(this.doc.sprite.animations).sort();
      const next = names[(names.indexOf(this.doc.animation) + 1) % names.length];
      this.apply(selectAnimation(this.doc, next));
    });
    this.key(['+'], () => { this.naming = ''; this.paint(); });
    this.key(['t'], () => this.apply(setTicksPerFrame(this.doc, -1)));
    this.key(['S-t'], () => this.apply(setTicksPerFrame(this.doc, +1)));
    this.key(['l'], () => this.apply(toggleLoop(this.doc)));
    this.key(['S-x'], () => this.tryOp(() => deleteAnimation(this.doc)));

    this.key(['s'], () => this.save());
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
      if ('gfbFB,.ncx<>a+tTlsS '.includes(ch)) return; // bound keys keep their meaning
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
                          this.paletteBox, this.statusBar]) {
      widget?.destroy();
    }
    this.canvasBox = this.previewBox = this.framesBox = this.paletteBox = this.statusBar = null;
  }
}
