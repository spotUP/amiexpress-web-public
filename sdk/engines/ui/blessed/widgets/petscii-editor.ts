/**
 * A PETSCII SCREEN, EDITED IN A TERMINAL.
 *
 * The board has had a PETSCII editor since 2026-09-14, but only in the admin
 * web studio: a sysop with a browser could draw a `.seq` and nobody sitting at
 * the BBS could. The sysop asked for it as a door - "port the web admin ui
 * petscii editor into an petscii-editor door like the ansi editor door" - and
 * then for the part that decides where this file lives: "we also reuse the
 * ansi-editor door for our ansi message editor can we do the same for petscii?
 * ... move the petscii stuff to sdk level so to say".
 *
 * So this is a WIDGET, beside `widgets/ansi-editor.ts`, and the hosts are
 * doors: the PETSCII studio, and the mail composer when the caller is on a
 * C64. Whatever the next host is, it gets the same editor.
 *
 * WHAT IT IS NOT: a fork of the ANSI editor's model. That widget edits ANSI
 * cells - CP437, per-cell backgrounds, 16 attributes - and this board's PETSCII
 * has one colour per cell, no background at all, and a glyph set of screen
 * codes. The model for THIS is `sdk/petscii/editor-surface.ts`, which is
 * already pure, already what the web studio calls, and already the machine's
 * own state type, so a surface loads through `PetsciiMachine.feed` and saves
 * through `writeSeq` with no adapter at either end. Nothing here re-implements
 * a tool; every one of them is a call into that file.
 *
 * HOW IT PAINTS. A cell is `puaForScreenCode(sc)` (`U+E100 + screenCode`, bit 7
 * = reverse) and a colour change is `colourMarker(vic)` (`U+E2xx`).
 * `Element.setContent` folds the pen marker to SGR - it is zero cells - and
 * leaves the glyph marker as the single cell it is, so a PETSCII caller's
 * transducer draws the exact screen code the artist chose, and an 80-column
 * ANSI caller gets the same picture folded to Unicode blocks by `BBSApi.write`.
 * One authored form, a renderer per terminal.
 *
 * BANK 1 ONLY, BLACK BACKGROUND ONLY (`sdk/petscii/board-rules.ts`, the sysop
 * 2026-09-14). `conformToBoard` runs on every mutation, so a surface that
 * breaks either rule cannot be built here in the first place - and nothing in
 * this file ever emits a `U+E0xx` bank-0 marker, which would make the
 * transducer send `$8E` and reflow every letter already on the caller's screen.
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';
import {
  blankSurface, cloneSurface, surfaceFromBytes, stamp, stampChar, colorize,
  floodFill, insertLine, removeLine, typeChar, liftRegion, stampRegion,
  clearSurface, conformToBoard,
  type PetsciiSurface, type PetsciiBrush, type PetsciiRegion,
} from '../../../../petscii/editor-surface';
import { writeSeq, type SeqWriteOptions } from '../../../../petscii/seq-writer';
import {
  puaForScreenCode, colourMarker, colourOfMarker, PUA_BANK1,
} from '../../../../petscii/pua';
import { asciiToPetsciiByte } from '../../../../petscii/ascii-to-petscii';
import { printablePetsciiToScreenCode } from '../../../../petscii/screen-codes';

/**
 * The tools, in the studio's own words.
 *
 * The same six the web editor offers, because a caller who has used one should
 * not have to learn the other. Full English words in every label
 * (`characterOnly` is shown as "Character only"), never RVS or CHR.
 */
export type PetsciiTool = 'draw' | 'characterOnly' | 'colourOnly' | 'fill' | 'brush' | 'text';

export const PETSCII_TOOL_LABELS: Record<PetsciiTool, string> = {
  draw: 'Draw',
  characterOnly: 'Character only',
  colourOnly: 'Colour only',
  fill: 'Fill',
  brush: 'Brush',
  text: 'Text',
};

export interface PetsciiEditorOptions extends ElementOptions {
  /** The screen to edit. Defaults to a blank board-legal 40x25 one. */
  surface?: PetsciiSurface;
  /** A viewer rather than an editor: no tool acts, no key draws. */
  readOnly?: boolean;
  /** The tool to start on. */
  tool?: PetsciiTool;
  /** The brush to start with. */
  brush?: PetsciiBrush;
}

