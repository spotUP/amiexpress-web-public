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
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  BrowserState, initialState, moveSelection, cyclePane, selection,
} from './browser-model';
import { previewLines } from './preview';
import { readSprite } from './assets';
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
  private tick = 0;
  /** The loaded sheet for the current selection, cached per selection. */
  private loaded: { key: string; sprite: Sprite } | null = null;

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
      this.destroy();
      void this.ctx.close();
    });
  }

  private apply(next: BrowserState): void {
    if (next === this.state) return;
    this.state = next;
    this.tick = 0; // a new selection starts its animation from the top
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
    this.spritesList.setItems(this.state.sprites);
    this.spritesList.select(this.state.spriteIndex);
    this.animationsList.setItems(this.state.animations);
    this.animationsList.select(this.state.animationIndex);
    focus(this.doorsList, this.state.pane === 'doors');
    focus(this.spritesList, this.state.pane === 'sprites');
    focus(this.animationsList, this.state.pane === 'animations');

    const sel = selection(this.state);
    this.statusBar.setContent(
      `{lightyellow-fg}${sel.door ?? '-'}{/} / ` +
      `{white-fg}${sel.sprite ?? '-'}{/} / ` +
      `{lightcyan-fg}${sel.animation ?? '-'}{/}` +
      '{|}{gray-fg}TAB panes  ARROWS move  Q quit{/}'
    );
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
    const meta =
      `{gray-fg}${sprite.name} · ${sel.animation} · ` +
      `${anim.frames.length} frame(s) · ${anim.ticksPerFrame} tpf · ` +
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
    if (this.inputManager) { this.inputManager.disable(); this.inputManager = null; }
    if (this.screen) {
      this.screen.removeAllListeners();
      this.screen.destroy();
      this.screen = null;
    }
  }
}
