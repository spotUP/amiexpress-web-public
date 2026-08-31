/**
 * Sprite Studio - the browser + preview UI.
 *
 * Layout (percentage-based, reflowing on the backend's screen:resize the
 * way livechat does):
 *
 *   +----------------+----------------+--------------------------------+
 *   | DOORS 25%      | SPRITES 25%    | PREVIEW (rest)                 |
 *   |                +----------------+  the selected animation,       |
 *   |                | ANIMATIONS     |  playing at its own speed,     |
 *   |                |                |  fat pixels (scale 2)          |
 *   +----------------+----------------+--------------------------------+
 *   | status: door/sprite/animation | TAB panes  ARROWS move  Q quit   |
 *   +-------------------------------------------------------------------+
 *
 * All selection logic lives in browser-model (tested); all pixels live in
 * preview (tested). This file is glue and stays that way.
 */

import type { DoorContext } from '@amiexpress/bbs-door-sdk/core/types';
import { createScreen, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import blessed, { ANSIEditor } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  BrowserState, initialState, moveSelection, cyclePane, selection,
} from './browser-model';
import { previewLines } from './preview';
import { readSprite, listArt, readArt, writeArt } from './assets';
import { EditScreen } from './edit-screen';
import type { Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';

/** Preview frame advance, in ms - matches the arcade doors' tick feel. */
const PLAYBACK_MS = 100;

export class StudioApp {
  private ctx: DoorContext;
  private screen: any = null;
  private inputManager: any = null;
  private state: BrowserState = null as any;

  private doorsList: any = null;
  private spritesList: any = null;
  private animationsList: any = null;
  private previewBox: any = null;
  private statusBar: any = null;

  private playback: ReturnType<typeof setInterval> | null = null;
  /** Resolves start()'s stay-alive promise; the door exits when it fires. */
  private exitResolve: (() => void) | null = null;
  private tick = 0;
  /** The loaded sheet for the current selection, cached per selection. */
  private loaded: { key: string; sprite: Sprite } | null = null;
  private editScreen: EditScreen | null = null;
  private artSession: ArtSession | null = null;

  constructor(ctx: DoorContext) {
    this.ctx = ctx;
  }

  async start(): Promise<void> {
    this.screen = createScreen((this.ctx as any).bbs, {
      title: 'Sprite Studio',
      responsive: true,
    });
    this.screen.program.write('\x1b[2J');
    this.screen.program.write('\x1b[H');
    this.inputManager = new DoorInputManager(this.ctx as any, this.screen, {
      enableGameMode: false,
      enableGrabKeys: false,
      enableMouse: true,
    });
    // enable() installs the BBS-to-blessed key bridge
    // (bbsSession.doorInputHandler); without it the backend drops every
    // keystroke and the door is input-dead - constructed is not enabled.
    // Every sibling blessed door calls this (ansi-editor, door-manager).
    this.inputManager.enable();

    this.state = initialState();
    this.buildLayout();
    this.bindKeys();
    this.refresh();

    // The playback loop only advances the tick; previewLines owns what a
    // tick looks like, and the tests own previewLines.
    this.playback = setInterval(() => {
      this.tick++;
      this.paintPreview();
    }, PLAYBACK_MS);

    // Hold the door OPEN. CoreDoor.execute() only awaits its input loop
    // when a door registers onInput handlers; this door routes every key
    // through the blessed screen instead, so without this await execute()
    // falls straight through to the close handlers - reported live as
    // "it just cleared the screen". The ANSI editor holds itself open the
    // same way. The promise resolves on destroy, whichever path calls it.
    await new Promise<void>((resolve) => {
      this.exitResolve = resolve;
      this.screen.once('destroy', resolve);
    });
  }

  private buildLayout(): void {
    this.doorsList = blessed.list({
      parent: this.screen,
      top: 0, left: 0, width: '25%', height: '90%',
      label: ' Doors ',
      border: { type: 'line' },
      tags: true, keys: false, mouse: false,
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'lightyellow', bold: true },
        item: { fg: 'white' },
      },
    });
    this.spritesList = blessed.list({
      parent: this.screen,
      top: 0, left: '25%', width: '25%', height: '45%',
      label: ' Sprites ',
      border: { type: 'line' },
      tags: true, keys: false, mouse: false,
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'lightyellow', bold: true },
        item: { fg: 'white' },
      },
    });
    this.animationsList = blessed.list({
      parent: this.screen,
      top: '45%', left: '25%', width: '25%', height: '45%',
      label: ' Animations ',
      border: { type: 'line' },
      tags: true, keys: false, mouse: false,
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'lightyellow', bold: true },
        item: { fg: 'white' },
      },
    });
    this.previewBox = blessed.box({
      parent: this.screen,
      top: 0, left: '50%', width: '50%', height: '90%',
      label: ' Preview ',
      border: { type: 'line' },
      tags: true,
      style: { border: { fg: 'green' } },
    });
    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 0, left: 0, width: '100%', height: 1,
      tags: true,
    });
  }

  private bindKeys(): void {
    // The screen drives everything; the widgets' own keys stay off, the
    // way every arcade door learned to (a widget's keys:true never fires
    // when input is routed by the door).
    this.screen.key(['up', 'k'], () => this.apply(moveSelection(this.state, -1)));
    this.screen.key(['down', 'j'], () => this.apply(moveSelection(this.state, 1)));
    this.screen.key(['pageup'], () => this.apply(moveSelection(this.state, -10)));
    this.screen.key(['pagedown'], () => this.apply(moveSelection(this.state, 10)));
    this.screen.key(['tab', 'right'], () => this.apply(cyclePane(this.state, 1)));
    this.screen.key(['S-tab', 'left'], () => this.apply(cyclePane(this.state, -1)));
    this.screen.key(['q', 'escape', 'C-c'], () => {
      if (this.editScreen || this.artSession) return;
      this.destroy();
      void this.ctx.close();
    });
    this.screen.key(['e'], () => {
      const sel = selection(this.state);
      const sprite = this.currentSprite();
      if (!sel.door || !sel.sprite || !sprite || this.editScreen || this.artSession) return;
      // The browser sleeps while the editor owns the screen: its panes
      // hide and its playback pauses, so two timers never fight over
      // render() and apply() ignores keys while the editor is open, so
      // the browser's own bindings cannot drift the selection underneath it.
      if (this.playback) { clearInterval(this.playback); this.playback = null; }
      for (const w of [this.doorsList, this.spritesList, this.animationsList,
                       this.previewBox, this.statusBar]) w.hide();
      this.editScreen = new EditScreen(this.screen, sel.door, sel.sprite, sprite, () => {
        this.editScreen = null;
        for (const w of [this.doorsList, this.spritesList, this.animationsList,
                         this.previewBox, this.statusBar]) w.show();
        this.loaded = null; // the sprite may have been saved - reload it
        this.playback = setInterval(() => { this.tick++; this.paintPreview(); }, PLAYBACK_MS);
        this.refresh();
      });
    });
    this.screen.key(['m'], () => {
      const sel = selection(this.state);
      if (!sel.door || this.editScreen || this.artSession) return;
      // Same sleep/wake contract as 'e': panes hide and playback pauses
      // while the art session owns the screen, and apply() ignores keys
      // while it is open (see below) so the browser cannot drift underneath
      // it. listArt(door) plus the '[new file]' row is never empty, so
      // there is no black-screen risk in hiding before the list paints -
      // the same reasoning the ansi-editor door's showFileBrowser relies on.
      if (this.playback) { clearInterval(this.playback); this.playback = null; }
      for (const w of [this.doorsList, this.spritesList, this.animationsList,
                       this.previewBox, this.statusBar]) w.hide();
      this.artSession = new ArtSession(this.screen, sel.door, () => {
        this.artSession = null;
        for (const w of [this.doorsList, this.spritesList, this.animationsList,
                         this.previewBox, this.statusBar]) w.show();
        this.playback = setInterval(() => { this.tick++; this.paintPreview(); }, PLAYBACK_MS);
        this.refresh();
      });
    });
  }

  private apply(next: BrowserState): void {
    // Blessed fires EVERY handler bound to a key, so while the edit
    // screen owns the arrows and tab, the browser's own bindings still
    // run - and were mutating the selection underneath the editor.
    // Every navigation key funnels through here; one guard covers them.
    if (this.editScreen) return;
    // Art mode owns the screen the same way while it is open.
    if (this.artSession) return;
    if (next === this.state) return;
    const before = selection(this.state);
    this.state = next;
    const after = selection(next);
    if (before.door !== after.door || before.sprite !== after.sprite ||
        before.animation !== after.animation) {
      this.tick = 0; // a new SELECTION starts from the top; a focus move does not
    }
    this.refresh();
  }

  /** The current sheet, loaded once per (door, sprite) selection. */
  private currentSprite(): Sprite | null {
    const sel = selection(this.state);
    if (!sel.door || !sel.sprite) return null;
    const key = `${sel.door}/${sel.sprite}`;
    if (this.loaded?.key !== key) {
      try {
        this.loaded = { key, sprite: readSprite(sel.door, sel.sprite) };
      } catch {
        this.loaded = null; // a malformed sheet previews as empty
      }
    }
    return this.loaded?.sprite ?? null;
  }

  private refresh(): void {
    const focus = (list: any, on: boolean) => {
      list.style.border.fg = on ? 'lightyellow' : 'cyan';
    };
    this.doorsList.setItems(this.state.doors);
    this.doorsList.select(this.state.doorIndex);
    // Display the sprite NAMES - 'diamond', not 'diamond.sprite.json'.
    // The filenames are 19+ characters and the pane's inner width at 80
    // columns is 18, so the full names wrapped and every row went ragged
    // (reported with a screenshot). The model keeps real filenames; only
    // the display strips the suffix.
    this.spritesList.setItems(
      this.state.sprites.map(f => f.replace(/\.sprite\.json$/, ''))
    );
    this.spritesList.select(this.state.spriteIndex);
    this.animationsList.setItems(this.state.animations);
    this.animationsList.select(this.state.animationIndex);
    focus(this.doorsList, this.state.pane === 'doors');
    focus(this.spritesList, this.state.pane === 'sprites');
    focus(this.animationsList, this.state.pane === 'animations');

    const sel = selection(this.state);
    const left =
      `{lightyellow-fg}${sel.door ?? '-'}{/} / ` +
      `{white-fg}${sel.sprite ?? '-'}{/} / ` +
      `{lightcyan-fg}${sel.animation ?? '-'}{/}`;
    const right = '{gray-fg}TAB panes  ARROWS move  Q quit{/}';
    const visible = (tagged: string) => tagged.replace(/\{[^}]*\}/g, '').length;
    // Clamp to the real width: if the two segments cannot fit on one row,
    // drop the hint rather than let the row wrap into the panes above.
    const width = Number(this.screen.width) || 80;
    const both = visible(left) + visible(right);
    if (both < width) {
      this.statusBar.setContent(left + ' '.repeat(width - both) + right);
    } else {
      this.statusBar.setContent(left);
    }
    this.paintPreview();
  }

  private paintPreview(): void {
    const sel = selection(this.state);
    const sprite = this.currentSprite();
    if (!sprite || !sel.animation) {
      this.previewBox.setContent('{gray-fg}nothing to preview{/}');
      this.screen.render();
      return;
    }
    const anim = sprite.animations[sel.animation];
    const lines = previewLines(sprite, sel.animation, this.tick, 2);
    const inner = Math.max(1, (this.previewBox.width as number) - 2);
    const pad = ' '.repeat(Math.max(0, Math.floor((inner - sprite.cellW * 2) / 2)));
    // ASCII separators, short words: the middle dot rendered as a quote
    // on the live terminal, and the long form wrapped inside the pane.
    const meta =
      `{gray-fg}${sprite.name} - ${sel.animation} - ` +
      `${anim.frames.length}f ${anim.ticksPerFrame}tpf ` +
      `${anim.loop ? 'loop' : 'hold'}{/}`;
    this.previewBox.setContent(
      '\n' + lines.map(l => pad + l).join('\n') + '\n\n ' + meta
    );
    this.screen.render();
  }

  destroy(): void {
    if (this.playback) {
      clearInterval(this.playback);
      this.playback = null;
    }
    this.editScreen?.destroy();
    this.editScreen = null;
    this.artSession?.destroy();
    this.artSession = null;
    if (this.inputManager) { this.inputManager.disable(); this.inputManager = null; }
    if (this.screen) {
      // removeAllListeners would also strip the stay-alive 'destroy'
      // listener, so resolve it by hand - destroy must ALWAYS release
      // start()'s await, or the door hangs instead of exiting.
      this.screen.removeAllListeners();
      this.screen.destroy();
      this.screen = null;
    }
    if (this.exitResolve) {
      this.exitResolve();
      this.exitResolve = null;
    }
  }
}

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
class ArtSession {
  private screen: any;
  private door: string;
  private onExit: () => void;