/** How deep the undo stack goes. A surface is two kilobytes; a hundred is nothing. */
const UNDO_DEPTH = 100;

/** A filled circle - the studio's own opening brush. */
const DEFAULT_SCREEN_CODE = 0x51;

/**
 * A glyph marker this board accepts: BANK 1 ONLY.
 *
 * `isPuaScreenCode` answers for both banks because a file that predates the
 * rule is still read. Nothing may be DRAWN from bank 0, so the editor asks the
 * narrower question - a `U+E0xx` glyph would make the transducer emit `$8E`
 * and reflow every letter already on the caller's screen.
 */
function isBank1Marker(code: number): boolean {
  return code >= PUA_BANK1 && code < PUA_BANK1 + 0x100;
}

export class PetsciiEditor extends Box {
  /** blessed-style widget kind; see Element.type. */
  get type(): string { return 'petscii-editor'; }

  private surface: PetsciiSurface;
  private past: PetsciiSurface[] = [];
  private future: PetsciiSurface[] = [];
  private readOnly: boolean;

  tool: PetsciiTool;
  brush: PetsciiBrush;
  cursor = { x: 0, y: 0 };

  /** The rectangle the Brush tool lifted, waiting to be stamped. */
  private region: PetsciiRegion | null = null;
  /** Where a brush drag started, while the button is still down. */
  private liftFrom: { x: number; y: number } | null = null;
  /** True while a pointer button is held, so a move paints instead of hovering. */
  private painting = false;

  /**
   * THE FIRST ROW OF THE ART THAT IS ON THE GLASS.
   *
   * A PETSCII screen is twenty-five rows, and so is a C64's: at forty columns
   * the art and the glass are the same thing and this is always zero. An
   * eighty-column terminal gives blessed twenty-four rows, one short, so the
   * canvas is a window onto the surface and the last row is reached by walking
   * the cursor to it. A window, not a fold: the art keeps its own shape
   * whatever terminal is looking at it.
   */
  private viewTop = 0;

  constructor(options: PetsciiEditorOptions = {}) {
    const { surface, readOnly, tool, brush, ...boxOptions } = options;

    super({
      keys: true,
      mouse: true,
      focusable: true,
      clickable: true,
      ...boxOptions,
      tags: false,      // the content is markers, not blessed tags
    });

    this.surface = conformToBoard(surface ? cloneSurface(surface) : blankSurface());
    this.readOnly = readOnly === true;
    this.tool = tool ?? 'draw';
    this.brush = brush ? { ...brush } : { screenCode: DEFAULT_SCREEN_CODE, color: 1, reverse: false };

    this.on('keypress', (ch: string, key: any) => this._onKeypress(ch, key));
    this.on('mousedown', (event: any) => this._onPointer(event, 'down'));
    this.on('mousemove', (event: any) => this._onPointer(event, 'move'));
    this.on('mouseup', (event: any) => this._onPointer(event, 'up'));
    this.on('attach', () => this.repaint());

    this.repaint();
  }

  // ---- the screen being edited ----------------------------------------

  getSurface(): PetsciiSurface {
    return this.surface;
  }

  /** Replace the screen outright - opening a file, or a host restoring a draft. */
  setSurface(surface: PetsciiSurface, options: { undoable?: boolean } = {}): void {
    if (options.undoable !== false) this.remember();
    this.surface = conformToBoard(cloneSurface(surface));
    this.cursor = { x: 0, y: 0 };
    this.changed();
  }

  setTool(tool: PetsciiTool): void {
    this.tool = tool;
    this.emit('tool', tool);
  }

  setBrush(brush: Partial<PetsciiBrush>): void {
    this.brush = { ...this.brush, ...brush };
    this.emit('brush', this.brush);
  }

  /** The rectangle the Brush tool is holding, if any - a host shows it in its status line. */
  getRegion(): PetsciiRegion | null {
    return this.region;
  }

  // ---- history ---------------------------------------------------------

  private remember(): void {
    this.past.push(cloneSurface(this.surface));
    if (this.past.length > UNDO_DEPTH) this.past.shift();
    this.future = [];
  }

  canUndo(): boolean { return this.past.length > 0; }
  canRedo(): boolean { return this.future.length > 0; }

  undo(): void {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(cloneSurface(this.surface));
    this.surface = previous;
    this.changed();
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(cloneSurface(this.surface));
    this.surface = next;
    this.changed();
  }

