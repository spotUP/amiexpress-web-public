"use strict";
/**
 * ANSIEditor - Full-featured ANSI/ASCII art editor widget
 *
 * Features:
 * - Text and Draw modes
 * - Full drawing toolset (draw, line, box, ellipse, fill, pick, select)
 * - ANSI color picker and character picker
 * - Search and replace
 * - Undo/redo
 * - Mouse and keyboard support
 * - File save/load support
 *
 * This widget uses the core ANSI Editor library for all canvas operations
 * and drawing tools, making the core functionality reusable for other doors.
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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ansiEditor = exports.ANSIEditor = void 0;
const box_1 = require("./box");
const canvas_1 = require("./canvas");
const text_1 = require("./text");
const list_1 = require("./list");
const overlay_1 = require("./overlay");
const doc_modal_1 = require("./doc-modal");
const confirm_modal_1 = require("./confirm-modal");
const dropdown_menu_1 = require("./dropdown-menu");
const modal_helpers_1 = require("../utils/modal-helpers");
const CoreCanvas = __importStar(require("../../ansi-editor/core/canvas"));
const editor_state_1 = require("../../ansi-editor/core/editor-state");
// Moebius F-key character sets (12 characters per set)
const FKEY_CHAR_SETS = [
    // Set 1: Block/shade characters
    ['█', '▓', '▒', '░', '▀', '▄', '▌', '▐', '■', '□', '▪', '▫'],
    // Set 2: Box drawing - singles
    ['─', '│', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼', '─'],
    // Set 3: Box drawing - doubles
    ['═', '║', '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬', '═'],
    // Set 4: Box drawing - mixed
    ['╓', '╖', '╙', '╜', '╒', '╕', '╘', '╛', '╞', '╡', '╥', '╨'],
    // Set 5: Arrows and symbols
    ['←', '→', '↑', '↓', '↔', '↕', '◄', '►', '▲', '▼', '◊', '♦'],
    // Set 6: Math and misc
    ['±', '×', '÷', '≤', '≥', '≠', '≈', '∞', '√', '∑', '∏', 'π'],
    // Set 7: Card suits and symbols
    ['♠', '♣', '♥', '♦', '☺', '☻', '☼', '♪', '♫', '†', '‡', '§'],
    // Set 8: Greek letters
    ['α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'σ', 'τ', 'φ', 'ω'],
];
/**
 * Half-block characters for 2x vertical resolution
 */
const HALF_BLOCK = {
    UPPER: '▀', // Upper half filled
    LOWER: '▄', // Lower half filled
    FULL: '█', // Both halves filled
    EMPTY: ' ', // Neither half filled
    SHADE_LIGHT: '░',
    SHADE_MEDIUM: '▒',
    SHADE_DARK: '▓',
};
/**
 * Main ANSI Editor Widget
 */
