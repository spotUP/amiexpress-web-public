/**
 * PETSCII Studio: draw a C64 screen from the BBS.
 *
 * A fork of `Doors/sprite-editor/studio.ts`, which is itself the ANSI editor
 * door forked - the sysop asked for exactly that ("fork the ansi editor and
 * use as a skeleton"). What is inherited is the SHELL: `createScreen` off the
 * caller's own terminal size, a `DoorInputManager`, the terminal-mode switch
 * built on the way in and disposed on the way out, the board's theme, and the
 * rule that there is ONE full-screen editor and everything else is a requester
 * that appears, does its job and goes away.
 *
 * At forty columns that rule stops being a preference. A PETSCII screen is
 * 40x25 and so is a C64's glass, so a permanent toolbar would cost a row of
 * somebody's art. The canvas IS the screen; F1 to F8 open the requesters, the
 * way a C64 art package has always worked. An eighty-column terminal has room
 * beside the canvas, so it gets a sidebar instead - the same editor either way.
 *
 * The EDITOR is not forked: `PetsciiEditor` lives in the SDK
 * (`sdk/engines/ui/blessed/widgets/petscii-editor.ts`) so this door and the
 * mail composer share one, exactly as ANSI-EDIT, SPRITED and the composer
 * share the ANSI editor widget.
 */

import type { DoorContext } from '@amiexpress/bbs-door-sdk';
import { Box, PetsciiEditor, PETSCII_TOOL_LABELS, type PetsciiTool } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createScreen, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { createTerminalModeSwitch, type TerminalModeSwitch } from '@amiexpress/bbs-door-sdk/utils/terminal-mode';
import { C64_PALETTE_COLODORE } from '@amiexpress/bbs-door-sdk/petscii';
import { applyTheme, T } from './door-theme';
import { promptText, chooseFrom, notice, confirm } from './dialogs';
import {
  BBS_SCREEN_DIRS, isSysop, listOwnScreens, loadOwnScreen, saveOwnScreen,
  listBoardScreens, loadBoardScreen, saveBoardScreen, withSeqExtension,
} from './assets';

/** The colour names a caller picks from, in VIC order. */
const COLOUR_NAMES = [
  'Black', 'White', 'Red', 'Cyan', 'Purple', 'Green', 'Blue', 'Yellow',
  'Orange', 'Brown', 'Light red', 'Dark grey', 'Grey', 'Light green', 'Light blue', 'Light grey',
];

/** The tools, in the order the requester lists them. */
const TOOLS: PetsciiTool[] = ['draw', 'characterOnly', 'colourOnly', 'fill', 'brush', 'text'];

/**
 * The characters the requester offers.
 *
 * Bank 1's graphics, which is what this board runs and therefore what a
 * caller may draw with - screen codes `$40` and `$5B-$7F`. Letters and digits
 * are typed, not picked, so they are not in the list.
 */
const GRAPHIC_CODES: number[] = [0x40, ...Array.from({ length: 0x25 }, (_, i) => 0x5b + i)];

/** An eighty-column terminal has room beside the canvas; a C64 has not. */
const SIDEBAR_FROM_WIDTH = 60;

export class PetsciiStudioDoor {
  private ctx!: DoorContext;
  private screen: any;
  private inputManager: any;
  private terminalMode: TerminalModeSwitch | null = null;

  /** Public so the door's own test can see the editor was built. */
  editor: any = null;
  private sidebar: any = null;

  /** The name this screen was opened or last saved under. */
  private filename: string | null = null;
  /** Where that name lives: the caller's own storage, or the board's art. */
  private target: 'own' | 'board' = 'own';
  private unsaved = false;

  private exitResolve: (() => void) | null = null;

  setContext(ctx: DoorContext): void {
    this.ctx = ctx;
  }

