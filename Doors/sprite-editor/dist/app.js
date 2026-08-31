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
const edit_screen_1 = require("./edit-screen");
const art_screen_1 = require("./art-screen");
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
        /** Resolves start()'s stay-alive promise; the door exits when it fires. */
        this.exitResolve = null;
        this.tick = 0;
        /** The loaded sheet for the current selection, cached per selection. */
        this.loaded = null;
        this.editScreen = null;
        this.artSession = null;
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
        // enable() installs the BBS-to-blessed key bridge
        // (bbsSession.doorInputHandler); without it the backend drops every
        // keystroke and the door is input-dead - constructed is not enabled.
        // Every sibling blessed door calls this (ansi-editor, door-manager).
        this.inputManager.enable();
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
        // Hold the door OPEN. CoreDoor.execute() only awaits its input loop
        // when a door registers onInput handlers; this door routes every key
        // through the blessed screen instead, so without this await execute()
        // falls straight through to the close handlers - reported live as
        // "it just cleared the screen". The ANSI editor holds itself open the
        // same way. The promise resolves on destroy, whichever path calls it.
        await new Promise((resolve) => {
            this.exitResolve = resolve;
            this.screen.once('destroy', resolve);
        });
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
            if (this.editScreen || this.artSession)
                return;
            this.destroy();
            void this.ctx.close();
        });
        this.screen.key(['e'], () => {
            const sel = (0, browser_model_1.selection)(this.state);
            const sprite = this.currentSprite();
            if (!sel.door || !sel.sprite || !sprite || this.editScreen || this.artSession)
                return;
            // The browser sleeps while the editor owns the screen: its panes
            // hide and its playback pauses, so two timers never fight over
            // render() and apply() ignores keys while the editor is open, so
            // the browser's own bindings cannot drift the selection underneath it.
            if (this.playback) {
                clearInterval(this.playback);
                this.playback = null;
            }
            for (const w of [this.doorsList, this.spritesList, this.animationsList,
                this.previewBox, this.statusBar])
                w.hide();
            this.editScreen = new edit_screen_1.EditScreen(this.screen, sel.door, sel.sprite, sprite, () => {
                this.editScreen = null;
                for (const w of [this.doorsList, this.spritesList, this.animationsList,
                    this.previewBox, this.statusBar])
                    w.show();
                this.loaded = null; // the sprite may have been saved - reload it
                this.playback = setInterval(() => { this.tick++; this.paintPreview(); }, PLAYBACK_MS);
                this.refresh();
            });
        });
        this.screen.key(['m'], () => {
            const sel = (0, browser_model_1.selection)(this.state);
            if (!sel.door || this.editScreen || this.artSession)
                return;
            // Same sleep/wake contract as 'e': panes hide and playback pauses
            // while the art session owns the screen, and apply() ignores keys
            // while it is open (see below) so the browser cannot drift underneath
            // it. listArt(door) plus the '[new file]' row is never empty, so
            // there is no black-screen risk in hiding before the list paints -
            // the same reasoning the ansi-editor door's showFileBrowser relies on.
            if (this.playback) {
                clearInterval(this.playback);
                this.playback = null;
            }
            for (const w of [this.doorsList, this.spritesList, this.animationsList,
                this.previewBox, this.statusBar])
                w.hide();
            this.artSession = new art_screen_1.ArtSession(this.screen, sel.door, () => {
                this.artSession = null;
                for (const w of [this.doorsList, this.spritesList, this.animationsList,
                    this.previewBox, this.statusBar])
                    w.show();
                this.playback = setInterval(() => { this.tick++; this.paintPreview(); }, PLAYBACK_MS);
                this.refresh();
            });
        });
    }
    apply(next) {
        // Blessed fires EVERY handler bound to a key, so while the edit
        // screen owns the arrows and tab, the browser's own bindings still
        // run - and were mutating the selection underneath the editor.
        // Every navigation key funnels through here; one guard covers them.
        if (this.editScreen)
            return;
        // Art mode owns the screen the same way while it is open.
        if (this.artSession)
            return;
        if (next === this.state)
            return;
        const before = (0, browser_model_1.selection)(this.state);
        this.state = next;
        const after = (0, browser_model_1.selection)(next);
        if (before.door !== after.door || before.sprite !== after.sprite ||
            before.animation !== after.animation) {
            this.tick = 0; // a new SELECTION starts from the top; a focus move does not
        }
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
        // Display the sprite NAMES - 'diamond', not 'diamond.sprite.json'.
        // The filenames are 19+ characters and the pane's inner width at 80
        // columns is 18, so the full names wrapped and every row went ragged
        // (reported with a screenshot). The model keeps real filenames; only
        // the display strips the suffix.
        this.spritesList.setItems(this.state.sprites.map(f => f.replace(/\.sprite\.json$/, '')));
        this.spritesList.select(this.state.spriteIndex);
        this.animationsList.setItems(this.state.animations);
        this.animationsList.select(this.state.animationIndex);
        focus(this.doorsList, this.state.pane === 'doors');
        focus(this.spritesList, this.state.pane === 'sprites');
        focus(this.animationsList, this.state.pane === 'animations');
        const sel = (0, browser_model_1.selection)(this.state);
        const left = `{lightyellow-fg}${sel.door ?? '-'}{/} / ` +
            `{white-fg}${sel.sprite ?? '-'}{/} / ` +
            `{lightcyan-fg}${sel.animation ?? '-'}{/}`;
        const right = '{gray-fg}TAB panes  ARROWS move  Q quit{/}';
        const visible = (tagged) => tagged.replace(/\{[^}]*\}/g, '').length;
        // Clamp to the real width: if the two segments cannot fit on one row,
        // drop the hint rather than let the row wrap into the panes above.
        const width = Number(this.screen.width) || 80;
        const both = visible(left) + visible(right);
        if (both < width) {
            this.statusBar.setContent(left + ' '.repeat(width - both) + right);
        }
        else {
            this.statusBar.setContent(left);
        }
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
        // ASCII separators, short words: the middle dot rendered as a quote
        // on the live terminal, and the long form wrapped inside the pane.
        const meta = `{gray-fg}${sprite.name} - ${sel.animation} - ` +
            `${anim.frames.length}f ${anim.ticksPerFrame}tpf ` +
            `${anim.loop ? 'loop' : 'hold'}{/}`;
        this.previewBox.setContent('\n' + lines.map(l => pad + l).join('\n') + '\n\n ' + meta);
        this.screen.render();
    }
    destroy() {
        if (this.playback) {
            clearInterval(this.playback);
            this.playback = null;
        }
        this.editScreen?.destroy();
        this.editScreen = null;
        this.artSession?.destroy();
        this.artSession = null;
        if (this.inputManager) {
            this.inputManager.disable();
            this.inputManager = null;
        }
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
exports.StudioApp = StudioApp;
