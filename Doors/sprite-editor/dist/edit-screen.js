"use strict";
/**
 * The edit screen: the SDK's ANSIEditor paints the frame, this file owns
 * everything the editor has no concept of - frames, animations, the
 * playback preview, and writing a .sprite file.
 *
 * The door used to paint cells itself: a hand-written canvas, its own
 * hit-test, its own tool/colour/glyph state and a toolbar that was a second
 * copy of the widget's sidebar. That was a recorded deviation from the
 * design doc's "the studio door is a fork of its door wrapper reusing this
 * engine wholesale", taken in studio 2b because the engine's canvas was
 * hardcoded 80x25 with no transparency and no working undo. The
 * ansi-editor-sprite-capable plan removed all three reasons and added
 * getCoreCanvas()/setCoreCanvas() for exactly this host; this file now
 * consumes them.
 *
 * The one invariant that replaces the old painter's: WHILE THE EDITOR IS
 * OPEN, THE WIDGET'S CANVAS IS THE CURRENT FRAME. `this.doc` is only
 * authoritative for frames other than the current one, so anything that
 * changes which frame is current - and every save - goes through
 * commitCanvasToDoc() first. Paint, press next-frame, lose the strokes is
 * the defect that would otherwise be built in by construction.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EditScreen = exports.CANVAS_SIDEBAR_COLS = void 0;
exports.canvasScale = canvasScale;
const blessed_1 = __importStar(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const edit_doc_1 = require("./edit-doc");
const assets_1 = require("./assets");
const dialogs_1 = require("./dialogs");
const bindings_1 = require("./bindings");
const layout_1 = require("./layout");
const menu_1 = require("./menu");
const panels_1 = require("./panels");
const door_theme_1 = require("./door-theme");
/**
 * The ANSIEditor's own left sidebar width (its `sidebarWidth` when
 * showSidebar is on). The magnification below is sized against the columns
 * the CANVAS actually gets, not the panel's full width - otherwise a wide
 * sprite is drawn at a scale that does not fit and is clipped by the
 * sidebar it forgot to subtract.
 */
exports.CANVAS_SIDEBAR_COLS = 6;
/**
 * How large one sprite cell is drawn, given the room available. A 5x2
 * sprite at one character per cell is a five-by-two smudge in a 44-column
 * panel; a 16-wide sprite gets a smaller magnification rather than a
 * clipped one. Exported so a test can assert the same number the screen
 * uses instead of recomputing it.
 */