  async start(): Promise<void> {
    this.createUI();
    this.terminalMode = createTerminalModeSwitch({
      bbs: (this.ctx as any).bbs,
      screen: this.screen,
      // The board's own width to begin with: a door should look like the
      // board it opened from until the caller asks otherwise.
      start: 'fixed',
      onRelayout: () => this.relayout(),
    });
    this.inputManager.enable();
    (this.ctx as any).bbs?.enableMouseEvents?.();

    this.openEditor();
    this.bindHotkeys();

    await new Promise<void>((resolve) => {
      this.exitResolve = resolve;
      this.screen.once('destroy', resolve);
    });
  }

  private createUI(): void {
    applyTheme((this.ctx as any).bbs);

    this.screen = createScreen((this.ctx as any).bbs, {
      dockBorders: false,
      title: 'PETSCII Studio',
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
      debugName: 'PETSCII-EDIT',
    });

    this.screen.render();
  }

  /** Does this terminal have room for a sidebar beside a forty-column canvas? */
  private get roomForSidebar(): boolean {
    return this.screen.width >= SIDEBAR_FROM_WIDTH;
  }

  /**
   * Build the editor at the screen's current size, keeping the art.
   *
   * The canvas is always the surface's own forty columns - a PETSCII screen
   * does not stretch to fill a wide terminal, it is a C64 screen wherever it
   * is being looked at.
   */
  private openEditor(): void {
    const surface = this.editor?.getSurface();
    const tool: PetsciiTool = this.editor?.tool ?? 'draw';
    const brush = this.editor?.brush;

    this.editor?.destroy();
    this.sidebar?.destroy();
    this.sidebar = null;

    this.editor = new PetsciiEditor({
      parent: this.screen,
      top: 0,
      left: 0,
      width: 40,
      height: Math.min(25, this.screen.height),
      surface,
      tool,
      brush,
    } as any);

    this.editor.on('change', () => { this.unsaved = true; this.refreshSidebar(); });
    this.editor.on('tool', () => this.refreshSidebar());
    this.editor.on('brush', () => this.refreshSidebar());
    this.editor.on('cursor', () => this.refreshSidebar());

    if (this.roomForSidebar) {
      this.sidebar = new Box({
        parent: this.screen,
        top: 0,
        left: 41,
        width: Math.max(18, this.screen.width - 42),
        height: Math.min(25, this.screen.height),
        label: ' PETSCII Studio ',
        tags: false,
        border: { type: 'line' },
        style: { border: { fg: T.accent }, fg: T.ink, bg: T.ground },
      });
    }

    this.editor.focus();
    this.refreshSidebar();
    this.screen.render();
  }

  private relayout(): void {
    this.openEditor();
  }

  /**
   * What the caller is holding, for a terminal wide enough to show it.
   *
   * At forty columns there is no sidebar and this does nothing: the pen is
   * visible as the colour of the cursor itself, which is how a C64 has always
   * answered the same question.
   */
  private refreshSidebar(): void {
    if (!this.sidebar || !this.editor) return;
    const { brush, cursor } = this.editor;
    const lines = [
      `Tool       ${PETSCII_TOOL_LABELS[this.editor.tool as PetsciiTool]}`,
      `Colour     ${COLOUR_NAMES[brush.color & 0x0f]}`,
      `Reverse    ${brush.reverse ? 'On' : 'Off'}`,
      `Cursor     ${cursor.x}, ${cursor.y}`,
      `File       ${this.filename ?? '(unsaved)'}${this.unsaved ? ' *' : ''}`,
      '',
      'F1 Help      F5 File',
      'F2 Tools     F6 Undo',
      'F3 Colour    F7 Redo',
      'F4 Character F8 Clear',
      '',
      'Escape       Leave',
    ];
    this.sidebar.setContent(lines.join('\n'));
    this.screen.render();
  }

  // ---- the requesters --------------------------------------------------

