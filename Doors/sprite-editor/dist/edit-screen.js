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
exports.EditScreen = exports.CELL_CHAR_WIDTH = void 0;
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const edit_doc_1 = require("./edit-doc");
const assets_1 = require("./assets");
const preview_1 = require("./preview");
const bindings_1 = require("./bindings");
const layout_1 = require("./layout");
const menu_1 = require("./menu");
const panels_1 = require("./panels");
const toolbar_1 = require("./toolbar");
const token_strip_1 = require("./token-strip");
const GLYPHS = ['▀', '▄', '█', '▌', '▐', '░', '▒', '▓', '•', '►', '◄', '▲', '▼'];
const PLAYBACK_MS = 100;
const DISCARD_WINDOW_MS = 3000;
// Fix round 1, Important 2: the ONE place that says a cell renders as two
// characters wide. paintCanvas() (the render side) and canvasHitTest()
// (the click side) both read this constant instead of each carrying its
// own literal '2' - two independently-written copies of the same number
// are a defect even while they happen to agree; this makes disagreement
// impossible instead of merely unlikely. Exported so a test can pin both
// sides against the SAME imported value, not two hand-typed '2's of its
// own that would happily desync from a future source change.
exports.CELL_CHAR_WIDTH = 2;
class EditScreen {
    constructor(screen, door, file, sprite, onExit) {
        this.mode = 'cell';
        this.cursorRow = 0; // cell coords in cell mode, pixel coords in pixel mode
        this.cursorCol = 0;
        this.fg = 11;
        this.bg = 0;
        this.glyph = 0;
        this.tool = 'paint';
        this.tick = 0;
        this.playback = null;
        this.statusFlash = '';
        this.discardArmedAt = 0;
        this.naming = null; // non-null while typing a new animation name
        this.canvasPanel = null;
        this.previewPanel = null;
        this.framesPanel = null;
        this.toolbarPanel = null;
        this.canvasBox = null;
        this.previewBox = null;
        this.framesBox = null;
        this.toolbarState = null;
        this.toolbar = null;
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
        this.wireMouse();
        this.playback = setInterval(() => {
            this.tick++;
            this.paintPreview();
        }, PLAYBACK_MS);
        this.paint();
    }
    /**
     * Studio 2c: each content pane is now a DockablePanel (panels.ts's
     * makePanel) at the SAME LAYOUT rect the bare box used to occupy; the
     * actual content box becomes its child, positioned by panels.ts's
     * panelContentRect (fix round 1: top:1, not top:0 - see its doc
     * comment for why row 0 belongs to the title bar, not the content).
     */
    buildLayout() {
        const { canvas, preview, frames, toolbar, status } = layout_1.LAYOUT.edit;
        this.canvasPanel = (0, panels_1.makePanel)(this.screen, { key: 'canvas', title: ' Canvas ', rect: canvas });
        const canvasContent = (0, panels_1.panelContentRect)(canvas);
        this.canvasBox = blessed_1.default.box({
            parent: this.canvasPanel,
            top: canvasContent.top, left: canvasContent.left, width: canvasContent.width, height: canvasContent.height,
            border: { type: 'none' }, tags: true, mouse: true,
        });
        this.previewPanel = (0, panels_1.makePanel)(this.screen, { key: 'preview', title: ' Preview ', rect: preview });
        const previewContent = (0, panels_1.panelContentRect)(preview);
        this.previewBox = blessed_1.default.box({
            parent: this.previewPanel,
            top: previewContent.top, left: previewContent.left, width: previewContent.width, height: previewContent.height,
            border: { type: 'none' }, tags: true,
        });
        this.framesPanel = (0, panels_1.makePanel)(this.screen, { key: 'frames', title: ' Frames ', rect: frames });
        const framesContent = (0, panels_1.panelContentRect)(frames);
        this.framesBox = blessed_1.default.box({
            parent: this.framesPanel,
            top: framesContent.top, left: framesContent.left, width: framesContent.width, height: framesContent.height,
            border: { type: 'none' }, tags: true, mouse: true,
        });
        this.toolbarPanel = (0, panels_1.makePanel)(this.screen, { key: 'toolbar', title: ' Paint ', rect: toolbar });
        // toolbar.ts owns its own content child (sized off LAYOUT.edit.toolbar
        // itself, via the same panelContentRect every other pane uses) - it is
        // the one pane whose content construction moved out of this file, per
        // the brief's fixed `createToolbar(screen, panel, state, onChange)`
        // signature.
        this.toolbarState = { tool: this.tool, colour: this.fg };
        this.toolbar = (0, toolbar_1.createToolbar)(this.screen, this.toolbarPanel, this.toolbarState, (next) => {
            this.tool = next.tool;
            this.fg = next.colour;
            this.paint();
        });
        this.statusBar = blessed_1.default.box({
            parent: this.screen,
            top: status.top, left: status.left, width: status.width, height: status.height, tags: true,
        });
        // Created LAST so the five indices above (canvasPanel..statusBar) keep
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
            // Studio 2c task 4: which tool a canvas click/drag applies. Keys
            // checked against every table entry above (task-4-report.md has the
            // full conflict trace) - p/e/k/u are all free; each is a single
            // printable char, so each lands in the derived glyph-exclusion set
            // the same way g/f/b/n/c/x/a/t/l/s already do (one more letter each
            // that cell mode can no longer type literally).
            { id: 'tool.paint', keys: ['p'], hotkeyHint: 'p', menu: 'Tools', label: 'Paint Tool',
                handler: () => { this.tool = 'paint'; this.paint(); } },
            { id: 'tool.erase', keys: ['e'], hotkeyHint: 'e', menu: 'Tools', label: 'Erase Tool',
                handler: () => { this.tool = 'erase'; this.paint(); } },
            { id: 'tool.pick', keys: ['k'], hotkeyHint: 'k', menu: 'Tools', label: 'Pick Tool',
                handler: () => { this.tool = 'pick'; this.paint(); } },
            { id: 'tool.fill', keys: ['u'], hotkeyHint: 'u', menu: 'Tools', label: 'Fill Tool',
                handler: () => { this.tool = 'fill'; this.paint(); } },
            // F1 - standard help key, non-printable (contributes nothing to the
            // glyph exclusion set: glyphForKey('f1') is null, key.length !== 1
            // and no 'S-' prefix). Reuses the existing statusFlash+paint
            // plumbing every other op's refusal already uses, so there is no
            // new display mechanism, just a Help menu entry that fills it in.
            { id: 'studio.help', keys: ['f1'], hotkeyHint: 'F1', menu: 'Help', label: 'Keyboard Shortcuts',
                handler: () => {
                    this.statusFlash = 'g/f/S-f/b/S-b paint  n/c/x/S-,/S-. frames  a/+/t/S-t/l/S-x animation  TAB mode  s save  ESC back';
                    this.paint();
                } },
            // Studio 2c: menu-only (empty keys is legal - see bindings.ts's
            // anEmptyKeysBindingIsMenuOnly), restores every panel to its LAYOUT
            // rect and floating state through panels.ts's resetPanelLayout.
            { id: 'view.resetLayout', keys: [], hotkeyHint: '', menu: 'View', label: 'Reset Layout',
                handler: () => {
                    (0, panels_1.resetPanelLayout)(this.canvasPanel, layout_1.LAYOUT.edit.canvas);
                    (0, panels_1.resetPanelLayout)(this.previewPanel, layout_1.LAYOUT.edit.preview);
                    (0, panels_1.resetPanelLayout)(this.framesPanel, layout_1.LAYOUT.edit.frames);
                    (0, panels_1.resetPanelLayout)(this.toolbarPanel, layout_1.LAYOUT.edit.toolbar);
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
                const body = char.repeat(exports.CELL_CHAR_WIDTH);
                line += isCursor
                    ? `{${bg}-fg}{${fg}-bg}${body}{/}` // inverted = the cursor
                    : `{${fg}-fg}{${bg}-bg}${body}{/}`;
            }
            rows.push(line);
        }
        const modeLine = this.mode === 'pixel'
            ? `{lightgreen-fg}PIXEL{/} row ${this.cursorRow} col ${this.cursorCol}`
            : `{lightyellow-fg}CELL{/} row ${this.cursorRow} col ${this.cursorCol}`;
        // Fix round 1, Important 2: no leading '\n ' any more - that blank
        // line used to push content below the box's own label/border; now
        // the CONTENT CHILD's position (panels.ts's panelContentRect, top:1)
        // already skips the panel's title-bar row, so a literal leading
        // newline here would double-blank it (one row lost to the panel's
        // geometry, a second lost to this string).
        //
        // Studio 2c task 4: `rows.join('\n')`, not `rows.join('\n ')`. The
        // one-space SEPARATOR (distinct from the leading-newline hack fix
        // round 1 already removed) put a phantom one-column left margin on
        // every row EXCEPT the first - `['a','b'].join('\n ')` is `'a\n b'`,
        // not `'a\nb'`. Harmless-looking on a two-char-per-cell canvas until
        // mouse painting needed to map a click's screen column back to a cell
        // column: with the stray space, row 0's cell c sits at local columns
        // [2c, 2c+1] but every row below it sits one column further right,
        // an inconsistency no keyboard-only editor could ever have surfaced.
        // Found while building `canvasHitTest` below and fixed here rather
        // than replicating the stagger in a second, "matching" but equally
        // wrong transform - see task-4-report.md.
        this.canvasBox.setContent(rows.join('\n') + '\n\n ' + modeLine);
    }
    /**
     * Map an absolute mouse-event (x, y) to a cell in the CURRENT frame, or
     * null when the click landed outside the grid (e.g. on the mode-line
     * row below it). box._getCoords() gives the canvas box's own live
     * absolute position - the exact numbers blessed itself used to place
     * paintCanvas()'s content on screen - so this reuses that placement
     * rather than re-deriving it from LAYOUT (which would drift the moment
     * a sysop drags the canvas panel elsewhere). The column math divides by
     * the SAME `CELL_CHAR_WIDTH` constant paintCanvas() builds each cell's
     * body from (flush from column 0 on every row now that the join-
     * separator stagger above is fixed) - one shared number, not two
     * independently-written literals that happen to agree.
     */
    canvasHitTest(data) {
        const coords = this.canvasBox._getCoords();
        if (!coords)
            return null;
        const localX = data.x - coords.xi;
        const localY = data.y - coords.yi;
        const frame = (0, edit_doc_1.currentFrame)(this.doc);
        if (localY < 0 || localY >= frame.length || localX < 0)
            return null;
        const col = Math.floor(localX / exports.CELL_CHAR_WIDTH);
        if (col >= frame[localY].length)
            return null;
        return { row: localY, col };
    }
    /**
     * Run the active tool at a clicked/dragged CELL (row, col are cell-mode
     * coordinates - the grid paintCanvas() itself renders one row per cell
     * regardless of cell/pixel mode). In pixel mode the click also moves the
     * cursor's cell, but PRESERVES which pixel half (top/bottom) it was
     * already on: a terminal mouse event has cell resolution, not half-cell,
     * so there is no click position that could disambiguate top vs bottom -
     * only the keyboard's up/down (which halves cursorRow) can select that.
     */
    applyToolAt(cellRow, cellCol) {
        // Two row numberings, never mixed: setCell/a cell-mode fg-read want
        // CELL space (0..cellH-1, what cellRow already is); setPixel/
        // floodFill/a pixel-mode fg-read want PIXEL space (0..cellH*2-1).
        // floodFill has no cell-space equivalent - Fill always runs in pixel
        // space regardless of `this.mode`, defaulting to the TOP half when
        // clicked from cell mode (there is no half to preserve there).
        const pixelRow = cellRow * 2 + (this.mode === 'pixel' ? this.cursorRow % 2 : 0);
        this.cursorRow = this.mode === 'pixel' ? pixelRow : cellRow;
        this.cursorCol = cellCol;
        if (this.tool === 'paint') {
            this.tryOp(() => this.mode === 'pixel'
                ? (0, edit_doc_1.setPixel)(this.doc, pixelRow, cellCol, this.fg)
                : (0, edit_doc_1.setCell)(this.doc, cellRow, cellCol, { char: GLYPHS[this.glyph], fg: this.fg, bg: this.bg }));
        }
        else if (this.tool === 'erase') {
            this.tryOp(() => this.mode === 'pixel'
                ? (0, edit_doc_1.setPixel)(this.doc, pixelRow, cellCol, null)
                : (0, edit_doc_1.setCell)(this.doc, cellRow, cellCol, null));
        }
        else if (this.tool === 'fill') {
            this.tryOp(() => (0, edit_doc_1.floodFill)(this.doc, pixelRow, cellCol, this.fg));
        }
        else { // pick - reads a colour into ToolbarState, never touches the doc
            const picked = this.mode === 'pixel'
                ? ((0, cell_art_1.decompilePixels)((0, edit_doc_1.currentFrame)(this.doc)) ?? [])[pixelRow]?.[cellCol] ?? null
                : (0, edit_doc_1.currentFrame)(this.doc)[cellRow][cellCol]?.fg ?? null;
            if (picked !== null)
                this.fg = picked;
            this.paint(); // tryOp's branches already repaint on success/failure; this one must do it itself
        }
    }
    handleCanvasClick(data) {
        // Fix round 1, Important 1: every keyboard op is naming-guarded
        // (opKey()) and the sibling handleFramesClick already has this same
        // check - mouse painting must not be the one path that bypasses it,
        // or "+", click-paint, click-paint... mutates the live document while
        // an animation name is mid-entry.
        if (this.naming !== null)
            return;
        const hit = this.canvasHitTest(data);
        if (!hit)
            return;
        this.applyToolAt(hit.row, hit.col);
    }
    /** Drag (mousemove with a button held) paints continuously - paint/erase only, never pick/fill. */
    handleCanvasDrag(data) {
        if (this.naming !== null)
            return; // same naming guard as handleCanvasClick
        if (!data.button)
            return;
        if (this.tool !== 'paint' && this.tool !== 'erase')
            return;
        const hit = this.canvasHitTest(data);
        if (!hit)
            return;
        this.applyToolAt(hit.row, hit.col);
    }
    handleFramesClick(data) {
        if (this.naming !== null)
            return; // don't reinterpret a click while typing a name
        const coords = this.framesBox._getCoords();
        if (!coords)
            return;
        const localX = data.x - coords.xi;
        const localY = data.y - coords.yi;
        if (localY !== 0)
            return; // row 1+ is the "new animation" naming line, not a frame
        const index = (0, token_strip_1.tokenAtColumn)(this.frameTokens(), localX);
        if (index === -1)
            return;
        // The exact same op the ,/. bindings call - selectFrame, not a
        // second copy of frame-selection logic.
        this.apply((0, edit_doc_1.selectFrame)(this.doc, index));
    }
    wireMouse() {
        this.canvasBox.on('click', (data) => this.handleCanvasClick(data));
        this.canvasBox.on('mousemove', (data) => this.handleCanvasDrag(data));
        this.framesBox.on('click', (data) => this.handleFramesClick(data));
    }
    paintPreview() {
        const anim = this.doc.sprite.animations[this.doc.animation];
        const lines = (0, preview_1.previewLines)(this.doc.sprite, this.doc.animation, this.tick, 2);
        this.previewBox.setContent(lines.join('\n ') +
            `\n\n {gray-fg}${this.doc.animation} - ${anim.frames.length}f ` +
            `${anim.ticksPerFrame}tpf ${anim.loop ? 'loop' : 'hold'}{/}`);
        this.screen.render();
    }
    /**
     * The frames strip's plain (untagged) per-frame tokens, in display
     * order - one source both paintFrames() (which wraps the active one in
     * colour tags) and handleFramesClick() (which walks them via
     * token-strip.ts's tokenAtColumn) read, so a click can never disagree
     * with what is actually on screen.
     */
    frameTokens() {
        const anim = this.doc.sprite.animations[this.doc.animation];
        return anim.frames.map((_, i) => (i === this.doc.frame ? `[${i + 1}]` : ` ${i + 1} `));
    }
    paintFrames() {
        const strip = this.frameTokens()
            .map((text, i) => (i === this.doc.frame ? `{blue-bg}{lightyellow-fg}${text}{/}` : text))
            .join(' ');
        const naming = this.naming !== null
            ? `\n new animation: {lightyellow-fg}${this.naming}{/}_ (enter/escape)`
            : '';
        this.framesBox.setContent(`${strip}${naming}`);
    }
    paint() {
        this.paintCanvas();
        this.paintFrames();
        // The toolbar's own copy of tool/colour is a mirror, not a second
        // source of truth - this.tool/this.fg are canonical (the same fields
        // the keyboard's p/e/k/u and f/S-f keys write), refreshed into
        // toolbarState every render so the palette highlight can never drift
        // from what a keyboard-driven change just did.
        this.toolbarState.tool = this.tool;
        this.toolbarState.colour = this.fg;
        this.toolbar.refresh();
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
        // this.toolbar.destroy() first: it owns a Box parented on
        // toolbarPanel, which the panel-destroy loop below would also tear
        // down via cascade (element.ts's destroy() is idempotent - guarded by
        // `if (this.destroyed) return`), but toolbar.ts is the module that
        // created that box, so it is the one that should also be the one to
        // let it go.
        this.toolbar?.destroy();
        // Destroy the PANELS, not just their nested content boxes: a panel's
        // destroy() cascades to its children (element.ts's destroy() destroys
        // every child), so this alone tears down canvasBox/previewBox/
        // framesBox too. Destroying only the content and leaving the panel
        // attached would orphan an empty, still-visible, still-draggable
        // panel shell (border + title bar) on screen.
        for (const widget of [this.canvasPanel, this.previewPanel, this.framesPanel,
            this.toolbarPanel, this.statusBar, this.menuBar]) {
            widget?.destroy();
        }
        this.canvasPanel = this.previewPanel = this.framesPanel = this.toolbarPanel = null;
        this.canvasBox = this.previewBox = this.framesBox = this.statusBar = this.menuBar = null;
        // Fix round 1, minor: nulled for the same reason every sibling widget
        // ref above is - a destroyed screen shouldn't leave a stale live
        // reference reachable off `this`.
        this.toolbar = this.toolbarState = null;
    }
}
exports.EditScreen = EditScreen;
