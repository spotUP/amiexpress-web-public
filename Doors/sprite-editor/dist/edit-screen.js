"use strict";
/**
 * The edit screen: keys in, document ops through edit-doc, pixels out.
 *
 * Owns nothing clever: every mutation is an edit-doc call (tested there),
 * every save is writeSprite (guarded there), and the canvas paint is
 * bufferToTags over the current frame with a cursor overlay. The screen
 * object install/removes its OWN key handlers so the browser's come back
 * untouched - the same discipline as the door lifecycle rules.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EditScreen = void 0;
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const edit_doc_1 = require("./edit-doc");
const assets_1 = require("./assets");
const preview_1 = require("./preview");
const bindings_1 = require("./bindings");
const layout_1 = require("./layout");
const menu_1 = require("./menu");
const GLYPHS = ['▀', '▄', '█', '▌', '▐', '░', '▒', '▓', '•', '►', '◄', '▲', '▼'];
const PLAYBACK_MS = 100;
const DISCARD_WINDOW_MS = 3000;
class EditScreen {
    constructor(screen, door, file, sprite, onExit) {
        this.mode = 'cell';
        this.cursorRow = 0; // cell coords in cell mode, pixel coords in pixel mode
        this.cursorCol = 0;
        this.fg = 11;
        this.bg = 0;
        this.glyph = 0;
        this.tick = 0;
        this.playback = null;
        this.statusFlash = '';
        this.discardArmedAt = 0;
        this.naming = null; // non-null while typing a new animation name
        this.canvasBox = null;
        this.previewBox = null;
        this.framesBox = null;
        this.paletteBox = null;
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
        // call time (handlers are closures, evaluated only once invoked), so
        // the reorder is safe - screen.children order (and every index the
        // behavior tests pin) is decided solely by buildLayout()'s own
        // box-creation order, which is unchanged.
        this.bindKeys();
        this.buildLayout();
        this.playback = setInterval(() => {
            this.tick++;
            this.paintPreview();
        }, PLAYBACK_MS);
        this.paint();
    }
    buildLayout() {
        const { canvas, preview, frames, toolbar, status } = layout_1.LAYOUT.edit;
        this.canvasBox = blessed_1.default.box({
            parent: this.screen,
            top: canvas.top, left: canvas.left, width: canvas.width, height: canvas.height,
            label: ' Canvas ',
            border: { type: 'line' }, tags: true,
            style: { border: { fg: 'lightyellow' } },
        });
        this.previewBox = blessed_1.default.box({
            parent: this.screen,
            top: preview.top, left: preview.left, width: preview.width, height: preview.height,
            label: ' Preview ',
            border: { type: 'line' }, tags: true,
            style: { border: { fg: 'green' } },
        });
        this.framesBox = blessed_1.default.box({
            parent: this.screen,
            top: frames.top, left: frames.left, width: frames.width, height: frames.height,
            label: ' Frames ',
            border: { type: 'line' }, tags: true,
            style: { border: { fg: 'cyan' } },
        });
        this.paletteBox = blessed_1.default.box({
            parent: this.screen,
            top: toolbar.top, left: toolbar.left, width: toolbar.width, height: toolbar.height,
            label: ' Paint ',
            border: { type: 'line' }, tags: true,
            style: { border: { fg: 'cyan' } },
        });
        this.statusBar = blessed_1.default.box({
            parent: this.screen,
            top: status.top, left: status.left, width: status.width, height: status.height, tags: true,
        });
        // Created LAST so the five indices above (canvasBox..statusBar) keep
        // the exact screen.children[N] positions edit-screen-behavior.test.ts
        // pins - the menu bar is purely additive.
        this.menuBar = (0, menu_1.createStudioMenuBar)(this.screen, this.bindingSet.menuItems());
    }
    /** Bind one screen-key group, remembered so destroy can remove it. */
    key(keys, handler) {
        this.screen.key(keys, handler);
        this.keyHandlers.push([keys, handler]);
    }
    /**
     * Bind a key that MUTATES THE DOCUMENT OR VIEW STATE and must do nothing
     * while a name is being typed. blessed fires the registered key handler
     * AND emits 'keypress' for the same physical key, so every one of these
     * would otherwise double as a letter in the typed name - naming "spin"
     * saved to disk (s) and inserted a blank frame (n) before this guard
     * existed. space/delete/enter/escape/+ are NOT routed through here: they
     * handle the naming state themselves (typing into the name, submitting,
     * cancelling). Routed through one wrapper so the guard exists exactly
     * once, per finding-1's review note.
     */
    opKey(keys, handler) {
        this.key(keys, (...args) => {
            if (this.naming !== null)
                return;
            handler(...args);
        });
    }
    /**
     * The op table: every opKey-guarded binding, plus 'paint' (space), which
     * is naming-aware itself and so is wired separately below (see opKey's
     * own doc comment for why space/delete/enter/escape/+ don't share the
     * outer guard). Handler bodies are unchanged from before the table -
     * only where they are declared moved. This one table is also the single
     * source for the glyph-typing exclusion set below, replacing a
     * hand-written string that had already drifted once (missing 'X' for
     * S-x, caught by shiftXDoesNotTypeIntoTheCell).
     */
    buildOpBindings() {
        return [
            // Cursor movement, cell/pixel mode, and the paint tool's own
            // glyph/fg/bg settings all group under one 'Mode' menu: they are
            // the controls for what happens when the paint key runs next,
            // which is the same reason the studio-2c menu plan names it
            // 'Mode' rather than splitting it into a 'View' and a 'Paint'.
            { id: 'cursor.up', keys: ['up'], hotkeyHint: 'up', menu: 'Mode', label: 'Move Up',
                handler: () => this.moveCursor(-1, 0) },
            { id: 'cursor.down', keys: ['down'], hotkeyHint: 'down', menu: 'Mode', label: 'Move Down',
                handler: () => this.moveCursor(1, 0) },
            { id: 'cursor.left', keys: ['left'], hotkeyHint: 'left', menu: 'Mode', label: 'Move Left',
                handler: () => this.moveCursor(0, -1) },
            { id: 'cursor.right', keys: ['right'], hotkeyHint: 'right', menu: 'Mode', label: 'Move Right',
                handler: () => this.moveCursor(0, 1) },
            { id: 'view.toggleMode', keys: ['tab'], hotkeyHint: 'tab', menu: 'Mode', label: 'Toggle Cell/Pixel Mode',
                handler: () => {
                    if (this.mode === 'cell' && (0, edit_doc_1.frameIsPixelEditable)(this.doc)) {
                        this.mode = 'pixel';
                        this.cursorRow = Math.min(this.cursorRow * 2, this.doc.sprite.cellH * 2 - 1);
                    }
                    else {
                        if (this.mode === 'pixel')
                            this.cursorRow = Math.floor(this.cursorRow / 2);
                        this.mode = 'cell';
                    }
                    this.paint();
                } },
            { id: 'paint.nextGlyph', keys: ['g'], hotkeyHint: 'g', menu: 'Mode', label: 'Next Glyph',
                handler: () => { this.glyph = (this.glyph + 1) % GLYPHS.length; this.paint(); } },
            { id: 'paint.nextFg', keys: ['f'], hotkeyHint: 'f', menu: 'Mode', label: 'Next Foreground',
                handler: () => { this.fg = (this.fg + 1) % 16; this.paint(); } },
            { id: 'paint.prevFg', keys: ['S-f'], hotkeyHint: 'S-f', menu: 'Mode', label: 'Previous Foreground',
                handler: () => { this.fg = (this.fg + 15) % 16; this.paint(); } },
            { id: 'paint.nextBg', keys: ['b'], hotkeyHint: 'b', menu: 'Mode', label: 'Next Background',
                handler: () => { this.bg = (this.bg + 1) % 16; this.paint(); } },
            { id: 'paint.prevBg', keys: ['S-b'], hotkeyHint: 'S-b', menu: 'Mode', label: 'Previous Background',
                handler: () => { this.bg = (this.bg + 15) % 16; this.paint(); } },
            { id: 'frame.prev', keys: [','], hotkeyHint: ',', menu: 'Frame', label: 'Previous Frame',
                handler: () => this.apply((0, edit_doc_1.selectFrame)(this.doc, this.doc.frame - 1)) },
            { id: 'frame.next', keys: ['.'], hotkeyHint: '.', menu: 'Frame', label: 'Next Frame',
                handler: () => this.apply((0, edit_doc_1.selectFrame)(this.doc, this.doc.frame + 1)) },
            { id: 'frame.new', keys: ['n'], hotkeyHint: 'n', menu: 'Frame', label: 'New Frame',
                handler: () => this.tryOp(() => (0, edit_doc_1.addFrame)(this.doc, 'blank')) },
            { id: 'frame.duplicate', keys: ['c'], hotkeyHint: 'c', menu: 'Frame', label: 'Duplicate Frame',
                handler: () => this.tryOp(() => (0, edit_doc_1.addFrame)(this.doc, 'duplicate')) },
            { id: 'frame.delete', keys: ['x'], hotkeyHint: 'x', menu: 'Frame', label: 'Delete Frame',
                handler: () => this.tryOp(() => (0, edit_doc_1.deleteFrame)(this.doc)) },
            { id: 'frame.moveEarlier', keys: ['S-,'], hotkeyHint: 'S-,', menu: 'Frame', label: 'Move Frame Earlier',
                handler: () => this.apply((0, edit_doc_1.moveFrame)(this.doc, -1)) },
            { id: 'frame.moveLater', keys: ['S-.'], hotkeyHint: 'S-.', menu: 'Frame', label: 'Move Frame Later',
                handler: () => this.apply((0, edit_doc_1.moveFrame)(this.doc, 1)) },
            { id: 'animation.next', keys: ['a'], hotkeyHint: 'a', menu: 'Animation', label: 'Next Animation',
                handler: () => {
                    const names = Object.keys(this.doc.sprite.animations).sort();
                    const next = names[(names.indexOf(this.doc.animation) + 1) % names.length];
                    this.apply((0, edit_doc_1.selectAnimation)(this.doc, next));
                } },
            { id: 'animation.new', keys: ['+'], hotkeyHint: '+', menu: 'Animation', label: 'New Animation',
                handler: () => { this.naming = ''; this.paint(); } },
            { id: 'animation.slower', keys: ['t'], hotkeyHint: 't', menu: 'Animation', label: 'Slower',
                handler: () => this.apply((0, edit_doc_1.setTicksPerFrame)(this.doc, -1)) },
            { id: 'animation.faster', keys: ['S-t'], hotkeyHint: 'S-t', menu: 'Animation', label: 'Faster',
                handler: () => this.apply((0, edit_doc_1.setTicksPerFrame)(this.doc, +1)) },
            { id: 'animation.toggleLoop', keys: ['l'], hotkeyHint: 'l', menu: 'Animation', label: 'Toggle Loop',
                handler: () => this.apply((0, edit_doc_1.toggleLoop)(this.doc)) },
            { id: 'animation.delete', keys: ['S-x'], hotkeyHint: 'S-x', menu: 'Animation', label: 'Delete Animation',
                handler: () => this.tryOp(() => (0, edit_doc_1.deleteAnimation)(this.doc)) },
            { id: 'file.save', keys: ['s'], hotkeyHint: 's', menu: 'File', label: 'Save',
                handler: () => this.save() },
            // Menu-only (keys: [] - the pattern bindings.ts/anEmptyKeysBindingIsMenuOnly
            // pins): reuses the existing statusFlash+paint plumbing every other
            // op's refusal already uses, so there is no new display mechanism,
            // just a Help menu entry that fills it in.
            { id: 'studio.help', keys: [], hotkeyHint: '', menu: 'Help', label: 'Keyboard Shortcuts',
                handler: () => {
                    this.statusFlash = 'g/f/S-f/b/S-b paint  n/c/x/S-,/S-. frames  a/+/t/S-t/l/S-x animation  TAB mode  s save  ESC back';
                    this.paint();
                } },
        ];
    }
    bindKeys() {
        const opBindings = this.buildOpBindings();
        for (const binding of opBindings)
            this.opKey(binding.keys, binding.handler);
        // Paint (space) is naming-aware itself (it types a space into the name
        // while naming, rather than doing nothing like every opKey binding),
        // so it is wired directly with this.key(), not opKey() - but it still
        // needs a table entry so its key contributes to the exclusion set
        // below, the same as every opKey binding does.
        const paintBinding = {
            id: 'paint.paint', keys: ['space'], hotkeyHint: 'space', menu: 'Paint', label: 'Paint',
            handler: () => {
                if (this.naming !== null) {
                    this.typeName(' ');
                    return;
                }
                this.tryOp(() => this.mode === 'pixel'
                    ? (0, edit_doc_1.setPixel)(this.doc, this.cursorRow, this.cursorCol, this.fg)
                    : (0, edit_doc_1.setCell)(this.doc, this.cursorRow, this.cursorCol, { char: GLYPHS[this.glyph], fg: this.fg, bg: this.bg }));
            },
        };
        this.key(paintBinding.keys, paintBinding.handler);
        this.bindingSet = (0, bindings_1.buildBindingSet)([...opBindings, paintBinding]);
        this.key(['delete', 'backspace'], () => {
            if (this.naming !== null) {
                this.naming = this.naming.slice(0, -1);
                this.paint();
                return;
            }
            this.tryOp(() => this.mode === 'pixel'
                ? (0, edit_doc_1.setPixel)(this.doc, this.cursorRow, this.cursorCol, null)
                : (0, edit_doc_1.setCell)(this.doc, this.cursorRow, this.cursorCol, null));
        });
        this.key(['enter'], () => {
            if (this.naming !== null) {
                const name = this.naming;
                this.naming = null;
                this.tryOp(() => (0, edit_doc_1.addAnimation)(this.doc, name));
            }
        });
        this.key(['escape'], () => {
            if (this.naming !== null) {
                this.naming = null;
                this.paint();
                return;
            }
            if (this.doc.dirty && Date.now() - this.discardArmedAt > DISCARD_WINDOW_MS) {
                this.discardArmedAt = Date.now();
                this.statusFlash = 'UNSAVED - escape again to discard, s to save';
                this.paint();
                return;
            }
            this.exit();
        });
        // Typed characters set the cell's char in cell mode, or extend the
        // animation name while naming. Screen keypress, filtered to printables.
        const onKeypress = (ch) => {
            if (!ch || ch.length !== 1 || ch < ' ' || ch === '\x7f')
                return;
            if (this.naming !== null) {
                this.typeName(ch);
                return;
            }
            if (this.mode !== 'cell')
                return;
            if (this.bindingSet.excludedGlyphKeys.has(ch))
                return; // bound keys keep their meaning
            if (ch === '{' || ch === '}')
                return; // the two characters the format refuses
            this.apply((0, edit_doc_1.setCell)(this.doc, this.cursorRow, this.cursorCol, { char: ch, fg: this.fg, bg: this.bg }));
        };
        this.screen.on('keypress', onKeypress);
        this.keyHandlers.push([['__keypress__'], onKeypress]);
    }
    typeName(ch) {
        if (this.naming === null)
            return;
        if (/[a-z0-9-]/.test(ch))
            this.naming += ch;
        this.paint();
    }
    moveCursor(dr, dc) {
        const rows = this.mode === 'pixel' ? this.doc.sprite.cellH * 2 : this.doc.sprite.cellH;
        const cols = this.doc.sprite.cellW;
        this.cursorRow = Math.max(0, Math.min(rows - 1, this.cursorRow + dr));
        this.cursorCol = Math.max(0, Math.min(cols - 1, this.cursorCol + dc));
        this.paint();
    }
    apply(next) {
        if (next === this.doc)
            return;
        this.doc = next;
        // Every state change funnels through here, so this is the one place
        // that needs to know: pixel mode is only valid for a half-block frame,
        // and frame/animation selection (or a frame add/delete that shifts
        // which frame is current) can land on one that is not. Left unchecked,
        // 'space' calls setPixel on a non-half-block frame and edit-doc.ts
        // throws out of the key handler.
        if (this.mode === 'pixel' && !(0, edit_doc_1.frameIsPixelEditable)(this.doc)) {
            this.mode = 'cell';
            this.cursorRow = Math.floor(this.cursorRow / 2);
        }
        this.paint();
    }
    tryOp(op) {
        try {
            this.apply(op());
        }
        catch (error) {
            this.statusFlash = String(error.message);
            this.paint();
        }
    }
    save() {
        try {
            (0, assets_1.writeSprite)(this.door, this.file, (0, edit_doc_1.toSprite)(this.doc));
            this.doc = { ...this.doc, dirty: false };
            this.statusFlash = `saved ${this.file}`;
        }
        catch (error) {
            this.statusFlash = `SAVE FAILED: ${error.message}`;
        }
        this.paint();
    }
    /** The frame, scale 2, with the cursor cell/pixel inverted. */
    paintCanvas() {
        const frame = (0, edit_doc_1.currentFrame)(this.doc);
        const rows = [];
        for (let r = 0; r < frame.length; r++) {
            let line = '';
            for (let c = 0; c < frame[r].length; c++) {
                const cell = frame[r][c];
                const isCursor = this.mode === 'cell'
                    ? (r === this.cursorRow && c === this.cursorCol)
                    : (Math.floor(this.cursorRow / 2) === r && this.cursorCol === c);
                const char = cell ? cell.char : ' ';
                const fg = cell ? cell_art_1.PALETTE[cell.fg] : 'gray';
                const bg = cell ? cell_art_1.PALETTE[cell.bg] : 'black';
                const body = `${char}${char}`;
                line += isCursor
                    ? `{${bg}-fg}{${fg}-bg}${body}{/}` // inverted = the cursor
                    : `{${fg}-fg}{${bg}-bg}${body}{/}`;
            }
            rows.push(line);
        }
        const modeLine = this.mode === 'pixel'
            ? `{lightgreen-fg}PIXEL{/} row ${this.cursorRow} col ${this.cursorCol}`
            : `{lightyellow-fg}CELL{/} row ${this.cursorRow} col ${this.cursorCol}`;
        this.canvasBox.setContent('\n ' + rows.join('\n ') + '\n\n ' + modeLine);
    }
    paintPreview() {
        const anim = this.doc.sprite.animations[this.doc.animation];
        const lines = (0, preview_1.previewLines)(this.doc.sprite, this.doc.animation, this.tick, 2);
        this.previewBox.setContent('\n ' + lines.join('\n ') +
            `\n\n {gray-fg}${this.doc.animation} - ${anim.frames.length}f ` +
            `${anim.ticksPerFrame}tpf ${anim.loop ? 'loop' : 'hold'}{/}`);
        this.screen.render();
    }
    paintFrames() {
        const anim = this.doc.sprite.animations[this.doc.animation];
        const strip = anim.frames
            .map((_, i) => (i === this.doc.frame ? `{blue-bg}{lightyellow-fg}[${i + 1}]{/}` : ` ${i + 1} `))
            .join(' ');
        const naming = this.naming !== null
            ? `\n new animation: {lightyellow-fg}${this.naming}{/}_ (enter/escape)`
            : '';
        this.framesBox.setContent(`\n ${strip}${naming}`);
    }
    paintPalette() {
        const swatches = cell_art_1.PALETTE
            .map((name, i) => {
            const marker = i === this.fg ? 'F' : i === this.bg ? 'B' : ' ';
            return `{${name}-bg}{${i === 0 ? 'white' : 'black'}-fg}${marker}{/}`;
        })
            .join('');
        this.paletteBox.setContent(`\n ${swatches}\n glyph: ${GLYPHS[this.glyph]}  ` +
            `fg {${cell_art_1.PALETTE[this.fg]}-fg}${this.fg}{/}  bg {${cell_art_1.PALETTE[this.bg]}-fg}${this.bg}{/}`);
    }
    paint() {
        this.paintCanvas();
        this.paintFrames();
        this.paintPalette();
        const dirty = this.doc.dirty ? '{lightred-fg}*{/} ' : '';
        const flash = this.statusFlash ? `  {lightyellow-fg}${this.statusFlash}{/}` : '';
        this.statusFlash = '';
        this.statusBar.setContent(`${dirty}{white-fg}${this.doc.sprite.name}{/} ${this.doc.animation} ` +
            `f${this.doc.frame + 1}${flash}` +
            '  {gray-fg}SPACE paint  DEL clear  TAB mode  s save  ESC back{/}');
        this.paintPreview();
    }
    exit() {
        this.destroy();
        this.onExit();
    }
    destroy() {
        if (this.playback) {
            clearInterval(this.playback);
            this.playback = null;
        }
        for (const [keys, handler] of this.keyHandlers) {
            if (keys[0] === '__keypress__')
                this.screen.removeListener('keypress', handler);
            else
                this.screen.unkey(keys, handler);
        }
        this.keyHandlers = [];
        for (const widget of [this.canvasBox, this.previewBox, this.framesBox,
            this.paletteBox, this.statusBar, this.menuBar]) {
            widget?.destroy();
        }
        this.canvasBox = this.previewBox = this.framesBox = this.paletteBox = this.statusBar = this.menuBar = null;
    }
}
exports.EditScreen = EditScreen;