function canvasScale(sprite, width, height) {
    const drawable = width - exports.CANVAS_SIDEBAR_COLS;
    return Math.max(1, Math.min(Math.floor(drawable / Math.max(1, sprite.cellW)), Math.floor(height / Math.max(1, sprite.cellH))));
}
class EditScreen {
    constructor(screen, door, file, sprite, onExit) {
        this.statusFlash = '';
        this.canvasPanel = null;
        this.editor = null;
        this.statusBar = null;
        this.menuBar = null;
        this.keyHandlers = [];
        this.screen = screen;
        this.door = door;
        this.file = file;
        this.onExit = onExit;
        this.doc = (0, edit_doc_1.openDoc)(sprite);
        // bindKeys() first: it builds this.bindingSet, which buildLayout()
        // needs to hand the menu bar its items. Neither touches a widget at
        // call time (handlers are closures, evaluated only once invoked).
        this.bindKeys();
        this.buildLayout();
        this.paint();
    }
    buildLayout() {
        const { canvas, status } = layout_1.LAYOUT.edit;
        this.canvasPanel = (0, panels_1.makePanel)(this.screen, { key: 'canvas', title: ' Canvas ', rect: canvas });
        const canvasContent = (0, panels_1.panelContentRect)(canvas);
        const scale = canvasScale(this.doc.sprite, canvasContent.width, canvasContent.height);
        this.editor = new blessed_1.ANSIEditor({
            parent: this.canvasPanel,
            top: canvasContent.top, left: canvasContent.left,
            width: canvasContent.width, height: canvasContent.height,
            initialMode: 'draw',
            canvasWidth: this.doc.sprite.cellW,
            canvasHeight: this.doc.sprite.cellH,
            cellScaleX: scale, cellScaleY: scale,
            // An erased sprite cell is a HOLE, not black: compositing skips it
            // and the game's background shows through. Without this the editor
            // would erase to an opaque black square and every sprite saved from
            // here would carry a black box around its artwork.
            transparentBackground: true,
            showSidebar: true, // colours and tools - what toolbar.ts was a second copy of
            showToolbar: true, // the F-key character sets
            showMenuBar: false, // the studio's own menu bar owns the top row
            showStatusBar: false, // the studio's own status bar owns the last row
            showLineNumbers: false,
            // The widget binds Ctrl+S and ESC itself and calls these; the studio
            // deliberately does NOT also bind them (see buildOpBindings) or the
            // save would run twice and ESC would open two dialogs.
            onSave: async () => { this.save(); return true; },
            onExit: () => { void this.closeEditor(); },
        });
        this.loadFrameIntoEditor();
        this.statusBar = blessed_1.default.box({
            parent: this.screen,
            top: status.top, left: status.left, width: status.width, height: status.height, tags: true,
        });
        // Created LAST so it renders above its siblings.
        this.menuBar = (0, menu_1.createStudioMenuBar)(this.screen, this.bindingSet.menuItems());
    }
    /**
     * The widget's canvas IS the current frame while the editor is open;
     * this is the only place its content re-enters the sprite. Called before
     * anything that changes which frame is current, and before every save -
     * otherwise the strokes since the last transfer are on screen and
     * nowhere else.
     */
    commitCanvasToDoc() {
        const canvas = this.editor?.getCoreCanvas();
        if (!canvas)
            return;
        // Through edit-doc like every other mutation, not by reaching into
        // this.doc.sprite here - setFrame is where the size invariant lives.
        this.doc = (0, edit_doc_1.setFrame)(this.doc, (0, cell_art_1.canvasToFrame)(canvas));
    }
    /**
     * The current frame becomes the widget's canvas. setCoreCanvas clears
     * the widget's draw-mode undo history on purpose: a different frame is a
     * new undo timeline, not a continuation of the old canvas's.
     */
    loadFrameIntoEditor() {
        if (!this.editor)
            return;
        this.editor.setCoreCanvas((0, cell_art_1.frameToCanvas)((0, edit_doc_1.currentFrame)(this.doc)));
        // setCoreCanvas marks the widget modified - correct for a host that
        // swapped the canvas as an EDIT, wrong here: loading a frame is not
        // user work. Left set, a freshly opened sprite reads as dirty and ESC
        // asks to discard changes nobody made. What is unsaved is tracked by
        // doc.dirty; editor.modified means "strokes since this frame loaded".
        this.editor.modified = false;
    }
    /** Bind one screen-key group, remembered so destroy can remove it. */
    key(keys, handler) {
        this.screen.key(keys, handler);
        this.keyHandlers.push([keys, handler]);
    }
    /**
     * Bind a key that must do nothing while a modal dialog owns the
     * keyboard. `screen.dialogOpen` is owned entirely by dialogs.ts. As of
     * bindings.ts's `isBlocked` parameter every binding this is called with
     * is already wrapped with the same check; the second layer costs nothing
     * and documents the invariant locally.
     */
    opKey(keys, handler) {
        this.key(keys, (...args) => {
            if (this.screen.dialogOpen)
                return;
            handler(...args);
        });
    }
    /**
     * The op table. Every key here is NON-PRINTABLE, and that is a hard
     * invariant (pinned by edit-screen-bindings.test.ts), not a style
     * choice: in draw mode the widget types any printable character onto the
     * canvas, so a single-letter binding would both fire the op AND paint
     * the letter. This replaces studio 2c's derived glyph-exclusion set -
     * there is no longer a set of letters the canvas must refuse, because
     * the studio claims none of them.
     *
     * Most ops are therefore menu-only (`keys: []`, which bindings.ts
     * supports), with Ctrl hotkeys for the three most frequent. The menus
     * are the primary surface, which is the user's own directive ("the whole
     * sprited app need to be menu driven"), and menu-coverage.test.ts still
     * fails if any registered key lacks a menu entry.
     *
     * Cursor movement, colours, glyphs, tools and undo are absent: they are
     * the widget's, on its sidebar and its own keys.
     */
    buildOpBindings() {
        return [
            { id: 'frame.prev', keys: ['C-p'], hotkeyHint: 'C-p', menu: 'Frame', label: 'Previous Frame',
                handler: () => this.applyAfterCommit(d => (0, edit_doc_1.selectFrame)(d, d.frame - 1)) },
            { id: 'frame.next', keys: ['C-f'], hotkeyHint: 'C-f', menu: 'Frame', label: 'Next Frame',
                handler: () => this.applyAfterCommit(d => (0, edit_doc_1.selectFrame)(d, d.frame + 1)) },
            { id: 'frame.new', keys: [], hotkeyHint: '', menu: 'Frame', label: 'New Frame',
                handler: () => this.tryOp(d => (0, edit_doc_1.addFrame)(d, 'blank')) },
            { id: 'frame.duplicate', keys: [], hotkeyHint: '', menu: 'Frame', label: 'Duplicate Frame',
                handler: () => this.tryOp(d => (0, edit_doc_1.addFrame)(d, 'duplicate')) },
            { id: 'frame.delete', keys: [], hotkeyHint: '', menu: 'Frame', label: 'Delete Frame',
                handler: async () => {
                    if (await (0, dialogs_1.confirm)(this.screen, 'Delete this frame?'))
                        this.tryOp(d => (0, edit_doc_1.deleteFrame)(d));
                } },
            { id: 'frame.moveEarlier', keys: [], hotkeyHint: '', menu: 'Frame', label: 'Move Frame Earlier',
                handler: () => this.applyAfterCommit(d => (0, edit_doc_1.moveFrame)(d, -1)) },
            { id: 'frame.moveLater', keys: [], hotkeyHint: '', menu: 'Frame', label: 'Move Frame Later',
                handler: () => this.applyAfterCommit(d => (0, edit_doc_1.moveFrame)(d, 1)) },
            { id: 'animation.next', keys: ['C-e'], hotkeyHint: 'C-e', menu: 'Animation', label: 'Next Animation',
                handler: () => {
                    const names = Object.keys(this.doc.sprite.animations).sort();
                    const next = names[(names.indexOf(this.doc.animation) + 1) % names.length];
                    this.applyAfterCommit(d => (0, edit_doc_1.selectAnimation)(d, next));
                } },
            { id: 'animation.new', keys: [], hotkeyHint: '', menu: 'Animation', label: 'New Animation',
                handler: async () => {
                    const name = await (0, dialogs_1.promptText)(this.screen, 'New animation name');
                    if (name === null)
                        return; // ESC cancelled - the document is untouched
                    this.tryOp(d => (0, edit_doc_1.addAnimation)(d, name));
                } },
            { id: 'animation.slower', keys: [], hotkeyHint: '', menu: 'Animation', label: 'Slower',
                handler: () => this.applyAfterCommit(d => (0, edit_doc_1.setTicksPerFrame)(d, -1)) },
            { id: 'animation.faster', keys: [], hotkeyHint: '', menu: 'Animation', label: 'Faster',
                handler: () => this.applyAfterCommit(d => (0, edit_doc_1.setTicksPerFrame)(d, +1)) },
            { id: 'animation.toggleLoop', keys: [], hotkeyHint: '', menu: 'Animation', label: 'Toggle Loop',
                handler: () => this.applyAfterCommit(d => (0, edit_doc_1.toggleLoop)(d)) },
            { id: 'animation.delete', keys: [], hotkeyHint: '', menu: 'Animation', label: 'Delete Animation',
                handler: async () => {
                    const message = `Delete animation "${this.doc.animation}"?`;
                    if (await (0, dialogs_1.confirm)(this.screen, message))
                        this.tryOp(d => (0, edit_doc_1.deleteAnimation)(d));
                } },
            // Menu-only WITH a hotkey hint: the widget already binds Ctrl+S and
            // calls our onSave. Binding it here too would save twice.
            { id: 'file.save', keys: [], hotkeyHint: 'C-s', menu: 'File', label: 'Save',
                handler: () => this.save() },
            // Likewise ESC, which the widget binds and routes to our onExit.
            // C-q stays as the second, explicit route out.
            { id: 'file.closeEditor', keys: ['C-q'], hotkeyHint: 'esc/C-q', menu: 'File', label: 'Close Editor',
                handler: () => { void this.closeEditor(); } },
            { id: 'studio.help', keys: [], hotkeyHint: '', menu: 'Help', label: 'Keyboard Shortcuts',
                handler: () => {
                    this.statusFlash = 'C-p/C-f frame  C-e animation  C-s save  ESC back  - drawing keys belong to the editor';
                    this.paint();
                } },
            { id: 'view.resetLayout', keys: [], hotkeyHint: '', menu: 'View', label: 'Reset Layout',
                handler: () => {
                    (0, panels_1.resetPanelLayout)(this.canvasPanel, layout_1.LAYOUT.edit.canvas);
                } },
        ];
    }
    bindKeys() {
        // buildBindingSet's `isBlocked` wraps every handler with the same
        // dialogOpen check BEFORE either consumer sees it, so this loop
        // (screen.key() registration) and menuItems()'s action (dispatched by
        // a real mouse click through dropdown-menu.ts) share the identical
        // guarded function.
        this.bindingSet = (0, bindings_1.buildBindingSet)(this.buildOpBindings(), () => this.screen.dialogOpen);
        for (const binding of this.bindingSet.bindings)
            this.opKey(binding.keys, binding.handler);
    }
    /** Commit what is on the canvas, then run a document op. */
    applyAfterCommit(op) {
        this.commitCanvasToDoc();
        this.apply(op(this.doc));
    }
    apply(next) {
        if (next === this.doc)
            return;
        this.doc = next;
        this.loadFrameIntoEditor();
        this.paint();
    }
    /** Commit, then run an op that may refuse - a refusal flashes, not throws. */
    tryOp(op) {
        this.commitCanvasToDoc();
        try {
            this.apply(op(this.doc));
        }
        catch (error) {
            this.statusFlash = String(error.message);
            this.paint();
        }
    }
    save() {
        this.commitCanvasToDoc();
        try {
            (0, assets_1.writeSprite)(this.door, this.file, (0, edit_doc_1.toSprite)(this.doc));
            this.doc = { ...this.doc, dirty: false };
            // The widget's own modified flag has to be cleared too, or the next
            // dirty check reports unsaved work immediately after a save.
            if (this.editor)
                this.editor.modified = false;
            this.statusFlash = `saved ${this.file}`;
        }
        catch (error) {
            this.statusFlash = `SAVE FAILED: ${error.message}`;
        }
        this.paint();
    }
    /** True when there is work neither saved nor already folded into the doc. */
    isDirty() {
        return this.doc.dirty || Boolean(this.editor?.isModified());
    }
    async closeEditor() {
        if (this.screen.dialogOpen)
            return;
        if (!this.isDirty()) {
            this.exit();
            return;
        }
        const discard = await (0, dialogs_1.confirm)(this.screen, 'Discard unsaved changes?');
        if (discard)
            this.exit();
    }
    /**
     * The frames strip, in display order, with the current frame bracketed.
     *
     * It had a pane of its own until the editor took the screen; it is one
     * short run of text, so it lives on the status row now rather than
     * costing the canvas eleven rows.
     */
    frameTokens() {
        const anim = this.doc.sprite.animations[this.doc.animation];
        return anim.frames.map((_, i) => (i === this.doc.frame ? `[${i + 1}]` : ` ${i + 1} `));
    }
    paint() {
        const dirty = this.isDirty() ? `{${door_theme_1.T.alert}-fg}*{/} ` : '';
        const flash = this.statusFlash ? `  {${door_theme_1.T.accent}-fg}${this.statusFlash}{/}` : '';
        this.statusFlash = '';
        const anim = this.doc.sprite.animations[this.doc.animation];
        const frames = this.frameTokens()
            .map((text, i) => (i === this.doc.frame ? `{${door_theme_1.T.accent}-fg}${text}{/}` : text))
            .join('');
        this.statusBar.setContent(`${dirty}{${door_theme_1.T.ink}-fg}${this.doc.sprite.name}{/} ${this.doc.animation} ` +
            `${frames} {${door_theme_1.T.dim}-fg}${anim.ticksPerFrame}tpf ${anim.loop ? 'loop' : 'hold'}{/}${flash}` +
            `  {${door_theme_1.T.dim}-fg}C-p/C-f frame  C-e anim  C-s save  ESC back{/}`);
        this.screen.render();
    }
    exit() {
        this.destroy();
        this.onExit();
    }
    destroy() {
        for (const [keys, handler] of this.keyHandlers) {
            this.screen.unkey(keys, handler);
        }
        this.keyHandlers = [];
        // Destroy the PANEL, not just the editor inside it: a panel's destroy()
        // cascades to its children, so this tears the editor down too.
        // Destroying only the content would orphan an empty, still-draggable
        // panel shell on screen.
        for (const widget of [this.canvasPanel, this.statusBar, this.menuBar]) {
            widget?.destroy();
        }
        this.canvasPanel = this.statusBar = this.menuBar = null;
        this.editor = null;
    }
}
exports.EditScreen = EditScreen;