  clear(): void {
    if (this.readOnly) return;
    this.remember();
    this.surface = clearSurface(this.surface);
    this.changed();
  }

  // ---- the tools -------------------------------------------------------

  /**
   * One tool, at one cell. Every route into the editor ends here: the pointer,
   * the keyboard, and a host's own menu item.
   *
   * It takes its own undo snapshot, so a host that calls it gets undo without
   * having to know the editor has a history. A STROKE - the pointer held down
   * across a row of cells - passes `continuing`, so the whole drag is one step
   * to take back rather than forty.
   */
  applyAt(x: number, y: number, options: { continuing?: boolean } = {}): void {
    if (this.readOnly) return;
    if (x < 0 || y < 0 || x >= this.surface.cols || y >= this.surface.rows) return;
    if (!options.continuing) this.remember();

    switch (this.tool) {
      case 'draw':
        this.surface = stamp(this.surface, x, y, this.brush);
        break;
      case 'characterOnly':
        this.surface = stampChar(this.surface, x, y, this.brush);
        break;
      case 'colourOnly':
        this.surface = colorize(this.surface, x, y, this.brush.color);
        break;
      case 'fill':
        this.surface = floodFill(this.surface, x, y, this.brush);
        break;
      case 'brush':
        if (this.region) this.surface = stampRegion(this.surface, x, y, this.region);
        break;
      case 'text':
        // Text draws through the keyboard, not by pointing; a click only moves
        // the caret so the caller can type somewhere else.
        break;
    }

    this.cursor = { x, y };
    this.changed();
  }

  /** Add a blank line at the cursor's row, pushing the rest down. */
  addLine(): void {
    if (this.readOnly) return;
    this.remember();
    this.surface = insertLine(this.surface, this.cursor.y, this.brush.color);
    this.changed();
  }

  /** Take the cursor's row out, pulling the rest up. */
  deleteLine(): void {
    if (this.readOnly) return;
    this.remember();
    this.surface = removeLine(this.surface, this.cursor.y, this.brush.color);
    this.changed();
  }

  /** Lift a rectangle into the brush. The next click stamps it. */
  lift(a: { x: number; y: number }, b: { x: number; y: number }): void {
    this.region = liftRegion(this.surface, a, b);
    this.emit('region', this.region);
  }

  // ---- what the caller sees --------------------------------------------

  moveCursor(dx: number, dy: number): void {
    const x = Math.max(0, Math.min(this.surface.cols - 1, this.cursor.x + dx));
    const y = Math.max(0, Math.min(this.surface.rows - 1, this.cursor.y + dy));
    if (x === this.cursor.x && y === this.cursor.y) return;
    this.cursor = { x, y };
    this.emit('cursor', this.cursor);
    this.repaint();
  }

  /**
   * The screen as the caller's terminal will draw it.
   *
   * A colour marker is emitted only where the colour CHANGES - sixteen pens
   * across a row cost sixteen markers, not a thousand - and every cell is one
   * glyph marker, so the row is exactly `cols` cells wide however many colours
   * it carries. Trailing blanks are kept: this is a canvas, and a short row
   * would leave the previous frame's glyphs standing to its right.
   */
  private renderRows(): string[] {
    const { cols, rows, screen, colorRam } = this.surface;
    const out: string[] = [];
    const last = Math.min(rows, this.viewTop + this.visibleRows());
    for (let y = this.viewTop; y < last; y++) {
      let row = '';
      let pen = -1;
      for (let x = 0; x < cols; x++) {
        const index = y * cols + x;
        const colour = colorRam[index] & 0x0f;
        if (colour !== pen) {
          row += colourMarker(colour);
          pen = colour;
        }
        row += puaForScreenCode(screen[index]);
      }
      out.push(row);
    }
    return out;
  }

  /**
   * Repaint, and put the caller's own cursor under the brush.
   *
   * The cell buffer is differential (`Screen._diff`), so a full `setContent`
   * costs only the cells that actually changed on the wire - a stamp is one
   * cell, not a frame. `setCursorTarget` is what makes the cursor useful on a
   * C64: the canvas draws it as a filled cell in the pen colour, so it shows
   * both where the brush is and what colour it will lay down.
   */
  repaint(): void {
    this.scrollToCursor();
    this.setContent(this.renderRows().join('\n'));
    const screen: any = this.screen;
    if (screen?.setCursorTarget && this.focused) {
      screen.setCursorTarget(this.ileft + this.cursor.x, this.itop + this.cursor.y - this.viewTop);
    }
    screen?.render?.();
  }

