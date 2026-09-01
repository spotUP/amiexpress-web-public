"use strict";
/**
 * Sprite Studio: the ANSI editor door, forked and taught about sprites.
 *
 * This is a fork of `Doors/ansi-editor/index.ts`, which is what the design
 * doc asked for from the start ("the studio door is a fork of its door
 * wrapper reusing this engine wholesale") and what the sysop repeated after
 * seeing what was built instead: "everything should live inside the forked
 * ansi-edit; we transform it to a full sprite animation studio."
 *
 * So there is ONE application here, shaped like Deluxe Paint: a full-screen
 * editor with its own menu bar, its own colour/tool sidebar, its own status
 * line - and everything else is a REQUESTER that appears, does its job and
 * goes away. No browser screen, no docked panes, no second menu bar.
 *
 * What makes it a sprite studio rather than an ANSI editor:
 *   - the canvas IS the current frame (frameToCanvas/canvasToFrame),
 *   - Frame and Animation live in the editor's own menu bar (extraMenus),
 *   - File > Open picks a door, then a sprite, then closes,
 *   - the animation plays in a requester on C-p, never behind your hand.
 *
 * The document model (edit-doc), the asset I/O (assets), the animation
 * renderer (preview) and the requesters (dialogs) are unchanged modules -
 * they were always independent of the screen that used to wrap them.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpriteStudioDoor = exports.ZOOM_STEPS = exports.DEFAULT_ZOOM = exports.SIDEBAR_COLS = void 0;
exports.stepZoom = stepZoom;
exports.studioTitle = studioTitle;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const edit_doc_1 = require("./edit-doc");
const assets_1 = require("./assets");
const preview_1 = require("./preview");
const dialogs_1 = require("./dialogs");
const door_theme_1 = require("./door-theme");
/** The editor's own sidebar width, subtracted before working out the zoom. */
exports.SIDEBAR_COLS = 6;
/**
 * Magnification, in characters per sprite cell.
 *
 * ONE by default, on the sysop's instruction after seeing an auto-fitted
 * sprite fill the screen: "its super magnified make it 1:1 as default".
 * The art is what it is - a sprite drawn at the size the game draws it is
 * the honest view, and zooming is something you ask for, from the Zoom
 * menu, not something the door decides for you.
 */