  private listBox: any = null;
  private editor: any = null;
  private files: string[] = [];
  private selected = 0;
  private naming: string | null = null; // non-null while typing a new file name
  private keyHandlers: Array<[string[], (...args: any[]) => void]> = [];

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
        selected: { bg: 'blue', fg: 'lightyellow', bold: true },
        item: { fg: 'white' },
      },
    });
    this.selected = 0;
    this.paint();

    this.key(['up', 'k'], () => {
      if (this.naming !== null) return;
      this.selected = Math.max(0, this.selected - 1);
      this.paint();
    });
    this.key(['down', 'j'], () => {
      if (this.naming !== null) return;
      this.selected = Math.min(this.items().length - 1, this.selected + 1);
      this.paint();
    });
    this.key(['enter'], () => {
      if (this.naming !== null) {
        const name = this.naming;
        if (!name) return; // the pattern is [a-z0-9-]+; an empty name stays in naming
        this.naming = null;
        this.openEditor(`${name}.ans`, '');
        return;
      }
      const isNewFile = this.selected === this.items().length - 1;
      if (isNewFile) {
        this.naming = '';
        this.paint();
        return;
      }
      const file = this.files[this.selected];
      let content = '';
      try { content = readArt(this.door, file).toString('latin1'); } catch { content = ''; }
      this.openEditor(file, content);
    });
    this.key(['backspace', 'delete'], () => {
      if (this.naming === null) return;
      this.naming = this.naming.slice(0, -1);
      this.paint();
    });
    // 'q' is NOT bound here (unlike the browser's own quit key): a typed
    // filename must be free to contain the letter q. Escape alone cancels,
    // the same restriction EditScreen's naming flow already lives with.
    this.key(['escape'], () => {
      if (this.naming !== null) { this.naming = null; this.paint(); return; }
      this.exit();
    });

    // Typed characters extend the new-file name while naming; the same
    // [a-z0-9-] pattern EditScreen's '+' animation-naming uses.
    const onKeypress = (ch: string) => {
      if (this.naming === null) return;
      if (!ch || ch.length !== 1) return;
      if (/[a-z0-9-]/.test(ch)) { this.naming += ch; this.paint(); }
    };
    this.screen.on('keypress', onKeypress);
    this.keyHandlers.push([['__keypress__'], onKeypress]);
  }

  private paint(): void {
    const items = this.naming !== null
      ? [...this.files, `[new file: ${this.naming}_]`]
      : this.items();
    this.listBox.setItems(items);
    this.listBox.select(this.selected);
    this.screen.render();
  }

  /** List phase -> editor phase: the list's keys die before the editor's own take over. */
  private openEditor(file: string, content: string): void {
    this.unbindKeys();
    this.listBox?.destroy();
    this.listBox = null;

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
    this.editor?.destroy();
    this.editor = null;
  }
}