  /** How many rows of the art this terminal is showing. */
  private visibleRows(): number {
    const height = this.iheight || this.surface.rows;
    return Math.max(1, Math.min(this.surface.rows, height));
  }

  /** Keep the cursor's row on the glass; at forty columns this never moves. */
  private scrollToCursor(): void {
    const visible = this.visibleRows();
    const highest = Math.max(0, this.surface.rows - visible);
    if (this.cursor.y < this.viewTop) this.viewTop = this.cursor.y;
    else if (this.cursor.y >= this.viewTop + visible) this.viewTop = this.cursor.y - visible + 1;
    this.viewTop = Math.max(0, Math.min(highest, this.viewTop));
  }

  private changed(): void {
    this.surface = conformToBoard(this.surface);
    this.emit('change', this.surface);
    this.emit('cursor', this.cursor);
    this.repaint();
  }

  // ---- the pointer -----------------------------------------------------

  /**
   * A web caller draws with the mouse; the board forwards cell coordinates and
   * blessed turns them into these events (`core/program.ts` parseJsonMouseEvent).
   * A telnet C64 has no mouse and uses the keys below - both routes end in
   * `applyAt`, so there is one behaviour to reason about.
   */
  private _onPointer(event: any, phase: 'down' | 'move' | 'up'): boolean {
    if (this.readOnly) return false;
    const x = event.x - this.ileft;
    const y = event.y - this.itop + this.viewTop;
    if (x < 0 || y < 0 || x >= this.surface.cols || y >= this.surface.rows) return false;

    if (this.tool === 'brush' && !this.region) {
      // Drag to lift: down marks a corner, up takes the rectangle between.
      if (phase === 'down') { this.liftFrom = { x, y }; return true; }
      if (phase === 'up' && this.liftFrom) {
        this.lift(this.liftFrom, { x, y });
        this.liftFrom = null;
        return true;
      }
      return true;
    }

    if (phase === 'down') {
      this.painting = true;
      this.applyAt(x, y);
      return true;
    }
    if (phase === 'move' && this.painting) {
      // Fill acts once per click; dragging it would flood every cell crossed.
      if (this.tool !== 'fill') this.applyAt(x, y, { continuing: true });
      return true;
    }
    if (phase === 'up') {
      this.painting = false;
      return true;
    }
    return false;
  }

  // ---- the keyboard ----------------------------------------------------

  /**
   * A C64's own chords, because they arrive already decoded.
   *
   * `petscii-input.ts` turns a colour chord into a `U+E2xx` pen marker and a
   * graphics key into a `U+E1xx` glyph marker before any door sees them, so
   * CTRL+3 and C=+A reach this widget as exactly the two things it draws with.
   * That is the whole keyboard design: a caller who knows a C64 already knows
   * this editor.
   */
  private _onKeypress(ch: string, key: any): boolean {
    if (this.readOnly) return false;

    const code = ch ? ch.codePointAt(0) : undefined;

    // A colour chord: CTRL+1..8, C=+1..8, or a real C64's own colour byte.
    if (code !== undefined) {
      const pen = colourOfMarker(code);
      if (pen !== null) {
        this.setBrush({ color: pen });
        this.repaint();
        return true;
      }
      // A graphics key. Its reverse bit is the caller's RVS latch, so it sets
      // the brush's reverse as well as its glyph.
      if (isBank1Marker(code)) {
        const sc = code & 0xff;
        this.setBrush({ screenCode: sc & 0x7f, reverse: (sc & 0x80) !== 0 });
        if (this.tool === 'text') this.stampAndAdvance(sc & 0x7f);
        else this.repaint();
        return true;
      }
    }

    switch (key?.name) {
      case 'left':  this.moveCursor(-1, 0); return true;
      case 'right': this.moveCursor(1, 0); return true;
      case 'up':    this.moveCursor(0, -1); return true;
      case 'down':  this.moveCursor(0, 1); return true;
      case 'home':  this.cursor = { x: 0, y: 0 }; this.emit('cursor', this.cursor); this.repaint(); return true;
      case 'enter':
      case 'return':
        if (this.tool === 'text') {
          this.cursor = { x: 0, y: Math.min(this.surface.rows - 1, this.cursor.y + 1) };
          this.emit('cursor', this.cursor);
          this.repaint();
        } else {
          this.applyAt(this.cursor.x, this.cursor.y);
        }
        return true;
      case 'space':
        this.applyAt(this.cursor.x, this.cursor.y);
        return true;
      case 'backspace':
      case 'delete': {
        this.remember();
        const blank: PetsciiBrush = { screenCode: 0x20, color: this.brush.color, reverse: false };
        this.surface = stamp(this.surface, this.cursor.x, this.cursor.y, blank);
        this.changed();
        return true;
      }
      default:
        break;
    }

    // Typing, in Text mode only: everywhere else a letter is free for a host's
    // own shortcut.
    if (this.tool === 'text' && ch && ch.length === 1 && code !== undefined && code >= 0x20 && code < 0x7f) {
      const { byte, needsReverse } = asciiToPetsciiByte(code, 1);
      this.remember();
      const typed = typeChar(this.surface, this.cursor.x, this.cursor.y, byte,
        this.brush.color, this.brush.reverse || needsReverse);
      this.surface = typed.surface;
      this.cursor = typed.cursor;
      this.changed();
      return true;
    }

    return false;
  }