  private bindHotkeys(): void {
    const guarded = (action: () => void | Promise<void>) => () => {
      if (this.screen.dialogOpen) return;
      void action();
    };

    this.screen.key(['f1'], guarded(() => this.showHelp()));
    this.screen.key(['f2'], guarded(() => this.pickTool()));
    this.screen.key(['f3'], guarded(() => this.pickColour()));
    this.screen.key(['f4'], guarded(() => this.pickCharacter()));
    this.screen.key(['f5'], guarded(() => this.fileMenu()));
    this.screen.key(['f6'], guarded(() => { this.editor?.undo(); }));
    this.screen.key(['f7'], guarded(() => { this.editor?.redo(); }));
    this.screen.key(['f8'], guarded(() => this.clearScreen()));
    this.screen.key(['escape'], guarded(() => this.leave()));
  }

  private async showHelp(): Promise<void> {
    await notice(this.screen, 'Help',
      'Arrows move. Return or Space draws.\n'
      + 'CTRL+1..8 and C= +1..8 pick a colour,\n'
      + 'CTRL+9 and CTRL+0 turn Reverse on and off,\n'
      + 'C= and a letter picks a graphic.');
  }

  private async pickTool(): Promise<void> {
    const index = await chooseFrom(this.screen, 'Tool', TOOLS.map((tool) => PETSCII_TOOL_LABELS[tool]));
    if (index === null) return;
    this.editor.setTool(TOOLS[index]);
    this.editor.focus();
  }

  private async pickColour(): Promise<void> {
    const index = await chooseFrom(this.screen, 'Colour', COLOUR_NAMES);
    if (index === null) return;
    this.editor.setBrush({ color: index });
    this.editor.focus();
  }

  private async pickCharacter(): Promise<void> {
    // Each row shows the glyph itself, drawn from the same marker the canvas
    // paints with, so the caller picks what he can see.
    const items = GRAPHIC_CODES.map((code) => `${String.fromCodePoint(0xe100 + code)}  ${code.toString(16).padStart(2, '0')}`);
    const index = await chooseFrom(this.screen, 'Character', items);
    if (index === null) return;
    this.editor.setBrush({ screenCode: GRAPHIC_CODES[index] });
    this.editor.focus();
  }

  private async clearScreen(): Promise<void> {
    if (!(await confirm(this.screen, 'Clear the whole screen?'))) {
      this.editor.focus();
      return;
    }
    this.editor.clear();
    this.editor.focus();
  }

  // ---- files -----------------------------------------------------------

  private async fileMenu(): Promise<void> {
    const actions = ['New', 'Open', 'Save', 'Save as'];
    if (isSysop(this.ctx)) actions.push('Open a board screen', 'Save to the board');

    const index = await chooseFrom(this.screen, 'File', actions);
    if (index === null) { this.editor.focus(); return; }

    switch (actions[index]) {
      case 'New': await this.newScreen(); break;
      case 'Open': await this.openOwn(); break;
      case 'Save': await this.save(); break;
      case 'Save as': await this.saveAs(); break;
      case 'Open a board screen': await this.openBoard(); break;
      case 'Save to the board': await this.saveToBoard(); break;
      default: break;
    }
    this.editor.focus();
  }

  private async newScreen(): Promise<void> {
    if (this.unsaved && !(await confirm(this.screen, 'Throw away the unsaved screen?'))) return;
    this.editor.clear();
    this.filename = null;
    this.target = 'own';
    this.unsaved = false;
    this.refreshSidebar();
  }

  private async openOwn(): Promise<void> {
    const names = await listOwnScreens(this.ctx);
    if (names.length === 0) {
      await notice(this.screen, 'Open', 'You have not saved a screen yet.');
      return;
    }
    const index = await chooseFrom(this.screen, 'Open', names);
    if (index === null) return;

    const bytes = await loadOwnScreen(this.ctx, names[index]);
    if (!bytes) {
      await notice(this.screen, 'Open', 'That screen could not be read.');
      return;
    }
    this.editor.fromSeq(bytes);
    this.filename = names[index];
    this.target = 'own';
    this.unsaved = false;
    this.refreshSidebar();
  }