exports.DEFAULT_ZOOM = 1;
/** What the Zoom menu offers, in characters per cell. */
exports.ZOOM_STEPS = [1, 2, 3, 4, 6, 8];
/** The next step up or down, clamped - never off the end of the list. */
function stepZoom(current, delta) {
    const i = exports.ZOOM_STEPS.indexOf(current);
    const from = i === -1 ? 0 : i;
    return exports.ZOOM_STEPS[Math.max(0, Math.min(exports.ZOOM_STEPS.length - 1, from + delta))];
}
/** The title line: what is open, which animation, which frame. */
function studioTitle(doc, door, file) {
    if (!doc)
        return 'Sprite Studio';
    const anim = doc.sprite.animations[doc.animation];
    const dirty = doc.dirty ? '*' : '';
    return `${dirty}${door}/${file}  ${doc.animation}  frame ${doc.frame + 1}/${anim.frames.length}`;
}
class SpriteStudioDoor {
    constructor() {
        this.editor = null;
        this.doc = null;
        this.zoom = exports.DEFAULT_ZOOM;
        this.door = '';
        this.file = '';
        this.exitResolve = null;
        this.keyHandlers = [];
    }
    setContext(ctx) {
        this.ctx = ctx;
    }
    async start() {
        this.createUI();
        this.inputManager.enable();
        this.bindHotkeys();
        // Nothing is open yet, so the first thing a sysop sees is the requester
        // that opens something - the editor behind it would have no document.
        await this.openSpriteRequester();
        await new Promise((resolve) => {
            this.exitResolve = resolve;
            this.screen.once('destroy', resolve);
        });
    }
    createUI() {
        (0, door_theme_1.applyTheme)(this.ctx.bbs);
        this.screen = (0, blessed_helpers_1.createScreen)(this.ctx.bbs, {
            dockBorders: false,
            title: 'Sprite Studio',
            responsive: true,
        });
        this.screen.program.write('\x1b[2J');
        this.screen.program.write('\x1b[H');
        this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
        this.screen.alloc();
        // enableGrabKeys MUST be false for blessed widgets - the fork base's
        // comment, and it is still true here.
        this.inputManager = new blessed_helpers_1.DoorInputManager(this.ctx, this.screen, {
            enableGameMode: false,
            enableGrabKeys: false,
            enableMouse: true,
            debug: false,
            debugName: 'SPRITED',
        });
        this.screen.render();
    }
    // ============================================
    // REQUESTERS
    // ============================================
    /**
     * Pick one of a list. The requester owns the screen while it is up and
     * takes itself down again - the black-screen rule the fork base learned
     * the hard way: whoever hides something owns showing it again.
     */
    pick(title, items) {
        return new Promise((resolve) => {
            if (items.length === 0) {
                resolve(null);
                return;
            }
            const list = new blessed_1.List({
                parent: this.screen,
                top: 'center',
                left: 'center',
                width: 44,
                height: Math.min(items.length + 2, 18),
                fixed: true,
                border: { type: 'line' },
                label: ` ${title} `,
                items,
                keys: true,
                mouse: true,
                tags: true,
                style: {
                    fg: door_theme_1.T.ink, bg: door_theme_1.T.bar,
                    border: { fg: door_theme_1.T.accent },
                    selected: { bg: door_theme_1.T.accent, fg: door_theme_1.T.bar },
                },
            });
            const done = (value) => {
                this.screen.dialogOpen = false;
                list.destroy();
                this.editor?.focus();
                this.screen.render();
                resolve(value);
            };
            this.screen.dialogOpen = true;
            list.on('select', (_item, index) => done(index));
            list.key(['escape', 'q'], () => done(null));
            list.focus();
            this.screen.render();
        });
    }
    /** File > Open: a door, then one of its sprites. Then it is gone. */
    async openSpriteRequester() {
        const doors = (0, assets_1.listDoorsWithSprites)();
        if (doors.length === 0) {
            await this.message('No sprites', 'No door on this board has a sprites/ directory.');
            return;
        }
        const d = await this.pick('Open - which door', doors);
        if (d === null)
            return;
        const sprites = (0, assets_1.listSprites)(doors[d]);
        if (sprites.length === 0) {
            await this.message('No sprites', `${doors[d]} has no sprite files.`);
            return;
        }
        const s = await this.pick(`Open - ${doors[d]}`, sprites.map(f => f.replace(/\.sprite\.json$/, '')));
        if (s === null)
            return;
        this.door = doors[d];
        this.file = sprites[s];
        this.doc = (0, edit_doc_1.openDoc)((0, assets_1.readSprite)(this.door, this.file));
        await this.openEditor();
    }
    /**
     * The animation, played on demand.
     *
     * Deliberately a requester and not a pane: the sysop's instruction was
     * "it cant play when i draw i need a panel and hotkeys so i can play it
     * when i need". So nothing animates behind the drawing hand - this opens
     * on C-p, plays, and any key takes it away.
     */
    previewRequester() {
        if (!this.doc)
            return;
        const doc = this.doc;
        const anim = doc.sprite.animations[doc.animation];
        const box = new blessed_1.Box({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: Math.max(24, doc.sprite.cellW * 2 + 6),
            height: doc.sprite.cellH * 2 + 4,
            fixed: true,
            border: { type: 'line' },
            label: ` ${doc.animation} - ${anim.frames.length}f ${anim.ticksPerFrame}tpf ${anim.loop ? 'loop' : 'hold'} `,
            tags: true,
            keys: true,
            focusable: true,
            style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.bar, border: { fg: door_theme_1.T.accent } },
        });
        let tick = 0;
        const timer = setInterval(() => {
            box.setContent((0, preview_1.previewLines)(doc.sprite, doc.animation, tick++, 2).join('\n'));
            this.screen.render();
        }, 100);
        const close = () => {
            clearInterval(timer);
            this.screen.dialogOpen = false;
            box.destroy();
            this.editor?.focus();
            this.screen.render();
        };
        this.screen.dialogOpen = true;
        box.key(['escape', 'enter', 'space', 'q'], close);
        box.on('click', close);
        box.focus();
        this.screen.render();
    }
    message(title, text) {
        return new Promise((resolve) => {
            const box = new blessed_1.Box({
                parent: this.screen,
                top: 'center', left: 'center', width: 60, height: 7,
                fixed: true,
                border: { type: 'line' },
                label: ` ${title} `,
                content: text,
                tags: true, keys: true, focusable: true,
                padding: { left: 2, right: 2, top: 1, bottom: 1 },
                style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.bar, border: { fg: door_theme_1.T.alert } },
            });
            const close = () => {
                this.screen.dialogOpen = false;
                box.destroy();
                this.editor?.focus();
                this.screen.render();
                resolve();
            };
            this.screen.dialogOpen = true;
            box.key(['escape', 'enter', 'space', 'q'], close);
            box.focus();
            this.screen.render();
        });
    }
    // ============================================
    // THE EDITOR - the whole application
    // ============================================
    async openEditor() {
        if (!this.doc)
            return;
        const sprite = this.doc.sprite;
        if (this.editor) {
            this.editor.destroy();
            this.editor = null;
        }
        this.editor = new blessed_1.ANSIEditor({
            parent: this.screen,
            top: 0, left: 0, width: '100%', height: '100%',
            title: studioTitle(this.doc, this.door, this.file),
            initialMode: 'draw',
            canvasWidth: sprite.cellW,
            canvasHeight: sprite.cellH,
            cellScaleX: this.zoom, cellScaleY: this.zoom,
            // An erased sprite cell is a HOLE - compositing skips it and the
            // game's background shows through. Without this every sprite saved
            // here would carry a black box around its artwork.
            transparentBackground: true,
            showLineNumbers: false,
            showMenuBar: true,
            showToolbar: true,
            showSidebar: true,
            showStatusBar: true,
            extraMenus: this.buildMenus(),
            onSave: async () => { await this.save(); return true; },
            onOpen: async () => { await this.openSpriteRequester(); },
            onExit: () => { void this.close(); },
        });
        this.loadFrame();
        this.editor.focus();
        this.screen.render();
    }
    /** Frame and Animation, in the editor's OWN menu bar. */
    buildMenus() {
        return [
            {
                label: 'Frame',
                items: [
                    { label: 'Next Frame      C-f', action: () => this.step(+1) },
                    { label: 'Previous Frame  C-b', action: () => this.step(-1) },
                    { label: '────────────────', separator: true },
                    { label: 'New Frame', action: () => this.op(d => (0, edit_doc_1.addFrame)(d, 'blank')) },
                    { label: 'Duplicate Frame', action: () => this.op(d => (0, edit_doc_1.addFrame)(d, 'duplicate')) },
                    { label: 'Delete Frame', action: () => void this.deleteFrameAsked() },
                    { label: '────────────────', separator: true },
                    { label: 'Move Earlier', action: () => this.op(d => (0, edit_doc_1.moveFrame)(d, -1)) },
                    { label: 'Move Later', action: () => this.op(d => (0, edit_doc_1.moveFrame)(d, 1)) },
                ],
            },
            {
                label: 'Zoom',
                items: exports.ZOOM_STEPS.map(z => ({
                    label: z === 1 ? '1:1  (actual size)' : `${z}:1`,
                    action: () => void this.setZoom(z),
                })),
            },
            {
                label: 'Animation',
                items: [
                    { label: 'Play          C-p', action: () => this.previewRequester() },
                    { label: 'Next          C-e', action: () => this.cycleAnimation() },
                    { label: '────────────────', separator: true },
                    { label: 'New...', action: () => void this.newAnimationAsked() },
                    { label: 'Delete', action: () => void this.deleteAnimationAsked() },
                    { label: '────────────────', separator: true },
                    { label: 'Slower', action: () => this.op(d => (0, edit_doc_1.setTicksPerFrame)(d, -1)) },
                    { label: 'Faster', action: () => this.op(d => (0, edit_doc_1.setTicksPerFrame)(d, +1)) },
                    { label: 'Toggle Loop', action: () => this.op(d => (0, edit_doc_1.toggleLoop)(d)) },
                ],
            },
        ];
    }
    // ============================================
    // THE CANVAS IS THE CURRENT FRAME
    // ============================================
    /**
     * The widget's canvas holds the current frame while the editor is open,
     * so it has to come back into the document before anything changes WHICH
     * frame is current, and before every save. Paint, next frame, lose the
     * strokes is the defect this prevents.
     */
    commit() {
        if (!this.doc || !this.editor)
            return;
        const canvas = this.editor.getCoreCanvas();
        if (!canvas)
            return;
        this.doc = (0, edit_doc_1.setFrame)(this.doc, (0, cell_art_1.canvasToFrame)(canvas));
    }
    loadFrame() {
        if (!this.doc || !this.editor)
            return;
        this.editor.setCoreCanvas((0, cell_art_1.frameToCanvas)((0, edit_doc_1.currentFrame)(this.doc)));
        // setCoreCanvas marks the widget modified; loading a frame is not user
        // work, and left set a freshly opened sprite reads as dirty.
        this.editor.modified = false;
        this.editor.setLabel?.(` ${studioTitle(this.doc, this.door, this.file)} `);
        this.screen.render();
    }
    /** Commit, run a document op, put the new frame on the canvas. */
    op(fn) {
        if (!this.doc)
            return;
        this.commit();
        try {
            const next = fn(this.doc);
            if (next !== this.doc) {
                this.doc = next;
                this.loadFrame();
            }
        }
        catch (error) {
            void this.message('Refused', String(error.message));
        }
    }
    /**
     * Redraw at a new magnification.
     *
     * The widget takes its scale at construction, so this commits what is on
     * the canvas, rebuilds the editor and puts the same frame back - the
     * document never notices.
     */
    async setZoom(zoom) {
        if (zoom === this.zoom)
            return;
        this.commit();
        this.zoom = zoom;
        await this.openEditor();
    }
    step(delta) {
        this.op(d => (0, edit_doc_1.selectFrame)(d, d.frame + delta));
    }
    cycleAnimation() {
        this.op(d => {
            const names = Object.keys(d.sprite.animations).sort();
            const next = names[(names.indexOf(d.animation) + 1) % names.length];
            return (0, edit_doc_1.selectAnimation)(d, next);
        });
    }
    async newAnimationAsked() {
        const name = await (0, dialogs_1.promptText)(this.screen, 'New animation name');
        if (name === null)
            return;
        this.op(d => (0, edit_doc_1.addAnimation)(d, name));
    }
    async deleteFrameAsked() {
        if (await (0, dialogs_1.confirm)(this.screen, 'Delete this frame?'))
            this.op(d => (0, edit_doc_1.deleteFrame)(d));
    }
    async deleteAnimationAsked() {
        if (!this.doc)
            return;
        if (await (0, dialogs_1.confirm)(this.screen, `Delete animation "${this.doc.animation}"?`)) {
            this.op(d => (0, edit_doc_1.deleteAnimation)(d));
        }
    }
    async save() {
        if (!this.doc)
            return;
        this.commit();
        try {
            (0, assets_1.writeSprite)(this.door, this.file, (0, edit_doc_1.toSprite)(this.doc));
            this.doc = { ...this.doc, dirty: false };
            if (this.editor)
                this.editor.modified = false;
            this.loadFrame();
        }
        catch (error) {
            await this.message('Save failed', String(error.message));
        }
    }
    isDirty() {
        return Boolean(this.doc?.dirty) || Boolean(this.editor?.isModified());
    }
    async close() {
        if (this.isDirty() && !(await (0, dialogs_1.confirm)(this.screen, 'Discard unsaved changes?')))
            return;
        this.destroy();
        this.exitResolve?.();
    }
    // ============================================
    // HOTKEYS
    // ============================================
    /**
     * Only what a hand reaches for while drawing. Everything is also in a
     * menu, and every key here is NON-PRINTABLE: in draw mode the editor
     * types printable characters onto the canvas, so a letter hotkey would
     * both run the command AND paint the letter. C-s/C-m/C-z/C-y/C-h are the
     * editor's own and are left alone.
     */
    bindHotkeys() {
        const key = (keys, handler) => {
            const guarded = () => {
                if (this.screen.dialogOpen)
                    return;
                handler();
            };
            this.screen.key(keys, guarded);
            this.keyHandlers.push([keys, guarded]);
        };
        key(['C-f'], () => this.step(+1));
        key(['C-b'], () => this.step(-1));
        key(['C-e'], () => this.cycleAnimation());
        key(['C-p'], () => this.previewRequester());
    }
    destroy() {
        for (const [keys, handler] of this.keyHandlers)
            this.screen.unkey(keys, handler);
        this.keyHandlers = [];
        this.editor?.destroy();
        this.editor = null;
        this.screen?.destroy();
    }
}
exports.SpriteStudioDoor = SpriteStudioDoor;
