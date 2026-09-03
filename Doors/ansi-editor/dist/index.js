"use strict";
/**
 * ANSI Editor Door - Professional ANSI/ASCII Art Editor
 *
 * Uses blessed ANSIEditor widget for full-featured editing
 * Files are stored in user's private storage (database-backed)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANSIEditorDoor = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const terminal_mode_1 = require("@amiexpress/bbs-door-sdk/utils/terminal-mode");
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
// File prefix for storage keys
const FILE_PREFIX = 'ansi:';
/**
 * Magnification steps, in characters per cell.
 *
 * EVEN above 1, the same rule the sprite studio uses and for the same
 * reason: half-block art puts two pixels in a cell vertically, so an odd
 * scale gives one of them more rows than the other.
 */
const ANSI_ZOOM_STEPS = [1, 2, 4, 6, 8];
function stepAnsiZoom(current, delta) {
    const i = ANSI_ZOOM_STEPS.indexOf(current);
    const from = i === -1 ? 0 : i;
    return ANSI_ZOOM_STEPS[Math.max(0, Math.min(ANSI_ZOOM_STEPS.length - 1, from + delta))];
}
// Sysop access level threshold
const SYSOP_ACCESS_LEVEL = 255;
// BBS screen directories that sysops can browse
const BBS_SCREEN_DIRS = [
    { path: 'Screens', label: 'Main Screens' },
    { path: 'Bulletins', label: 'Bulletins' },
    { path: 'Conf01/Screens', label: 'Conf 1 Screens' },
    { path: 'Conf01/Bulletins', label: 'Conf 1 Bulletins' },
    { path: 'Conf02/Screens', label: 'Conf 2 Screens' },
    { path: 'Conf03/Screens', label: 'Conf 3 Screens' },
];
// Exported for the regression tests; the door instance below stays the
// default export the BBS loads.
/**
 * The caller's colours. Every literal in this door was the token below it -
 * `{cyan-fg}` was the accent, `{gray-fg}` the dim - so classic renders as
 * before and other themes are followed instead of ignored.
 */