class ANSIEditor extends box_1.Box {
    constructor(options = {}) {
        super({
            ...options,
            border: options.border || { type: 'line', fg: 'cyan' },
            label: options.label || ` ${options.title || 'ANSI Editor'} `,
            tags: true,
            keys: true,
            mouse: true,
            vi: true,
        });
        // F-key toolbar state
        this.fkeySetIndex = 0; // Current character set (0-7)
        this.fkeyButtons = []; // F1-F12 character preview buttons
        // Editor State
        this.mode = 'draw'; // Default to draw mode
        this.lines = [];
        this.cursor = { line: 0, col: 0 };
        this.scrollTop = 0;
        this.scrollLeft = 0;
        this.modified = false;
        // Drawing state - uses core library Cell type
        this.currentFg = 7;
        this.currentBg = 0;
        this.currentChar = '█';
        this.cellCanvas = null; // Core library canvas
        this.currentTool = 'text'; // Default to text/typing mode (Moebius-style)
        this.isDrawing = false;
        this.drawStartPos = null;
        // Core editor state for tool operations
        this.coreState = null;
        // Undo/Redo - use core library undo system for draw mode
        this.undoStack = []; // For text mode
        this.redoStack = [];
        // Layer System
        this.layers = [];
        this.activeLayerIndex = 0;
        this.nextLayerId = 1;
        // SAUCE Metadata
        this.sauce = {
            title: '',
            author: '',
            group: '',
            date: new Date().toISOString().slice(0, 8).replace(/-/g, ''),
            fileSize: 0,
            dataType: 1, // Character (ANSI)
            fileType: 1, // ANSi
            tInfo1: 80, // Width
            tInfo2: 25, // Height
            tInfo3: 0,
            tInfo4: 0,
            comments: [],
            tFlags: 0,
            tInfoS: '',
        };
        // iCE Colors (16 background colors instead of 8 + blink)
        this.iceColorsEnabled = false;
        // Clipboard for cut/copy/paste
        this.clipboard = null;
        // Selection state
        this.selection = null;
        // Brush mode state (Moebius-style)
        this.brushMode = 'text';
        this.halfBlockSubY = 0; // 0 = upper half, 1 = lower half
        // Preview overlay for shape tools (line, box, ellipse)
        this.previewCanvas = null;
        this.lastPreviewPos = null;
        this.uiVisible = true;
        this.modalOpen = false; // Track when dialogs are open
        this.mode = options.initialMode || 'draw'; // Default to draw mode
        this.maxLines = options.maxLines || 1000;
        this.maxLineLength = options.maxLineLength || 160;
        this.showLineNumbers = options.showLineNumbers ?? true;
        this.onSaveCallback = options.onSave;
        this.onSaveAsCallback = options.onSaveAs;
        this.onOpenCallback = options.onOpen;
        this.onOpenBBSCallback = options.onOpenBBS;
        this.onExitCallback = options.onExit;
        this.hideUIHotkey = options.hideUIHotkey || 'f2';
        // Initialize core canvas (80x25 standard ANSI size)
        this.cellCanvas = CoreCanvas.createCanvas(80, 25);
        // Parse initial content
        if (options.initialContent) {
            this.lines = options.initialContent.split('\n');
            if (this.lines.length > this.maxLines) {
                this.lines = this.lines.slice(0, this.maxLines);
            }
            // Parse ANSI content into cell canvas for draw mode
            CoreCanvas.parseANSIToCanvas(this.cellCanvas, options.initialContent);
        }
        else {
            this.lines = [''];
        }
        // Save initial state for undo
        this.saveUndoState();
        // Initialize layer system with default layer
        this.layers = [{
                id: this.nextLayerId++,
                name: 'Layer 1',
                canvas: this.cellCanvas,
                visible: true,
                locked: false,
                opacity: 100,
            }];
        this.activeLayerIndex = 0;
        // Initialize core editor state for tool operations (future use for advanced tool handlers)
        this.coreState = new editor_state_1.EditorState();
        this.coreState.setCanvas(CoreCanvas.cloneCanvas(this.cellCanvas));
        this.createUI(options);
        this.setupKeyHandlers();
        this.setupMouseHandlers();
        // Sync canvas to display if we have initial content
        if (options.initialContent && this.mode === 'draw') {
            this.syncCoreCanvasToDisplay();
        }
        // Focus the appropriate element based on mode
        if (this.mode === 'draw') {
            this.drawCanvas.focus();
        }
        else {
            this.viewport.focus();
        }
    }
    createUI(options) {
        // Calculate layout offsets based on enabled UI components
        let topOffset = 0;
        const showMenuBar = options.showMenuBar !== false;
        const showToolbar = options.showToolbar !== false;
        const showSidebar = options.showSidebar !== false;
        const showStatusBar = options.showStatusBar !== false;
        // Calculate sidebar width (7 chars for compact layout)
        const sidebarWidth = showSidebar ? 6 : 0;
        // 1. Menu bar at top (Moebius-style)
        if (showMenuBar) {
            this.createMenuBar();
            topOffset = 1;
        }
        // 2. F-key character toolbar below menu bar
        if (showToolbar) {
            this.createFkeyToolbar(topOffset);
            topOffset += 1; // F-key toolbar is 1 row
        }
        // 3. Left sidebar with colors & tools
        if (showSidebar) {
            this.createSidebar(topOffset, showStatusBar);
        }
        // 4. Main viewport (for text mode)
        this.viewport = new box_1.Box({
            parent: this,
            top: topOffset,
            left: sidebarWidth,
            right: 0,
            bottom: showStatusBar ? 1 : 0,
            style: { bg: 'black', fg: 'white' },
            scrollable: true,
            alwaysScroll: true,
            keys: true,
            mouse: true,
            vi: true,
            focusable: true,
            clickable: true,
            input: true,
        });
        // 5. Canvas (for draw mode)
        this.drawCanvas = new canvas_1.Canvas({
            parent: this,
            top: topOffset,
            left: sidebarWidth,
            right: 0,
            bottom: showStatusBar ? 1 : 0,
            style: { bg: 'black', fg: 'white' },
            keys: true,
            mouse: true,
            focusable: true,
            clickable: true,
            input: true,
            fillChar: this.currentChar,
            clearChar: ' ',
        });
        // Enable all-motion mouse tracking when canvas is focused
        this.drawCanvas.on('focus', () => {
            if (this.screen && this.screen.program) {
                this.screen.program.setMouse({ allMotion: true }, true);
            }
        });
        this.drawCanvas.on('blur', () => {
            if (this.screen && this.screen.program) {
                this.screen.program.setMouse({ allMotion: false }, true);
            }
        });
        // 6. Cursor overlay for draw mode
        this.drawCursor = new box_1.Box({
            parent: this,
            top: topOffset,
            left: sidebarWidth,
            width: 1,
            height: 1,
            content: '█',
            style: { bg: 'white', fg: 'black' },
            tags: true,
            clickable: false,
            mouse: false,
        });
        // Set initial visibility based on mode
        if (this.mode === 'draw') {
            this.viewport.hide();
            this.drawCanvas.show();
            this.drawCursor.show();
        }
        else {
            this.viewport.show();
            this.drawCanvas.hide();
            this.drawCursor.hide();
        }
        // 7. Status bar (Moebius-style)
        if (showStatusBar) {
            this.statusBar = new text_1.Text({
                parent: this,
                bottom: 0,
                left: 0,
                width: '100%',
                height: 1,
                content: '',
                style: { bg: 'blue', fg: 'white' },
                tags: true,
            });
        }
        // Initial render
        this.updateDisplay();
    }
    /**
     * Create Moebius-style menu bar with dropdown menus
     */
    createMenuBar() {
        this.menuBar = new box_1.Box({
            parent: this,
            top: 0,
            left: 0,
            width: '100%',
            height: 1,
            style: { bg: 'gray', fg: 'black' },
            tags: true,
        });
        // Menu button positions
        const menus = [
            { label: ' File ', left: 0 },
            { label: ' Edit ', left: 6 },
            { label: ' Layer ', left: 12 },
            { label: ' Select ', left: 19 },
            { label: ' Colors ', left: 28 },
            { label: ' View ', left: 36 },
            { label: ' Help ', left: 42 },
        ];
        // Store button references for anchor registration
        const menuButtons = [];
        menus.forEach((menu) => {
            const btn = new box_1.Box({
                parent: this.menuBar,
                top: 0,
                left: menu.left,
                width: menu.label.length,
                height: 1,
                content: menu.label,
                style: { bg: 'gray', fg: 'black', hover: { bg: 'blue', fg: 'white' } },
                tags: true,
                mouse: true,
                clickable: true,
            });
            menuButtons.push(btn);
        });
        // Create dropdown menus (hidden initially)
        this.createDropdownMenus();
        // Register anchors for hover-to-open behavior
        // Positions are now calculated dynamically from anchor coordinates
        const dropdownMenus = [
            this.fileMenu,
            this.editMenu,
            this.layerMenu,
            this.selectionMenu,
            this.colorsMenu,
            this.viewMenu,
            this.helpMenu,
        ];
        menuButtons.forEach((btn, idx) => {
            const dropdown = dropdownMenus[idx];
            if (dropdown) {
                dropdown.registerAnchor(btn); // Position calculated dynamically from btn coords
            }
        });
    }
    /**
     * Create dropdown menus for the menu bar
     */
    createDropdownMenus() {
        if (!this.screen)
            return;
        // File menu - build items dynamically based on available callbacks
        const fileMenuItems = [
            { label: 'New', action: () => this.newDocument() },
            { label: 'Open...', action: () => this.onOpenCallback?.() },
        ];
        // Add BBS files option for sysops (only if callback provided)
        if (this.onOpenBBSCallback) {
            fileMenuItems.push({ label: 'Open BBS Files...', action: () => this.onOpenBBSCallback?.() });
        }
        fileMenuItems.push({ label: '────────────────', separator: true }, { label: 'Save', action: () => this.save() }, { label: 'Save As...', action: () => this.onSaveAsCallback?.() }, { label: '────────────────', separator: true }, { label: 'SAUCE Info...', action: () => this.showSauceEditor() }, { label: '────────────────', separator: true }, { label: 'Exit', action: () => this.onExitCallback?.() });
        this.fileMenu = new dropdown_menu_1.DropdownMenu({
            parent: this.screen,
            width: 22,
            items: fileMenuItems,
        });
        // Edit menu
        this.editMenu = new dropdown_menu_1.DropdownMenu({
            parent: this.screen,
            width: 22,
            items: [
                { label: 'Undo', action: () => this.undo() },
                { label: 'Redo', action: () => this.redo() },
                { label: '────────────────', separator: true },
                { label: 'Cut', action: () => this.cutSelection() },
                { label: 'Copy', action: () => this.copySelection() },
                { label: 'Paste', action: () => this.pasteClipboard() },
                { label: '────────────────', separator: true },
                { label: 'Insert Row', action: () => this.insertRow() },
                { label: 'Delete Row', action: () => this.deleteRow() },
            ],
        });
        // Selection menu
        this.selectionMenu = new dropdown_menu_1.DropdownMenu({
            parent: this.screen,
            width: 22,
            items: [
                { label: 'Select All', action: () => this.selectAll() },
                { label: 'Deselect', action: () => this.deselect() },
                { label: '────────────────', separator: true },
                { label: 'Move Block', action: () => this.moveBlock() },
                { label: 'Copy Block', action: () => this.copyBlock() },
                { label: '────────────────', separator: true },
                { label: 'Flip Horizontal', action: () => this.flipHorizontal() },
                { label: 'Flip Vertical', action: () => this.flipVertical() },
            ],
        });
        // Colors menu
        this.colorsMenu = new dropdown_menu_1.DropdownMenu({
            parent: this.screen,
            width: 22,
            items: [
                { label: 'Foreground...', action: () => this.showColorPicker(true) },
                { label: 'Background...', action: () => this.showColorPicker(false) },
                { label: '────────────────', separator: true },
                { label: 'Swap FG/BG', action: () => this.swapColors() },
                { label: 'Default Colors', action: () => this.resetColors() },
                { label: '────────────────', separator: true },
                { label: this.iceColorsEnabled ? '[X] iCE Colors' : '[ ] iCE Colors', action: () => this.toggleIceColors() },
            ],
        });
        // Layer menu
        this.layerMenu = new dropdown_menu_1.DropdownMenu({
            parent: this.screen,
            width: 22,
            items: [
                { label: 'Add Layer', action: () => this.addLayer() },
                { label: 'Delete Layer', action: () => this.deleteLayer() },
                { label: '────────────────', separator: true },
                { label: 'Merge Down', action: () => this.mergeLayerDown() },
                { label: 'Flatten All', action: () => this.flattenLayers() },
                { label: '────────────────', separator: true },
                { label: 'Toggle Visibility', action: () => this.toggleLayerVisibility() },
                { label: 'Toggle Lock', action: () => this.toggleLayerLock() },
                { label: '────────────────', separator: true },
                { label: 'Move Up', action: () => this.moveLayerUp() },
                { label: 'Move Down', action: () => this.moveLayerDown() },
            ],
        });
        // View menu
        this.viewMenu = new dropdown_menu_1.DropdownMenu({
            parent: this.screen,
            width: 22,
            items: [
                { label: 'Toggle Sidebar', action: () => this.toggleSidebar() },
                { label: 'Toggle Toolbar', action: () => this.toggleFkeyToolbar() },
                { label: '────────────────', separator: true },
                { label: 'Text Mode', action: () => this.mode !== 'text' && this.toggleMode() },
                { label: 'Draw Mode', action: () => this.mode !== 'draw' && this.toggleMode() },
            ],
        });
        // Help menu
        this.helpMenu = new dropdown_menu_1.DropdownMenu({
            parent: this.screen,
            width: 22,
            items: [
                { label: 'Keyboard Shortcuts', action: () => this.showHelp() },
                { label: '────────────────', separator: true },
                { label: 'About ANSI Editor', action: () => this.showAbout() },
            ],
        });
    }
    /**
     * Open a dropdown menu
     */
    openMenu(index) {
        const menus = [
            { menu: this.fileMenu, left: 0 },
            { menu: this.editMenu, left: 6 },
            { menu: this.layerMenu, left: 12 },
            { menu: this.selectionMenu, left: 19 },
            { menu: this.colorsMenu, left: 28 },
            { menu: this.viewMenu, left: 36 },
            { menu: this.helpMenu, left: 42 },
        ];
        const item = menus[index];
        if (item?.menu) {
            item.menu.openAt(item.left + this.aleft + 1, this.atop + 2);
        }
    }
    /**
     * Create F-key character toolbar (Moebius-style)
     */
    createFkeyToolbar(topOffset) {
        this.fkeyToolbar = new box_1.Box({
            parent: this,
            top: topOffset,
            left: 0,
            width: '100%',
            height: 1,
            style: { bg: 'black', fg: 'white' },
            tags: true,
        });
        // Character set selector (< and >) - horizontal on single row
        const prevBtn = new text_1.Text({
            parent: this.fkeyToolbar,
            top: 0,
            left: 0,
            width: 1,
            height: 1,
            content: '{cyan-fg}<{/cyan-fg}',
            style: { bg: 'black', fg: 'white', hover: { bg: 'blue' } },
            tags: true,
            mouse: true,
            clickable: true,
        });
        prevBtn.on('click', () => this.prevFkeySet());
        // Set number display
        new text_1.Text({
            parent: this.fkeyToolbar,
            top: 0,
            left: 1,
            width: 1,
            height: 1,
            content: `${this.fkeySetIndex + 1}`,
            style: { bg: 'black', fg: 'cyan' },
            tags: true,
        });
        const nextBtn = new text_1.Text({
            parent: this.fkeyToolbar,
            top: 0,
            left: 2,
            width: 1,
            height: 1,
            content: '{cyan-fg}>{/cyan-fg}',
            style: { bg: 'black', fg: 'white', hover: { bg: 'blue' } },
            tags: true,
            mouse: true,
            clickable: true,
        });
        nextBtn.on('click', () => this.nextFkeySet());
        // F1-F12 character buttons - single row, compact (5 chars each: "F1█ ")
        this.fkeyButtons = [];
        for (let i = 0; i < 12; i++) {
            const fkeyBtn = new box_1.Box({
                parent: this.fkeyToolbar,
                top: 0,
                left: 4 + i * 5, // All on single row
                width: 5,
                height: 1,
                content: this.getFkeyButtonContent(i),
                style: { bg: 'black', fg: 'white', hover: { bg: 'blue' } },
                tags: true,
                mouse: true,
                clickable: true,
            });
            fkeyBtn.on('click', () => this.selectFkeyChar(i));
            this.fkeyButtons.push(fkeyBtn);
        }
    }
    /**
     * Get F-key button content (e.g., "F1█")
     */
    getFkeyButtonContent(index) {
        const fkeyNum = index + 1;
        const fkeyLabel = fkeyNum <= 9 ? `F${fkeyNum}` : (fkeyNum === 10 ? '10' : (fkeyNum === 11 ? '11' : '12'));
        const char = FKEY_CHAR_SETS[this.fkeySetIndex]?.[index] || '?';
        // Compact format: "F1█" or "12█" for F10-F12
        return `{cyan-fg}${fkeyLabel}{/}{white-fg}${char}{/}`;
    }
    /**
     * Update F-key toolbar characters
     */
    updateFkeyToolbar() {
        if (!this.fkeyToolbar)
            return;
        // Update F-key buttons
        this.fkeyButtons.forEach((btn, i) => {
            btn.setContent(this.getFkeyButtonContent(i));
        });
        this.screen?.render();
    }
    /**
     * Go to previous F-key character set
     */
    prevFkeySet() {
        this.fkeySetIndex = (this.fkeySetIndex - 1 + FKEY_CHAR_SETS.length) % FKEY_CHAR_SETS.length;
        this.updateFkeyToolbar();
    }
    /**
     * Go to next F-key character set
     */
    nextFkeySet() {
        this.fkeySetIndex = (this.fkeySetIndex + 1) % FKEY_CHAR_SETS.length;
        this.updateFkeyToolbar();
    }
    /**
     * Select a character from F-key toolbar
     */
    selectFkeyChar(index) {
        const char = FKEY_CHAR_SETS[this.fkeySetIndex]?.[index];
        if (char) {
            this.currentChar = char;
            this.drawCursor.setContent(char);
            this.updateStatusBar();
            this.screen?.render();
        }
    }
    /**
     * Create left sidebar with color palette and tool buttons (Moebius-style)
     */
    createSidebar(topOffset, showStatusBar) {
        this.sidebar = new box_1.Box({
            parent: this,
            top: topOffset,
            left: 0,
            width: 6,
            bottom: showStatusBar ? 1 : 0,
            style: { bg: 'black', fg: 'white' },
            tags: true,
        });
        // Color palette (2 columns x 8 rows = 16 colors, Moebius-style vertical layout)
        this.colorPalette = new box_1.Box({
            parent: this.sidebar,
            top: 0,
            left: 0,
            width: 6,
            height: 8,
            tags: true,
        });
        // Create color swatches - 2 columns x 8 rows (Moebius layout)
        // Left column: dark colors (0-7), Right column: bright colors (8-15)
        const colors = [
            'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
            'gray', 'lightred', 'lightgreen', 'lightyellow', 'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
        ];
        for (let i = 0; i < 16; i++) {
            const row = i % 8; // 0-7 (8 rows)
            const col = Math.floor(i / 8); // 0 or 1 (2 columns)
            const swatch = new box_1.Box({
                parent: this.colorPalette,
                top: row,
                left: col * 3,
                width: 3,
                height: 1,
                content: '   ',
                style: { bg: colors[i] },
                mouse: true,
                clickable: true,
            });
            swatch.on('click', (data) => {
                if (data.button === 'left') {
                    this.currentFg = i;
                }
                else if (data.button === 'right') {
                    this.currentBg = i;
                }
                this.updateStatusBar();
                this.updateSidebarFGBG();
                this.screen?.render();
            });
        }
        // FG/BG indicator (2 lines)
        this.fgBgIndicator = new text_1.Text({
            parent: this.sidebar,
            top: 8,
            left: 0,
            width: 6,
            height: 2,
            content: this.getFGBGContent(),
            style: { bg: 'black' },
            tags: true,
        });
        // Tool buttons (below FG/BG)
        this.toolPanel = new box_1.Box({
            parent: this.sidebar,
            top: 10,
            left: 0,
            width: 6,
            height: 8,
            tags: true,
        });
        const tools = [
            { label: '{yellow-fg}T{/}ext', tool: 'text' },
            { label: '{yellow-fg}D{/}raw', tool: 'draw' },
            { label: '{yellow-fg}L{/}ine', tool: 'line' },
            { label: '{yellow-fg}R{/}ect', tool: 'box' },
            { label: '{yellow-fg}E{/}llip', tool: 'ellipse' },
            { label: '{yellow-fg}F{/}ill', tool: 'fill' },
            { label: '{yellow-fg}P{/}ick', tool: 'pick' },
            { label: '{yellow-fg}S{/}el', tool: 'select' },
        ];
        tools.forEach((t, idx) => {
            const isSelected = this.currentTool === t.tool;
            const toolBtn = new box_1.Box({
                parent: this.toolPanel,
                top: idx,
                left: 0,
                width: 6,
                height: 1,
                content: (isSelected ? '{inverse}' : '') + t.label + (isSelected ? '{/inverse}' : ''),
                style: { bg: 'black', fg: 'white', hover: { bg: 'blue' } },
                tags: true,
                mouse: true,
                clickable: true,
            });
            toolBtn.on('click', () => {
                this.switchTool(t.tool);
                this.updateSidebarToolSelection();
            });
        });
        // Brush mode panel (below tools)
        this.createBrushModePanel();
    }
    /**
     * Get FG/BG content string
     */
    getFGBGContent() {
        const colors = [
            'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
            'gray', 'lightred', 'lightgreen', 'lightyellow', 'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
        ];
        const fgColor = colors[this.currentFg] || 'white';
        const bgColor = colors[this.currentBg] || 'black';
        return `{${fgColor}-fg}F{/}{${bgColor}-bg}B{/}${this.currentFg}/${this.currentBg}`;
    }
    /**
     * Update FG/BG indicator in sidebar
     */
    updateSidebarFGBG() {
        if (this.fgBgIndicator) {
            this.fgBgIndicator.setContent(this.getFGBGContent());
        }
    }
    /**
     * Create brush mode panel in sidebar (compact)
     */
    createBrushModePanel() {
        if (!this.sidebar)
            return;
        // Separator line
        new text_1.Text({
            parent: this.sidebar,
            top: 11,
            left: 0,
            content: '{gray-fg}------{/}',
            tags: true,
        });
        // Brush mode header + toggle button (compact single line)
        const brushModeBtn = new box_1.Box({
            parent: this.sidebar,
            top: 12,
            left: 0,
            width: 6,
            height: 1,
            content: this.getBrushModeContent(),
            style: { bg: 'black', fg: 'cyan', hover: { bg: 'blue' } },
            tags: true,
            mouse: true,
            clickable: true,
        });
        brushModeBtn.on('click', () => {
            // Cycle through brush modes
            if (this.brushMode === 'text') {
                this.switchBrushMode('half-block');
            }
            else {
                this.switchBrushMode('text');
            }
            brushModeBtn.setContent(this.getBrushModeContent());
            if (this.halfBlockBtn) {
                this.halfBlockBtn.setContent(this.getHalfBlockContent());
            }
            this.screen?.render();
        });
        // Half-block sub-row toggle (only relevant in half-block mode)
        this.halfBlockBtn = new box_1.Box({
            parent: this.sidebar,
            top: 13,
            left: 0,
            width: 6,
            height: 1,
            content: this.getHalfBlockContent(),
            style: { bg: 'black', fg: 'yellow', hover: { bg: 'blue' } },
            tags: true,
            mouse: true,
            clickable: true,
        });
        this.halfBlockBtn.on('click', () => {
            if (this.brushMode === 'half-block') {
                this.toggleHalfBlockSubY();
                this.halfBlockBtn.setContent(this.getHalfBlockContent());
                this.screen?.render();
            }
        });
    }
    getBrushModeContent() {
        if (this.brushMode === 'half-block') {
            return '{cyan-fg}{inverse}HlfBlk{/inverse}{/}';
        }
        return '{cyan-fg}HlfBlk{/}';
    }
    getHalfBlockContent() {
        if (this.brushMode === 'half-block') {
            return `{yellow-fg}${this.halfBlockSubY === 0 ? '▀Up' : '▄Dn'}{/}`;
        }
        return '';
    }
    /**
     * Create layer panel in sidebar
     */
    createLayerPanel() {
        if (!this.sidebar)
            return;
        // Layer panel header (positioned below brush mode panel)
        new text_1.Text({
            parent: this.sidebar,
            top: 25,
            left: 0,
            width: 6,
            height: 1,
            content: '{cyan-fg}Layers{/}',
            style: { bg: 'black' },
            tags: true,
        });
        // Layer list container
        this.layerPanel = new box_1.Box({
            parent: this.sidebar,
            top: 26,
            left: 0,
            width: 6,
            height: 4,
            style: { bg: 'black' },
            tags: true,
        });
        // Layer action buttons row
        const layerActions = new box_1.Box({
            parent: this.sidebar,
            top: 30,
            left: 0,
            width: 6,
            height: 1,
            style: { bg: 'black' },
            tags: true,
        });
        // Add layer button
        const addBtn = new box_1.Box({
            parent: layerActions,
            top: 0,
            left: 0,
            width: 2,
            height: 1,
            content: '{green-fg}+{/}',
            style: { bg: 'black', hover: { bg: 'blue' } },
            tags: true,
            mouse: true,
            clickable: true,
        });
        addBtn.on('click', () => this.addLayer());
        // Delete layer button
        const delBtn = new box_1.Box({
            parent: layerActions,
            top: 0,
            left: 2,
            width: 2,
            height: 1,
            content: '{red-fg}-{/}',
            style: { bg: 'black', hover: { bg: 'blue' } },
            tags: true,
            mouse: true,
            clickable: true,
        });
        delBtn.on('click', () => this.deleteLayer());
        // Merge down button
        const mergeBtn = new box_1.Box({
            parent: layerActions,
            top: 0,
            left: 4,
            width: 3,
            height: 1,
            content: '{yellow-fg}M{/}',
            style: { bg: 'black', hover: { bg: 'blue' } },
            tags: true,
            mouse: true,
            clickable: true,
        });
        mergeBtn.on('click', () => this.mergeLayerDown());
        this.updateLayerPanel();
    }
    /**
     * Update layer panel display
     */
    updateLayerPanel() {
        if (!this.layerPanel)
            return;
        // Clear existing children
        while (this.layerPanel.children.length > 0) {
            const child = this.layerPanel.children[0];
            child.destroy();
        }
        // Display layers (top layer first)
        const visibleLayers = this.layers.slice().reverse().slice(0, 5);
        visibleLayers.forEach((layer, displayIdx) => {
            const actualIdx = this.layers.length - 1 - displayIdx;
            const isActive = actualIdx === this.activeLayerIndex;
            const visIcon = layer.visible ? '{white-fg}*{/}' : '{gray-fg}.{/}';
            const lockIcon = layer.locked ? '{red-fg}L{/}' : ' ';
            const layerRow = new box_1.Box({
                parent: this.layerPanel,
                top: displayIdx,
                left: 0,
                width: 6,
                height: 1,
                content: (isActive ? '{inverse}' : '') + `${visIcon}${lockIcon}${layer.name.slice(0, 4)}` + (isActive ? '{/inverse}' : ''),
                style: { bg: 'black', fg: 'white', hover: { bg: 'blue' } },
                tags: true,
                mouse: true,
                clickable: true,
            });
            layerRow.on('click', (data) => {
                if (data.button === 'left') {
                    this.activeLayerIndex = actualIdx;
                    this.cellCanvas = this.layers[actualIdx].canvas;
                    this.updateLayerPanel();
                    this.updateDisplay();
                }
                else if (data.button === 'right') {
                    // Toggle visibility
                    this.layers[actualIdx].visible = !this.layers[actualIdx].visible;
                    this.updateLayerPanel();
                    this.composeLayers();
                    this.updateDisplay();
                }
            });
        });
        this.screen?.render();
    }
    /**
     * Add new layer
     */
    addLayer() {
        const newLayer = {
            id: this.nextLayerId++,
            name: `Layer ${this.nextLayerId - 1}`,
            canvas: CoreCanvas.createCanvas(80, 25),
            visible: true,
            locked: false,
            opacity: 100,
        };
        // Insert above current layer
        this.layers.splice(this.activeLayerIndex + 1, 0, newLayer);
        this.activeLayerIndex++;
        this.cellCanvas = newLayer.canvas;
        this.updateLayerPanel();
        this.updateDisplay();
        this.modified = true;
    }
    /**
     * Delete current layer
     */
    deleteLayer() {
        if (this.layers.length <= 1)
            return; // Can't delete last layer
        this.layers.splice(this.activeLayerIndex, 1);
        // Adjust active index
        if (this.activeLayerIndex >= this.layers.length) {
            this.activeLayerIndex = this.layers.length - 1;
        }
        this.cellCanvas = this.layers[this.activeLayerIndex].canvas;
        this.composeLayers();
        this.updateLayerPanel();
        this.updateDisplay();
        this.modified = true;
    }
    /**
     * Merge current layer down into layer below
     */
    mergeLayerDown() {
        if (this.activeLayerIndex === 0)
            return; // Can't merge bottom layer
        const srcLayer = this.layers[this.activeLayerIndex];
        const dstLayer = this.layers[this.activeLayerIndex - 1];
        // Merge canvases (overlay src on dst)
        for (let y = 0; y < srcLayer.canvas.length; y++) {
            for (let x = 0; x < srcLayer.canvas[y].length; x++) {
                const srcCell = srcLayer.canvas[y][x];
                if (srcCell.char !== ' ' || srcCell.bg !== 0) {
                    dstLayer.canvas[y][x] = { ...srcCell };
                }
            }
        }
        // Remove source layer
        this.layers.splice(this.activeLayerIndex, 1);
        this.activeLayerIndex--;
        this.cellCanvas = dstLayer.canvas;
        this.composeLayers();
        this.updateLayerPanel();
        this.updateDisplay();
        this.modified = true;
    }
    /**
     * Toggle layer visibility
     */
    toggleLayerVisibility(layerIndex) {
        const idx = layerIndex ?? this.activeLayerIndex;
        if (idx >= 0 && idx < this.layers.length) {
            this.layers[idx].visible = !this.layers[idx].visible;
            this.composeLayers();
            this.updateLayerPanel();
            this.updateDisplay();
        }
    }
    /**
     * Toggle layer lock
     */
    toggleLayerLock(layerIndex) {
        const idx = layerIndex ?? this.activeLayerIndex;
        if (idx >= 0 && idx < this.layers.length) {
            this.layers[idx].locked = !this.layers[idx].locked;
            this.updateLayerPanel();
        }
    }
    /**
     * Compose all visible layers into a single output canvas
     */
    composeLayers() {
        const width = 80;
        const height = 25;
        const output = CoreCanvas.createCanvas(width, height);
        // Composite from bottom to top
        for (const layer of this.layers) {
            if (!layer.visible)
                continue;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const cell = layer.canvas[y]?.[x];
                    if (cell && (cell.char !== ' ' || cell.bg !== 0)) {
                        output[y][x] = { ...cell };
                    }
                }
            }
        }
        return output;
    }
    /**
     * Flatten all layers into one
     */
    flattenLayers() {
        if (this.layers.length <= 1)
            return;
        const flattened = this.composeLayers();
        // Replace all layers with single flattened layer
        this.layers = [{
                id: this.nextLayerId++,
                name: 'Flattened',
                canvas: flattened,
                visible: true,
                locked: false,
                opacity: 100,
            }];
        this.activeLayerIndex = 0;
        this.cellCanvas = flattened;
        this.updateLayerPanel();
        this.updateDisplay();
        this.modified = true;
    }
    /**
     * Move current layer up (toward front)
     */
    moveLayerUp() {
        if (this.activeLayerIndex >= this.layers.length - 1)
            return;
        const temp = this.layers[this.activeLayerIndex];
        this.layers[this.activeLayerIndex] = this.layers[this.activeLayerIndex + 1];
        this.layers[this.activeLayerIndex + 1] = temp;
        this.activeLayerIndex++;
        this.composeLayers();
        this.updateLayerPanel();
        this.updateDisplay();
        this.modified = true;
    }
    /**
     * Move current layer down (toward back)
     */
    moveLayerDown() {
        if (this.activeLayerIndex <= 0)
            return;
        const temp = this.layers[this.activeLayerIndex];
        this.layers[this.activeLayerIndex] = this.layers[this.activeLayerIndex - 1];
        this.layers[this.activeLayerIndex - 1] = temp;
        this.activeLayerIndex--;
        this.composeLayers();
        this.updateLayerPanel();
        this.updateDisplay();
        this.modified = true;
    }
    /**
     * Toggle iCE Colors mode (16 BG colors vs 8 + blink)
     */
    toggleIceColors() {
        this.iceColorsEnabled = !this.iceColorsEnabled;
        this.updateStatusBar();
        // Update the Colors menu checkbox
        if (this.colorsMenu) {
            // The menu will reflect the state when reopened
        }
        this.screen?.render();
    }
    // ============================================
    // CLIPBOARD OPERATIONS
    // ============================================
    /**
     * Cut selection to clipboard
     */
    cutSelection() {
        if (!this.cellCanvas)
            return;
        // If no selection, select entire canvas
        const sel = this.selection || { x1: 0, y1: 0, x2: 79, y2: 24 };
        // Copy to clipboard
        this.copyRegion(sel.x1, sel.y1, sel.x2, sel.y2);
        // Clear the region
        for (let y = sel.y1; y <= sel.y2; y++) {
            for (let x = sel.x1; x <= sel.x2; x++) {
                if (this.cellCanvas[y]?.[x]) {
                    this.cellCanvas[y][x] = { char: ' ', fg: 7, bg: 0 };
                }
            }
        }
        this.syncCoreCanvasToDisplay();
        this.modified = true;
        this.updateDisplay();
    }
    /**
     * Copy selection to clipboard
     */
    copySelection() {
        // If no selection, select entire canvas
        const sel = this.selection || { x1: 0, y1: 0, x2: 79, y2: 24 };
        this.copyRegion(sel.x1, sel.y1, sel.x2, sel.y2);
    }
    /**
     * Copy a region to clipboard
     */
    copyRegion(x1, y1, x2, y2) {
        if (!this.cellCanvas)
            return;
        const width = x2 - x1 + 1;
        const height = y2 - y1 + 1;
        this.clipboard = [];
        for (let y = 0; y < height; y++) {
            this.clipboard[y] = [];
            for (let x = 0; x < width; x++) {
                const srcCell = this.cellCanvas[y1 + y]?.[x1 + x];
                this.clipboard[y][x] = srcCell
                    ? { ...srcCell }
                    : { char: ' ', fg: 7, bg: 0 };
            }
        }
    }
    /**
     * Paste clipboard at cursor position
     */
    pasteClipboard() {
        if (!this.cellCanvas || !this.clipboard)
            return;
        const startX = this.cursor.col;
        const startY = this.cursor.line;
        for (let y = 0; y < this.clipboard.length; y++) {
            for (let x = 0; x < this.clipboard[y].length; x++) {
                const destX = startX + x;
                const destY = startY + y;
                if (destY < 25 && destX < 80 && this.cellCanvas[destY]) {
                    this.cellCanvas[destY][destX] = { ...this.clipboard[y][x] };
                }
            }
        }
        this.syncCoreCanvasToDisplay();
        this.modified = true;
        this.updateDisplay();
    }
    // ============================================
    // ROW OPERATIONS
    // ============================================
    /**
     * Insert a blank row at cursor position
     */
    insertRow() {
        if (!this.cellCanvas)
            return;
        const y = this.cursor.line;
        // Shift rows down (lose bottom row)
        for (let row = 24; row > y; row--) {
            this.cellCanvas[row] = this.cellCanvas[row - 1];
        }
        // Create blank row
        this.cellCanvas[y] = [];
        for (let x = 0; x < 80; x++) {
            this.cellCanvas[y][x] = { char: ' ', fg: 7, bg: 0 };
        }
        this.syncCoreCanvasToDisplay();
        this.modified = true;
        this.updateDisplay();
    }
    /**
     * Delete row at cursor position
     */
    deleteRow() {
        if (!this.cellCanvas)
            return;
        const y = this.cursor.line;
        // Shift rows up
        for (let row = y; row < 24; row++) {
            this.cellCanvas[row] = this.cellCanvas[row + 1];
        }
        // Create blank row at bottom
        this.cellCanvas[24] = [];
        for (let x = 0; x < 80; x++) {
            this.cellCanvas[24][x] = { char: ' ', fg: 7, bg: 0 };
        }
        this.syncCoreCanvasToDisplay();
        this.modified = true;
        this.updateDisplay();
    }
    // ============================================
    // SELECTION OPERATIONS
    // ============================================
    /**
     * Select entire canvas
     */
    selectAll() {
        this.selection = { x1: 0, y1: 0, x2: 79, y2: 24 };
        this.updateDisplay();
    }
    /**
     * Clear selection
     */
    deselect() {
        this.selection = null;
        this.updateDisplay();
    }
    // ============================================
    // BLOCK OPERATIONS
    // ============================================
    /**
     * Move selected block to cursor position
     */
    moveBlock() {
        if (!this.selection || !this.cellCanvas)
            return;
        const sel = this.selection;
        // Copy to clipboard first
        this.copyRegion(sel.x1, sel.y1, sel.x2, sel.y2);
        // Clear original location
        for (let y = sel.y1; y <= sel.y2; y++) {
            for (let x = sel.x1; x <= sel.x2; x++) {
                if (this.cellCanvas[y]?.[x]) {
                    this.cellCanvas[y][x] = { char: ' ', fg: 7, bg: 0 };
                }
            }
        }
        // Paste at cursor
        this.pasteClipboard();
        this.selection = null;
        this.modified = true;
        this.updateDisplay();
    }
    /**
     * Copy selected block to cursor position
     */
    copyBlock() {
        if (!this.selection)
            return;
        const sel = this.selection;
        // Copy to clipboard
        this.copyRegion(sel.x1, sel.y1, sel.x2, sel.y2);
        // Paste at cursor (don't clear original)
        this.pasteClipboard();
        this.selection = null;
        this.modified = true;
        this.updateDisplay();
    }
    // ============================================
    // FLIP OPERATIONS
    // ============================================
    /**
     * Flip selection or canvas horizontally
     */
    flipHorizontal() {
        if (!this.cellCanvas)
            return;
        const sel = this.selection || { x1: 0, y1: 0, x2: 79, y2: 24 };
        const width = sel.x2 - sel.x1 + 1;
        for (let y = sel.y1; y <= sel.y2; y++) {
            const row = this.cellCanvas[y];
            if (!row)
                continue;
            // Swap cells from left to right
            for (let x = 0; x < Math.floor(width / 2); x++) {
                const leftX = sel.x1 + x;
                const rightX = sel.x2 - x;
                const temp = row[leftX];
                row[leftX] = row[rightX];
                row[rightX] = temp;
            }
        }
        this.syncCoreCanvasToDisplay();
        this.modified = true;
        this.updateDisplay();
    }
    /**
     * Flip selection or canvas vertically
     */
    flipVertical() {
        if (!this.cellCanvas)
            return;
        const sel = this.selection || { x1: 0, y1: 0, x2: 79, y2: 24 };
        const height = sel.y2 - sel.y1 + 1;
        for (let y = 0; y < Math.floor(height / 2); y++) {
            const topY = sel.y1 + y;
            const bottomY = sel.y2 - y;
            // Swap entire rows within selection bounds
            for (let x = sel.x1; x <= sel.x2; x++) {
                const temp = this.cellCanvas[topY][x];
                this.cellCanvas[topY][x] = this.cellCanvas[bottomY][x];
                this.cellCanvas[bottomY][x] = temp;
            }
        }
        this.syncCoreCanvasToDisplay();
        this.modified = true;
        this.updateDisplay();
    }
    // ============================================
    // ABOUT DIALOG
    // ============================================
    /**
     * Show About dialog
     */
    showAbout() {
        if (!this.screen || this.modalOpen)
            return;
        this.drawCursor.hide();
        this.modalOpen = true;
        const aboutText = `{cyan-fg}{bold}ANSI EDITOR{/bold}{/cyan-fg}
{gray-fg}Version 2.0{/gray-fg}

{white-fg}A Moebius-style ANSI art editor for
the AmiExpress BBS system.{/white-fg}

{yellow-fg}{bold}Features:{/bold}{/yellow-fg}
  - Full 16-color ANSI palette
  - Multiple drawing tools
  - Layer support
  - iCE colors mode
  - SAUCE metadata
  - Undo/Redo

{yellow-fg}{bold}Inspired by:{/bold}{/yellow-fg}
  - Moebius (Andy Herbert)
  - TheDraw
  - ACiDDraw
  - PabloDraw

{gray-fg}Part of AmiExpress-Web
BBS Door SDK v2.0{/gray-fg}

{cyan-fg}Press any key to close{/cyan-fg}`;
        const aboutModal = new doc_modal_1.DocModal({
            parent: this.screen,
            title: 'About ANSI Editor',
            content: aboutText,
            closeKeys: ['escape', 'q', 'enter', 'space'],
            footerText: '{bold} Press any key to close {/bold}',
            style: {
                fg: 'white',
                bg: 'blue',
                border: { fg: 'cyan' },
            },
            contentStyle: {
                fg: 'white',
                bg: 'blue',
            },
            onClose: () => {
                aboutModal.destroy();
                this.restoreFocusAfterDialog();
            },
        });
        const focusTarget = this.mode === 'draw' ? this.drawCanvas : this.viewport;
        aboutModal.display(focusTarget);
    }
    /**
     * Show SAUCE metadata editor dialog
     */
    showSauceEditor() {
        if (!this.screen || this.modalOpen)
            return;
        this.drawCursor.hide();
        this.modalOpen = true;
        // Create overlay for dimming background
        const overlay = new overlay_1.Overlay({
            parent: this.screen,
            opacity: 0.5,
        });
        // Modal dialog
        const modal = new box_1.Box({
            parent: overlay,
            top: 'center',
            left: 'center',
            width: 50,
            height: 18,
            border: { type: 'line' },
            label: ' SAUCE Information ',
            tags: true,
            keys: true,
            mouse: true,
            style: { fg: 'white', bg: 'blue', border: { fg: 'cyan' } },
        });
        // Current values
        let title = this.sauce.title;
        let author = this.sauce.author;
        let group = this.sauce.group;
        // Title field
        new text_1.Text({
            parent: modal,
            top: 1,
            left: 2,
            content: '{cyan-fg}Title:{/}',
            tags: true,
        });
        const titleBox = new box_1.Box({
            parent: modal,
            top: 1,
            left: 10,
            width: 35,
            height: 1,
            content: title,
            style: { bg: 'black', fg: 'white' },
            tags: true,
        });
        // Author field
        new text_1.Text({
            parent: modal,
            top: 3,
            left: 2,
            content: '{cyan-fg}Author:{/}',
            tags: true,
        });
        const authorBox = new box_1.Box({
            parent: modal,
            top: 3,
            left: 10,
            width: 35,
            height: 1,
            content: author,
            style: { bg: 'black', fg: 'white' },
            tags: true,
        });
        // Group field
        new text_1.Text({
            parent: modal,
            top: 5,
            left: 2,
            content: '{cyan-fg}Group:{/}',
            tags: true,
        });
        const groupBox = new box_1.Box({
            parent: modal,
            top: 5,
            left: 10,
            width: 35,
            height: 1,
            content: group,
            style: { bg: 'black', fg: 'white' },
            tags: true,
        });
        // Info (read-only)
        new text_1.Text({
            parent: modal,
            top: 7,
            left: 2,
            content: `{gray-fg}Date: ${this.sauce.date}{/}`,
            tags: true,
        });
        new text_1.Text({
            parent: modal,
            top: 8,
            left: 2,
            content: `{gray-fg}Size: ${this.sauce.tInfo1}x${this.sauce.tInfo2}{/}`,
            tags: true,
        });
        new text_1.Text({
            parent: modal,
            top: 9,
            left: 2,
            content: `{gray-fg}iCE: ${this.iceColorsEnabled ? 'Yes' : 'No'}{/}`,
            tags: true,
        });
        // Field navigation
        let activeField = 0;
        const fields = [titleBox, authorBox, groupBox];
        const values = [title, author, group];
        const updateFields = () => {
            fields.forEach((f, i) => {
                f.style.bg = i === activeField ? 'cyan' : 'black';
                f.style.fg = i === activeField ? 'black' : 'white';
            });
            this.screen?.render();
        };
        updateFields();
        // Instructions
        new text_1.Text({
            parent: modal,
            top: 11,
            left: 2,
            content: '{yellow-fg}Tab{/}: Next field  {yellow-fg}Enter{/}: Edit  {yellow-fg}ESC{/}: Close',
            tags: true,
        });
        const trapCleanup = (0, modal_helpers_1.trapModalInput)(modal);
        const closeDialog = (save) => {
            trapCleanup();
            overlay.destroy();
            if (save) {
                this.sauce.title = values[0];
                this.sauce.author = values[1];
                this.sauce.group = values[2];
                this.modified = true;
            }
            this.restoreFocusAfterDialog();
        };
        modal.key(['tab'], () => {
            activeField = (activeField + 1) % fields.length;
            updateFields();
        });
        modal.key(['S-tab'], () => {
            activeField = (activeField - 1 + fields.length) % fields.length;
            updateFields();
        });
        modal.key(['enter'], () => {
            // Simple inline editing - just prompt
            const current = values[activeField];
            const fieldNames = ['Title', 'Author', 'Group'];
            // Create a simple prompt
            const promptBox = new box_1.Box({
                parent: modal,
                top: 13,
                left: 2,
                width: 44,
                height: 3,
                border: { type: 'line' },
                label: ` Edit ${fieldNames[activeField]} `,
                tags: true,
                style: { bg: 'black', fg: 'white', border: { fg: 'yellow' } },
            });
            const input = new text_1.Text({
                parent: promptBox,
                top: 0,
                left: 1,
                width: 40,
                content: `{inverse}${current.padEnd(35)}{/inverse}`,
                tags: true,
            });
            let editValue = current;
            let cursorPos = current.length;
            const updateInput = () => {
                const displayVal = editValue.padEnd(35);
                const before = displayVal.slice(0, cursorPos);
                const at = displayVal[cursorPos] || ' ';
                const after = displayVal.slice(cursorPos + 1);
                input.setContent(`${before}{inverse}${at}{/inverse}${after}`);
                this.screen?.render();
            };
            updateInput();
            const handleKey = (_ch, key) => {
                if (key.name === 'escape') {
                    promptBox.destroy();
                    modal.removeListener('keypress', handleKey);
                    return;
                }
                if (key.name === 'enter') {
                    values[activeField] = editValue.trim();
                    fields[activeField].setContent(values[activeField]);
                    promptBox.destroy();
                    modal.removeListener('keypress', handleKey);
                    return;
                }
                if (key.name === 'backspace') {
                    if (cursorPos > 0) {
                        editValue = editValue.slice(0, cursorPos - 1) + editValue.slice(cursorPos);
                        cursorPos--;
                        updateInput();
                    }
                    return;
                }
                if (key.name === 'left') {
                    if (cursorPos > 0)
                        cursorPos--;
                    updateInput();
                    return;
                }
                if (key.name === 'right') {
                    if (cursorPos < editValue.length)
                        cursorPos++;
                    updateInput();
                    return;
                }
                // Regular character input
                if (key.ch && !key.ctrl && !key.meta && editValue.length < 35) {
                    editValue = editValue.slice(0, cursorPos) + key.ch + editValue.slice(cursorPos);
                    cursorPos++;
                    updateInput();
                }
            };
            modal.on('keypress', handleKey);
            this.screen?.render();
        });
        modal.key(['escape', 'q'], () => closeDialog(true)); // Auto-save on close
        overlay.on('cancel', () => closeDialog(false));
        overlay.show();
        modal.focus();
        this.screen.render();
    }
    /**
     * Update sidebar tool selection highlighting
     */
    updateSidebarToolSelection() {
        if (!this.toolPanel)
            return;
        const tools = ['text', 'draw', 'line', 'box', 'ellipse', 'fill', 'pick', 'select'];
        const labels = ['Text', 'Draw', 'Line', 'Rect', 'Ellip', 'Fill', 'Pick', 'Select'];
        this.toolPanel.children.forEach((child, idx) => {
            if (child instanceof box_1.Box && idx < tools.length) {
                const isSelected = this.currentTool === tools[idx];
                const shortcut = labels[idx][0];
                const rest = labels[idx].slice(1);
                child.setContent((isSelected ? '{inverse}' : '') + `{yellow-fg}${shortcut}{/yellow-fg}${rest}` + (isSelected ? '{/inverse}' : ''));
            }
        });
        this.screen?.render();
    }
    /**
     * Toggle sidebar visibility
     */
    toggleSidebar() {
        if (this.sidebar) {
            if (this.sidebar.hidden) {
                this.sidebar.show();
                this.viewport.left = 6;
                this.drawCanvas.left = 6;
                this.drawCursor.left = 6;
            }
            else {
                this.sidebar.hide();
                this.viewport.left = 0;
                this.drawCanvas.left = 0;
                this.drawCursor.left = 0;
            }
            this.screen?.render();
        }
    }
    /**
     * Toggle F-key toolbar visibility
     */
    toggleFkeyToolbar() {
        if (this.fkeyToolbar) {
            if (this.fkeyToolbar.hidden) {
                this.fkeyToolbar.show();
            }
            else {
                this.fkeyToolbar.hide();
            }
            this.screen?.render();
        }
    }
    /**
     * Swap foreground and background colors
     */
    swapColors() {
        const tmp = this.currentFg;
        this.currentFg = this.currentBg;
        this.currentBg = tmp;
        this.updateStatusBar();
        this.screen?.render();
    }
    /**
     * Reset colors to default (white on black)
     */
    resetColors() {
        this.currentFg = 7;
        this.currentBg = 0;
        this.updateStatusBar();
        this.screen?.render();
    }
    /**
     * Create new document (clear canvas)
     */
    newDocument() {
        if (!this.cellCanvas)
            return;
        // Clear the canvas
        this.cellCanvas = CoreCanvas.createCanvas(80, 25);
        this.syncCoreCanvasToDisplay();
        // Reset lines for text mode
        this.lines = [''];
        this.cursor = { line: 0, col: 0 };
        this.modified = false;
        // Clear undo stack
        this.undoStack = [];
        this.redoStack = [];
        this.saveUndoState();
        this.updateDisplay();
    }
    setupKeyHandlers() {
        // Set up handlers on viewport (which has focus) instead of parent
        // This ensures input is actually received
        // Help (?) - works on both viewport and canvas
        this.viewport.key(['?'], () => {
            this.showHelp();
            return true;
        });
        this.drawCanvas.key(['?'], () => {
            this.showHelp();
            return true;
        });
        // Exit handler - shared function
        const handleExit = () => {
            // Don't exit if a modal is open - ESC should only close the modal
            if (this.modalOpen)
                return true;
            if (this.onExitCallback) {
                if (this.modified) {
                    this.confirmExit();
                }
                else {
                    this.onExitCallback();
                }
            }
            return true;
        };
        // ESC on parent, viewport, AND drawCanvas
        this.key(['escape'], handleExit);
        this.viewport.key(['escape'], handleExit);
        this.drawCanvas.key(['escape'], handleExit);
        // Toggle UI visibility (F2 by default)
        this.viewport.key([this.hideUIHotkey], () => {
            this.toggleUI();
            return true;
        });
        // Text mode keys - listen on viewport
        // Modifier key combinations (Ctrl+S, Ctrl+M, etc.) are handled here
        // because blessed's key() method is unreliable for Ctrl combinations
        this.viewport.on('keypress', (ch, key) => {
            if (!key)
                return;
            // Handle Ctrl+key shortcuts first
            if (key.ctrl) {
                if (key.name === 's') {
                    this.save().catch(console.error);
                    return;
                }
                else if (key.name === 'm') {
                    this.toggleMode();
                    return;
                }
                else if (key.name === 'z') {
                    this.undo();
                    return;
                }
                else if (key.name === 'y') {
                    this.redo();
                    return;
                }
            }
            this.handleTextKey(ch, key);
            this.updateDisplay();
        });
        // Draw mode keys - listen on canvas
        // Modifier key combinations are handled here as well
        this.drawCanvas.on('keypress', (ch, key) => {
            if (!key)
                return;
            // Handle Ctrl+key shortcuts first
            if (key.ctrl) {
                if (key.name === 's') {
                    this.save().catch(console.error);
                    return;
                }
                else if (key.name === 'm') {
                    this.toggleMode();
                    return;
                }
                else if (key.name === 'z') {
                    this.undo();
                    return;
                }
                else if (key.name === 'y') {
                    this.redo();
                    return;
                }
            }
            this.handleDrawKey(ch, key);
            this.updateStatusBar();
            if (this.screen) {
                this.screen.render();
            }
        });
    }
    setupMouseHandlers() {
        // TEXT MODE - Mouse click on viewport for cursor positioning
        this.viewport.on('click', (data) => {
            if (!data)
                return;
            // Calculate click position relative to viewport
            const x = data.x - this.viewport.aleft;
            const y = data.y - this.viewport.atop;
            if (x < 0 || y < 0)
                return;
            // Move cursor to clicked position - allow free movement
            this.cursor.line = y + this.scrollTop;
            this.cursor.col = x + this.scrollLeft;
            // Ensure lines exist up to cursor position
            while (this.lines.length <= this.cursor.line) {
                this.lines.push('');
            }
            // Pad line with spaces if cursor is beyond current line length
            const line = this.lines[this.cursor.line] || '';
            if (this.cursor.col > line.length) {
                this.lines[this.cursor.line] = line.padEnd(this.cursor.col, ' ');
            }
            this.updateDisplay();
            if (this.screen) {
                this.screen.render();
            }
        });
        // DRAW MODE - Mouse handlers on canvas
        this.drawCanvas.on('click', (data) => {
            // Don't process clicks if a modal dialog or dropdown menu is open (or just closed)
            if (!data || this.modalOpen || dropdown_menu_1.DropdownMenu.shouldBlockClick())
                return;
            // Calculate click position relative to canvas content area
            // Use ileft/itop to account for any border or padding
            const x = data.x - this.drawCanvas.ileft;
            const y = data.y - this.drawCanvas.itop;
            if (x < 0 || y < 0)
                return;
            // Clamp to canvas bounds (80 columns, 25 rows)
            this.cursor.col = Math.min(Math.max(0, x), 79);
            this.cursor.line = Math.min(Math.max(0, y), 24);
            this.updateDrawCursor();
            // Handle tool-specific click behavior
            if (data.button === 'left') {
                this.handleToolClick(this.cursor.col, this.cursor.line);
            }
            else if (data.button === 'right') {
                // RMB: Draw with background color (Moebius-style)
                this.drawWithBackgroundColor();
            }
            this.updateStatusBar();
            if (this.screen) {
                this.screen.render();
            }
        });
        // DRAW MODE - Mouse movement for continuous drawing
        // Also handles mousedown since 'click' event may not fire reliably
        this.drawCanvas.on('mouse', (data) => {
            // Don't process mouse events if a modal dialog or dropdown menu is open (or just closed)
            if (!data || !data.action || this.modalOpen || dropdown_menu_1.DropdownMenu.shouldBlockClick())
                return;
            // Calculate position relative to canvas content area
            // Use ileft/itop to account for any border or padding
            const x = data.x - this.drawCanvas.ileft;
            const y = data.y - this.drawCanvas.itop;
            if (x < 0 || y < 0)
                return;
            // Clamp to canvas bounds (80 columns, 25 rows)
            this.cursor.col = Math.min(Math.max(0, x), 79);
            this.cursor.line = Math.min(Math.max(0, y), 24);
            this.updateDrawCursor();
            // For shape tools, update preview on mouse move while drawing
            const shapeTools = ['line', 'box', 'box-fill', 'ellipse', 'ellipse-fill', 'select'];
            const isShapeTool = shapeTools.includes(this.currentTool);
            if (isShapeTool && this.isDrawing && data.action === 'mousemove') {
                // Update shape preview
                this.updateShapePreview(this.cursor.col, this.cursor.line);
            }
            else if (!isShapeTool) {
                // Draw/text tools - draw on mousedown or mousemove with button pressed (drag)
                // LMB: Draw with foreground color, RMB: Draw with background color (Moebius-style)
                if ((data.action === 'mousedown' || data.action === 'mousemove') && data.button) {
                    if (data.button === 'left') {
                        // Use half-block mode if enabled
                        if (this.brushMode === 'half-block') {
                            this.drawHalfBlock(this.cursor.col, this.cursor.line, this.halfBlockSubY);
                        }
                        else {
                            this.drawAtCursor();
                        }
                    }
                    else if (data.button === 'right') {
                        // RMB: Draw with background color (Moebius-style)
                        if (this.brushMode === 'half-block') {
                            this.drawHalfBlockWithBg(this.cursor.col, this.cursor.line, this.halfBlockSubY);
                        }
                        else {
                            this.drawWithBackgroundColor();
                        }
                    }
                }
            }
            this.updateStatusBar();
            if (this.screen) {
                this.screen.render();
            }
        });
    }
    toggleUI() {
        this.uiVisible = !this.uiVisible;
        // Toggle all UI components
        if (this.menuBar) {
            if (this.uiVisible)
                this.menuBar.show();
            else
                this.menuBar.hide();
        }
        if (this.fkeyToolbar) {
            if (this.uiVisible)
                this.fkeyToolbar.show();
            else
                this.fkeyToolbar.hide();
        }
        if (this.sidebar) {
            if (this.uiVisible)
                this.sidebar.show();
            else
                this.sidebar.hide();
        }
        if (this.statusBar) {
            if (this.uiVisible)
                this.statusBar.show();
            else
                this.statusBar.hide();
        }
        // Calculate new layout positions
        let topOffset = 0;
        let leftOffset = 0;
        if (this.uiVisible) {
            if (this.menuBar)
                topOffset += 1;
            if (this.fkeyToolbar)
                topOffset += 1;
            if (this.sidebar)
                leftOffset = 6;
        }
        // Adjust viewport/canvas positions
        this.viewport.top = topOffset;
        this.viewport.left = leftOffset;
        this.viewport.bottom = this.uiVisible && this.statusBar ? 1 : 0;
        this.drawCanvas.top = topOffset;
        this.drawCanvas.left = leftOffset;
        this.drawCanvas.bottom = this.uiVisible && this.statusBar ? 1 : 0;
        this.drawCursor.top = topOffset;
        this.drawCursor.left = leftOffset;
        this.updateDrawCursor();
        this.updateDisplay();
        if (this.screen) {
            this.screen.render();
        }
    }
    handleTextKey(ch, key) {
        const { name, ctrl, shift } = key;
        // Navigation
        if (name === 'left') {
            this.moveCursor(-1, 0);
        }
        else if (name === 'right') {
            this.moveCursor(1, 0);
        }
        else if (name === 'up') {
            this.moveCursor(0, -1);
        }
        else if (name === 'down') {
            this.moveCursor(0, 1);
        }
        else if (name === 'home') {
            this.cursor.col = 0;
        }
        else if (name === 'end') {
            this.cursor.col = this.lines[this.cursor.line]?.length || 0;
        }
        else if (name === 'pageup') {
            const viewportHeight = this.viewport.height - 2;
            this.cursor.line = Math.max(0, this.cursor.line - viewportHeight);
        }
        else if (name === 'pagedown') {
            const viewportHeight = this.viewport.height - 2;
            this.cursor.line = Math.min(this.lines.length - 1, this.cursor.line + viewportHeight);
        }
        // Editing
        else if (name === 'return' || name === 'enter') {
            this.insertNewLine();
        }
        else if (name === 'backspace') {
            this.deleteChar(true);
        }
        else if (name === 'delete') {
            this.deleteChar(false);
        }
        else if (name === 'tab') {
            this.overwriteTextAtCursor('  '); // 2 spaces
        }
        else if (ch && ch.length === 1 && !ctrl) {
            this.overwriteTextAtCursor(ch);
        }
        // Delete line
        else if (ctrl && name === 'd') {
            this.lines.splice(this.cursor.line, 1);
            if (this.lines.length === 0)
                this.lines = [''];
            this.modified = true;
        }
    }
    handleDrawKey(ch, key) {
        const { name, shift, ctrl } = key;
        // ===== F-KEYS: Select character from F-key toolbar (Moebius-style) =====
        // F1-F12 now select characters from the current character set
        const fkeyMatch = name?.match(/^f(\d+)$/);
        if (fkeyMatch) {
            const fkeyNum = parseInt(fkeyMatch[1], 10);
            if (fkeyNum >= 1 && fkeyNum <= 12) {
                // Shift+F-key to change character set
                if (shift) {
                    this.nextFkeySet();
                }
                else {
                    this.selectFkeyChar(fkeyNum - 1);
                }
                return;
            }
        }
        // ===== ALT KEY SHORTCUTS =====
        if (key.meta || key.alt) {
            // Alt+C = Colors (FG picker)
            if (name === 'c') {
                this.showColorPicker(true);
                return;
            }
            // Alt+B = Background color picker
            if (name === 'b') {
                this.showColorPicker(false);
                return;
            }
            // Alt+H = Toggle half-block mode
            if (name === 'h') {
                if (this.brushMode === 'half-block') {
                    this.switchBrushMode('text');
                }
                else {
                    this.switchBrushMode('half-block');
                }
                return;
            }
        }
        // ===== CTRL KEY SHORTCUTS =====
        if (ctrl) {
            // Ctrl+H = Toggle half-block sub-row (upper/lower)
            if (name === 'h') {
                this.toggleHalfBlockSubY();
                return;
            }
        }
        // ===== TAB = Toggle half-block sub-row when in half-block mode =====
        if (name === 'tab' && this.brushMode === 'half-block') {
            this.toggleHalfBlockSubY();
            return;
        }
        // ===== NAVIGATION: Always works =====
        if (name === 'left') {
            this.cursor.col = Math.max(0, this.cursor.col - 1);
            this.updateDrawCursor();
            return;
        }
        if (name === 'right') {
            this.cursor.col = Math.min(79, this.cursor.col + 1);
            this.updateDrawCursor();
            return;
        }
        if (name === 'up') {
            this.cursor.line = Math.max(0, this.cursor.line - 1);
            this.updateDrawCursor();
            return;
        }
        if (name === 'down') {
            this.cursor.line = Math.min(24, this.cursor.line + 1);
            this.updateDrawCursor();
            return;
        }
        // Enter moves to next line
        if (name === 'enter' || name === 'return') {
            this.cursor.line = Math.min(24, this.cursor.line + 1);
            this.cursor.col = 0;
            this.updateDrawCursor();
            return;
        }
        // Backspace erases and moves left
        if (name === 'backspace') {
            if (this.cursor.col > 0) {
                this.cursor.col--;
                this.eraseAtCursor();
                this.updateDrawCursor();
            }
            return;
        }
        // ===== TEXT TOOL: All keys type characters (Moebius default) =====
        if (this.currentTool === 'text') {
            // Type any printable character
            if (ch && ch.length === 1) {
                this.typeCharAtCursor(ch);
                this.cursor.col = Math.min(79, this.cursor.col + 1);
                this.updateDrawCursor();
                return;
            }
            // Space types a space
            if (name === 'space') {
                this.typeCharAtCursor(' ');
                this.cursor.col = Math.min(79, this.cursor.col + 1);
                this.updateDrawCursor();
                return;
            }
            return;
        }
        // ===== OTHER TOOLS: Single-letter shortcuts to switch tools =====
        // Tool shortcuts (only when NOT in text mode)
        const toolShortcuts = {
            't': 'text',
            'd': 'draw',
            'l': 'line',
            'r': 'box',
            'e': 'ellipse',
            'f': 'fill',
            'p': 'pick',
            's': 'select',
        };
        const lowerCh = ch?.toLowerCase();
        if (lowerCh && toolShortcuts[lowerCh]) {
            this.switchTool(toolShortcuts[lowerCh]);
            return;
        }
        // Undo (U)
        if (lowerCh === 'u') {
            this.undo();
            return;
        }
        // Drawing with space
        if (name === 'space') {
            this.drawAtCursor();
        }
    }
    /**
     * Switch to a different drawing tool
     */
    switchTool(tool) {
        this.currentTool = tool;
        this.isDrawing = false;
        this.drawStartPos = null;
        this.updateToolbar();
        this.updateStatusBar();
    }
    /**
     * Type a character at cursor position (for text tool)
     */
    typeCharAtCursor(char) {
        const y = this.cursor.line;
        const x = this.cursor.col;
        // Use core canvas for cell-based drawing
        if (this.cellCanvas) {
            const cell = {
                char: char,
                fg: this.currentFg,
                bg: this.currentBg,
                blink: false,
            };
            CoreCanvas.setCell(this.cellCanvas, x, y, cell);
            this.syncCoreCanvasToDisplay();
        }
        this.modified = true;
    }
    moveCursor(dx, dy) {
        if (dy !== 0) {
            // Allow free vertical movement within reasonable bounds (80x25 for ANSI)
            this.cursor.line = Math.max(0, Math.min(999, this.cursor.line + dy));
            // Ensure line exists
            while (this.lines.length <= this.cursor.line) {
                this.lines.push('');
            }
            // Ensure the new line is long enough for the current column position
            const line = this.lines[this.cursor.line] || '';
            if (this.cursor.col > line.length) {
                this.lines[this.cursor.line] = line.padEnd(this.cursor.col, ' ');
            }
        }
        if (dx !== 0) {
            // Allow free horizontal movement (up to maxLineLength)
            this.cursor.col = Math.max(0, Math.min(this.maxLineLength, this.cursor.col + dx));
            // Ensure line exists and is long enough
            const line = this.lines[this.cursor.line] || '';
            if (this.cursor.col > line.length) {
                // Pad line with spaces to cursor position
                this.lines[this.cursor.line] = line.padEnd(this.cursor.col, ' ');
            }
        }
    }
    insertTextAtCursor(text) {
        const line = this.lines[this.cursor.line] || '';
        const before = line.substring(0, this.cursor.col);
        const after = line.substring(this.cursor.col);
        this.lines[this.cursor.line] = before + text + after;
        this.cursor.col += text.length;
        this.modified = true;
    }
    overwriteTextAtCursor(text) {
        let line = this.lines[this.cursor.line] || '';
        // Pad line with spaces if cursor is beyond current line length
        if (this.cursor.col > line.length) {
            line = line.padEnd(this.cursor.col, ' ');
        }
        const before = line.substring(0, this.cursor.col);
        const after = line.substring(this.cursor.col + text.length);
        this.lines[this.cursor.line] = before + text + after;
        this.cursor.col += text.length;
        this.modified = true;
    }
    insertNewLine() {
        const line = this.lines[this.cursor.line] || '';
        const before = line.substring(0, this.cursor.col);
        const after = line.substring(this.cursor.col);
        this.lines[this.cursor.line] = before;
        this.lines.splice(this.cursor.line + 1, 0, after);
        this.cursor.line++;
        this.cursor.col = 0;
        this.modified = true;
    }
    deleteChar(backspace) {
        const line = this.lines[this.cursor.line] || '';
        if (backspace) {
            if (this.cursor.col > 0) {
                const before = line.substring(0, this.cursor.col - 1);
                const after = line.substring(this.cursor.col);
                this.lines[this.cursor.line] = before + after;
                this.cursor.col--;
                this.modified = true;
            }
            else if (this.cursor.line > 0) {
                // Join with previous line
                const prevLine = this.lines[this.cursor.line - 1];
                this.cursor.col = prevLine.length;
                this.lines[this.cursor.line - 1] = prevLine + line;
                this.lines.splice(this.cursor.line, 1);
                this.cursor.line--;
                this.modified = true;
            }
        }
        else {
            if (this.cursor.col < line.length) {
                const before = line.substring(0, this.cursor.col);
                const after = line.substring(this.cursor.col + 1);
                this.lines[this.cursor.line] = before + after;
                this.modified = true;
            }
            else if (this.cursor.line < this.lines.length - 1) {
                // Join with next line
                const nextLine = this.lines[this.cursor.line + 1];
                this.lines[this.cursor.line] = line + nextLine;
                this.lines.splice(this.cursor.line + 1, 1);
                this.modified = true;
            }
        }
    }
    toggleMode() {
        if (this.mode === 'text') {
            this.mode = 'draw';
            // Switch to canvas
            this.viewport.hide();
            this.drawCanvas.show();
            this.drawCursor.show();
            this.updateDrawCursor();
            this.drawCanvas.focus();
        }
        else {
            this.mode = 'text';
            // Switch to viewport
            this.drawCanvas.hide();
            this.drawCursor.hide();
            this.viewport.show();
            this.viewport.focus();
        }
        this.updateToolbar();
        this.updateStatusBar();
        if (this.screen) {
            this.screen.render();
        }
    }
    updateDrawCursor() {
        if (!this.drawCursor || this.mode !== 'draw')
            return;
        // Position cursor overlay at the current cursor position
        const canvasTop = this.drawCanvas.position.top || 0;
        const canvasLeft = this.drawCanvas.position.left || 0;
        this.drawCursor.top = canvasTop + this.cursor.line;
        this.drawCursor.left = canvasLeft + this.cursor.col;
        // Show the current drawing character in the cursor
        this.drawCursor.setContent(this.currentChar);
    }
    drawAtCursor() {
        const y = this.cursor.line;
        const x = this.cursor.col;
        // Use core canvas for cell-based drawing
        if (this.cellCanvas) {
            const cell = {
                char: this.currentChar,
                fg: this.currentFg,
                bg: this.currentBg,
                blink: false,
            };
            CoreCanvas.setCell(this.cellCanvas, x, y, cell);
            // Re-render canvas with colors
            this.syncCoreCanvasToDisplay();
        }
        this.modified = true;
    }
    eraseAtCursor() {
        const y = this.cursor.line;
        const x = this.cursor.col;
        // Update core canvas
        if (this.cellCanvas) {
            const emptyCell = { char: ' ', fg: 7, bg: 0, blink: false };
            CoreCanvas.setCell(this.cellCanvas, x, y, emptyCell);
            // Re-render canvas with colors
            this.syncCoreCanvasToDisplay();
        }
        this.modified = true;
    }
    /**
     * Draw with background color (Moebius-style RMB drawing)
     * Swaps FG and BG colors so RMB draws with the current background color
     */
    drawWithBackgroundColor() {
        const y = this.cursor.line;
        const x = this.cursor.col;
        // Use core canvas for cell-based drawing
        // Swap FG and BG so we're drawing with the background color
        if (this.cellCanvas) {
            const cell = {
                char: this.currentChar,
                fg: this.currentBg, // Use BG as FG
                bg: this.currentFg, // Use FG as BG
                blink: false,
            };
            CoreCanvas.setCell(this.cellCanvas, x, y, cell);
            // Re-render canvas with colors
            this.syncCoreCanvasToDisplay();
        }
        this.modified = true;
    }
    // ============================================
    // HALF-BLOCK DRAWING SYSTEM (Moebius-style 2x resolution)
    // ============================================
    /**
     * Draw in half-block mode at cursor position
     * Each cell represents 2 vertical "pixels" using ▀▄█ characters
     * FG color = upper half, BG color = lower half
     */
    drawHalfBlock(x, y, subY) {
        if (!this.cellCanvas)
            return;
        const existingCell = CoreCanvas.getCell(this.cellCanvas, x, y);
        if (!existingCell)
            return;
        // Determine what's currently in this cell
        const currentChar = existingCell.char;
        const currentFg = existingCell.fg;
        const currentBg = existingCell.bg;
        // Calculate new cell state based on which half we're drawing
        let newChar;
        let newFg;
        let newBg;
        if (subY === 0) {
            // Drawing upper half
            if (currentChar === HALF_BLOCK.LOWER || currentChar === HALF_BLOCK.FULL) {
                // Lower half has content - check if colors match
                if (this.currentFg === currentBg) {
                    // Same color - use full block
                    newChar = HALF_BLOCK.FULL;
                    newFg = this.currentFg;
                    newBg = this.currentFg;
                }
                else {
                    // Different colors - use upper half block
                    newChar = HALF_BLOCK.UPPER;
                    newFg = this.currentFg; // Upper = FG
                    newBg = currentBg; // Lower = keep existing BG
                }
            }
            else if (currentChar === HALF_BLOCK.UPPER) {
                // Already has upper half - just change color
                newChar = HALF_BLOCK.UPPER;
                newFg = this.currentFg;
                newBg = currentBg;
            }
            else {
                // Empty or other char - set upper half only
                newChar = HALF_BLOCK.UPPER;
                newFg = this.currentFg;
                newBg = this.currentBg; // BG will show as lower half (empty)
            }
        }
        else {
            // Drawing lower half
            if (currentChar === HALF_BLOCK.UPPER || currentChar === HALF_BLOCK.FULL) {
                // Upper half has content - check if colors match
                if (this.currentFg === currentFg) {
                    // Same color - use full block
                    newChar = HALF_BLOCK.FULL;
                    newFg = this.currentFg;
                    newBg = this.currentFg;
                }
                else {
                    // Different colors - use upper half block (FG=upper, BG=lower)
                    newChar = HALF_BLOCK.UPPER;
                    newFg = currentFg; // Upper = keep existing FG
                    newBg = this.currentFg; // Lower = our color in BG
                }
            }
            else if (currentChar === HALF_BLOCK.LOWER) {
                // Already has lower half - change to use upper half representation
                newChar = HALF_BLOCK.UPPER;
                newFg = currentBg; // Old BG becomes FG (upper)
                newBg = this.currentFg; // New color in BG (lower)
            }
            else {
                // Empty or other char - set lower half only using ▄
                newChar = HALF_BLOCK.LOWER;
                newFg = this.currentFg; // ▄ uses FG for the lower part
                newBg = this.currentBg;
            }
        }
        const newCell = {
            char: newChar,
            fg: newFg,
            bg: newBg,
            blink: false,
        };
        CoreCanvas.setCell(this.cellCanvas, x, y, newCell);
        this.syncCoreCanvasToDisplay();
        this.modified = true;
    }
    /**
     * Erase in half-block mode at cursor position
     */
    eraseHalfBlock(x, y, subY) {
        if (!this.cellCanvas)
            return;
        const existingCell = CoreCanvas.getCell(this.cellCanvas, x, y);
        if (!existingCell)
            return;
        const currentChar = existingCell.char;
        const currentFg = existingCell.fg;
        const currentBg = existingCell.bg;
        let newChar;
        let newFg;
        let newBg;
        if (subY === 0) {
            // Erasing upper half
            if (currentChar === HALF_BLOCK.FULL || currentChar === HALF_BLOCK.UPPER) {
                // Has upper content - remove it, keep lower if exists
                if (currentChar === HALF_BLOCK.FULL) {
                    newChar = HALF_BLOCK.LOWER;
                    newFg = currentBg; // BG becomes FG for ▄
                    newBg = 0; // Black background
                }
                else {
                    newChar = HALF_BLOCK.LOWER;
                    newFg = currentBg;
                    newBg = 0;
                }
            }
            else {
                // No upper content - nothing to erase
                return;
            }
        }
        else {
            // Erasing lower half
            if (currentChar === HALF_BLOCK.FULL || currentChar === HALF_BLOCK.UPPER) {
                // Has lower content (in BG) - remove it, keep upper
                newChar = HALF_BLOCK.UPPER;
                newFg = currentFg;
                newBg = 0; // Black for empty lower half
            }
            else if (currentChar === HALF_BLOCK.LOWER) {
                // Only has lower half - clear it
                newChar = HALF_BLOCK.EMPTY;
                newFg = 7;
                newBg = 0;
            }
            else {
                return;
            }
        }
        const newCell = {
            char: newChar,
            fg: newFg,
            bg: newBg,
            blink: false,
        };
        CoreCanvas.setCell(this.cellCanvas, x, y, newCell);
        this.syncCoreCanvasToDisplay();
        this.modified = true;
    }
    /**
     * Draw half-block with background color (Moebius-style RMB)
     * Uses background color instead of foreground for the half being drawn
     */
    drawHalfBlockWithBg(x, y, subY) {
        if (!this.cellCanvas)
            return;
        const existingCell = CoreCanvas.getCell(this.cellCanvas, x, y);
        if (!existingCell)
            return;
        const currentChar = existingCell.char;
        const currentFg = existingCell.fg;
        const currentBg = existingCell.bg;
        let newChar;
        let newFg;
        let newBg;
        // Use background color instead of foreground (swapped)
        const drawColor = this.currentBg;
        if (subY === 0) {
            // Drawing upper half with BG color
            if (currentChar === HALF_BLOCK.EMPTY || currentChar === ' ') {
                newChar = HALF_BLOCK.UPPER;
                newFg = drawColor;
                newBg = 0;
            }
            else if (currentChar === HALF_BLOCK.LOWER) {
                newChar = HALF_BLOCK.FULL;
                newFg = drawColor;
                newBg = currentFg;
            }
            else if (currentChar === HALF_BLOCK.UPPER) {
                newChar = HALF_BLOCK.UPPER;
                newFg = drawColor;
                newBg = currentBg;
            }
            else {
                newChar = HALF_BLOCK.FULL;
                newFg = drawColor;
                newBg = currentBg;
            }
        }
        else {
            // Drawing lower half with BG color
            if (currentChar === HALF_BLOCK.EMPTY || currentChar === ' ') {
                newChar = HALF_BLOCK.LOWER;
                newFg = drawColor;
                newBg = 0;
            }
            else if (currentChar === HALF_BLOCK.UPPER) {
                newChar = HALF_BLOCK.FULL;
                newFg = currentFg;
                newBg = drawColor;
            }
            else if (currentChar === HALF_BLOCK.LOWER) {
                newChar = HALF_BLOCK.LOWER;
                newFg = drawColor;
                newBg = currentBg;
            }
            else {
                newChar = HALF_BLOCK.FULL;
                newFg = currentFg;
                newBg = drawColor;
            }
        }
        const newCell = {
            char: newChar,
            fg: newFg,
            bg: newBg,
            blink: false,
        };
        CoreCanvas.setCell(this.cellCanvas, x, y, newCell);
        this.syncCoreCanvasToDisplay();
        this.modified = true;
    }
    /**
     * Get sub-Y position from mouse Y coordinate
     * Each cell is 1 character tall, but we track upper/lower half
     */
    getSubYFromMouseY(mouseY, cellY) {
        // In a terminal, we can't truly get sub-pixel position
        // Use alternating pattern based on cursor movement
        // Or track mouse micro-movements if available
        // For now, toggle on each click or use cursor.line parity
        return this.halfBlockSubY;
    }
    /**
     * Toggle which half-block sub-row is active
     */
    toggleHalfBlockSubY() {
        this.halfBlockSubY = this.halfBlockSubY === 0 ? 1 : 0;
        this.updateStatusBar();
    }
    /**
     * Switch brush mode
     */
    switchBrushMode(mode) {
        this.brushMode = mode;
        this.updateStatusBar();
        this.updateSidebarBrushMode();
    }
    /**
     * Update sidebar to show current brush mode
     */
    updateSidebarBrushMode() {
        if (!this.sidebar)
            return;
        // Find and update brush mode buttons in sidebar
        // The brush mode buttons are children of sidebar at positions 21-23
        // This is a simplified approach - in production would use references
        const children = this.sidebar.children;
        const brushModes = ['text', 'half-block'];
        // Update brush mode button highlighting
        children.forEach((child) => {
            if (child instanceof box_1.Box) {
                const content = child._originalContent || child.content;
                if (content && typeof content === 'string') {
                    if (content.includes('Text') || content.includes('HBlock')) {
                        const isText = content.includes('Text');
                        const mode = isText ? 'text' : 'half-block';
                        const label = isText ? 'Text' : 'HBlock';
                        const isSelected = this.brushMode === mode;
                        child.setContent((isSelected ? '{inverse}' : '') +
                            `{cyan-fg}${label}{/cyan-fg}` +
                            (isSelected ? '{/inverse}' : ''));
                    }
                    // Update sub-row indicator
                    if (content.includes('Upper') || content.includes('Lower') || content.includes('▀') || content.includes('▄')) {
                        if (this.brushMode === 'half-block') {
                            child.setContent(`{yellow-fg}${this.halfBlockSubY === 0 ? '▀Upper' : '▄Lower'}{/yellow-fg}`);
                        }
                        else {
                            child.setContent('');
                        }
                    }
                }
            }
        });
        this.screen?.render();
    }
    // ============================================
    // REAL-TIME PREVIEW OVERLAY SYSTEM
    // ============================================
    /**
     * Initialize preview canvas (same size as main canvas)
     */
    initPreviewCanvas() {
        if (!this.cellCanvas)
            return;
        this.previewCanvas = CoreCanvas.createCanvas(80, 25);
    }
    /**
     * Clear preview canvas
     */
    clearPreview() {
        if (this.previewCanvas) {
            // Clear all cells
            for (let y = 0; y < this.previewCanvas.length; y++) {
                for (let x = 0; x < this.previewCanvas[y].length; x++) {
                    this.previewCanvas[y][x] = { char: '', fg: 0, bg: 0, blink: false };
                }
            }
        }
        this.lastPreviewPos = null;
    }
    /**
     * Update preview for shape tools (line, box, ellipse)
     * Called on mouse move while drawing
     */
    updateShapePreview(x, y) {
        if (!this.drawStartPos || !this.cellCanvas)
            return;
        // Only update if position changed
        if (this.lastPreviewPos && this.lastPreviewPos.x === x && this.lastPreviewPos.y === y) {
            return;
        }
        this.lastPreviewPos = { x, y };
        // Initialize preview canvas if needed
        if (!this.previewCanvas) {
            this.initPreviewCanvas();
        }
        if (!this.previewCanvas)
            return;
        // Clear previous preview
        this.clearPreview();
        const cell = {
            char: this.currentChar,
            fg: this.currentFg,
            bg: this.currentBg,
            blink: false,
        };
        // Draw preview shape based on current tool
        switch (this.currentTool) {
            case 'line':
                this.previewLine(this.drawStartPos.col, this.drawStartPos.line, x, y, cell);
                break;
            case 'box':
                this.previewBox(this.drawStartPos.col, this.drawStartPos.line, x, y, cell, false);
                break;
            case 'box-fill':
                this.previewBox(this.drawStartPos.col, this.drawStartPos.line, x, y, cell, true);
                break;
            case 'ellipse':
                const rx = Math.abs(x - this.drawStartPos.col);
                const ry = Math.abs(y - this.drawStartPos.line);
                this.previewEllipse(this.drawStartPos.col, this.drawStartPos.line, rx, ry, cell, false);
                break;
            case 'ellipse-fill':
                const rx2 = Math.abs(x - this.drawStartPos.col);
                const ry2 = Math.abs(y - this.drawStartPos.line);
                this.previewEllipse(this.drawStartPos.col, this.drawStartPos.line, rx2, ry2, cell, true);
                break;
            case 'select':
                this.previewSelection(this.drawStartPos.col, this.drawStartPos.line, x, y);
                break;
        }
        // Render preview
        this.renderPreview();
    }
    /**
     * Draw preview line using Bresenham algorithm
     */
    previewLine(x0, y0, x1, y1, cell) {
        if (!this.previewCanvas)
            return;
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        let x = x0;
        let y = y0;
        while (true) {
            if (x >= 0 && x < 80 && y >= 0 && y < 25) {
                this.previewCanvas[y][x] = { ...cell };
            }
            if (x === x1 && y === y1)
                break;
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x += sx;
            }
            if (e2 < dx) {
                err += dx;
                y += sy;
            }
        }
    }
    /**
     * Draw preview box/rectangle
     */
    previewBox(x0, y0, x1, y1, cell, filled) {
        if (!this.previewCanvas)
            return;
        const minX = Math.max(0, Math.min(x0, x1));
        const maxX = Math.min(79, Math.max(x0, x1));
        const minY = Math.max(0, Math.min(y0, y1));
        const maxY = Math.min(24, Math.max(y0, y1));
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const isEdge = (y === minY || y === maxY || x === minX || x === maxX);
                if (filled || isEdge) {
                    this.previewCanvas[y][x] = { ...cell };
                }
            }
        }
    }
    /**
     * Draw preview ellipse using midpoint algorithm
     */
    previewEllipse(cx, cy, rx, ry, cell, filled) {
        if (!this.previewCanvas || rx === 0 || ry === 0)
            return;
        if (filled) {
            // Filled ellipse - draw horizontal lines
            for (let y = -ry; y <= ry; y++) {
                const py = cy + y;
                if (py < 0 || py >= 25)
                    continue;
                // Calculate x extent at this y
                const xExtent = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
                for (let x = -xExtent; x <= xExtent; x++) {
                    const px = cx + x;
                    if (px >= 0 && px < 80) {
                        this.previewCanvas[py][px] = { ...cell };
                    }
                }
            }
        }
        else {
            // Outline only - use parametric approach
            const steps = Math.max(rx, ry) * 4;
            for (let i = 0; i < steps; i++) {
                const angle = (2 * Math.PI * i) / steps;
                const px = Math.round(cx + rx * Math.cos(angle));
                const py = Math.round(cy + ry * Math.sin(angle));
                if (px >= 0 && px < 80 && py >= 0 && py < 25) {
                    this.previewCanvas[py][px] = { ...cell };
                }
            }
        }
    }
    /**
     * Draw preview selection rectangle (marching ants style)
     */
    previewSelection(x0, y0, x1, y1) {
        if (!this.previewCanvas)
            return;
        const minX = Math.max(0, Math.min(x0, x1));
        const maxX = Math.min(79, Math.max(x0, x1));
        const minY = Math.max(0, Math.min(y0, y1));
        const maxY = Math.min(24, Math.max(y0, y1));
        // Use dotted pattern for selection preview
        const selCell = { char: '·', fg: 15, bg: 0, blink: false };
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const isEdge = (y === minY || y === maxY || x === minX || x === maxX);
                if (isEdge) {
                    // Alternating pattern for "marching ants" effect
                    if ((x + y) % 2 === 0) {
                        this.previewCanvas[y][x] = selCell;
                    }
                }
            }
        }
        // Store selection bounds for later use
        this.selection = { x1: minX, y1: minY, x2: maxX, y2: maxY };
    }
    /**
     * Render preview overlay on top of main canvas
     */
    renderPreview() {
        if (!this.previewCanvas || !this.cellCanvas)
            return;
        // Compose main canvas + preview for display
        // For now, directly render preview cells over main canvas display
        // This is a simplified approach - a proper overlay would use blessed overlay
        // Build display content combining main canvas and preview
        let content = '';
        const colors = [
            'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
            'gray', 'lightred', 'lightgreen', 'lightyellow', 'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
        ];
        for (let y = 0; y < 25; y++) {
            for (let x = 0; x < 80; x++) {
                // Check preview first
                const preview = this.previewCanvas[y]?.[x];
                const main = this.cellCanvas[y]?.[x];
                let displayCell;
                if (preview && preview.char && preview.char !== '') {
                    // Use preview cell with highlight
                    displayCell = preview;
                }
                else if (main) {
                    displayCell = main;
                }
                else {
                    displayCell = { char: ' ', fg: 7, bg: 0, blink: false };
                }
                const fgColor = colors[displayCell.fg] || 'white';
                const bgColor = colors[displayCell.bg] || 'black';
                const char = displayCell.char || ' ';
                content += `{${fgColor}-fg}{${bgColor}-bg}${char}{/${bgColor}-bg}{/${fgColor}-fg}`;
            }
            if (y < 24)
                content += '\n';
        }
        this.drawCanvas.setContent(content);
        this.screen?.render();
    }
    /**
     * Apply preview to main canvas (commit the shape)
     */
    applyPreview() {
        if (!this.previewCanvas || !this.cellCanvas)
            return;
        for (let y = 0; y < this.previewCanvas.length; y++) {
            for (let x = 0; x < this.previewCanvas[y].length; x++) {
                const preview = this.previewCanvas[y][x];
                if (preview && preview.char && preview.char !== '') {
                    this.cellCanvas[y][x] = { ...preview };
                }
            }
        }
        this.clearPreview();
        this.syncCoreCanvasToDisplay();
        this.modified = true;
    }
    /**
     * Handle tool-specific click behavior using core library
     * Shape tools use preview system for real-time feedback
     */
    handleToolClick(x, y) {
        if (!this.cellCanvas)
            return;
        const cell = {
            char: this.currentChar,
            fg: this.currentFg,
            bg: this.currentBg,
            blink: false,
        };
        switch (this.currentTool) {
            case 'draw':
                // Use half-block mode if enabled
                if (this.brushMode === 'half-block') {
                    this.drawHalfBlock(x, y, this.halfBlockSubY);
                }
                else {
                    this.drawAtCursor();
                }
                break;
            case 'text':
                // Simple draw at cursor
                this.drawAtCursor();
                break;
            case 'line':
                // Line tool: first click sets start, second click applies preview
                if (!this.isDrawing) {
                    this.isDrawing = true;
                    this.drawStartPos = { line: y, col: x };
                    this.initPreviewCanvas();
                }
                else {
                    // Apply the preview to main canvas
                    this.applyPreview();
                    this.isDrawing = false;
                    this.drawStartPos = null;
                }
                break;
            case 'box':
                // Box tool: first click sets start, second click applies preview
                if (!this.isDrawing) {
                    this.isDrawing = true;
                    this.drawStartPos = { line: y, col: x };
                    this.initPreviewCanvas();
                }
                else {
                    this.applyPreview();
                    this.isDrawing = false;
                    this.drawStartPos = null;
                }
                break;
            case 'box-fill':
                // Filled box tool
                if (!this.isDrawing) {
                    this.isDrawing = true;
                    this.drawStartPos = { line: y, col: x };
                    this.initPreviewCanvas();
                }
                else {
                    this.applyPreview();
                    this.isDrawing = false;
                    this.drawStartPos = null;
                }
                break;
            case 'ellipse':
                // Ellipse tool: first click sets center, second click applies preview
                if (!this.isDrawing) {
                    this.isDrawing = true;
                    this.drawStartPos = { line: y, col: x };
                    this.initPreviewCanvas();
                }
                else {
                    this.applyPreview();
                    this.isDrawing = false;
                    this.drawStartPos = null;
                }
                break;
            case 'ellipse-fill':
                // Filled ellipse tool
                if (!this.isDrawing) {
                    this.isDrawing = true;
                    this.drawStartPos = { line: y, col: x };
                    this.initPreviewCanvas();
                }
                else {
                    this.applyPreview();
                    this.isDrawing = false;
                    this.drawStartPos = null;
                }
                break;
            case 'fill':
                // Flood fill at clicked position
                CoreCanvas.floodFill(this.cellCanvas, x, y, cell);
                this.syncCoreCanvasToDisplay();
                break;
            case 'pick':
                // Pick color/char from clicked cell
                const pickedCell = CoreCanvas.getCell(this.cellCanvas, x, y);
                if (pickedCell) {
                    this.currentFg = pickedCell.fg;
                    this.currentBg = pickedCell.bg;
                    if (pickedCell.char !== ' ') {
                        this.currentChar = pickedCell.char;
                    }
                }
                break;
            case 'select':
                // Selection tool - first click starts, second click finalizes
                if (!this.isDrawing) {
                    this.isDrawing = true;
                    this.drawStartPos = { line: y, col: x };
                    this.initPreviewCanvas();
                }
                else {
                    // Finalize selection (preview already set selection bounds)
                    this.clearPreview();
                    this.isDrawing = false;
                    this.drawStartPos = null;
                }
                break;
        }
        this.modified = true;
    }
    /**
     * Sync core canvas to blessed Canvas widget for display
     * Standard 80x25 ANSI art canvas with 1 character per cell
     */
    syncCoreCanvasToDisplay() {
        if (!this.cellCanvas)
            return;
        const colors = [
            'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
            'gray', 'lightred', 'lightgreen', 'lightyellow', 'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
        ];
        // Render canvas with colors using blessed tags
        // Standard 80 columns, 1 character per cell
        let content = '';
        for (let y = 0; y < 25; y++) {
            for (let x = 0; x < 80; x++) {
                const cell = this.cellCanvas[y]?.[x] || { char: ' ', fg: 7, bg: 0 };
                const fgColor = colors[cell.fg] || 'white';
                const bgColor = colors[cell.bg] || 'black';
                const char = cell.char || ' ';
                content += `{${fgColor}-fg}{${bgColor}-bg}${char}{/${bgColor}-bg}{/${fgColor}-fg}`;
            }
            if (y < 24)
                content += '\n';
        }
        this.drawCanvas.setContent(content);
    }
    updateDisplay() {
        if (this.mode === 'text') {
            this.renderTextMode();
        }
        else {
            // Draw mode: update cursor position
            this.updateDrawCursor();
        }
        this.updateStatusBar();
        this.updateToolbar();
        if (this.screen) {
            this.screen.render();
        }
    }
    renderTextMode() {
        const viewportHeight = this.viewport.height - 2;
        const viewportWidth = this.viewport.width - 2;
        // Auto-scroll to cursor
        if (this.cursor.line < this.scrollTop) {
            this.scrollTop = this.cursor.line;
        }
        else if (this.cursor.line >= this.scrollTop + viewportHeight) {
            this.scrollTop = this.cursor.line - viewportHeight + 1;
        }
        const lineNumberWidth = this.showLineNumbers ? 5 : 0;
        const content = [];
        for (let i = 0; i < viewportHeight; i++) {
            const lineIndex = this.scrollTop + i;
            if (lineIndex >= this.lines.length)
                break;
            const line = this.lines[lineIndex] || '';
            let displayLine = '';
            if (this.showLineNumbers) {
                displayLine += `{gray-fg}${(lineIndex + 1).toString().padStart(4)} {/}`;
            }
            // Show cursor on current line
            if (lineIndex === this.cursor.line) {
                const before = line.substring(0, this.cursor.col);
                const at = line[this.cursor.col] || ' ';
                const after = line.substring(this.cursor.col + 1);
                displayLine += before + `{inverse}${at}{/inverse}` + after;
            }
            else {
                displayLine += line;
            }
            content.push(displayLine);
        }
        this.viewport.setContent(content.join('\n'));
    }
    updateStatusBar() {
        if (!this.statusBar)
            return;
        // Moebius-style status bar: position, canvas size, colors, tool, character, brush mode
        const colors = [
            'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
            'gray', 'lightred', 'lightgreen', 'lightyellow', 'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
        ];
        const modifiedMark = this.modified ? '{yellow-fg}*{/}' : ' ';
        const pos = `{white-fg}X:${(this.cursor.col + 1).toString().padStart(3)} Y:${(this.cursor.line + 1).toString().padStart(3)}{/}`;
        const canvasSize = `{gray-fg}80x25{/}`;
        const charPreview = this.currentChar || '█';
        const fgColor = colors[this.currentFg] || 'white';
        const bgColor = colors[this.currentBg] || 'black';
        const toolNames = {
            'draw': 'DRAW',
            'line': 'LINE',
            'box': 'RECT',
            'box-fill': 'FILL-RECT',
            'ellipse': 'ELLIPSE',
            'ellipse-fill': 'FILL-ELLIPSE',
            'fill': 'FILL',
            'pick': 'PICK',
            'select': 'SELECT',
            'text': 'TEXT',
        };
        const toolName = toolNames[this.currentTool] || 'TEXT';
        const drawingState = this.isDrawing ? ' {yellow-fg}[1]{/}' : '';
        const iceIndicator = this.iceColorsEnabled ? '{magenta-fg}iCE{/}' : '';
        const layerInfo = this.layers.length > 1 ? `{cyan-fg}L${this.activeLayerIndex + 1}/${this.layers.length}{/}` : '';
        // Brush mode indicator
        const brushModeNames = {
            'text': '',
            'half-block': 'HLF',
            'custom': 'CUS',
            'shading': 'SHD',
            'colorize': 'COL',
        };
        const brushIndicator = this.brushMode !== 'text'
            ? `{green-fg}${brushModeNames[this.brushMode]}${this.brushMode === 'half-block' ? (this.halfBlockSubY === 0 ? '▀' : '▄') : ''}{/}`
            : '';
        // Format: [*] X:001 Y:001 | 80x25 | FG:7 BG:0 | [char] | TOOL | Brush | Layer | iCE
        this.statusBar.setContent(` ${modifiedMark} ${pos} | ${canvasSize} | ` +
            `{${fgColor}-fg}{${bgColor}-bg}${charPreview}{/} ` +
            `{${fgColor}-fg}FG:${this.currentFg.toString().padStart(2)}{/} ` +
            `{${bgColor}-bg}{white-fg}BG:${this.currentBg.toString().padStart(2)}{/} | ` +
            `{cyan-fg}${toolName}{/}${drawingState}` +
            (brushIndicator ? ` ${brushIndicator}` : '') +
            (layerInfo ? ` | ${layerInfo}` : '') +
            (iceIndicator ? ` ${iceIndicator}` : ''));
    }
    updateToolbar() {
        // F-key toolbar is now separate, no need for old toolbar
        // Update F-key toolbar if it exists
        if (this.fkeyToolbar) {
            this.updateFkeyToolbar();
        }
        // Update sidebar tool selection
        if (this.sidebar) {
            this.updateSidebarToolSelection();
        }
    }
    async save() {
        if (!this.onSaveCallback)
            return;
        let content;
        if (this.mode === 'draw') {
            // Get content from Canvas widget
            content = this.drawCanvas.getContent();
        }
        else {
            content = this.lines.join('\n');
        }
        const success = await this.onSaveCallback(content);
        if (success) {
            this.modified = false;
            this.updateDisplay();
        }
    }
    confirmExit() {
        if (!this.screen) {
            if (this.onExitCallback)
                this.onExitCallback();
            return;
        }
        // Hide the cursor overlay while dialog is shown
        this.drawCursor.hide();
        this.modalOpen = true;
        // Track if we should exit or return to editing
        let shouldExit = false;
        // Use SDK ConfirmModal for proper input handling
        const modal = new confirm_modal_1.ConfirmModal({
            parent: this.screen,
            title: 'Unsaved Changes',
            message: 'You have unsaved changes.\n\nSave: Save and exit\nDiscard: Exit without saving\nESC: Cancel and continue editing',
            confirmText: '[ Save ]',
            cancelText: '[ Discard ]',
            confirmColor: 'green',
            cancelColor: 'red',
            borderColor: 'yellow',
            overlay: true,
            style: {
                fg: 'white',
                bg: 'black',
            },
            onConfirm: () => {
                shouldExit = true;
                modal.destroy();
                this.save().then(() => {
                    if (this.onExitCallback)
                        this.onExitCallback();
                }).catch(console.error);
            },
            onCancel: () => {
                shouldExit = true;
                modal.destroy();
                if (this.onExitCallback)
                    this.onExitCallback();
            },
        });
        // Override ESC to cancel and return to editing (not exit)
        modal.key(['escape'], () => {
            if (!shouldExit) {
                modal.hide();
                modal.destroy();
                this.restoreFocusAfterDialog();
            }
            return true; // Prevent default ESC handling
        });
        modal.display();
    }
    restoreFocusAfterDialog() {
        // Defer clearing modal flag so ESC handler still sees it as true
        // (ESC both closes modal AND triggers exit handler - we need exit handler to see modalOpen=true)
        setImmediate(() => {
            this.modalOpen = false;
        });
        // Show cursor overlay again if in draw mode
        if (this.mode === 'draw') {
            this.drawCursor.show();
            this.updateDrawCursor();
            this.drawCanvas.focus();
        }
        else {
            this.viewport.focus();
        }
        this.updateStatusBar();
        this.screen?.render();
    }
    showColorPicker(isForeground) {
        if (!this.screen || this.modalOpen)
            return;
        this.drawCursor.hide();
        this.modalOpen = true;
        // 16 ANSI colors in order
        const colorCodes = [
            'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
            'gray', 'lightred', 'lightgreen', 'lightyellow', 'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
        ];
        let selectedFg = this.currentFg;
        let selectedBg = this.currentBg;
        let editingFg = isForeground; // Which row is active
        // Create overlay for dimming background
        const overlay = new overlay_1.Overlay({
            parent: this.screen,
            opacity: 0.5,
        });
        // Modal with both FG and BG rows
        // Layout: FG label + 2 rows, BG label + 2 rows
        const modal = new box_1.Box({
            parent: overlay,
            top: 'center',
            left: 'center',
            width: 22,
            height: 10,
            border: { type: 'line' },
            label: ' Colors ',
            tags: true,
            keys: true,
            mouse: true,
            ch: ' ',
            style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
        });
        // FG Label
        new text_1.Text({
            parent: modal,
            top: 0,
            left: 0,
            content: 'FG',
            style: { fg: editingFg ? 'cyan' : 'gray', bold: editingFg },
        });
        // BG Label
        new text_1.Text({
            parent: modal,
            top: 4,
            left: 0,
            content: 'BG',
            style: { fg: !editingFg ? 'cyan' : 'gray', bold: !editingFg },
        });
        // Create FG swatches (rows 0-1, offset by 3 for label)
        const fgSwatches = [];
        for (let i = 0; i < 16; i++) {
            const row = Math.floor(i / 8);
            const col = i % 8;
            const isSelected = i === selectedFg;
            const swatch = new box_1.Box({
                parent: modal,
                top: row + 1,
                left: col * 2 + 3,
                width: 2,
                height: 1,
                mouse: true,
                content: '  ',
                style: { bg: colorCodes[i], inverse: isSelected },
            });
            swatch.on('click', () => {
                selectedFg = i;
                editingFg = true;
                updateSelection();
            });
            fgSwatches.push(swatch);
        }
        // Create BG swatches (rows 4-5)
        const bgSwatches = [];
        for (let i = 0; i < 16; i++) {
            const row = Math.floor(i / 8);
            const col = i % 8;
            const isSelected = i === selectedBg;
            const swatch = new box_1.Box({
                parent: modal,
                top: row + 5,
                left: col * 2 + 3,
                width: 2,
                height: 1,
                mouse: true,
                content: '  ',
                style: { bg: colorCodes[i], inverse: isSelected },
            });
            swatch.on('click', () => {
                selectedBg = i;
                editingFg = false;
                updateSelection();
            });
            bgSwatches.push(swatch);
        }
        const fgLabel = modal.children[0];
        const bgLabel = modal.children[1];
        const updateSelection = () => {
            // Update FG swatches
            fgSwatches.forEach((s, i) => {
                s.style.inverse = (i === selectedFg);
            });
            // Update BG swatches
            bgSwatches.forEach((s, i) => {
                s.style.inverse = (i === selectedBg);
            });
            // Update labels to show which is active
            fgLabel.style.fg = editingFg ? 'cyan' : 'gray';
            bgLabel.style.fg = !editingFg ? 'cyan' : 'gray';
            this.screen?.render();
        };
        const trapCleanup = (0, modal_helpers_1.trapModalInput)(modal);
        const closeDialog = (save) => {
            trapCleanup();
            overlay.destroy();
            if (save) {
                this.currentFg = selectedFg;
                this.currentBg = selectedBg;
            }
            this.restoreFocusAfterDialog();
        };
        // Keyboard navigation
        const currentIdx = () => editingFg ? selectedFg : selectedBg;
        const setIdx = (idx) => {
            if (editingFg)
                selectedFg = idx;
            else
                selectedBg = idx;
        };
        modal.key(['left', 'h'], () => {
            setIdx(currentIdx() > 0 ? currentIdx() - 1 : 15);
            updateSelection();
        });
        modal.key(['right', 'l'], () => {
            setIdx(currentIdx() < 15 ? currentIdx() + 1 : 0);
            updateSelection();
        });
        modal.key(['up', 'k'], () => {
            const idx = currentIdx();
            if (editingFg && idx >= 8) {
                setIdx(idx - 8);
            }
            else if (editingFg && idx < 8) {
                // Move to BG row
                editingFg = false;
                selectedBg = idx + 8;
            }
            else if (!editingFg && idx >= 8) {
                setIdx(idx - 8);
            }
            else {
                // Move to FG row
                editingFg = true;
                selectedFg = idx + 8;
            }
            updateSelection();
        });
        modal.key(['down', 'j'], () => {
            const idx = currentIdx();
            if (editingFg && idx < 8) {
                setIdx(idx + 8);
            }
            else if (editingFg && idx >= 8) {
                // Move to BG row
                editingFg = false;
                selectedBg = idx - 8;
            }
            else if (!editingFg && idx < 8) {
                setIdx(idx + 8);
            }
            else {
                // Move to FG row
                editingFg = true;
                selectedFg = idx - 8;
            }
            updateSelection();
        });
        modal.key(['tab'], () => {
            editingFg = !editingFg;
            updateSelection();
        });
        modal.key(['enter', 'space'], () => closeDialog(true));
        modal.key(['escape', 'q'], () => closeDialog(false));
        overlay.on('cancel', () => closeDialog(false));
        overlay.show();
        modal.focus();
        this.screen.render();
    }
    showCharacterPicker() {
        if (!this.screen || this.modalOpen)
            return;
        this.drawCursor.hide();
        this.modalOpen = true;
        const charSets = [
            { label: 'Blocks', chars: ['█', '▓', '▒', '░', '▀', '▄', '▌', '▐'] },
            { label: 'Boxes', chars: ['■', '□', '▪', '▫', '◼', '◻', '▬', '▭'] },
            { label: 'Circles', chars: ['●', '○', '◉', '◎', '•', '◦', '◐', '◑'] },
            { label: 'Lines', chars: ['─', '│', '┌', '┐', '└', '┘', '├', '┤'] },
            { label: 'Symbols', chars: ['/', '\\', '|', '-', '+', '*', '#', '@'] },
            { label: 'Arrows', chars: ['←', '→', '↑', '↓', '↔', '↕', '◄', '►'] },
        ];
        const allChars = charSets.flatMap(s => s.chars);
        // Create overlay for dimming background
        const overlay = new overlay_1.Overlay({
            parent: this.screen,
            opacity: 0.5,
        });
        // Create modal box - fixed height with scrollable list
        const modal = new box_1.Box({
            parent: overlay,
            top: 'center',
            left: 'center',
            width: 30,
            height: 16, // Fixed height - list will scroll
            border: { type: 'line' },
            label: ' Character ',
            tags: true,
            keys: true,
            mouse: true,
            ch: ' ',
            style: { fg: 'white', bg: 'blue', border: { fg: 'magenta' } },
        });
        // Create list for character selection
        const items = allChars.map((char, idx) => {
            const set = charSets.find(s => s.chars.includes(char));
            return `${char}  ${set?.label || 'Other'}`;
        });
        const list = new list_1.List({
            parent: modal,
            top: 0,
            left: 0,
            width: '100%-2',
            height: '100%-2',
            items,
            mouse: true,
            keys: true,
            tags: true,
            scrollable: true,
            scrollbar: {
                ch: ' ',
                style: { bg: 'magenta' },
            },
            style: {
                fg: 'white',
                bg: 'blue',
                selected: { fg: 'black', bg: 'magenta' },
            },
        });
        const currentIdx = allChars.indexOf(this.currentChar);
        if (currentIdx >= 0)
            list.select(currentIdx);
        const trapCleanup = (0, modal_helpers_1.trapModalInput)(modal);
        const closeDialog = (selectedChar) => {
            trapCleanup();
            overlay.destroy();
            if (selectedChar) {
                this.currentChar = selectedChar;
            }
            this.restoreFocusAfterDialog();
        };
        list.on('select', (_item, idx) => closeDialog(allChars[idx]));
        list.key(['escape', 'q'], () => closeDialog());
        overlay.on('cancel', () => closeDialog());
        overlay.show();
        list.focus();
        this.screen.render();
    }
    showHelp() {
        if (!this.screen || this.modalOpen)
            return;
        // Hide the cursor overlay while dialog is shown
        this.drawCursor.hide();
        this.modalOpen = true;
        const helpText = `{cyan-fg}{bold}MOEBIUS-STYLE ANSI EDITOR{/bold}{/cyan-fg}

{yellow-fg}{bold}INTERFACE:{/bold}{/yellow-fg}
  Menu Bar       File/Edit/Layer/Select/Colors/View/Help
  F-Key Toolbar  F1-F12 character sets (< > to change set)
  Left Sidebar   Colors + Tools + Layers
  Status Bar     Position, colors, tool, layer, iCE mode

{yellow-fg}{bold}F-KEYS (Character Selection):{/bold}{/yellow-fg}
  F1-F12         Select character from current set
  Shift+F-key    Change to next character set
  < > buttons    Previous/next character set

{yellow-fg}{bold}COLOR SELECTION:{/bold}{/yellow-fg}
  Left Click     Select foreground color from palette
  Right Click    Select background color from palette
  Alt+C          Open foreground color picker
  Alt+B          Open background color picker

{yellow-fg}{bold}TOOLS (use sidebar or keyboard):{/bold}{/yellow-fg}
  T              Text mode (type characters)
  D              Draw tool (freehand)
  L              Line tool (click two points)
  R              Rectangle tool
  E              Ellipse tool
  F              Fill tool (flood fill)
  P              Pick tool (sample color/char)
  S              Select tool

{yellow-fg}{bold}LAYERS:{/bold}{/yellow-fg}
  Layer menu     Add, delete, merge, move layers
  Sidebar +/-    Add/delete layer
  Sidebar M      Merge down
  Left Click     Select layer
  Right Click    Toggle layer visibility
  * = visible    L = locked

{yellow-fg}{bold}NAVIGATION:{/bold}{/yellow-fg}
  Arrow Keys     Move cursor
  Enter          Move to next line
  Backspace      Erase and move left

{yellow-fg}{bold}DRAWING:{/bold}{/yellow-fg}
  Type any key   Place character (in text mode)
  Space          Draw with current tool
  Left Click     Draw at position
  Right Click    Erase at position
  Mouse Drag     Continuous draw/erase

{yellow-fg}{bold}EDITING:{/bold}{/yellow-fg}
  Ctrl+Z         Undo
  Ctrl+Y         Redo
  Ctrl+S         Save
  Ctrl+M         Toggle Text/Draw mode
  U              Undo (in draw mode)

{yellow-fg}{bold}FILE:{/bold}{/yellow-fg}
  SAUCE Info     Edit SAUCE metadata (title, author, group)
  iCE Colors     Toggle 16 BG colors (vs 8 + blink)

{yellow-fg}{bold}VIEW:{/bold}{/yellow-fg}
  F2             Toggle fullscreen (hide/show UI)
  ?              This help screen
  ESC            Exit editor

{yellow-fg}{bold}TIPS:{/bold}{/yellow-fg}
  - F-keys select from 8 character sets
  - Layers let you work on separate elements
  - SAUCE metadata is saved with the file
  - iCE colors enable 16 background colors
`;
        // Use DocModal widget for proper help display
        const helpModal = new doc_modal_1.DocModal({
            parent: this.screen,
            title: 'ANSI Editor Help',
            content: helpText,
            closeKeys: ['escape', 'q', '?', 'enter', 'space'],
            footerText: '{bold} Scroll: Arrows/PgUp/PgDn | Close: ESC/Q/?/Enter {/bold}',
            style: {
                fg: 'white',
                bg: 'blue',
                border: { fg: 'cyan' },
            },
            contentStyle: {
                fg: 'white',
                bg: 'blue', // Match modal background for transparent look
            },
            onClose: () => {
                helpModal.destroy();
                this.restoreFocusAfterDialog(); // This sets modalOpen = false
            },
        });
        // Display the modal, with focusOnClose pointing to the right widget
        const focusTarget = this.mode === 'draw' ? this.drawCanvas : this.viewport;
        helpModal.display(focusTarget);
    }
    saveUndoState() {
        this.undoStack.push(this.lines.join('\n'));
        if (this.undoStack.length > 100) {
            this.undoStack.shift();
        }
        this.redoStack = [];
    }
    undo() {
        if (this.undoStack.length > 1) {
            const current = this.undoStack.pop();
            this.redoStack.push(current);
            const previous = this.undoStack[this.undoStack.length - 1];
            this.lines = previous.split('\n');
            this.modified = true;
            this.updateDisplay();
        }
    }
    redo() {
        if (this.redoStack.length > 0) {
            const next = this.redoStack.pop();
            this.undoStack.push(next);
            this.lines = next.split('\n');
            this.modified = true;
            this.updateDisplay();
        }
    }
    /**
     * Get current content
     */
    getContent() {
        if (this.mode === 'draw') {
            // Use core library to convert canvas to ANSI
            if (this.cellCanvas) {
                return CoreCanvas.canvasToANSI(this.cellCanvas);
            }
            // Fallback to Canvas widget content
            return this.drawCanvas.getContent();
        }
        else {
            return this.lines.join('\n');
        }
    }
    /**
     * Get the core canvas (Cell[][]) for advanced operations
     */
    getCoreCanvas() {
        return this.cellCanvas;
    }
    /**
     * Set the core canvas directly
     */
    setCoreCanvas(canvas) {
        this.cellCanvas = canvas;
        this.syncCoreCanvasToDisplay();
        this.modified = true;
        this.updateDisplay();
    }
    /**
     * Check if content has been modified
     */
    isModified() {
        return this.modified;
    }
    /**
     * Set content - parses ANSI and updates both text lines and cell canvas
     */
    setContent(content) {
        this.lines = content.split('\n');
        this.cursor = { line: 0, col: 0 };
        // Clear and repopulate the cell canvas from ANSI content
        if (this.cellCanvas) {
            CoreCanvas.clearCanvas(this.cellCanvas);
            CoreCanvas.parseANSIToCanvas(this.cellCanvas, content);
            this.syncCoreCanvasToDisplay();
        }
        this.modified = false;
        this.saveUndoState();
        this.updateDisplay();
    }
}
exports.ANSIEditor = ANSIEditor;
/**
 * Helper function to create ANSIEditor
 */
function ansiEditor(options = {}) {
    return new ANSIEditor(options);
}
exports.ansiEditor = ansiEditor;