  /** Stamp a screen code at the caret and step right, wrapping at the row end. */
  private stampAndAdvance(screenCode: number): void {
    this.remember();
    this.surface = stamp(this.surface, this.cursor.x, this.cursor.y, {
      screenCode, color: this.brush.color, reverse: this.brush.reverse,
    });
    if (this.cursor.x < this.surface.cols - 1) this.cursor = { x: this.cursor.x + 1, y: this.cursor.y };
    else if (this.cursor.y < this.surface.rows - 1) this.cursor = { x: 0, y: this.cursor.y + 1 };
    this.changed();
  }

  // ---- what a host saves -----------------------------------------------

  /**
   * The screen as a `.seq` file - what the board's own screens are.
   *
   * The studio door writes this; the round trip `fromSeq(toSeq())` is the
   * writer's own contract (`seq-writer.ts`): the same SCREEN comes back, not
   * necessarily the same bytes.
   */
  toSeq(options: SeqWriteOptions = {}): Uint8Array {
    return writeSeq(this.surface, options);
  }

  fromSeq(bytes: Uint8Array): void {
    this.setSurface(surfaceFromBytes(bytes));
  }

  /**
   * The screen as authored TEXT - what a message body is.
   *
   * A message and a chat line carry glyph and pen markers, never ESC, because
   * every escape is stripped out of a chat message before it is stored. So the
   * mail composer asks for this instead of `.seq` bytes, and an eighty-column
   * reader gets the art folded to Unicode with the same colours.
   *
   * Trailing blanks go, unlike the canvas: a message is lines of text, and
   * forty spaces of padding would be forty spaces in somebody's mailbox.
   */
  toPua(): string {
    return this.renderRows()
      .map((row) => row.replace(new RegExp(`(?:${puaForScreenCode(0x20)})+$`), ''))
      .join('\n')
      .replace(/\n+$/, '');
  }

  /** The inverse: authored text back onto the canvas. */
  fromPua(text: string): void {
    const next = blankSurface(this.surface.cols, this.surface.rows);
    let x = 0;
    let y = 0;
    let pen = 1;
    for (const character of text) {
      const code = character.codePointAt(0)!;
      if (character === '\n') { x = 0; y++; continue; }
      if (y >= next.rows) break;
      const colour = colourOfMarker(code);
      if (colour !== null) { pen = colour; continue; }
      if (x >= next.cols) continue;
      const index = y * next.cols + x;
      if (isBank1Marker(code)) {
        next.screen[index] = code - PUA_BANK1;
      } else {
        const { byte, needsReverse } = asciiToPetsciiByte(code, 1);
        const sc = printablePetsciiToScreenCode(byte);
        next.screen[index] = needsReverse ? (sc | 0x80) : sc;
      }
      next.colorRam[index] = pen;
      x++;
    }
    this.setSurface(next);
  }
}

/** blessed's lowercase factory, the way every other widget offers one. */
export function petsciiEditor(options: PetsciiEditorOptions = {}): PetsciiEditor {
  return new PetsciiEditor(options);
}
