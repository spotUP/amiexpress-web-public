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
import { PetsciiEditor, type PetsciiTool } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createScreen, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { createTerminalModeSwitch, type TerminalModeSwitch } from '@amiexpress/bbs-door-sdk/utils/terminal-mode';
import { C64_PALETTE_COLODORE } from '@amiexpress/bbs-door-sdk/petscii';
import { applyTheme, T } from './door-theme';
import { promptText, chooseFrom, notice, helpScreen, confirm } from './dialogs';
import {
  BBS_SCREEN_DIRS, isSysop, listOwnScreens, loadOwnScreen, saveOwnScreen,
  listBoardScreens, loadBoardScreen, saveBoardScreen, withSeqExtension,
} from './assets';

export class PetsciiStudioDoor {
  private ctx!: DoorContext;
  private screen: any;
  private inputManager: any;
  private terminalMode: TerminalModeSwitch | null = null;

  /** Public so the door's own test can see the editor was built. */
  editor: any = null;

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

    // The first thing a caller sees, because nothing on an empty canvas says
    // which key draws a corner ("petscii edit needs a help screen when it
    // starts", the sysop, 2026-09-23). Dismissed with a keypress, and F1 says
    // it again later.
    await this.showHelp();
    this.editor.focus();

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
      // Ctrl+C and a Ctrl+K palette pick end the studio the way leave() does
      // once it is past its unsaved-work question: the board has already
      // decided, so there is no one to ask.
      onClose: () => { this.destroy(); this.exitResolve?.(); },
    });

    this.screen.render();
  }

  /**
   * Build the editor at the screen's current size, keeping the art.
   *
   * The widget decides where its own chrome goes and centres the forty-column
   * picture in what is left, so this hands it the whole screen and a set of
   * callbacks rather than laying anything out itself.
   */
  private openEditor(): void {
    const surface = this.editor?.getSurface();
    const tool: PetsciiTool = this.editor?.tool ?? 'draw';
    const brush = this.editor?.brush;

    this.editor?.destroy();

    /*
     * THE WIDGET TAKES THE WHOLE SCREEN, and lays its own chrome out inside
     * it - menu bar, character row, sidebar, status line, and the art centred
     * in what is left. That is the ANSI editor's arrangement, which is what
     * the sysop asked for ("the same layout as ansi edit but adapted for
     * petscii"), and it is why this door no longer draws a panel of its own:
     * two status lines saying the same thing is what the fork base had.
     */
    this.editor = new PetsciiEditor({
      parent: this.screen,
      top: 0,
      left: 0,
      width: this.screen.width,
      height: this.screen.height,
      surface,
      tool,
      brush,
      hostMenus: isSysop(this.ctx) ? [this.boardMenu()] : [],
      onOpen: () => { void this.openOwn(); },
      onSave: () => { void this.save(); },
      onSaveAs: () => { void this.saveAs(); },
      onExit: () => { void this.leave(); },
      onHelp: () => { void this.showHelp(); },
    } as any);

    this.editor.on('change', () => { this.unsaved = true; });

    this.editor.focus();
    this.screen.render();
  }

  /** The board's own art, for a sysop: its own menu on the bar. */
  private boardMenu(): { label: string; items: Array<{ label: string; action: () => void }> } {
    return {
      label: 'Board',
      items: [
        { label: 'Open a board screen', action: () => { void this.openBoard(); } },
        { label: 'Save to the board', action: () => { void this.saveToBoard(); } },
      ],
    };
  }

  private relayout(): void {
    this.openEditor();
  }

  // ---- the requesters --------------------------------------------------

  /**
   * The keys the DOOR owns.
   *
   * F2 and F5 to F8 belong to the editor widget - they hide and show its four
   * parts, and a door that also bound them would fight it. What is left here
   * is help, the two history keys a caller reaches for constantly, and the way
   * out. Everything else lives on the menu bar, which F5 puts back when it has
   * been hidden.
   */
  private bindHotkeys(): void {
    const guarded = (action: () => void | Promise<void>) => () => {
      if (this.screen.dialogOpen) return;
      void action();
    };

    this.screen.key(['f1'], guarded(() => this.showHelp()));
    this.screen.key(['f3'], guarded(() => { this.editor?.undo(); }));
    this.screen.key(['f4'], guarded(() => { this.editor?.redo(); }));
    this.screen.key(['escape'], guarded(() => this.leave()));
  }

  /**
   * The keys, in full words, on one page.
   *
   * Written for a C64's own keyboard, because that is what the chords are:
   * CTRL and a digit for the first eight colours, the Commodore key for the
   * other eight and for the graphics. On a PC keyboard the Commodore key is
   * played by Alt, which is the one substitution a caller has to be told.
   */
  private helpLines(): string[] {
    return [
      '  PETSCII STUDIO',
      '',
      '  DRAWING',
      '   Arrows         Move the cursor',
      '   Return, Space  Draw at the cursor',
      '   Mouse          Draw by pointing',
      '   Delete         Blank the cell',
      '',
      '  PICKING',
      '   The character row is the character',
      '   picker; the tool row carries the',
      '   sixteen colours. Click one.',
      '',
      '  COLOUR AND CHARACTERS',
      '   CTRL and 1-8   The first eight colours',
      '   C= and 1-8     The other eight colours',
      '   CTRL and 9, 0  Reverse on and off',
      '   C= and letter  A graphic character',
      '   (C= is played by Alt on a PC)',
      '',
      '  THE INTERFACE',
      '   F2   Hide it all, or bring it back',
      '   F5   Open the menu   F6  Characters',
      '   F7   The tool row    F8  Status line',
      '',
      '  THE REST',
      '   F1 Help   F3 Undo   F4 Redo',
      '   Escape    Leave the editor',
      '',
      '  Press Return to start drawing',
    ];
  }

  private async showHelp(): Promise<void> {
    await helpScreen(this.screen, this.helpLines());
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
    this.editor?.layout();
  }

  private async save(): Promise<void> {
    if (!this.filename) { await this.saveAs(); return; }
    if (this.target === 'board') { await this.writeToBoard(this.filename); return; }
    await saveOwnScreen(this.ctx, this.filename, this.editor.toSeq());
    this.unsaved = false;
    this.editor?.layout();
  }

  private async saveAs(): Promise<void> {
    const typed = await promptText(this.screen, 'Save as', this.filename ?? '');
    if (!typed) return;
    this.filename = withSeqExtension(typed);
    this.target = 'own';
    await saveOwnScreen(this.ctx, this.filename, this.editor.toSeq());
    this.unsaved = false;
    this.editor?.layout();
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
    this.editor?.layout();
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
    this.editor?.layout();
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
    try { this.screen?.destroy(); } catch { /* leaving anyway */ }
  }
}

/** The palette a host can show beside the editor, in VIC order. */
export const STUDIO_PALETTE = C64_PALETTE_COLODORE;
