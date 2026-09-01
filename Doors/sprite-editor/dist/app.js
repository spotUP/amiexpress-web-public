"use strict";
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
const bindings_1 = require("./bindings");
const layout_1 = require("./layout");
const menu_1 = require("./menu");
const panels_1 = require("./panels");
const door_theme_1 = require("./door-theme");
/** Preview frame advance, in ms - matches the arcade doors' tick feel. */
const PLAYBACK_MS = 100;
class StudioApp {
    constructor(ctx) {
        this.screen = null;
        this.inputManager = null;
        this.state = null;
        this.doorsPanel = null;
        this.spritesPanel = null;
        this.animationsPanel = null;
        this.previewPanel = null;
        this.doorsList = null;
        this.spritesList = null;
        this.animationsList = null;
        this.previewBox = null;
        this.statusBar = null;
        this.menuBar = null;
        /** Double-click gate for the sprites list - see wireMouseSelection(). */
        this.lastSpriteClick = { index: -1, at: 0 };
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
        (0, door_theme_1.applyTheme)(this.ctx.bbs); // chrome only; see door-theme.ts
        this.screen = (0, blessed_helpers_1.createScreen)(this.ctx.bbs, {
            title: 'Sprite Studio',
            responsive: true,
            // Mirrors livechat/ui/screen.ts: fastCSR forces the fast
            // scroll-region optimisation, which corrupts the terminal while a
            // DockablePanel is being dragged/resized. Disabled for the same
            // reason livechat disables it - stable dockable-panel rendering.
            fastCSR: false,
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
        await new Promise((resolve) => {
            this.exitResolve = resolve;
            this.screen.once('destroy', resolve);
        });
    }
    /**
     * Studio 2c: each content pane is now a DockablePanel (panels.ts's
     * makePanel), built from the SAME LAYOUT rect the bare box used to take
     * directly - the panel supplies the border/title bar the box used to
     * draw itself, and the actual widget (list/box) becomes its content
     * child, positioned by panels.ts's panelContentRect (fix round 1:
     * top:1, not top:0 - see its doc comment for why row 0 belongs to the
     * title bar, not the content).
     */
    buildLayout() {
        const { doors, sprites, animations, preview, status } = layout_1.LAYOUT.browser;
        this.doorsPanel = (0, panels_1.makePanel)(this.screen, { key: 'doors', title: ' Doors ', rect: doors });
        const doorsContent = (0, panels_1.panelContentRect)(doors);
        this.doorsList = blessed_1.default.list({
            parent: this.doorsPanel,
            top: doorsContent.top, left: doorsContent.left, width: doorsContent.width, height: doorsContent.height,
            border: { type: 'none' },
            // keys stay off: the door drives every key through the screen (see
            // the class comment on buildBindings), so a widget's own keys never
            // fire. mouse:true is new (Studio 2c): click-to-select, wired below
            // in wireMouseSelection() through the SAME handlers as arrow/enter.
            tags: true, keys: false, mouse: true,
            style: {
                selected: { bg: door_theme_1.T.bar, fg: door_theme_1.T.accent, bold: true },
                item: { fg: door_theme_1.T.ink },
            },
        });
        this.spritesPanel = (0, panels_1.makePanel)(this.screen, { key: 'sprites', title: ' Sprites ', rect: sprites });
        const spritesContent = (0, panels_1.panelContentRect)(sprites);
        this.spritesList = blessed_1.default.list({
            parent: this.spritesPanel,
            top: spritesContent.top, left: spritesContent.left, width: spritesContent.width, height: spritesContent.height,
            border: { type: 'none' },
            tags: true, keys: false, mouse: true,
            style: {
                selected: { bg: door_theme_1.T.bar, fg: door_theme_1.T.accent, bold: true },
                item: { fg: door_theme_1.T.ink },
            },
        });
        this.animationsPanel = (0, panels_1.makePanel)(this.screen, { key: 'animations', title: ' Animations ', rect: animations });
        const animationsContent = (0, panels_1.panelContentRect)(animations);
        this.animationsList = blessed_1.default.list({
            parent: this.animationsPanel,
            top: animationsContent.top, left: animationsContent.left,
            width: animationsContent.width, height: animationsContent.height,
            border: { type: 'none' },
            tags: true, keys: false, mouse: true,
            style: {
                selected: { bg: door_theme_1.T.bar, fg: door_theme_1.T.accent, bold: true },
                item: { fg: door_theme_1.T.ink },
            },
        });
        this.previewPanel = (0, panels_1.makePanel)(this.screen, { key: 'preview', title: ' Preview ', rect: preview });
        const previewContent = (0, panels_1.panelContentRect)(preview);
        this.previewBox = blessed_1.default.box({
            parent: this.previewPanel,
            top: previewContent.top, left: previewContent.left, width: previewContent.width, height: previewContent.height,
            border: { type: 'none' },
            tags: true, mouse: true,
        });
        this.statusBar = blessed_1.default.box({
            parent: this.screen,
            top: status.top, left: status.left, width: status.width, height: status.height,
            tags: true,
        });
        // Created LAST, purely additive - no existing screen.children[N]
        // index shifts under it.
        this.menuBar = (0, menu_1.createStudioMenuBar)(this.screen, this.bindingSet.menuItems());
    }
    /**
     * Browser mouse selection (Studio 2c). No new selection logic: a click
     * on a row reuses moveSelection/cyclePane through this.apply(), the
     * exact path arrow keys already take, and a double-click on a sprite
     * calls the SAME 'studio.edit' binding handler 'e' invokes - found by
     * id in this.bindingSet.bindings, not a second copy of the handler.
     */
    wireMouseSelection() {
        const PANE_ORDER = ['doors', 'sprites', 'animations'];
        /** Step this.state to the target pane using ONLY cyclePane, forward. */
        const focusPane = (pane) => {
            const steps = (PANE_ORDER.indexOf(pane) - PANE_ORDER.indexOf(this.state.pane) + 3) % 3;
            for (let i = 0; i < steps; i++)
                this.apply((0, browser_model_1.cyclePane)(this.state, 1));
        };
        const wirePane = (list, pane, indexOf) => {
            list.on('select', (_item, clickedIndex) => {
                if (this.editScreen || this.artSession)
                    return;
                focusPane(pane);
                const indexDelta = clickedIndex - indexOf(this.state);
                if (indexDelta !== 0)
                    this.apply((0, browser_model_1.moveSelection)(this.state, indexDelta));
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
        this.spritesList.on('select', (_item, clickedIndex) => {
            if (this.editScreen || this.artSession)
                return;
            focusPane('sprites');
            const indexDelta = clickedIndex - this.state.spriteIndex;
            if (indexDelta !== 0)
                this.apply((0, browser_model_1.moveSelection)(this.state, indexDelta));
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
    buildBindings() {
        return [
            // Pane/selection movement - how every door, sprite, and animation
            // gets reached - groups under 'Sprite' below alongside the two
            // things you actually DO with the current selection (studio-2c's
            // menu plan asked for 'Sprite'/'Animation'/'Help'; there is no
            // animation-only action distinct from these, so a 'Navigate' menu
            // is the honest label rather than an 'Animation' menu whose only
            // items are generic cursor movement).
            { id: 'nav.up', keys: ['up', 'k'], hotkeyHint: 'up/k', menu: 'Navigate', label: 'Move Up',
                handler: () => this.apply((0, browser_model_1.moveSelection)(this.state, -1)) },
            { id: 'nav.down', keys: ['down', 'j'], hotkeyHint: 'down/j', menu: 'Navigate', label: 'Move Down',
                handler: () => this.apply((0, browser_model_1.moveSelection)(this.state, 1)) },
            { id: 'nav.pageUp', keys: ['pageup'], hotkeyHint: 'pageup', menu: 'Navigate', label: 'Page Up',
                handler: () => this.apply((0, browser_model_1.moveSelection)(this.state, -10)) },
            { id: 'nav.pageDown', keys: ['pagedown'], hotkeyHint: 'pagedown', menu: 'Navigate', label: 'Page Down',
                handler: () => this.apply((0, browser_model_1.moveSelection)(this.state, 10)) },
            { id: 'nav.paneNext', keys: ['tab', 'right'], hotkeyHint: 'tab', menu: 'Navigate', label: 'Next Pane',
                handler: () => this.apply((0, browser_model_1.cyclePane)(this.state, 1)) },
            { id: 'nav.panePrev', keys: ['S-tab', 'left'], hotkeyHint: 'S-tab', menu: 'Navigate', label: 'Previous Pane',
                handler: () => this.apply((0, browser_model_1.cyclePane)(this.state, -1)) },
            { id: 'studio.quit', keys: ['q', 'escape', 'C-c'], hotkeyHint: 'q', menu: 'Sprite', label: 'Quit',
                handler: () => {
                    if (this.editScreen || this.artSession)
                        return;
                    this.destroy();
                    void this.ctx.close();
                } },
            { id: 'studio.edit', keys: ['e'], hotkeyHint: 'e', menu: 'Sprite', label: 'Edit Sprite',
                handler: () => {
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
                    // menuBar included: it stays mounted at top:0 with live
                    // hover/click listeners otherwise, sitting directly under the
                    // editor's own menu bar - a hovering mouse could open this
                    // browser's "Sprite > Quit" while the editor owns the screen.
                    for (const w of [this.doorsPanel, this.spritesPanel, this.animationsPanel,
                        this.previewPanel, this.statusBar, this.menuBar])
                        w.hide();
                    this.editScreen = new edit_screen_1.EditScreen(this.screen, sel.door, sel.sprite, sprite, () => {
                        this.editScreen = null;
                        for (const w of [this.doorsPanel, this.spritesPanel, this.animationsPanel,
                            this.previewPanel, this.statusBar, this.menuBar])
                            w.show();
                        this.loaded = null; // the sprite may have been saved - reload it
                        this.playback = setInterval(() => { this.tick++; this.paintPreview(); }, PLAYBACK_MS);
                        this.refresh();
                    });
                } },
            { id: 'studio.artMode', keys: ['m'], hotkeyHint: 'm', menu: 'Sprite', label: 'Art Mode',
                handler: () => {
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
                    // menuBar included - same reasoning as the 'e' handler above.
                    for (const w of [this.doorsPanel, this.spritesPanel, this.animationsPanel,
                        this.previewPanel, this.statusBar, this.menuBar])
                        w.hide();
                    this.artSession = new art_screen_1.ArtSession(this.screen, sel.door, () => {
                        this.artSession = null;
                        for (const w of [this.doorsPanel, this.spritesPanel, this.animationsPanel,
                            this.previewPanel, this.statusBar, this.menuBar])
                            w.show();
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
                    this.statusBar.setContent(`{${door_theme_1.T.accent}-fg}up/down/j/k move  pageup/pagedown  tab panes  e edit  m art mode  q quit{/}`);
                    this.screen.render();
                } },
            // Studio 2c: menu-only (empty keys is legal - see bindings.ts's
            // anEmptyKeysBindingIsMenuOnly), restores every panel to its LAYOUT
            // rect and floating state through panels.ts's resetPanelLayout -
            // the same setState() DockablePanel uses to restore a saved layout.
            { id: 'view.resetLayout', keys: [], hotkeyHint: '', menu: 'View', label: 'Reset Layout',
                handler: () => {
                    (0, panels_1.resetPanelLayout)(this.doorsPanel, layout_1.LAYOUT.browser.doors);
                    (0, panels_1.resetPanelLayout)(this.spritesPanel, layout_1.LAYOUT.browser.sprites);
                    (0, panels_1.resetPanelLayout)(this.animationsPanel, layout_1.LAYOUT.browser.animations);
                    (0, panels_1.resetPanelLayout)(this.previewPanel, layout_1.LAYOUT.browser.preview);
                } },
        ];
    }
    bindKeys() {
        const bindings = this.buildBindings();
        // Final fix wave, Important 4: this used to wire the RAW table while
        // menuItems() (built by buildBindingSet below, read by
        // createStudioMenuBar) served the GUARDED array - the opposite of the
        // invariant bindings.ts's module doc comment documents, and of what
        // edit-screen.ts's bindKeys() does. Harmless only as long as no
        // isBlocked predicate was passed; the browser and editor share ONE
        // Screen instance, so `this.screen.dialogOpen` set by an editor-owned
        // confirm()/promptText() (dialogs.ts) is visible here too - pass it so
        // the browser's own keyboard path stays inert while the editor's
        // dialog owns the screen, exactly like edit-screen.ts's bindKeys().
        this.bindingSet = (0, bindings_1.buildBindingSet)(bindings, () => this.screen.dialogOpen);
        for (const binding of this.bindingSet.bindings)
            this.screen.key(binding.keys, binding.handler);
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
        // Studio 2c: the coloured border that shows which pane has focus now
        // lives on the PANEL (the content list is borderless - the panel
        // draws it), so this targets this.doorsPanel/etc, not the list. The
        // panel's own style.border may not exist yet (DockablePanel only
        // creates it lazily, in applyBorderHoverStyle(), on first hover), so
        // it is created here rather than assumed present.
        const focus = (panel, on) => {
            panel.style.border = panel.style.border || {};
            panel.style.border.fg = on ? 'lightyellow' : 'cyan';
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
        focus(this.doorsPanel, this.state.pane === 'doors');
        focus(this.spritesPanel, this.state.pane === 'sprites');
        focus(this.animationsPanel, this.state.pane === 'animations');
        const sel = (0, browser_model_1.selection)(this.state);
        const left = `{${door_theme_1.T.accent}-fg}${sel.door ?? '-'}{/} / ` +
            `{${door_theme_1.T.ink}-fg}${sel.sprite ?? '-'}{/} / ` +
            `{${door_theme_1.T.accentAlt}-fg}${sel.animation ?? '-'}{/}`;
        const right = `{${door_theme_1.T.dim}-fg}TAB panes  ARROWS move  Q quit{/}`;
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
            this.previewBox.setContent(`{${door_theme_1.T.dim}-fg}nothing to preview{/}`);
            this.screen.render();
            return;
        }
        const anim = sprite.animations[sel.animation];
        const lines = (0, preview_1.previewLines)(sprite, sel.animation, this.tick, 2);
        const inner = Math.max(1, this.previewBox.width - 2);
        const pad = ' '.repeat(Math.max(0, Math.floor((inner - sprite.cellW * 2) / 2)));
        // ASCII separators, short words: the middle dot rendered as a quote
        // on the live terminal, and the long form wrapped inside the pane.
        const meta = `{${door_theme_1.T.dim}-fg}${sprite.name} - ${sel.animation} - ` +
            `${anim.frames.length}f ${anim.ticksPerFrame}tpf ` +
            `${anim.loop ? 'loop' : 'hold'}{/}`;
        // Fix round 1, Important 2: no leading '\n' - see panels.ts's
        // panelContentRect doc comment. This pane's content child already
        // starts one row below the panel's title bar; a literal leading
        // newline here would double-blank that row.
        this.previewBox.setContent(lines.map(l => pad + l).join('\n') + '\n\n ' + meta);
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
