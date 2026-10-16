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
import { MenuBar, type MenuBarItem } from './menu-bar';
import { activeTheme } from '../../theme/live.js';
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

  /*
   * THE CHROME, NAMED AS THE ANSI EDITOR NAMES IT.
   *
   * "the same layout as ansi edit but adapted for petscii and hotkeys to hide
   * them ... all ui should be hideable" (the sysop, 2026-09-23). The four
   * parts are the four that widget has, so a door that hosts both asks for
   * them the same way.
   *
   * Left out, every one of them defaults to the WIDTH: a forty-column screen
   * is a PETSCII screen exactly, so chrome there would cost the artist a row
   * of his own picture and starts hidden. An eighty-column terminal has room
   * beside the canvas and starts with everything showing.
   */
  showMenuBar?: boolean;
  showToolbar?: boolean;
  /**
   * The tool, the pen and the reverse latch, as ONE ROW along the bottom.
   *
   * A column down the side is what the ANSI editor has, and at forty columns
   * it cost the picture eight of them: a forty-cell row in a thirty-two-cell
   * box WRAPPED, so every second line on the glass was the overflow of the
   * one above - "every other line is black" (the sysop, 2026-09-23, with the
   * screenshot). A row at the bottom costs one line instead of eight columns
   * and leaves the art its full width: "it looks like the tools panel would
   * fit better as one horizontal line at the bottom of the editor instead".
   */
  showTools?: boolean;
  /** The old name for `showTools`, from when it was a column. */
  showSidebar?: boolean;
  showStatusBar?: boolean;

  /** Menus of the host's own. They lead the bar, ahead of the generic ones. */
  hostMenus?: MenuBarItem[];

  /**
   * Offer File > Open / Save / Save as / Leave.
   *
   * A host that edits a FILE wants it; the mail composer does not - a message
   * is sent, not saved, and its own menu says so.
   */
  showFileMenu?: boolean;

  /** Save the screen as it is. */
  onSave?: () => void;
  /** Save it under a new name. */
  onSaveAs?: () => void;
  /** Open one. */
  onOpen?: () => void;
  /** Leave the editor. */
  onExit?: () => void;
  /** Show the host's help page. */
  onHelp?: () => void;

  /**
   * The key that hides the whole interface, F2 by default.
   *
   * The same option name and the same default the ANSI editor carries, so a
   * door hosting both sets one key and gets one behaviour.
   */
  hideUIHotkey?: string;
}

/** Which part of the chrome a toggle is about. */
export type PetsciiChrome = 'menuBar' | 'toolbar' | 'tools' | 'statusBar';

/** Below this width the canvas IS the screen and chrome starts hidden. */
const CHROME_FROM_WIDTH = 60;

/**
 * Wide enough to put the characters BESIDE the tools rather than under them.
 *
 * The thirty-eight graphics want a column each, and the tool row wants the
 * sixteen colour swatches and a word - so about eighty columns before the two
 * fit on one line.
 */
const DOCK_SIDE_BY_SIDE_WIDTH = 78;

/** The colours, in VIC order, in full words. */
export const PETSCII_COLOUR_NAMES = [
  'Black', 'White', 'Red', 'Cyan', 'Purple', 'Green', 'Blue', 'Yellow',
  'Orange', 'Brown', 'Light red', 'Dark grey', 'Grey', 'Light green',
  'Light blue', 'Light grey',
];

/**
 * The graphics the toolbar offers at a keystroke.
 *
 * Bank 1's own - screen codes `$40` and `$5B-$7F`. Letters and digits are
 * typed rather than picked, so they are not here.
 */
export const PETSCII_TOOLBAR_CODES: number[] = [
  0x40, ...Array.from({ length: 0x25 }, (_, i) => 0x5b + i),
];

/** How deep the undo stack goes. A surface is two kilobytes; a hundred is nothing. */
const UNDO_DEPTH = 100;

/**
 * The brush a caller starts with: `$66`, the medium shade.
 *
 * NOT `$51`. That is the filled circle in the GRAPHICS bank and the letter Q
 * in the one this board runs, so the studio opened with a brush that drew
 * "Q" - which is what the sysop's first drawing came out as. Bank 1's
 * graphics are `$40` and `$5B-$7F`, and nothing outside that range belongs in
 * a default here.
 */
