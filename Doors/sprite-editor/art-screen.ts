/**
 * Art mode: 'm' on a selected door lists its .ans files (plus a
 * '[new file]' row) and opens the pick in the full ANSIEditor engine,
 * full-screen. Same discipline as EditScreen: this object binds its own
 * screen-level keys and removes them on destroy, so the browser's own
 * bindings come back untouched when it leaves.
 *
 * Two phases, not one screen: a small centred list first (so a file can be
 * picked or a new name typed), then the editor takes the whole screen.
 * screen.key() handlers are GLOBAL - they fire regardless of focus - so
 * the list's keys are unbound before the editor's own internal bindings
 * take over; leaving both live would race Enter/Escape between the two.
 */

import blessed, { ANSIEditor } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { listArt, readArt, writeArt } from './assets';
import { promptText } from './dialogs';
import { buildBindingSet, BindingSet, StudioBinding } from './bindings';
import { createStudioMenuBar } from './menu';
import { T } from './door-theme';

/**
 * The content to open for a typed new-file name.
 *
 * A name that COLLIDES with a file already on disk must open THAT file's
 * real content, never a blank canvas - the [new file] flow used to hand
 * the editor `''` unconditionally, so naming an existing file opened it
 * blank and the first save silently replaced the real .ans with nothing.
 * Same latin1 path readArt/the normal open already use. Exported as a
 * pure function of (door, existing files, typed name) so the collision
 * decision is assertable without a blessed screen.
 */
export function newFileContent(door: string, files: string[], name: string): string {
  const file = `${name}.ans`;
  if (!files.includes(file)) return '';
  try { return readArt(door, file).toString('latin1'); } catch { return ''; }
}

export class ArtSession {
  private screen: any;
  private door: string;
  private onExit: () => void;

  private listBox: any = null;
  private editor: any = null;
  private files: string[] = [];
  private selected = 0;
  private keyHandlers: Array<[string[], (...args: any[]) => void]> = [];
  private menuBar: any = null;
  private bindingSet!: BindingSet;

  constructor(screen: any, door: string, onExit: () => void) {
    this.screen = screen;
    this.door = door;
    this.onExit = onExit;
    this.showList();
  }

  /** Bind one screen-key group, remembered so unbindKeys can remove it. */
  private key(keys: string[], handler: (...args: any[]) => void): void {
    this.screen.key(keys, handler);
    this.keyHandlers.push([keys, handler]);
  }

  private unbindKeys(): void {
    for (const [keys, handler] of this.keyHandlers) {
      if (keys[0] === '__keypress__') this.screen.removeListener('keypress', handler);
      else this.screen.unkey(keys, handler);
    }
    this.keyHandlers = [];
  }

  /** items(): the door's .ans files, sorted, plus the trailing new-file row. */
  private items(): string[] {
    return [...this.files, '[new file]'];
  }

  /**
   * The picker's table - Task 7 (controller audit gap 3): this list used
   * to bind up/k, down/j, enter, escape directly via this.key(), with NO
   * menu at all. Handler bodies below are moved verbatim from that old
   * this.key() wiring (same dialogOpen guard, same behaviour) - only WHERE
   * they are declared changed. dialogOpen (dialogs.ts) is the same guard
   * edit-screen.ts's opKey() uses: screen.key() bindings are GLOBAL (fire
   * regardless of focus - see this file's own module doc comment), so the
   * physical keystrokes a promptText dialog's own Textbox is consuming
   * would otherwise ALSO reach these handlers.
   */
  private buildListBindings(): StudioBinding[] {
    return [
      { id: 'file.openSelected', keys: ['enter'], hotkeyHint: 'enter', menu: 'File', label: 'Open Selected',
        handler: async () => {
          if (this.screen.dialogOpen) return;
          const isNewFile = this.selected === this.items().length - 1;
          if (isNewFile) {
            const name = await promptText(this.screen, 'New file name');
            if (name === null) return; // ESC cancelled
            this.openEditor(`${name}.ans`, newFileContent(this.door, this.files, name));
            return;
          }
          const file = this.files[this.selected];
          let content = '';
          try { content = readArt(this.door, file).toString('latin1'); } catch { content = ''; }
          this.openEditor(file, content);
        } },
      // 'q' is NOT bound here (unlike the browser's own quit key): a typed
      // filename must be free to contain the letter q, and the promptText
      // dialog owns its own text field's keystrokes anyway. Escape alone
      // exits the list.
      { id: 'file.cancel', keys: ['escape'], hotkeyHint: 'esc', menu: 'File', label: 'Cancel',
        handler: () => {
          if (this.screen.dialogOpen) return; // the dialog's own ESC handles its own cancel
          this.exit();
        } },
      { id: 'nav.up', keys: ['up', 'k'], hotkeyHint: 'up/k', menu: 'Navigate', label: 'Up',
        handler: () => {
          if (this.screen.dialogOpen) return;
          this.selected = Math.max(0, this.selected - 1);
          this.paint();
        } },
      { id: 'nav.down', keys: ['down', 'j'], hotkeyHint: 'down/j', menu: 'Navigate', label: 'Down',
        handler: () => {
          if (this.screen.dialogOpen) return;
          this.selected = Math.min(this.items().length - 1, this.selected + 1);
          this.paint();
        } },
    ];
  }

