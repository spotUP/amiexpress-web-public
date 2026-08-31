"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudioApp = void 0;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const browser_model_1 = require("./browser-model");
const preview_1 = require("./preview");
const assets_1 = require("./assets");
/** Preview frame advance, in ms - matches the arcade doors' tick feel. */
const PLAYBACK_MS = 100;
class StudioApp {
    constructor(ctx) {
        this.screen = null;
        this.inputManager = null;
        this.state = null;
        this.doorsList = null;
        this.spritesList = null;
        this.animationsList = null;
        this.previewBox = null;
        this.statusBar = null;
        this.playback = null;
        this.tick = 0;
        /** The loaded sheet for the current selection, cached per selection. */
        this.loaded = null;
        this.ctx = ctx;
    }
    async start() {
        this.screen = (0, blessed_helpers_1.createScreen)(this.ctx.bbs, {
            title: 'Sprite Studio',
            responsive: true,
        });
        this.screen.program.write('\x1b[2J');
        this.screen.program.write('\x1b[H');
        this.inputManager = new blessed_helpers_1.DoorInputManager(this.ctx, this.screen, {
            enableGameMode: false,
            enableGrabKeys: false,
            enableMouse: true,
        });
        this.state = (0, browser_model_1.initialState)();
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
    buildLayout() {
        this.doorsList = blessed_1.default.list({
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
        this.spritesList = blessed_1.default.list({
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
        this.animationsList = blessed_1.default.list({
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
        this.previewBox = blessed_1.default.box({
            parent: this.screen,
            top: 0, left: '50%', width: '50%', height: '90%',
            label: ' Preview ',
            border: { type: 'line' },
            tags: true,
            style: { border: { fg: 'green' } },
        });
        this.statusBar = blessed_1.default.box({
            parent: this.screen,
            bottom: 0, left: 0, width: '100%', height: 1,
            tags: true,
        });
    }
    bindKeys() {
        // The screen drives everything; the widgets' own keys stay off, the
        // way every arcade door learned to (a widget's keys:true never fires
        // when input is routed by the door).
        this.screen.key(['up', 'k'], () => this.apply((0, browser_model_1.moveSelection)(this.state, -1)));
        this.screen.key(['down', 'j'], () => this.apply((0, browser_model_1.moveSelection)(this.state, 1)));
        this.screen.key(['pageup'], () => this.apply((0, browser_model_1.moveSelection)(this.state, -10)));
        this.screen.key(['pagedown'], () => this.apply((0, browser_model_1.moveSelection)(this.state, 10)));
        this.screen.key(['tab', 'right'], () => this.apply((0, browser_model_1.cyclePane)(this.state, 1)));
        this.screen.key(['S-tab', 'left'], () => this.apply((0, browser_model_1.cyclePane)(this.state, -1)));
        this.screen.key(['q', 'escape', 'C-c'], () => {
            this.destroy();
            void this.ctx.close();
        });
    }
    apply(next) {
        if (next === this.state)
            return;
        this.state = next;
        this.tick = 0; // a new selection starts its animation from the top
        this.refresh();
    }
    /** The current sheet, loaded once per (door, sprite) selection. */
    currentSprite() {
        const sel = (0, browser_model_1.selection)(this.state);
        if (!sel.door || !sel.sprite)
            return null;
        const key = `${sel.door}/${sel.sprite}`;
        if (this.loaded?.key !== key) {
            try {
                this.loaded = { key, sprite: (0, assets_1.readSprite)(sel.door, sel.sprite) };
            }
            catch {
                this.loaded = null; // a malformed sheet previews as empty
            }
        }
        return this.loaded?.sprite ?? null;
    }
    refresh() {
        const focus = (list, on) => {
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
        const sel = (0, browser_model_1.selection)(this.state);
        this.statusBar.setContent(`{lightyellow-fg}${sel.door ?? '-'}{/} / ` +
            `{white-fg}${sel.sprite ?? '-'}{/} / ` +
            `{lightcyan-fg}${sel.animation ?? '-'}{/}` +
            '{|}{gray-fg}TAB panes  ARROWS move  Q quit{/}');
        this.paintPreview();
    }
    paintPreview() {
        const sel = (0, browser_model_1.selection)(this.state);
        const sprite = this.currentSprite();
        if (!sprite || !sel.animation) {
            this.previewBox.setContent('{gray-fg}nothing to preview{/}');
            this.screen.render();
            return;
        }
        const anim = sprite.animations[sel.animation];
        const lines = (0, preview_1.previewLines)(sprite, sel.animation, this.tick, 2);
        const inner = Math.max(1, this.previewBox.width - 2);
        const pad = ' '.repeat(Math.max(0, Math.floor((inner - sprite.cellW * 2) / 2)));
        const meta = `{gray-fg}${sprite.name} · ${sel.animation} · ` +
            `${anim.frames.length} frame(s) · ${anim.ticksPerFrame} tpf · ` +
            `${anim.loop ? 'loop' : 'hold'}{/}`;
        this.previewBox.setContent('\n' + lines.map(l => pad + l).join('\n') + '\n\n ' + meta);
        this.screen.render();
    }
    destroy() {
        if (this.playback) {
            clearInterval(this.playback);
            this.playback = null;
        }
        if (this.inputManager) {
            this.inputManager.disable();
            this.inputManager = null;
        }
        if (this.screen) {
            this.screen.removeAllListeners();
            this.screen.destroy();
            this.screen = null;
        }
    }
}
exports.StudioApp = StudioApp;