const DEFAULT_SCREEN_CODE = 0x66;

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

  /** The art itself. Everything else on this widget is chrome around it. */
  private canvas: any = null;
  private menuBar: any = null;
  private toolbar: any = null;
  private toolsLine: any = null;
  /** The frame the two pickers sit in, along the bottom. */
  private dock: any = null;
  private statusBar: any = null;
  private hostMenus: MenuBarItem[] = [];
  private showFileMenu = true;
  private hideUIHotkey = 'f2';
  private hooks: {
    onSave?: () => void; onSaveAs?: () => void; onOpen?: () => void;
    onExit?: () => void; onHelp?: () => void;
  } = {};
  private chromeWanted: Record<PetsciiChrome, boolean> = {
    menuBar: false, toolbar: false, tools: false, statusBar: false,
  };

  constructor(options: PetsciiEditorOptions = {}) {
    const {
      surface, readOnly, tool, brush,
      showMenuBar, showToolbar, showSidebar, showTools, showStatusBar, hostMenus, showFileMenu, hideUIHotkey,
      onSave, onSaveAs, onOpen, onExit, onHelp,
      ...boxOptions
    } = options;

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
    this.hostMenus = hostMenus ?? [];
    this.showFileMenu = showFileMenu !== false;
    this.hideUIHotkey = hideUIHotkey ?? 'f2';
    this.hooks = { onSave, onSaveAs, onOpen, onExit, onHelp };

    // Wide enough for chrome, or a C64 screen where the art is the whole of
    // it. Either way an explicit option wins.
    const roomy = (this.width as number) >= CHROME_FROM_WIDTH;
    this.chromeWanted = {
      menuBar: showMenuBar ?? roomy,
      toolbar: showToolbar ?? roomy,
      tools: showTools ?? showSidebar ?? roomy,
      statusBar: showStatusBar ?? roomy,
    };

    this.buildChrome();

    this.on('keypress', (ch: string, key: any) => this._onKeypress(ch, key));
    this.on('mousedown', (event: any) => this._onPointer(event, 'down'));
    this.on('mousemove', (event: any) => this._onPointer(event, 'move'));
    this.on('mouseup', (event: any) => this._onPointer(event, 'up'));
    this.on('attach', () => this.layout());

    this.layout();
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
    this.refreshChrome();
    this.repaint();
    this.emit('tool', tool);
  }

  setBrush(brush: Partial<PetsciiBrush>): void {
    this.brush = { ...this.brush, ...brush };
    this.refreshChrome();
    this.repaint();
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

  // ---- the chrome ------------------------------------------------------

  /**
   * THE SAME FOUR PARTS THE ANSI EDITOR HAS, and every one of them hideable.
   *
   * A menu bar across the top, a row of characters under it, a sidebar of
   * tools and colours down the left, a status line along the bottom - and the
   * art in what is left, which is where a PETSCII screen differs from an ANSI
   * one: the picture is forty columns by twenty-five and does not stretch, so
   * it is CENTRED in the room rather than filling it.
   */
  private buildChrome(): void {
    this.destroyChrome();

    /*
     * THE BOARD'S COLOURS, not blessed's.
     *
     * Every box below used to be built with no style at all, so it drew in
     * the widget defaults while the door around it used the caller's theme -
     * "not correct theme colors" (the sysop, 2026-09-23). The SDK holds the
     * theme the door set (`engines/ui/theme/live.ts`); the chrome reads it
     * the same way the menu bar does.
     *
     * The ART is NOT themed and never will be. A screen drawn in red is red
     * because the artist chose red.
     */
    const tokens = activeTheme().tokens;
    const chromeStyle = { fg: tokens.ink, bg: tokens.ground };
    const framed = {
      border: { type: 'line' as const },
      style: { ...chromeStyle, border: { fg: tokens.accent }, label: { fg: tokens.accent } },
    };

    if (this.chromeWanted.menuBar) {
      this.menuBar = new MenuBar({
        parent: this,
        screen: this.screen as any,
        items: this.menuItems(),
      } as any);
    }

    /*
     * THE DOCK: the tools and the characters, framed, along the bottom.
     *
     * "put the petscii chars at the bottom on the right side, dont let them
     * float on black, frame them same for the tools" (the sysop, 2026-09-23).
     * Glyphs loose on a black screen read as part of the picture - which is
     * exactly what a caller is trying to look at - so both pickers sit inside
     * one border at the foot of the editor.
     *
     * Side by side when the terminal is wide enough for the characters to
     * have their own half, stacked when it is not: thirty-eight graphics do
     * not fit beside anything in forty columns.
     */
    const wantsDock = this.chromeWanted.tools || this.chromeWanted.toolbar;
    if (wantsDock) {
      const sideBySide = (this.width as number) >= DOCK_SIDE_BY_SIDE_WIDTH
        && this.chromeWanted.tools && this.chromeWanted.toolbar;
      const rows = sideBySide || !(this.chromeWanted.tools && this.chromeWanted.toolbar) ? 1 : 2;

      this.dock = new Box({
        parent: this,
        bottom: this.chromeWanted.statusBar ? 1 : 0,
        left: 0, width: '100%', height: rows + 2,
        tags: false,
        label: ' Tools ',
        ...framed,
      } as any);

      if (this.chromeWanted.tools) {
        this.toolsLine = new Box({
          parent: this.dock,
          top: 0, left: 0,
          width: sideBySide ? Math.floor(((this.width as number) - 2) / 2) : '100%-2',
          height: 1,
          tags: false, mouse: true, clickable: true,
          style: chromeStyle,
        } as any);
        this.toolsLine.on('click', (event: any) => {
          const vic = this.colourAtColumn(event.x - this.toolsLine.ileft);
          if (vic !== null) this.setBrush({ color: vic });
        });
      }

      if (this.chromeWanted.toolbar) {
        const beside = sideBySide && this.toolsLine;
        this.toolbar = new Box({
          parent: this.dock,
          top: beside ? 0 : (this.toolsLine ? 1 : 0),
          left: beside ? (this.toolsLine.position.width as number) : 0,
          width: beside
            ? (this.width as number) - 2 - (this.toolsLine.position.width as number)
            : '100%-2',
          height: 1,
          tags: false, mouse: true, clickable: true,
          style: chromeStyle,
        } as any);
        this.toolbar.on('click', (event: any) => {
          const code = PETSCII_TOOLBAR_CODES[event.x - this.toolbar.ileft];
          if (code !== undefined) this.setBrush({ screenCode: code });
        });
      }
    }

    if (this.chromeWanted.statusBar) {
      this.statusBar = new Box({
        parent: this,
        bottom: 0, left: 0, width: '100%', height: 1,
        tags: false,
        style: { fg: tokens.dim, bg: tokens.ground },
      } as any);
    }

    /*
     * THE ART, AND A LINE ROUND IT WHERE THERE IS ROOM.
     *
     * "the background and canvas have the same color so i dont see where the
     * canvas ends" (the sysop, 2026-09-23). Both are black, and on this board
     * they always will be - it is a black-background board and PETSCII has no
     * per-cell background to shade the desk with. So the edge is drawn, in
     * the box-drawing glyphs a C64 has (`borderCharsFor` gives the PETSCII
     * set), rather than implied by a colour a C64 cannot show.
     *
     * Only when the editor is at least two columns and two rows wider than
     * the picture. At exactly forty columns the art IS the glass and there is
     * nowhere to put a line; the screen's own edge is the canvas's edge.
     */
    const room = this.roomForBorder();
    this.canvas = new Box({
      parent: this,
      top: 0, left: 0,
      width: this.surface.cols + (room ? 2 : 0),
      height: this.surface.rows + (room ? 2 : 0),
      tags: false,
      ...(room ? { border: { type: 'line' }, style: { border: { fg: tokens.chrome } } } : {}),
    } as any);
  }

  private destroyChrome(): void {
    for (const part of [this.toolbar, this.toolsLine, this.dock, this.menuBar, this.statusBar, this.canvas]) {
      try { part?.destroy(); } catch { /* going away anyway */ }
    }
    this.menuBar = null;
    this.toolbar = null;
    this.toolsLine = null;
    this.dock = null;
    this.statusBar = null;
    this.canvas = null;
  }

  /**
   * Is there room for a line around the picture?
   *
   * WIDTH only. A PETSCII screen is twenty-five rows and so is the terminal
   * showing it, so a line above and below would never fit anywhere - asking
   * for the height as well meant no border on any session at all, which is
   * how this was first written and what the test caught. The rows the border
   * costs come off the VIEWPORT instead: the picture scrolls inside its frame
   * by a row, which it already does whenever chrome is up.
   */
  private roomForBorder(): boolean {
    return (this.width as number) >= this.surface.cols + 2;
  }

  /** The first row the canvas may use: only the menu bar sits above it. */
  private chromeTop(): number {
    return this.menuBar ? 1 : 0;
  }

  /**
   * Put the canvas where the chrome leaves room, centred in it.
   *
   * Centred rather than pinned, for the reason the ANSI editor learned:
   * hiding the sidebar gives the canvas eight more columns of room, and where
   * the picture sits in that room is arithmetic, not a constant.
   */
  layout(): void {
    if (!this.canvas) return;
    const top = this.chromeTop();
    const left = 0;
    const bottomRows = (this.dock ? (this.dock.position.height as number) : 0)
      + (this.statusBar ? 1 : 0);
    const roomWidth = Math.max(1, (this.width as number) - left);
    const roomHeight = Math.max(1, (this.height as number) - top - bottomRows);

    const frame = this.canvas.options?.border ? 2 : 0;
    const width = Math.min(this.surface.cols + frame, roomWidth);
    const height = Math.min(this.surface.rows + frame, roomHeight);

    this.canvas.position.width = width;
    this.canvas.position.height = height;
    this.canvas.position.left = left + Math.max(0, Math.floor((roomWidth - width) / 2));
    this.canvas.position.top = top + Math.max(0, Math.floor((roomHeight - height) / 2));

    this.refreshChrome();
    this.repaint();
  }

  /** Is this part of the chrome on the glass? */
  chromeVisible(part: PetsciiChrome): boolean {
    return this.chromeWanted[part];
  }

  /** Show or hide one part, and give the canvas the room back. */
  setChromeVisible(part: PetsciiChrome, visible: boolean): void {
    if (this.chromeWanted[part] === visible) return;
    this.chromeWanted[part] = visible;
    this.buildChrome();
    this.layout();
    this.emit('chrome', { ...this.chromeWanted });
  }

  toggleChrome(part: PetsciiChrome): void {
    this.setChromeVisible(part, !this.chromeWanted[part]);
  }

  /**
   * One key for the whole screen, and one for it back.
   *
   * If anything is showing, everything goes; if nothing is, everything
   * returns. That is what a caller means by "hide the interface" - not four
   * presses in the right order.
   */
  toggleAllChrome(): void {
    const anyShowing = Object.values(this.chromeWanted).some(Boolean);
    for (const part of Object.keys(this.chromeWanted) as PetsciiChrome[]) {
      this.chromeWanted[part] = !anyShowing;
    }
    this.buildChrome();
    this.layout();
    this.emit('chrome', { ...this.chromeWanted });
  }

  /**
   * OPEN THE MENU, which is not the same as showing the bar.
   *
   * A bar on the glass with no way into it is what the first cut shipped:
   * F5 made it appear and nothing opened, so "no menu items worked" on a
   * keyboard - and a telnet C64 has no mouse to click them with. `MenuBar`
   * has `openFirst()` for precisely this; the host has to call it.
   */
  openMenu(): void {
    if (!this.chromeWanted.menuBar) this.setChromeVisible('menuBar', true);
    this.menuBar?.openFirst?.();
  }

  /**
   * Run a menu item, then give the keyboard back to the picture.
   *
   * Without it the focus stays on the menu button the caller came from, and
   * the next arrow key walks the menu instead of moving the cursor.
   */
  private fromMenu(action: () => void): () => void {
    return () => {
      action();
      this.menuBar?.closeAll?.();
      this.focus();
      this.repaint();
    };
  }

  /** The menu bar's own menus, plus whatever the host added. */
  private menuItems(): MenuBarItem[] {
    const file: MenuBarItem = {
      label: 'File',
      items: [
        { label: 'Open', action: this.fromMenu(() => this.hooks.onOpen?.()) },
        { label: 'Save', action: this.fromMenu(() => this.hooks.onSave?.()) },
        { label: 'Save as', action: this.fromMenu(() => this.hooks.onSaveAs?.()) },
        { label: '────────────', separator: true },
        { label: 'Leave', action: this.fromMenu(() => this.hooks.onExit?.()) },
      ],
    };

    const edit: MenuBarItem = {
      label: 'Edit',
      items: [
        { label: 'Undo', action: this.fromMenu(() => this.undo()) },
        { label: 'Redo', action: this.fromMenu(() => this.redo()) },
        { label: '────────────', separator: true },
        { label: 'Add line', action: this.fromMenu(() => this.addLine()) },
        { label: 'Remove line', action: this.fromMenu(() => this.deleteLine()) },
        { label: 'Clear screen', action: this.fromMenu(() => this.clear()) },
      ],
    };

    const tools: MenuBarItem = {
      label: 'Tools',
      items: (Object.keys(PETSCII_TOOL_LABELS) as PetsciiTool[]).map((tool) => ({
        label: PETSCII_TOOL_LABELS[tool],
        action: this.fromMenu(() => this.setTool(tool)),
      })),
    };

    const colour: MenuBarItem = {
      label: 'Colour',
      items: PETSCII_COLOUR_NAMES.map((name, vic) => ({
        label: name,
        action: this.fromMenu(() => this.setBrush({ color: vic })),
      })),
    };

    const view: MenuBarItem = {
      label: 'View',
      items: [
        { label: 'Hide the menu bar', action: this.fromMenu(() => this.setChromeVisible('menuBar', false)) },
        { label: 'Toggle the character row', action: this.fromMenu(() => this.toggleChrome('toolbar')) },
        { label: 'Toggle the tool line', action: this.fromMenu(() => this.toggleChrome('tools')) },
        { label: 'Toggle the status line', action: this.fromMenu(() => this.toggleChrome('statusBar')) },
        { label: '────────────', separator: true },
        { label: 'Hide everything', action: this.fromMenu(() => this.toggleAllChrome()) },
      ],
    };

    const help: MenuBarItem = {
      label: 'Help',
      items: [{ label: 'Keys', action: this.fromMenu(() => this.hooks.onHelp?.()) }],
    };

    /*
     * THE HOST'S OWN MENUS COME FIRST, AND THE BAR HAS TO FIT.
     *
     * `MenuBar` lays its labels out left to right at fixed positions and does
     * nothing about running out of glass - so on a C64, `File Edit Tools
     * Colour View` filled the forty columns and everything after it was off
     * the edge, unreachable. The mail composer's own Message menu was there
     * the whole time and the caller could not get at it: "ae doesnt let me
     * send messages only save files like the normal editor" (the sysop,
     * 2026-09-23).
     *
     * So a host's menus lead - they are why the door exists - and the two
     * that duplicate the dock's own pickers, Tools and Colour, stand down on
     * a narrow screen. Nothing is lost: both rows ARE those menus, and the
     * caller can click or key them.
     */
    const roomy = (this.width as number) >= CHROME_FROM_WIDTH;
    const generic = roomy ? [edit, tools, colour, view] : [edit, view];
    const menus = [...this.hostMenus, ...(this.showFileMenu ? [file] : []), ...generic, help];
    return fittingMenus(menus, this.width as number);
  }

  /**
   * The character row: the graphics themselves, the one in hand REVERSED.
   *
   * Reversed rather than bracketed, because a bracket would cost two columns
   * and move every glyph after it - the caller would be pointing at a moving
   * target.
   */
  private toolbarLine(): string {
    const inHand = this.brush.screenCode & 0x7f;
    return PETSCII_TOOLBAR_CODES
      .map((code) => puaForScreenCode(code === inHand ? (code | 0x80) : code))
      .join('');
  }

  /**
   * The tool in hand, the sixteen colours, and the reverse latch.
   *
   * A swatch is a REVERSED SPACE, which is the only way a C64 fills a cell:
   * the pen colours it, so the row really is the palette rather than a list
   * of colour names.
   */
  private toolsText(): string {
    const tool = PETSCII_TOOL_LABELS[this.tool];
    const reverse = this.brush.reverse ? ' Reverse' : '';
    if (this.screen?.colour === false) {
      // Colour off: the pen colour is stripped, so each swatch holds its index
      // digit and the pen in hand is named.
      const digits = PETSCII_COLOUR_NAMES.map((_name, vic) => vic.toString(16)).join('');
      const pen = this.brush.color & 0x0f;
      return `${digits} Pen: ${pen.toString(16)} ${PETSCII_COLOUR_NAMES[pen]} ${tool}${reverse}`;
    }
    const swatches = PETSCII_COLOUR_NAMES
      .map((_name, vic) => colourMarker(vic) + puaForScreenCode(0xa0))
      .join('');
    return `${swatches}${colourMarker(this.brush.color & 0x0f)} ${tool}${reverse}`;
  }

  /** Which swatch is under this column of the tool row, if any. */
  private colourAtColumn(column: number): number | null {
    return column >= 0 && column < PETSCII_COLOUR_NAMES.length ? column : null;
  }

  /** Where the cursor is, and how much of the picture is on the glass. */
  private statusLine(): string {
    const rows = `${this.viewTop + 1}-${Math.min(this.surface.rows, this.viewTop + this.visibleRows())}`;
    return ` ${this.cursor.x}, ${this.cursor.y}   rows ${rows} of ${this.surface.rows}`
      .slice(0, (this.width as number) || 40);
  }

  private refreshChrome(): void {
    this.toolbar?.setContent(this.toolbarLine());
    this.toolsLine?.setContent(this.toolsText());
    this.statusBar?.setContent(this.statusLine());
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
    if (!this.canvas) return;
    this.scrollToCursor();
    this.canvas.setContent(this.renderRows().join('\n'));
    const screen: any = this.screen;
    if (screen?.setCursorTarget && this.focused) {
      screen.setCursorTarget(
        this.canvas.ileft + this.cursor.x,
        this.canvas.itop + this.cursor.y - this.viewTop,
      );
    }
    screen?.render?.();
  }

  /** How many rows of the art this terminal is showing. */
  private visibleRows(): number {
    // `iheight`, not `position.height`: inside the border, which is where the
    // art actually goes.
    const height = (this.canvas?.iheight as number) || this.iheight || this.surface.rows;
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
    this.refreshChrome();
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
    if (!this.canvas) return false;
    const x = event.x - this.canvas.ileft;
    const y = event.y - this.canvas.itop + this.viewTop;
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

    /*
     * THE HOTKEYS THAT HIDE THINGS.
     *
     * F2 takes the whole interface away and brings it back - one key, because
     * that is what "hide the interface" means to somebody drawing. The four
     * parts have a key each after it, in the order they sit on the screen.
     * They are F-keys because a C64 keyboard HAS eight of them and has no
     * CTRL+letter at all.
     */
    if (key?.name === this.hideUIHotkey) { this.toggleAllChrome(); return true; }

    switch (key?.name) {
      case 'f5': this.openMenu(); return true;
      case 'f6': this.toggleChrome('toolbar'); return true;
      case 'f7': this.toggleChrome('tools'); return true;
      case 'f8': this.toggleChrome('statusBar'); return true;
      default: break;
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

/**
 * As many menus as the bar can actually show.
 *
 * `MenuBar` positions each label at a fixed column and lets the rest run off
 * the glass, where no caller can reach them. Counted the way it counts:
 * ` Label ` plus one column of spacing.
 */
function fittingMenus(menus: MenuBarItem[], width: number): MenuBarItem[] {
  const out: MenuBarItem[] = [];
  let used = 0;
  for (const menu of menus) {
    const cost = menu.label.length + 3;
    if (used + cost > width) break;
    out.push(menu);
    used += cost;
  }
  return out;
}

/** blessed's lowercase factory, the way every other widget offers one. */
export function petsciiEditor(options: PetsciiEditorOptions = {}): PetsciiEditor {
  return new PetsciiEditor(options);
}