  private async save(): Promise<void> {
    if (!this.filename) { await this.saveAs(); return; }
    if (this.target === 'board') { await this.writeToBoard(this.filename); return; }
    await saveOwnScreen(this.ctx, this.filename, this.editor.toSeq());
    this.unsaved = false;
    this.refreshSidebar();
  }

  private async saveAs(): Promise<void> {
    const typed = await promptText(this.screen, 'Save as', this.filename ?? '');
    if (!typed) return;
    this.filename = withSeqExtension(typed);
    this.target = 'own';
    await saveOwnScreen(this.ctx, this.filename, this.editor.toSeq());
    this.unsaved = false;
    this.refreshSidebar();
  }

  private async openBoard(): Promise<void> {
    const directory = await this.pickBoardDirectory();
    if (!directory) return;

    const files = await listBoardScreens(this.ctx, directory);
    if (files.length === 0) {
      await notice(this.screen, 'Open', `No .seq files in ${directory}.`);
      return;
    }
    const index = await chooseFrom(this.screen, directory, files);
    if (index === null) return;

    const path = `${directory}/${files[index]}`;
    const bytes = await loadBoardScreen(this.ctx, path);
    if (!bytes) {
      await notice(this.screen, 'Open', 'That screen could not be read.');
      return;
    }
    this.editor.fromSeq(bytes);
    this.filename = path;
    this.target = 'board';
    this.unsaved = false;
    this.refreshSidebar();
  }

  private async saveToBoard(): Promise<void> {
    const directory = await this.pickBoardDirectory();
    if (!directory) return;
    const typed = await promptText(this.screen, 'File name', this.filename?.split('/').pop() ?? '');
    if (!typed) return;
    await this.writeToBoard(`${directory}/${withSeqExtension(typed)}`);
  }

  /**
   * Write into the board's own art, or say why not.
   *
   * The refusal comes from `checkBoardRules` on the bytes - bank 1 only,
   * black background only - and it is the board's rule rather than this
   * door's opinion, which is why the caller is told the reason rather than
   * just refused.
   */
  private async writeToBoard(path: string): Promise<void> {
    const result = await saveBoardScreen(this.ctx, path, this.editor.toSeq());
    if (!result.saved) {
      await notice(this.screen, 'Not saved', result.reason ?? 'The board refused that screen.');
      return;
    }
    this.filename = path;
    this.target = 'board';
    this.unsaved = false;
    this.refreshSidebar();
  }

  private async pickBoardDirectory(): Promise<string | null> {
    const index = await chooseFrom(this.screen, 'Where', BBS_SCREEN_DIRS);
    return index === null ? null : BBS_SCREEN_DIRS[index];
  }

  // ---- leaving ---------------------------------------------------------

  private async leave(): Promise<void> {
    if (this.unsaved && !(await confirm(this.screen, 'Leave without saving?'))) {
      this.editor.focus();
      return;
    }
    this.destroy();
    this.exitResolve?.();
  }

  destroy(): void {
    try { this.terminalMode?.dispose(); } catch { /* leaving anyway */ }
    this.terminalMode = null;
    try { this.inputManager?.disable(); } catch { /* leaving anyway */ }
    try { (this.ctx as any).bbs?.disableMouseEvents?.(); } catch { /* leaving anyway */ }
    try { this.editor?.destroy(); } catch { /* leaving anyway */ }
    this.editor = null;
    try { this.sidebar?.destroy(); } catch { /* leaving anyway */ }
    this.sidebar = null;
    try { this.screen?.destroy(); } catch { /* leaving anyway */ }
  }
}

/** The palette a host can show beside the editor, in VIC order. */
export const STUDIO_PALETTE = C64_PALETTE_COLODORE;
