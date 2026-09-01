/**
 * Sprite Studio - the browser + preview UI.
 *
 * Layout (Studio 2c: integer rows/cols from layout.ts's LAYOUT.browser -
 * no percent strings; see layout.ts's comment for why the old percent
 * layout was unsafe):
 *
 *   row 0:  menu bar
 *   +----------------+----------------+--------------------------------+
 *   | DOORS          | SPRITES        | PREVIEW (rest)                 |
 *   |                +----------------+  the selected animation,       |
 *   |                | ANIMATIONS     |  playing at its own speed,     |
 *   |                |                |  fat pixels (scale 2)          |
 *   +----------------+----------------+--------------------------------+
 *   rows 20-23: reserved headroom (future floating/minimized panels)
 *   row 24: status: door/sprite/animation | TAB panes  ARROWS move  Q quit
 *
 * All selection logic lives in browser-model (tested); all pixels live in
 * preview (tested). This file is glue and stays that way.
 */

import type { DoorContext } from '@amiexpress/bbs-door-sdk/core/types';
import { createScreen, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  BrowserState, initialState, moveSelection, cyclePane, selection,
} from './browser-model';
import { previewLines } from './preview';
import { readSprite } from './assets';
import { EditScreen } from './edit-screen';
import { ArtSession } from './art-screen';
import type { Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { buildBindingSet, BindingSet, StudioBinding } from './bindings';
import { LAYOUT } from './layout';
import { createStudioMenuBar } from './menu';

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
  private menuBar: any = null;
  /** Double-click gate for the sprites list - see wireMouseSelection(). */
  private lastSpriteClick: { index: number; at: number } = { index: -1, at: 0 };

  private playback: ReturnType<typeof setInterval> | null = null;
  /** Resolves start()'s stay-alive promise; the door exits when it fires. */
  private exitResolve: (() => void) | null = null;
  private tick = 0;
  /** The loaded sheet for the current selection, cached per selection. */
  private loaded: { key: string; sprite: Sprite } | null = null;
  private editScreen: EditScreen | null = null;
  private artSession: ArtSession | null = null;
  private bindingSet!: BindingSet;

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
    // bindKeys() first: it builds this.bindingSet, which buildLayout()
    // needs for the menu bar's items. See EditScreen's constructor for
    // the identical reasoning (neither call touches a widget).
    this.bindKeys();
    this.buildLayout();
    this.wireMouseSelection();
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
    const { doors, sprites, animations, preview, status } = LAYOUT.browser;
    this.doorsList = blessed.list({
      parent: this.screen,
      top: doors.top, left: doors.left, width: doors.width, height: doors.height,
      label: ' Doors ',
      border: { type: 'line' },
      // keys stay off: the door drives every key through the screen (see
      // the class comment on buildBindings), so a widget's own keys never
      // fire. mouse:true is new (Studio 2c): click-to-select, wired below
      // in wireMouseSelection() through the SAME handlers as arrow/enter.
      tags: true, keys: false, mouse: true,
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'lightyellow', bold: true },
        item: { fg: 'white' },
      },
    });
    this.spritesList = blessed.list({
      parent: this.screen,
      top: sprites.top, left: sprites.left, width: sprites.width, height: sprites.height,
      label: ' Sprites ',
      border: { type: 'line' },
      tags: true, keys: false, mouse: true,
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'lightyellow', bold: true },
        item: { fg: 'white' },
      },
    });
    this.animationsList = blessed.list({
      parent: this.screen,
      top: animations.top, left: animations.left, width: animations.width, height: animations.height,
      label: ' Animations ',
      border: { type: 'line' },
      tags: true, keys: false, mouse: true,
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'lightyellow', bold: true },
        item: { fg: 'white' },
      },
    });
    this.previewBox = blessed.box({
      parent: this.screen,
      top: preview.top, left: preview.left, width: preview.width, height: preview.height,
      label: ' Preview ',
      border: { type: 'line' },
      tags: true, mouse: true,
      style: { border: { fg: 'green' } },
    });
    this.statusBar = blessed.box({
      parent: this.screen,
      top: status.top, left: status.left, width: status.width, height: status.height,
      tags: true,
    });
    // Created LAST, purely additive - no existing screen.children[N]
    // index shifts under it.
    this.menuBar = createStudioMenuBar(this.screen, this.bindingSet.menuItems());
  }

  /**
   * Browser mouse selection (Studio 2c). No new selection logic: a click
   * on a row reuses moveSelection/cyclePane through this.apply(), the
   * exact path arrow keys already take, and a double-click on a sprite
   * calls the SAME 'studio.edit' binding handler 'e' invokes - found by
   * id in this.bindingSet.bindings, not a second copy of the handler.
   */
  private wireMouseSelection(): void {
    const PANE_ORDER: BrowserState['pane'][] = ['doors', 'sprites', 'animations'];

    /** Step this.state to the target pane using ONLY cyclePane, forward. */
    const focusPane = (pane: BrowserState['pane']): void => {
      const steps = (PANE_ORDER.indexOf(pane) - PANE_ORDER.indexOf(this.state.pane) + 3) % 3;
      for (let i = 0; i < steps; i++) this.apply(cyclePane(this.state, 1));
    };

    const wirePane = (list: any, pane: BrowserState['pane'], indexOf: (s: BrowserState) => number): void => {
      list.on('select', (_item: string, clickedIndex: number) => {
        if (this.editScreen || this.artSession) return;
        focusPane(pane);
        const indexDelta = clickedIndex - indexOf(this.state);
        if (indexDelta !== 0) this.apply(moveSelection(this.state, indexDelta));
      });
    };
    wirePane(this.doorsList, 'doors', (s) => s.doorIndex);
    wirePane(this.animationsList, 'animations', (s) => s.animationIndex);

    // Sprites gets the same click-to-select PLUS a hand-rolled double-
    // click gate (this SDK's List has no built-in dblclick - see
    // dockable-panel.ts's identical closure-timestamp pattern) that opens
    // the editor through the exact 'e' binding handler (found by id, the
    // same function reference the 'e' key already dispatches - not a
    // second copy of it).
    this.spritesList.on('select', (_item: string, clickedIndex: number) => {
      if (this.editScreen || this.artSession) return;
      focusPane('sprites');
      const indexDelta = clickedIndex - this.state.spriteIndex;
      if (indexDelta !== 0) this.apply(moveSelection(this.state, indexDelta));

      const now = Date.now();
      const isDoubleClick = clickedIndex === this.lastSpriteClick.index &&
        now - this.lastSpriteClick.at < 400;
      this.lastSpriteClick = { index: clickedIndex, at: now };
      if (isDoubleClick) {
        this.bindingSet.bindings.find(b => b.id === 'studio.edit')?.handler();
      }
    });
  }

  /**
   * The browser's key table. One StudioBinding array, wired verbatim (the
   * screen drives everything; the widgets' own keys stay off, the way
   * every arcade door learned to - a widget's keys:true never fires when
   * input is routed by the door) and fed to buildBindingSet so a later
   * task can build a menu from the same source, without a second
   * hand-maintained list of what's bound.
   */
  private buildBindings(): StudioBinding[] {
    return [
      // Pane/selection movement - how every door, sprite, and animation
      // gets reached - groups under 'Sprite' below alongside the two
      // things you actually DO with the current selection (studio-2c's
      // menu plan asked for 'Sprite'/'Animation'/'Help'; there is no
      // animation-only action distinct from these, so a 'Navigate' menu
      // is the honest label rather than an 'Animation' menu whose only
      // items are generic cursor movement).
      { id: 'nav.up', keys: ['up', 'k'], hotkeyHint: 'up/k', menu: 'Navigate', label: 'Move Up',
        handler: () => this.apply(moveSelection(this.state, -1)) },
      { id: 'nav.down', keys: ['down', 'j'], hotkeyHint: 'down/j', menu: 'Navigate', label: 'Move Down',
        handler: () => this.apply(moveSelection(this.state, 1)) },
      { id: 'nav.pageUp', keys: ['pageup'], hotkeyHint: 'pageup', menu: 'Navigate', label: 'Page Up',
        handler: () => this.apply(moveSelection(this.state, -10)) },
      { id: 'nav.pageDown', keys: ['pagedown'], hotkeyHint: 'pagedown', menu: 'Navigate', label: 'Page Down',
        handler: () => this.apply(moveSelection(this.state, 10)) },
      { id: 'nav.paneNext', keys: ['tab', 'right'], hotkeyHint: 'tab', menu: 'Navigate', label: 'Next Pane',
        handler: () => this.apply(cyclePane(this.state, 1)) },
      { id: 'nav.panePrev', keys: ['S-tab', 'left'], hotkeyHint: 'S-tab', menu: 'Navigate', label: 'Previous Pane',
        handler: () => this.apply(cyclePane(this.state, -1)) },
      { id: 'studio.quit', keys: ['q', 'escape', 'C-c'], hotkeyHint: 'q', menu: 'Sprite', label: 'Quit',
        handler: () => {
          if (this.editScreen || this.artSession) return;
          this.destroy();
          void this.ctx.close();
        } },
      { id: 'studio.edit', keys: ['e'], hotkeyHint: 'e', menu: 'Sprite', label: 'Edit Sprite',
        handler: () => {
          const sel = selection(this.state);
          const sprite = this.currentSprite();
          if (!sel.door || !sel.sprite || !sprite || this.editScreen || this.artSession) return;
          // The browser sleeps while the editor owns the screen: its panes
          // hide and its playback pauses, so two timers never fight over
          // render() and apply() ignores keys while the editor is open, so
          // the browser's own bindings cannot drift the selection underneath it.
          if (this.playback) { clearInterval(this.playback); this.playback = null; }
          // menuBar included: it stays mounted at top:0 with live
          // hover/click listeners otherwise, sitting directly under the
          // editor's own menu bar - a hovering mouse could open this
          // browser's "Sprite > Quit" while the editor owns the screen.
          for (const w of [this.doorsList, this.spritesList, this.animationsList,
                           this.previewBox, this.statusBar, this.menuBar]) w.hide();
          this.editScreen = new EditScreen(this.screen, sel.door, sel.sprite, sprite, () => {
            this.editScreen = null;
            for (const w of [this.doorsList, this.spritesList, this.animationsList,
                             this.previewBox, this.statusBar, this.menuBar]) w.show();
            this.loaded = null; // the sprite may have been saved - reload it
            this.playback = setInterval(() => { this.tick++; this.paintPreview(); }, PLAYBACK_MS);
            this.refresh();
          });
        } },
      { id: 'studio.artMode', keys: ['m'], hotkeyHint: 'm', menu: 'Sprite', label: 'Art Mode',
        handler: () => {
          const sel = selection(this.state);
          if (!sel.door || this.editScreen || this.artSession) return;
          // Same sleep/wake contract as 'e': panes hide and playback pauses
          // while the art session owns the screen, and apply() ignores keys
          // while it is open (see below) so the browser cannot drift underneath
          // it. listArt(door) plus the '[new file]' row is never empty, so
          // there is no black-screen risk in hiding before the list paints -
          // the same reasoning the ansi-editor door's showFileBrowser relies on.
          if (this.playback) { clearInterval(this.playback); this.playback = null; }
          // menuBar included - same reasoning as the 'e' handler above.
          for (const w of [this.doorsList, this.spritesList, this.animationsList,
                           this.previewBox, this.statusBar, this.menuBar]) w.hide();
          this.artSession = new ArtSession(this.screen, sel.door, () => {
            this.artSession = null;
            for (const w of [this.doorsList, this.spritesList, this.animationsList,
                             this.previewBox, this.statusBar, this.menuBar]) w.show();
            this.playback = setInterval(() => { this.tick++; this.paintPreview(); }, PLAYBACK_MS);
            this.refresh();
          });
        } },

      // F1 - standard help key, non-printable (contributes nothing to the
      // glyph exclusion set - see edit-screen.ts's studio.help for the
      // same reasoning). Writes straight to the existing status bar
      // widget, the same way refresh() already does, rather than adding a
      // new flash/state mechanism this browser doesn't otherwise have.
      { id: 'studio.help', keys: ['f1'], hotkeyHint: 'F1', menu: 'Help', label: 'Keyboard Shortcuts',
        handler: () => {
          this.statusBar.setContent(
            '{lightyellow-fg}up/down/j/k move  pageup/pagedown  tab panes  e edit  m art mode  q quit{/}'
          );
          this.screen.render();
        } },
    ];
  }

  private bindKeys(): void {
    const bindings = this.buildBindings();
    this.bindingSet = buildBindingSet(bindings);
    for (const binding of bindings) this.screen.key(binding.keys, binding.handler);
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