let T = (0, theme_1.themeById)('classic').tokens;
let S = (0, theme_1.themeStyles)((0, theme_1.themeById)('classic'));
/** The theme itself, for the chrome - it needs the rail and the glitches. */
let THEME = (0, theme_1.themeById)('classic');
class ANSIEditorDoor {
    constructor() {
        this.currentFilename = null;
        this.currentBBSPath = null; // For BBS files (sysop mode)
        this.isBBSFile = false; // True if editing a BBS file
        this.exitResolve = null;
        this.hasExited = false;
        /**
         * Backported from the sprite studio, which is this door's own fork.
         *
         * Everything the studio gained inside the WIDGET arrived here for free -
         * half-block magnification, canvas centring, the undo chunk fixed to
         * flush on release, the half-cell cursor. These two are door-side and had
         * to be carried across by hand.
         */
        this.terminalMode = null;
        this.zoom = 1;
        /**
         * The SDK chrome on the editor's own title row, and on whichever
         * requester is up. Two handles because they have different lifetimes:
         * the editor's goes down when the editor is rebuilt for a zoom step or a
         * resize, a requester's when the requester closes.
         */
        this.chrome = null;
        this.requesterChrome = null;
    }
    setContext(ctx) {
        this.ctx = ctx;
    }
    async start() {
        this.createUI();
        // Enable input handling
        this.inputManager.enable();
        // Go directly to editor (skip main menu)
        await this.openEditor('');
        // Wait for exit
        await new Promise((resolve) => {
            this.exitResolve = resolve;
            this.screen.once('destroy', resolve);
        });
    }
    // ============================================
    // STORAGE HELPERS
    // ============================================
    /**
     * List all ANSI files in user's storage
     */
    async listFiles() {
        const keys = await this.ctx.storage.keys();
        const ansiKeys = keys.filter(k => k.startsWith(FILE_PREFIX));
        const files = [];
        for (const key of ansiKeys) {
            const data = await this.ctx.storage.load(key);
            if (data) {
                files.push({
                    filename: key.slice(FILE_PREFIX.length),
                    size: data.content?.length || 0,
                    modified: data.modified || new Date().toISOString(),
                });
            }
        }
        return files.sort((a, b) => a.filename.localeCompare(b.filename));
    }
    /**
     * Load file content from storage
     */
    async loadFile(filename) {
        const key = FILE_PREFIX + filename;
        const data = await this.ctx.storage.load(key);
        return data?.content || null;
    }
    /**
     * Save file content to storage
     */
    async saveFile(filename, content) {
        const key = FILE_PREFIX + filename;
        await this.ctx.storage.save(key, {
            content,
            modified: new Date().toISOString(),
        });
    }
    /**
     * Delete file from storage
     */
    async deleteFile(filename) {
        const key = FILE_PREFIX + filename;
        await this.ctx.storage.delete(key);
    }
    // ============================================
    // SYSOP BBS FILE OPERATIONS
    // ============================================
    /**
     * Check if current user is a sysop
     */
    isSysop() {
        return (this.ctx.user?.accessLevel || 0) >= SYSOP_ACCESS_LEVEL;
    }
    /**
     * List BBS screen files in a directory
     */
    async listBBSFiles(directory) {
        if (!this.ctx.bbs)
            return [];
        try {
            const files = await this.ctx.bbs.listFiles(directory, '*.ans');
            const txtFiles = await this.ctx.bbs.listFiles(directory, '*.txt');
            const allFiles = [...files, ...txtFiles];
            return allFiles.map(filename => ({
                filename,
                path: `${directory}/${filename}`,
                size: 0, // Size not available from listFiles
            }));
        }
        catch (error) {
            console.error(`[ANSI-Editor] Error listing BBS files in ${directory}:`, error);
            return [];
        }
    }
    /**
     * Load BBS file content
     */
    async loadBBSFile(filepath) {
        if (!this.ctx.bbs)
            return null;
        try {
            const content = await this.ctx.bbs.readFile(filepath);
            return content;
        }
        catch (error) {
            console.error(`[ANSI-Editor] Error loading BBS file ${filepath}:`, error);
            return null;
        }
    }
    /**
     * Save BBS file content
     */
    async saveBBSFile(filepath, content) {
        if (!this.ctx.bbs)
            return false;
        try {
            const success = await this.ctx.bbs.writeFile(filepath, content);
            return success;
        }
        catch (error) {
            console.error(`[ANSI-Editor] Error saving BBS file ${filepath}:`, error);
            return false;
        }
    }
    /**
     * Show BBS screen file browser (sysop only)
     */
    async showBBSFileBrowser() {
        if (!this.isSysop()) {
            this.showMessage('Access Denied', 'Only sysops can browse BBS files.', 'red');
            return;
        }
        this.editor.hide();
        // First, show directory selection
        const dirItems = BBS_SCREEN_DIRS.map((d, idx) => `${(idx + 1).toString().padStart(2)}. ${d.label.padEnd(25)} (${d.path})`);
        const dirList = new blessed_1.List({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: '70%',
            height: '60%',
            fixed: true, // Static modal dialog
            border: { type: 'line', fg: T.warn },
            label: ' {bold}BBS Screen Directories{/bold} ',
            tags: true,
            keys: true,
            mouse: true,
            vi: true,
            style: {
                selected: { bg: T.warn, fg: T.selectionInk, bold: true },
                item: { fg: T.ink },
                border: { fg: T.warn },
            },
            items: dirItems,
        });
        const hintRow = new blessed_1.Text({
            parent: dirList,
            bottom: 0,
            left: 2,
            content: '',
            tags: true,
        });
        this.attachRequesterChrome('BBS SCREEN DIRECTORIES', dirList, hintRow, [{ key: 'Enter', does: 'Browse' }, { key: 'ESC', does: 'Cancel' }], [{ key: 'Ent', does: 'Browse' }, { key: 'ESC', does: 'Back' }]);
        const closeDialog = () => {
            this.closeRequesterChrome();
            dirList.destroy();
            this.editor.show();
            this.editor.focus();
            this.screen.render();
        };
        dirList.key(['escape', 'q'], closeDialog);
        dirList.key(['enter'], () => {
            const index = dirList.selected;
            if (index >= 0 && index < BBS_SCREEN_DIRS.length) {
                const dir = BBS_SCREEN_DIRS[index];
                this.closeRequesterChrome();
                dirList.destroy();
                this.showBBSDirectoryBrowser(dir.path, dir.label).catch(console.error);
            }
        });
        dirList.focus();
        this.screen.render();
    }
    /**
     * Rebuild the editor at the current size and zoom, keeping the artwork.
     *
     * The widget takes its geometry and its scale at construction, so both a
     * resize and a zoom mean building it again. getContent() round-trips the
     * document through ANSI text, which is lossless for a .ans - this door has
     * no transparency to lose, unlike the sprite studio.
     */
    async reopenEditorPreservingContent() {
        if (!this.editor)
            return;
        const content = this.editor.getContent();
        await this.openEditor(content);
    }
    /**
     * Show files in a specific BBS directory
     */
    async showBBSDirectoryBrowser(directory, label) {
        const files = await this.listBBSFiles(directory);
        if (files.length === 0) {
            this.showMessage('No Files', `No .ans or .txt files found in ${directory}`, 'yellow');
            this.editor.show();
            this.editor.focus();
            this.screen.render();
            return;
        }
        const fileList = new blessed_1.List({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: '80%',
            height: '80%',
            fixed: true, // Static modal dialog
            border: { type: 'line', fg: T.warn },
            label: ` {bold}${label}{/bold} `,
            tags: true,
            keys: true,
            mouse: true,
            vi: true,
            style: {
                selected: { bg: T.warn, fg: T.selectionInk, bold: true },
                item: { fg: T.ink },
                border: { fg: T.warn },
            },
            items: files.map((f, idx) => `${(idx + 1).toString().padStart(3)}. ${f.filename}`),
        });
        const hintRow = new blessed_1.Text({
            parent: fileList,
            bottom: 0,
            left: 2,
            content: '',
            tags: true,
        });
        this.attachRequesterChrome(label.toUpperCase(), fileList, hintRow, [{ key: 'Enter', does: 'Open' }, { key: 'B', does: 'Back' }, { key: 'ESC', does: 'Cancel' }], [{ key: 'Ent', does: 'Open' }, { key: 'B', does: 'Back' }, { key: 'ESC', does: 'Bye' }]);
        const closeDialog = () => {
            this.closeRequesterChrome();
            fileList.destroy();
            this.editor.show();
            this.editor.focus();
            this.screen.render();
        };
        fileList.key(['escape', 'q'], closeDialog);
        fileList.key(['b', 'B'], () => {
            this.closeRequesterChrome();
            fileList.destroy();
            this.showBBSFileBrowser();
        });
        fileList.key(['enter'], () => {
            const index = fileList.selected;
            if (index >= 0 && index < files.length) {
                const file = files[index];
                this.closeRequesterChrome();
                fileList.destroy();
                // Load and open the BBS file
                this.loadBBSFile(file.path).then(content => {
                    if (content !== null) {
                        this.currentFilename = file.filename;
                        this.currentBBSPath = file.path;
                        this.isBBSFile = true;
                        this.openEditor(content).catch(console.error);
                    }
                    else {
                        this.showMessage('Error', `Failed to load ${file.filename}`, 'red');
                        this.editor.show();
                        this.editor.focus();
                        this.screen.render();
                    }
                }).catch(console.error);
            }
        });
        fileList.focus();
        this.screen.render();
    }
    // ============================================
    // UI CREATION
    // ============================================
    createUI() {
        // Create screen using helper (sets up proper input/output)
        const host = this.ctx.bbs;
        if (typeof host?.getTheme === 'function') {
            const theme = host.getTheme();
            T = theme.tokens;
            S = (0, theme_1.themeStyles)(theme);
            THEME = theme;
        }
        this.screen = (0, blessed_helpers_1.createScreen)(this.ctx.bbs, {
            dockBorders: false, // Not needed for fixed panels
            title: 'ANSI Art Editor',
            responsive: true,
        });
        this.screen.program.write('\x1b[2J');
        this.screen.program.write('\x1b[H');
        this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
        this.screen.alloc();
        // CRITICAL: enableGrabKeys MUST be false for blessed widgets!
        this.inputManager = new blessed_helpers_1.DoorInputManager(this.ctx, this.screen, {
            enableGameMode: false,
            enableGrabKeys: false,
            enableMouse: true,
            debug: false,
            debugName: 'ANSI-EDITOR'
        });
        // The 80x25 / responsive switch, created HERE because the editor's own
        // menu asks for it the moment the door opens. It used to be created
        // inside the sysop's BBS-files browser, so a door that never opened
        // that dialog reached `this.terminalMode!.menuItem()` with null and
        // threw on start - the door did not open at all. A source-pinning test
        // ("the file mentions createTerminalModeSwitch") passed throughout.
        this.terminalMode = (0, terminal_mode_1.createTerminalModeSwitch)({
            bbs: this.ctx.bbs,
            screen: this.screen,
            // FIXED, like every other door here: "ansi-edit opens in fullscreen in
            // bbs mode thats wrong" (2026-09-02). A door opens at the size the
            // board serves and the caller asks for the rest with Alt+Enter - the
            // SDK's default is 'wide' and taking it was the mistake.
            start: 'fixed',
            onRelayout: () => { void this.reopenEditorPreservingContent(); },
        });
        this.screen.render();
    }
    /**
     * attachDoorChrome, with the three things every call in this door shares.
     *
     * The width is the LIVE screen width and never the constant 80: the SDK
     * gates every moving part on it, which is how a 40-column caller gets a
     * still screen without this door owning a rule about it.
     */
    chromeFor(options) {
        return (0, theme_1.attachDoorChrome)(THEME, {
            ...options,
            width: this.screen.width,
            styles: S,
            render: () => this.screen.render(),
        });
    }
    /**
     * The chrome a requester gets: the SDK's hint line on the row the dialog
     * already had, and the theme's glitches on its list.
     *
     * These hint rows were hand-written strings - `Enter: Open | D: Delete`
     * and friends - which is the thing footerHints exists to stop, and the
     * LIST is the only text on this screen that may be damaged for effect.
     * Nothing moves a cell: the same Text, in the same corner of the same
     * dialog, saying the same three things.
     *
     * No masthead on a requester: its title is already its border label, and
     * a second rail sliding over the editor's would be two bars competing
     * for one screen.
     */
    attachRequesterChrome(title, list, hintRow, hints, compactHints) {
        this.closeRequesterChrome();
        this.requesterChrome = this.chromeFor({
            title,
            footer: hintRow,
            hints,
            compactHints,
            glitch: list,
            glitchOptions: { tickMs: 400 },
        });
    }
    /** Stop it before the dialog it draws on is destroyed - stop() restores. */
    closeRequesterChrome() {
        this.requesterChrome?.stop();
        this.requesterChrome = null;
    }
    // ============================================
    // FILE OPERATIONS
    // ============================================
    /**
     * Show file browser dialog
     */
    async showFileBrowser() {
        const files = await this.listFiles();
        if (files.length === 0) {
            this.showMessage('No Files', 'No saved files found.\nCreate a new file first.', 'yellow');
            return;
        }
        this.editor.hide();
        // Create file selection dialog
        const fileList = new blessed_1.List({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: '80%',
            height: '80%',
            fixed: true, // Static modal dialog
            border: { type: 'line', fg: T.accent },
            label: ' {bold}Your ANSI Files{/bold} ',
            tags: true,
            keys: true,
            mouse: true,
            vi: true,
            style: {
                selected: { bg: T.bar, fg: T.ink, bold: true },
                item: { fg: T.ink },
                border: { fg: T.accent },
            },
            items: files.map((f, idx) => {
                const sizeStr = this.formatFileSize(f.size);
                const dateStr = new Date(f.modified).toLocaleDateString();
                return `${(idx + 1).toString().padStart(3)}. ${f.filename.padEnd(30)} ${sizeStr.padStart(8)} ${dateStr}`;
            }),
        });
        // Instructions, written by the SDK: the key caps take the accent and
        // the words stay dim, which is the same hint line every other door has.
        const hintRow = new blessed_1.Text({
            parent: fileList,
            bottom: 0,
            left: 2,
            content: '',
            tags: true,
        });
        this.attachRequesterChrome('YOUR ANSI FILES', fileList, hintRow, [{ key: 'Enter', does: 'Open' }, { key: 'D', does: 'Delete' }, { key: 'ESC', does: 'Cancel' }], [{ key: 'Ent', does: 'Open' }, { key: 'D', does: 'Del' }, { key: 'ESC', does: 'Bye' }]);
        const closeDialog = () => {
            this.closeRequesterChrome();
            fileList.destroy();
            this.editor.show();
            this.editor.focus();
            this.screen.render();
        };
        fileList.key(['escape', 'q'], closeDialog);
        fileList.key(['enter'], () => {
            const index = fileList.selected;
            if (index >= 0 && index < files.length) {
                const file = files[index];
                this.closeRequesterChrome();
                fileList.destroy();
                // Reset BBS mode - this is a user file
                this.isBBSFile = false;
                this.currentBBSPath = null;
                this.currentFilename = file.filename;
                this.loadFile(file.filename).then(content => {
                    this.openEditor(content || '').catch(console.error);
                }).catch(console.error);
            }
        });
        fileList.key(['d', 'D'], () => {
            const index = fileList.selected;
            if (index >= 0 && index < files.length) {
                const file = files[index];
                // Confirm deletion
                this.confirmDialog('Delete File', `Delete "${file.filename}"?\n\nThis cannot be undone.`).then(confirmed => {
                    if (confirmed) {
                        this.deleteFile(file.filename).then(() => {
                            closeDialog();
                            // Reopen browser to refresh list
                            this.showFileBrowser().catch(console.error);
                        }).catch(console.error);
                    }
                }).catch(console.error);
            }
        });
        fileList.focus();
        this.screen.render();
    }
    /**
     * Show save-as dialog (prompts for filename)
     */
    async showSaveAsDialog() {
        const filename = await this.promptFilename('Save As');
        if (filename) {
            // Get current content from editor
            const content = this.editor.getContent();
            // Add .ans extension if not present
            const finalName = filename.endsWith('.ans') ? filename : `${filename}.ans`;
            await this.saveFile(finalName, content);
            this.currentFilename = finalName;
            this.showMessage('Saved', `File saved: ${finalName}`, 'green');
        }
    }
    /**
     * Show open dialog (from editor menu)
     */
    async showOpenDialog() {
        // No hide here: showFileBrowser hides the editor itself, and only
        // AFTER it knows there are files to show. Hiding first meant the
        // no-files path - message dialog, early return - left the editor
        // hidden with nothing to restore it: reported live 2026-08-31 as
        // "a dialog said that and then i got a black screen". The widget
        // that hides the editor owns showing it again; nobody hides it on
        // that widget's behalf.
        await this.showFileBrowser();
    }
    // ============================================
    // EDITOR
    // ============================================
    async openEditor(initialContent) {
        // The masthead is drawn on the editor's title row, so it has to be
        // stopped while that row still exists - stop() leaves the bar at rest
        // rather than mid-slide, and a timer outliving its widget is how a
        // door takes the session with it.
        this.chrome?.stop();
        this.chrome = null;
        // Destroy existing editor if any
        if (this.editor) {
            this.editor.destroy();
        }
        // Build title based on file type
        let editorTitle = 'New File';
        if (this.isBBSFile && this.currentBBSPath) {
            editorTitle = `[BBS] ${this.currentBBSPath}`;
        }
        else if (this.currentFilename) {
            editorTitle = `Editing: ${this.currentFilename}`;
        }
        this.editor = new blessed_1.ANSIEditor({
            parent: this.screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            title: editorTitle,
            initialContent,
            initialMode: 'draw',
            showLineNumbers: false,
            showMenuBar: true,
            showToolbar: true,
            showSidebar: true,
            showStatusBar: true,
            cellScaleX: this.zoom,
            cellScaleY: this.zoom,
            extraMenus: [
                {
                    label: 'Zoom',
                    items: ANSI_ZOOM_STEPS.map(z => ({
                        label: z === 1 ? '1:1  (actual size)' : `${z}:1`,
                        action: () => { void this.setZoom(z); },
                    })).concat([
                        { label: '────────────────', separator: true },
                        this.terminalMode.menuItem(),
                    ]),
                },
            ],
            // Save callback (quick save to current file)
            // View > Theme changes the editor's colours without closing it. T and
            // S are this door's own captured tokens; the widget re-points them
            // through this callback as the panel previews.
            themeHost: this.ctx.bbs,
            onThemeChange: (theme) => {
                T = theme.tokens;
                S = (0, theme_1.themeStyles)(theme);
            },
            onSave: async (content) => {
                // Handle BBS file saving (sysop mode)
                if (this.isBBSFile && this.currentBBSPath) {
                    const success = await this.saveBBSFile(this.currentBBSPath, content);
                    if (success) {
                        this.showMessage('Saved', `BBS file saved: ${this.currentBBSPath}`, 'green');
                        return true;
                    }
                    else {
                        this.showMessage('Error', `Failed to save BBS file: ${this.currentBBSPath}`, 'red');
                        return false;
                    }
                }
                // Handle user file saving
                if (!this.currentFilename) {
                    // No filename yet, prompt for one
                    const filename = await this.promptFilename('Save');
                    if (!filename)
                        return false;
                    this.currentFilename = filename.endsWith('.ans') ? filename : `${filename}.ans`;
                }
                await this.saveFile(this.currentFilename, content);
                this.showMessage('Saved', `File saved: ${this.currentFilename}`, 'green');
                return true;
            },
            // Save As callback (always prompts for filename, saves to user storage)
            onSaveAs: async () => {
                // Reset BBS mode - Save As always saves to user storage
                this.isBBSFile = false;
                this.currentBBSPath = null;
                await this.showSaveAsDialog();
            },
            // Open callback (shows user file browser)
            onOpen: async () => {
                await this.showOpenDialog();
            },
            // Open BBS files callback (sysop only)
            onOpenBBS: this.isSysop() ? async () => {
                await this.showBBSFileBrowser();
            } : undefined,
            // Exit callback - exit the door entirely
            onExit: () => {
                this.cleanup();
            },
        });
        // The wheel steps the zoom ladder, as it does in the sprite studio: the
        // widget reports the turn, the door owns the ladder.
        this.editor.on('canvas-wheel', (d) => {
            void this.setZoom(stepAnsiZoom(this.zoom, d.direction === 'up' ? 1 : -1));
        });
        this.editor.focus();
        this.screen.render();
        // The whole chrome, from the ONE SDK call.
        //
        // The masthead has exactly one row it can have on this screen, and it
        // is the editor's own title line. Inside the frame the widget owns row
        // 0 with its menu bar and row 1 with the F-key toolbar (sdk/engines/ui/
        // blessed/widgets/ansi-editor.ts:665-674) and the bottom row with a
        // live status line (:768-778); everything between them is the canvas.
        // A masthead of its own would therefore have to come out of the
        // artwork, which is the one thing this door exists to show - so it
        // goes on the frame instead, where the door already owns the text.
        //
        // No footer here: that status line is live state - cursor position,
        // the current colours, the current tool. No glitch either: the only
        // other thing on this screen is somebody's picture, and damaging that
        // on purpose is data loss dressed as atmosphere.
        const editor = this.editor;
        this.chrome = this.chromeFor({
            title: editorTitle,
            masthead: { setContent: (text) => editor.setLabel(text) },
            // A border label is printed between the corners with a space either
            // side of it (sdk/engines/ui/blessed/core/screen.ts:1512-1533), so
            // five of the row's columns are spoken for before the first slash.
            mastheadWidth: Math.max(1, this.screen.width - 5),
        });
    }
    async setZoom(zoom) {
        if (zoom === this.zoom)
            return;
        this.zoom = zoom;
        await this.reopenEditorPreservingContent();
    }
    // ============================================
    // DIALOGS
    // ============================================
    async promptFilename(title) {
        return new Promise((resolve) => {
            const dialog = new blessed_1.Box({
                parent: this.screen,
                top: 'center',
                left: 'center',
                width: 50,
                height: 9,
                fixed: true, // Static modal dialog
                border: { type: 'line', fg: T.warn },
                label: ` {bold}${title}{/bold} `,
                tags: true,
                style: {
                    fg: T.ink,
                    bg: T.bar,
                    border: { fg: T.warn }
                },
            });
            new blessed_1.Text({
                parent: dialog,
                top: 1,
                left: 2,
                content: 'Enter filename (without .ans extension):',
                tags: true,
            });
            const input = new blessed_1.Textbox({
                parent: dialog,
                top: 3,
                left: 2,
                width: 44,
                height: 1,
                style: {
                    fg: T.ink,
                    bg: T.ground,
                    focus: { bg: T.ground, fg: T.ink },
                },
                inputOnFocus: true,
                keys: true,
                mouse: true,
            });
            // The hint line, from the SDK rather than from a string written here.
            // A local handle, not the door's: this prompt can open on top of a
            // requester, and taking that requester's chrome down with this one
            // would leave the list behind it unglitched for the rest of its life.
            const hintRow = new blessed_1.Text({
                parent: dialog,
                top: 5,
                left: 2,
                content: '',
                tags: true,
            });
            const chrome = this.chromeFor({
                title,
                footer: hintRow,
                hints: [{ key: 'Enter', does: 'Save' }, { key: 'Escape', does: 'Cancel' }],
                compactHints: [{ key: 'Ent', does: 'Save' }, { key: 'ESC', does: 'Cancel' }],
            });
            const closeDialog = (result) => {
                chrome.stop();
                dialog.destroy();
                this.screen.render();
                resolve(result);
            };
            input.on('submit', (value) => {
                closeDialog(value && value.trim() ? value.trim() : null);
            });
            input.key(['escape'], () => {
                closeDialog(null);
            });
            input.focus();
            this.screen.render();
        });
    }
    async confirmDialog(title, message) {
        return new Promise((resolve) => {
            const dialog = new blessed_1.Box({
                parent: this.screen,
                top: 'center',
                left: 'center',
                width: 50,
                height: 10,
                fixed: true, // Static modal dialog
                border: { type: 'line', fg: T.alert },
                label: ` {bold}${title}{/bold} `,
                tags: true,
                style: {
                    fg: T.ink,
                    bg: T.bar,
                    border: { fg: T.alert }
                },
            });
            new blessed_1.Text({
                parent: dialog,
                top: 1,
                left: 2,
                content: message,
                tags: true,
            });
            const hintRow = new blessed_1.Text({
                parent: dialog,
                top: 6,
                left: 2,
                content: '',
                tags: true,
            });
            const chrome = this.chromeFor({
                title,
                footer: hintRow,
                hints: [
                    { key: 'Y', does: 'Yes' },
                    { key: 'N', does: 'No' },
                    { key: 'ESC', does: 'No' },
                ],
            });
            const closeDialog = (result) => {
                chrome.stop();
                dialog.destroy();
                this.screen.render();
                resolve(result);
            };
            dialog.key(['y', 'Y'], () => closeDialog(true));
            dialog.key(['n', 'N', 'escape'], () => closeDialog(false));
            dialog.focus();
            this.screen.render();
        });
    }
    showMessage(title, message, color) {
        const msgBox = new blessed_1.Box({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 60,
            height: 7,
            fixed: true, // Static modal dialog
            border: { type: 'line', fg: color },
            label: ` {bold}${title}{/bold} `,
            tags: true,
            keys: true,
            focusable: true,
            padding: { left: 2, right: 2, top: 1, bottom: 1 },
            style: {
                fg: T.ink,
                bg: T.bar,
                border: { fg: color }
            },
        });
        new blessed_1.Text({
            parent: msgBox,
            top: 0,
            left: 0,
            content: message + `\n\n{${T.dim}-fg}Press any key...{/${T.dim}-fg}`,
            tags: true,
            style: { bg: T.bar, fg: T.ink },
        });
        let closed = false;
        const close = () => {
            if (closed)
                return;
            closed = true;
            this.screen.off('click', outsideClickHandler);
            msgBox.destroy();
            this.screen.render();
        };
        // Click outside to close
        const outsideClickHandler = (data) => {
            const pos = msgBox._getCoords();
            if (!pos)
                return;
            const outside = data.x < pos.xi || data.x > pos.xl || data.y < pos.yi || data.y > pos.yl;
            if (outside) {
                close();
            }
        };
        this.screen.on('click', outsideClickHandler);
        msgBox.on('keypress', close);
        msgBox.key(['enter', 'escape', 'space'], close);
        msgBox.focus();
        this.screen.render();
    }
    showHelp() {
        const helpText = `{${T.accent}-fg}{bold}Main Menu:{/bold}{/${T.accent}-fg}

  N              New file - create blank canvas
  O              Open file - load from your files
  H              Help - show this help
  Q / ESC        Quit - exit editor


{${T.warn}-fg}{bold}Moebius-Style Interface:{/bold}{/${T.warn}-fg}

  Menu Bar       File/Edit/Layer/Select/Colors/View/Help
  F-Key Toolbar  F1-F12 character sets
  Left Sidebar   Color palette + Tool buttons
  Status Bar     Position, colors, current tool


{${T.accent}-fg}{bold}Your Files:{/bold}{/${T.accent}-fg}

  Files are stored in your personal storage.
  Each user has their own private file space.
  Files are preserved between sessions.


{${T.accent}-fg}{bold}Quick Keys in Editor:{/bold}{/${T.accent}-fg}

  Ctrl+S         Save file
  Ctrl+Z         Undo
  Ctrl+Y         Redo
  F2             Toggle fullscreen
  ?              Show help
  ESC            Exit to menu
`;
        const helpModal = new blessed_1.DocModal({
            parent: this.screen,
            title: 'ANSI Editor Help',
            content: helpText,
            closeKeys: ['escape', 'q', '?', 'enter', 'space'],
            footerText: '{bold} Scroll: Arrows/PgUp/PgDn | Close: ESC/Q/?/Enter {/bold}',
            style: {
                fg: T.ink,
                bg: T.bar,
                border: { fg: T.accent },
            },
            onClose: () => {
                helpModal.destroy();
                this.editor?.focus();
                this.screen.render();
            },
        });
        helpModal.display(this.screen);
    }
    // ============================================
    // UTILITIES
    // ============================================
    formatFileSize(bytes) {
        if (bytes < 1024)
            return `${bytes}B`;
        if (bytes < 1024 * 1024)
            return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
    cleanup() {
        if (this.hasExited)
            return;
        this.hasExited = true;
        // Every chrome timer goes first: one still writing to a destroyed
        // screen is how a door takes the session with it, and stop() also puts
        // back any row a glitch was in the middle of damaging.
        this.chrome?.stop();
        this.chrome = null;
        this.closeRequesterChrome();
        // Gives the board its 80 columns back and unhooks resize and Alt+Enter.
        this.terminalMode?.dispose();
        this.terminalMode = null;
        if (this.inputManager) {
            this.inputManager.disable();
        }
        if (this.screen && !this.screen.destroyed) {
            this.screen.destroy();
        }
        if (this.exitResolve) {
            this.exitResolve();
        }
        this.ctx.close();
    }
}
exports.ANSIEditorDoor = ANSIEditorDoor;
const door = new bbs_door_sdk_1.CoreDoor({
    name: 'ANSI Editor',
    version: '2.0.0',
    description: 'Professional ANSI Art Editor with user file storage',
    author: 'AmiExpress SDK v2.0',
});
door.onStart(async (ctx) => {
    const app = new ANSIEditorDoor();
    app.setContext(ctx);
    await app.start();
});
door.onClose(async (ctx) => {
    // Cleanup handled by ANSIEditorDoor
});
door.onError(async (ctx, error) => {
    ctx.output.writeLine(`\r\n\x1b[31mError in ANSI Editor: ${error.message}\x1b[0m\r\n`);
});
exports.default = door;