  private showList(): void {
    this.files = listArt(this.door);
    this.listBox = blessed.list({
      parent: this.screen,
      top: 'center', left: 'center', width: '50%', height: '50%',
      label: ` Art: ${this.door} `,
      border: { type: 'line' },
      tags: true, keys: false, mouse: false,
      style: {
        border: { fg: 'lightyellow' },
        selected: { bg: T.bar, fg: 'lightyellow', bold: true },
        item: { fg: T.ink },
      },
    });
    this.selected = 0;
    this.paint();

    // Same isBlocked wiring as edit-screen.ts/app.ts's own bindKeys(): the
    // guard lives in bindings.ts's buildBindingSet so screen.key()
    // registration (this loop) and a future menu-mouse dispatch share the
    // identical guarded handler - see bindings.ts's module doc comment.
    this.bindingSet = buildBindingSet(this.buildListBindings(), () => this.screen.dialogOpen);
    for (const binding of this.bindingSet.bindings) this.key(binding.keys, binding.handler);

    // Studio 2c menu bar, same pattern as EditScreen/StudioApp - built from
    // the identical guarded bindingSet the keys above wire from, so there
    // is one dispatch path, not two.
    this.menuBar = createStudioMenuBar(this.screen, this.bindingSet.menuItems());
  }

  private paint(): void {
    this.listBox.setItems(this.items());
    this.listBox.select(this.selected);
    this.screen.render();
  }

  /**
   * List phase -> editor phase: the list's keys die before the editor's
   * own take over. The picker's OWN menu bar must die here too, not just
   * hide - the ANSIEditor is opened with `showMenuBar: true` of its own,
   * and this ArtSession never returns to the list phase once the editor is
   * open (the editor's only onExit path is a full session exit - see
   * exit() below), so there is nothing to restore it FOR. Destroying it
   * (rather than merely hiding it) is the strongest form of "not live
   * underneath the editor's own bar": a destroyed element is detached from
   * the screen tree entirely, so it can never be found by the real mouse
   * hit-test path either - proven in art-screen.test.ts's
   * thePickerMenuBarDoesNotOutliveTheListPhase against a REAL Screen, the
   * same hit-test proof app-shape.test.ts uses for the browser's own menu
   * bar sleeping under EditScreen/ArtSession.
   */
  private openEditor(file: string, content: string): void {
    this.unbindKeys();
    this.listBox?.destroy();
    this.listBox = null;
    this.menuBar?.destroy();
    this.menuBar = null;

    this.editor = new ANSIEditor({
      parent: this.screen,
      top: 0, left: 0, width: '100%', height: '100%',
      title: `Art: ${this.door}/${file}`,
      initialContent: content,
      initialMode: 'draw',
      showLineNumbers: false,
      showMenuBar: true,
      showToolbar: true,
      showSidebar: true,
      showStatusBar: true,
      onSave: async (text: string) => {
        try {
          // The widget moves cell chars 1:1 through this string with no
          // CP437/UTF-8 re-encoding of its own (parseANSIToCanvas and
          // canvasToANSI both copy cell.char verbatim), so the round trip
          // to Buffer must be byte-preserving too - 'latin1', the encoding
          // this codebase already uses everywhere raw Amiga bytes cross a
          // JS string boundary. UTF-8 here would mangle every high-bit byte,
          // the exact class of bug logged against the Edit/Write tools.
          writeArt(this.door, file, Buffer.from(text, 'latin1'));
          return true;
        } catch (error) {
          console.error(`[sprite-editor] art save failed for ${this.door}/${file}:`, error);
          return false;
        }
      },
      onExit: () => {
        this.exit();
      },
    });
    this.editor.focus();
    this.screen.render();
  }

  private exit(): void {
    this.destroy();
    this.onExit();
  }

  destroy(): void {
    this.unbindKeys();
    this.listBox?.destroy();
    this.listBox = null;
    // Idempotent: openEditor() already destroys/nulls this.menuBar before
    // the editor phase begins, so this is a no-op by then - but the
    // ordinary "File > Cancel"/escape exit from the LIST phase (never
    // having opened the editor at all) reaches destroy() with the picker's
    // menu bar still alive, and it must die with everything else this
    // session owns.
    this.menuBar?.destroy();
    this.menuBar = null;
    this.editor?.destroy();
    this.editor = null;
  }
}
