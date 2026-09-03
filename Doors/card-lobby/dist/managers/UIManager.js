"use strict";
/**
 * Card Lobby - UI Manager
 * Handles all UI building, layout, and rendering operations
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
exports.UIManager = void 0;
const blessed_1 = __importStar(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const constants_1 = require("../lib/constants");
const utils_1 = require("../lib/utils");
const card_style_1 = require("../lib/card-style");
const cardEngine = new bbs_door_sdk_1.CardEngine();
/** The headline beside the rail. Full words: this is a label, not a code. */
const MASTHEAD_TITLE = 'CARD LOBBY';
class UIManager {
    constructor(screen, desktop, nodeId = 1) {
        /** Whether this session's terminal can draw unicode card faces. */
        this.unicodeCapable = false;
        /** Lines above the log (UNO context) and the door's own lines below it. */
        this.activityHeader = [];
        this.activityBody = [];
        this.dealAnimationInProgress = false;
        this.menuButtons = [];
        this.menus = [];
        /** The column after the last menu button; where the masthead run starts. */
        this.mastheadLeft = 1;
        /** Columns the masthead run may use, from the LIVE screen width. */
        this.mastheadRun = 0;
        /** The SDK's chrome: the animated rail and the theme's glitches. */
        this.chrome = null;
        this.screen = screen;
        this.desktop = desktop;
        this.nodeId = nodeId;
    }
    getDealAnimationInProgress() {
        return this.dealAnimationInProgress;
    }
    buildTopBar(callbacks) {
        const { focusLobby, focusTable, showProfileWindow, showLeaderboardWindow, showAchievementsWindow, showBulletinsWindow, showCardStyleWindow, showThemeWindow, saySomething, exitDoor, runAction } = callbacks;
        this.topBar = (0, blessed_helpers_1.createBox)({
            // Panel adds a line border unless the key is present; these are
            // bars and content areas, and the window around them carries the frame.
            border: undefined,
            parent: this.desktop,
            top: 0,
            left: 0,
            width: '100%',
            height: 1,
            fixed: true,
            hidden: false,
            focusable: false,
            mouse: false,
            clickable: false,
            tags: true,
            style: { fg: constants_1.UI_THEME.topBar.fg, bg: constants_1.UI_THEME.topBar.bg },
            // The theme's mark used to be printed here, right-aligned and still.
            // It is drawn by the masthead below now; layoutMasthead() puts it back
            // on this row when the screen is too narrow for one.
            content: '',
        });
        this.topInfoBar = (0, blessed_helpers_1.createBox)({
            // Panel adds a line border unless the key is present; these are
            // bars and content areas, and the window around them carries the frame.
            border: undefined,
            parent: this.desktop,
            top: 0,
            left: 0,
            width: '100%',
            height: 1,
            tags: true,
            hidden: true,
            focusable: false,
            mouse: false,
            clickable: false,
            style: { fg: constants_1.UI_THEME.topBar.fg, bg: constants_1.UI_THEME.topBar.bg },
            content: ' Card Lobby v2.0.2-SDK ',
        });
        // Two menus that held one entry each are folded into Views: a menu bar
        // is for choosing what to look at, and "Lobby > Focus Lobby" said the
        // same word twice to say it (2026-09-02).
        const menuDefs = [
            {
                label: 'Views',
                items: [
                    { label: 'Lobby', action: () => runAction(focusLobby) },
                    { label: 'Table', action: () => runAction(focusTable) },
                    { label: 'Profile', action: () => runAction(showProfileWindow) },
                    { label: 'Leaders', action: () => runAction(showLeaderboardWindow) },
                    { label: 'Achievements', action: () => runAction(showAchievementsWindow) },
                    { label: 'Bulletins', action: () => runAction(showBulletinsWindow) },
                    { label: 'Say Something (T)', action: () => runAction(saySomething) },
                    { label: 'Card Style', action: () => runAction(showCardStyleWindow) },
                    { label: 'Theme', action: () => runAction(showThemeWindow) },
                ],
            },
            {
                label: 'System',
                items: [
                    { label: 'Quit', action: () => runAction(exitDoor) },
                ],
            },
        ];
        this.menuButtons = [];
        this.menus = [];
        menuDefs.forEach((menu) => {
            this.menus.push(new blessed_1.DropdownMenu({ parent: this.screen, label: menu.label, items: menu.items }));
        });
        const openMenu = (index) => {
            this.menus.forEach((menu, i) => {
                if (i !== index)
                    menu.close();
            });
            this.menus[index].openFor(this.menuButtons[index]);
        };
        let left = 1;
        menuDefs.forEach((menu, index) => {
            const button = (0, blessed_helpers_1.createBox)({
                // Panel adds a line border unless the key is present; these are
                // bars and content areas, and the window around them carries the frame.
                border: undefined,
                parent: this.topBar,
                top: 0,
                left,
                width: menu.label.length + 2,
                height: 1,
                content: `{bold}${menu.label}{/bold}`,
                style: { fg: constants_1.UI_THEME.topBar.fg, bg: constants_1.UI_THEME.topBar.bg, focus: { fg: constants_1.UI_THEME.highlightInk, bg: constants_1.UI_THEME.accent } },
                mouse: true,
                keys: true,
                clickable: true,
                fixed: true,
            });
            button.on('click', () => openMenu(index));
            button.key(['enter', 'space', 'down'], () => openMenu(index));
            this.menus[index].on('tab-next', () => openMenu((index + 1) % this.menus.length));
            this.menus[index].on('tab-prev', () => openMenu((index - 1 + this.menus.length) % this.menus.length));
            this.menuButtons.push(button);
            left += menu.label.length + 3;
        });
        // The masthead goes in the TOP BAR, because this door has no spare row:
        // row 0 is the menu bar and every row under it is a window or a panel.
        // It takes the run the menus leave, from the column after the last menu
        // button to the right edge. Drawing it into the bar's own content
        // instead would put an animated slash in each one-column gap BETWEEN
        // the menu labels, which reads as damage rather than as branding.
        this.mastheadLeft = left;
        this.mastheadRow = (0, blessed_helpers_1.createBox)({
            border: undefined,
            parent: this.topBar,
            top: 0,
            left,
            width: `100%-${left}`,
            height: 1,
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
            tags: true,
            style: { fg: constants_1.UI_THEME.topBar.fg, bg: constants_1.UI_THEME.topBar.bg },
            content: '',
        });
        this.layoutMasthead();
    }
    /**
     * Size the masthead run to the LIVE screen, and say whether one fits.
     *
     * What is left after the menus is what there is: on a 40-column C64 they
     * leave six columns, which is not a masthead but a clipped word. There the
     * bar keeps the still mark it drew before there was a masthead at all.
     */
    layoutMasthead() {
        const width = this.screen.width || 80;
        const room = width - this.mastheadLeft;
        // The title, plus enough rail beside it to read as a rail.
        const fits = room >= MASTHEAD_TITLE.length + 6;
        this.mastheadRow.width = `100%-${this.mastheadLeft}`;
        if (fits)
            this.mastheadRow.show();
        else
            this.mastheadRow.hide();
        // One short of the run's last cell: writing a row's final cell leaves
        // the terminal in a pending-wrap state and the last glyph is clipped.
        this.mastheadRun = Math.max(1, room - 1);
        // `{|}` is blessed's right-align; the dropdown menus draw over the left
        // end, which is why the mark sat at the other one.
        this.topBar.setContent(!fits && constants_1.UI_THEME.rail ? `{|}${constants_1.UI_THEME.rail} ` : '');
        return fits;
    }
    /**
     * The whole chrome, from the ONE SDK call: the slash rail that draws
     * itself in and then slides, and the theme's glitches.
     *
     * CARD LOBBY had the theme's COLOURS and none of its chrome - the sysop's
     * "only colors makes no great theme". Every moving part here is the SDK's;
     * a door that hand-rolled a rail timer would be the seventh copy of one.
     *
     * No `footer` is passed. The bottom row is the SDK StatusBar and it
     * carries live state - who you are, your chips, where you are, the last
     * notice - so there is no free row for a hint line, and the door's key
     * hints already sit in the lobby window's own two bars.
     *
     * Re-callable: a resize changes what the menus leave, and a rail sized for
     * 80 columns would strand the title mid-screen in a wide terminal.
     */
    attachChrome(options = {}) {
        this.stopChrome();
        const theme = (0, constants_1.activeTheme)();
        const fits = this.layoutMasthead();
        this.chrome = (0, theme_1.attachDoorChrome)(theme, {
            // The LIVE width, never 80: every moving part is gated on it, and the
            // 40-column tier turns them all off through this one number.
            width: this.screen.width || 80,
            title: MASTHEAD_TITLE,
            masthead: fits ? this.mastheadRow : undefined,
            // The masthead sits inside the top bar to the right of the menus, so
            // its run is nothing like the screen's width.
            mastheadWidth: this.mastheadRun,
            // The bar draws itself in when the door OPENS. On a resize it is
            // already there, and replaying the draw-in makes the rail appear to
            // stutter every time somebody widens the terminal - which reads as
            // the resize having broken something.
            entryFrames: options.entry === false ? 0 : undefined,
            // Asked at every tick, because this door swaps what is on screen.
            glitch: () => this.glitchPane(),
            glitchOptions: { tickMs: 400 },
            render: () => this.screen.render(),
            seed: this.nodeId * 7 + 3,
        });
    }
    /**
     * Stop every chrome timer.
     *
     * Part of teardown, not an optimisation: a timer that outlives the screen
     * writes to a destroyed one and takes the session with it.
     */
    stopChrome() {
        if (!this.chrome)
            return;
        try {
            this.chrome.stop();
        }
        catch { /* leaving anyway */ }
        this.chrome = null;
    }
    /**
     * The pane the theme's glitches damage, chosen at every tick.
     *
     * Never the top bar and never the status bar: damage THERE reads as the
     * door being broken rather than as atmosphere. What is left is whichever
     * pane is currently up and has rows to spare - and which that is changes,
     * which is why the SDK is handed a function rather than an element.
     */
    glitchPane() {
        // A hand is running: the activity log is the panel with rows to spare.
        if (this.activityPanel && !this.activityPanel.hidden)
            return this.activityContent;
        // The lobby: the table list is what everybody is looking at.
        if (this.lobbyWindow && !this.lobbyWindow.hidden)
            return this.lobbyList;
        // A table with no hand dealt yet - the details pane is all there is.
        return this.tableContent;
    }
    /**
     * The footer: who you are, what you have, where you are, and the last
     * thing that happened.
     *
     * The SDK's StatusBar, not a Box the door writes a joined string into. It
     * owns the sections and the separator, so a caller sets the part that
     * changed instead of rebuilding the line - and it is the widget every
     * other door's footer already is.
     */
    buildStatusBar() {
        this.statusBar = new blessed_1.StatusBar({
            parent: this.desktop,
            position: 'bottom',
            separator: ' | ',
            fg: constants_1.UI_THEME.statusBar.fg,
            bg: constants_1.UI_THEME.statusBar.bg,
            sections: [
                { id: 'user', content: 'Loading Card Lobby...' },
                { id: 'chips', content: '' },
                { id: 'where', content: '' },
                { id: 'notice', content: '' },
            ],
        });
    }
    /**
     * The table strip: game, pot, stakes, buy-in, and whose turn it is.
     *
     * The door decides WHAT is true - which table, what the pot stands at,
     * whose turn - and this paints it, because the widget and its width live
     * here. `null` is the resting label, for no table or one that has gone.
     */
    renderTableInfoBar(table, pot, turnLabel) {
        if (!table) {
            this.topInfoBar.setContent(' Card Lobby ');
            return;
        }
        const segments = [
            `{${constants_1.UI_THEME.accent}-fg}${table.gameName}{/}`,
            `{${constants_1.UI_THEME.accentAlt}-fg}Pot: ${pot}{/}`,
            `{${constants_1.UI_THEME.accent}-fg}Stakes: ${table.stakesLabel}{/}`,
            `{green-fg}Buy-in: ${table.buyIn}{/}`,
        ];
        if (turnLabel)
            segments.push(`{white-fg}${turnLabel}{/}`);
        const width = Number(this.topInfoBar.width) || 80;
        this.topInfoBar.setContent((0, utils_1.padColumn)(` ${segments.join('   ')} `, width));
    }
    buildWindows(callbacks) {
        const { onLobbySelect, createTableFlow, joinSelectedTable, observeSelectedTable, toggleFilters, manualRefresh, runAction } = callbacks;
        this.computeLayout();
        const { topOffset, statusHeight, logHeight, mainHeight, leftWidth, rightWidth } = this.layout;
        // Lobby window - left side
        this.lobbyWindow = (0, blessed_helpers_1.createBox)({
            parent: this.desktop,
            top: topOffset,
            left: 0,
            width: leftWidth,
            height: mainHeight,
            label: ' Lobby ',
            border: { type: 'line' },
            focusable: false,
            mouse: false,
            clickable: false,
            style: { border: constants_1.UI_THEME.windowBorder, bg: constants_1.UI_THEME.windowBg },
        });
        // Table window - right side (shares border with lobby at leftWidth-1)
        this.tableWindow = (0, blessed_helpers_1.createBox)({
            parent: this.desktop,
            top: topOffset,
            left: leftWidth - 1, // Share border with lobby window
            width: rightWidth,
            height: mainHeight,
            border: { type: 'line' },
            label: ' Table ',
            focusable: false,
            mouse: false,
            clickable: false,
            style: { border: constants_1.UI_THEME.windowBorder, bg: constants_1.UI_THEME.windowBg },
        });
        // Help text at top
        const helpBar = (0, blessed_helpers_1.createBox)({
            // Panel adds a line border unless the key is present; these are
            // bars and content areas, and the window around them carries the frame.
            border: undefined,
            parent: this.lobbyWindow,
            top: 0,
            left: 0,
            width: '100%',
            height: 1,
            focusable: false,
            mouse: false,
            clickable: false,
            style: { fg: constants_1.UI_THEME.accent, bg: constants_1.UI_THEME.topBar.bg },
            content: ' ENTER:Join  O:Observe  C:Create ',
        });
        // Use SDK ListTable for clean table display
        this.lobbyList = new blessed_1.ListTable({
            parent: this.lobbyWindow,
            top: 1,
            left: 0,
            width: '100%-2',
            height: '100%-3',
            headers: ['ID', 'Game', 'Stakes', 'Players', 'Status'],
            rows: [],
            interactive: true,
            keys: true, // Enable keyboard navigation
            vi: true, // Enable vi-style arrow key navigation
            mouse: true, // Enable mouse clicks
            style: {
                fg: constants_1.UI_THEME.ink,
                selected: { fg: constants_1.UI_THEME.highlightInk, bg: constants_1.UI_THEME.highlightBg },
                header: { fg: constants_1.UI_THEME.accent, bold: true },
            },
            scrollbar: {
                ch: '|',
                track: { ch: '|', bg: constants_1.UI_THEME.windowBg },
                style: { fg: constants_1.UI_THEME.accent },
            },
        });
        // The highlight moving is not a decision: it keeps the Table panel
        // showing whatever row the cursor is on.
        this.lobbyList.on('select item', (_, index) => {
            onLobbySelect(index);
        });
        // ENTER (or a click) IS the decision. It used to be the J key, which is
        // also this widget's vi-style "down", so the cursor moved and nothing
        // joined ("the selected row moves down when i press j to join it doesnt
        // join", 2026-09-02).
        this.lobbyList.on('select', (_, index) => {
            onLobbySelect(index);
            runAction(() => joinSelectedTable());
        });
        // Action bar at bottom with clearer instructions
        this.lobbyActions = (0, blessed_helpers_1.createBox)({
            // Panel adds a line border unless the key is present; these are
            // bars and content areas, and the window around them carries the frame.
            border: undefined,
            parent: this.lobbyWindow,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 1,
            focusable: false,
            mouse: false,
            clickable: false,
            style: { fg: constants_1.UI_THEME.highlightInk, bg: constants_1.UI_THEME.accent },
            content: ' F:Filter R:Refresh Q:Quit ',
        });
        // Use SDK box instead of blessed.scrollabletext
        this.tableContent = (0, blessed_helpers_1.createBox)({
            // Panel adds a line border unless the key is present; these are
            // bars and content areas, and the window around them carries the frame.
            border: undefined,
            parent: this.tableWindow,
            top: 1,
            left: 1,
            right: 1,
            bottom: 1,
            scrollable: true,
            alwaysScroll: true,
            keys: true,
            // Tab reaches this panel so a long table can be scrolled; it was
            // focusable: false, which is why Tab appeared to do nothing.
            focusable: true,
            mouse: true,
            clickable: false,
            style: { fg: constants_1.UI_THEME.ink },
            content: 'Select a table to view details.',
        });
        this.tableActions = (0, blessed_helpers_1.createBox)({
            // Panel adds a line border unless the key is present; these are
            // bars and content areas, and the window around them carries the frame.
            border: undefined,
            parent: this.tableWindow,
            top: 0,
            left: 1,
            right: 1,
            height: 1,
            focusable: false,
            mouse: false,
            clickable: false,
            style: { fg: constants_1.UI_THEME.ink, bg: constants_1.UI_THEME.windowBg },
            hidden: true,
        });
        this.actionButtons = {
            fold: (0, blessed_helpers_1.createButton)({
                parent: this.tableActions,
                mouse: true,
                keys: true,
                height: 1,
                top: 0,
                left: 0,
                padding: { left: 1, right: 1, top: 0, bottom: 0 },
                content: 'FOLD',
            }),
            check: (0, blessed_helpers_1.createButton)({
                parent: this.tableActions,
                mouse: true,
                keys: true,
                height: 1,
                top: 0,
                left: 0,
                padding: { left: 1, right: 1, top: 0, bottom: 0 },
                content: 'CHECK',
            }),
            call: (0, blessed_helpers_1.createButton)({
                parent: this.tableActions,
                mouse: true,
                keys: true,
                height: 1,
                top: 0,
                left: 0,
                padding: { left: 1, right: 1, top: 0, bottom: 0 },
                content: 'CALL',
            }),
            raise: (0, blessed_helpers_1.createButton)({
                parent: this.tableActions,
                mouse: true,
                keys: true,
                height: 1,
                top: 0,
                left: 0,
                padding: { left: 1, right: 1, top: 0, bottom: 0 },
                content: 'RAISE',
            }),
            quit: (0, blessed_helpers_1.createButton)({
                parent: this.tableActions,
                mouse: true,
                keys: true,
                height: 1,
                top: 0,
                left: 0,
                padding: { left: 1, right: 1, top: 0, bottom: 0 },
                content: 'QUIT',
            }),
        };
        this.registerActionButtonEvents();
        this.logWindow = (0, blessed_helpers_1.createLog)({
            parent: this.desktop,
            bottom: statusHeight,
            left: 0,
            width: '100%',
            height: logHeight,
            border: { type: 'line', labelStyle: { fg: constants_1.UI_THEME.accent } },
            label: ' Activity ',
            tags: true,
            scrollable: true,
            alwaysScroll: true,
            style: { fg: constants_1.UI_THEME.ink, border: constants_1.UI_THEME.windowBorder, bg: constants_1.UI_THEME.windowBg },
            scrollbar: {
                ch: '|',
                track: { ch: '|', bg: constants_1.UI_THEME.windowBg },
                style: { fg: constants_1.UI_THEME.accent, bg: constants_1.UI_THEME.accent },
            },
        });
        this.buildTablePanels();
        // Last, because the glitches are aimed at panes built above this line.
        // The door is opening, so the bar draws itself in.
        this.attachChrome({ entry: true });
    }
    /**
     * The window geometry, from the screen's CURRENT size.
     *
     * Two windows carry absolute numbers - the lobby's width and both windows'
     * height - so they cannot follow a resize the way the percentage-sized
     * widgets do. This is the one place those numbers are worked out, for the
     * first paint and for every resize after it.
     */
    computeLayout() {
        const height = this.screen.height || 24;
        const width = this.screen.width || 80;
        const topOffset = 1; // Space for top bar
        const statusHeight = 1; // Bottom status bar
        const logHeight = 4; // Activity log height
        const mainHeight = height - topOffset - statusHeight - logHeight;
        // Split: 30% lobby, 70% table (share border at junction)
        const leftWidth = Math.max(25, Math.floor(width * 0.30));
        const rightWidth = width - leftWidth + 1; // +1 to share border with lobby
        this.layout = {
            width,
            height,
            topOffset,
            statusHeight,
            logHeight,
            mainHeight,
            // The table view hides the activity log, so those rows are the table's:
            // without this the four panels were sized for a band that is not on
            // screen, and a seven-card hand had six rows to be drawn in.
            tableHeight: mainHeight + logHeight,
            leftWidth,
            rightWidth,
        };
    }
    /**
     * Follow a terminal resize.
     *
     * Alt+Enter asks the caller's terminal to grow (sdk/utils/terminal-mode.ts)
     * and the bottom-docked widgets move on their own, but the lobby and table
     * windows kept the size they were built with - so a wide terminal showed an
     * 80-column door in its top-left corner (2026-09-02).
     */
    relayout() {
        this.computeLayout();
        const { topOffset, mainHeight, leftWidth, rightWidth } = this.layout;
        if (this.lobbyWindow) {
            this.lobbyWindow.top = topOffset;
            this.lobbyWindow.left = 0;
            this.lobbyWindow.width = leftWidth;
            this.lobbyWindow.height = mainHeight;
        }
        if (this.tableWindow) {
            this.tableWindow.top = topOffset;
            this.tableWindow.left = leftWidth - 1;
            this.tableWindow.width = rightWidth;
            this.tableWindow.height = mainHeight;
        }
        this.layoutTablePanels();
        this.layoutActionButtons();
        // The menus leave a different run in a resized terminal, and the rail is
        // sized once when it is attached - so it is re-attached here, WITHOUT
        // the draw-in: the bar is already on screen and growing it again reads
        // as the resize having broken it.
        this.attachChrome({ entry: false });
    }
    buildTablePanels() {
        const panelStyle = { border: constants_1.UI_THEME.windowBorder, bg: constants_1.UI_THEME.windowBg };
        const contentStyle = { fg: constants_1.UI_THEME.ink, bg: constants_1.UI_THEME.windowBg };
        const scrollbarStyle = { fg: constants_1.UI_THEME.accent, bg: constants_1.UI_THEME.accent };
        this.flopPanel = (0, blessed_helpers_1.createBox)({
            parent: this.tableWindow,
            top: 1,
            left: 1,
            width: 10,
            height: 6,
            label: ' FLOP ',
            tags: true,
            hidden: true,
            focusable: false,
            mouse: false,
            clickable: false,
            border: { type: 'line', labelStyle: { fg: constants_1.UI_THEME.accent } },
            style: panelStyle,
        });
        this.flopContent = (0, blessed_helpers_1.createBox)({
            // Panel adds a line border unless the key is present; these are
            // bars and content areas, and the window around them carries the frame.
            border: undefined,
            parent: this.flopPanel,
            top: 1,
            left: 1,
            right: 1,
            bottom: 1,
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
            style: contentStyle,
            content: '',
        });
        this.playersPanel = (0, blessed_helpers_1.createBox)({
            parent: this.tableWindow,
            top: 1,
            left: 1,
            width: 10,
            height: 6,
            label: ' PLAYERS ',
            tags: true,
            hidden: true,
            focusable: false,
            mouse: false,
            clickable: false,
            border: { type: 'line', labelStyle: { fg: constants_1.UI_THEME.accent } },
            style: panelStyle,
        });
        this.playersContent = blessed_1.default.scrollabletext({
            parent: this.playersPanel,
            top: 1,
            left: 1,
            right: 1,
            bottom: 1,
            tags: true,
            scrollable: true,
            alwaysScroll: true,
            keys: true,
            mouse: true,
            style: contentStyle,
            scrollbar: {
                ch: '|',
                track: { ch: '|', bg: constants_1.UI_THEME.windowBg },
                style: scrollbarStyle,
            },
            content: '',
        });
        this.handPanel = (0, blessed_helpers_1.createBox)({
            parent: this.tableWindow,
            top: 1,
            left: 1,
            width: 10,
            height: 6,
            label: ' YOUR HAND ',
            tags: true,
            hidden: true,
            focusable: false,
            mouse: false,
            clickable: false,
            border: { type: 'line', labelStyle: { fg: constants_1.UI_THEME.accent } },
            style: panelStyle,
        });
        this.handContent = (0, blessed_helpers_1.createBox)({
            // Panel adds a line border unless the key is present; these are
            // bars and content areas, and the window around them carries the frame.
            border: undefined,
            parent: this.handPanel,
            top: 1,
            left: 1,
            right: 1,
            bottom: 1,
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
            style: contentStyle,
            content: '',
        });
        this.activityPanel = (0, blessed_helpers_1.createBox)({
            parent: this.tableWindow,
            top: 1,
            left: 1,
            width: 10,
            height: 6,
            label: ' ACTIVITY ',
            tags: true,
            hidden: true,
            focusable: false,
            mouse: false,
            clickable: false,
            border: { type: 'line', labelStyle: { fg: constants_1.UI_THEME.accent } },
            style: panelStyle,
        });
        this.activityContent = (0, blessed_helpers_1.createLog)({
            parent: this.activityPanel,
            top: 1,
            left: 1,
            right: 1,
            bottom: 1,
            tags: true,
            scrollable: true,
            alwaysScroll: true,
            keys: true,
            mouse: true,
            wrap: true,
            scrollOnInput: false,
            scrollback: 200,
            style: contentStyle,
            scrollbar: {
                ch: '|',
                track: { ch: '|', bg: constants_1.UI_THEME.windowBg },
                style: scrollbarStyle,
            },
            content: '',
        });
        // CHAT sits beside ACTIVITY when the table has the room for it: the
        // feed is the door talking, this is the players talking. On a narrow
        // board there is no room for a second panel, and the door writes chat
        // into the activity feed instead - never nowhere.
        this.chatPanel = (0, blessed_helpers_1.createBox)({
            parent: this.tableWindow,
            top: 1,
            left: 1,
            width: 10,
            height: 6,
            label: ' CHAT ',
            tags: true,
            hidden: true,
            focusable: false,
            mouse: false,
            clickable: false,
            border: { type: 'line', labelStyle: { fg: constants_1.UI_THEME.accent } },
            style: panelStyle,
        });
        this.chatContent = (0, blessed_helpers_1.createLog)({
            parent: this.chatPanel,
            top: 1,
            left: 1,
            right: 1,
            bottom: 1,
            tags: true,
            scrollable: true,
            alwaysScroll: true,
            keys: true,
            mouse: true,
            wrap: true,
            scrollOnInput: false,
            scrollback: 200,
            style: contentStyle,
            scrollbar: {
                ch: '|',
                track: { ch: '|', bg: constants_1.UI_THEME.windowBg },
                style: scrollbarStyle,
            },
            content: '',
        });
        this.layoutTablePanels();
    }
    /**
     * Whether the right column has the rows for ACTIVITY and CHAT both.
     *
     * Each panel spends two rows on its own frame, so a pair costs four
     * before a word is drawn. At nine rows the split gives four and five -
     * two lines of feed and three of chat, which is a conversation. Below
     * that the split leaves two panels showing one line each, and the chat
     * belongs in the feed instead.
     */
    hasRoomForChatPanel(bottomHeight) {
        return bottomHeight >= 9;
    }
    /** Is the chat drawn in its own panel, or does it belong in the feed? */
    chatHasItsOwnPanel() {
        return Boolean(this.chatPanel) && !this.chatPanel.hidden;
    }
    /** Repaint the chat panel from the messages it should be showing. */
    setChatLines(lines) {
        if (!this.chatContent)
            return;
        this.chatContent.setContent(lines.join('\n'));
        this.chatContent.setScrollPerc(100);
    }
    /** Rows a widget has inside its own borders, for sizing what goes in it. */
    panelRows(widget) {
        const box = widget;
        const coords = box._getCoords?.();
        if (coords && typeof coords.yi === 'number' && typeof coords.yl === 'number') {
            return Math.max(0, coords.yl - coords.yi);
        }
        return Math.max(0, Number(box.height) || 0);
    }
    /**
     * Move and size a widget.
     *
     * Both the live property and `options` are written: the property is what
     * the renderer reads, and `options` is what a later rebuild would seed
     * from, so leaving them to disagree is how a panel springs back.
     */
    place(widget, box) {
        widget.top = box.top;
        widget.left = box.left;
        widget.width = box.width;
        widget.height = box.height;
        const options = widget.options;
        if (options) {
            options.top = box.top;
            options.left = box.left;
            options.width = box.width;
            options.height = box.height;
        }
    }
    layoutTablePanels() {
        if (!this.layout)
            return;
        const tableWidth = Number(this.tableWindow.width) || this.layout.width;
        const tableHeight = Number(this.tableWindow.height) || this.layout.mainHeight;
        const innerWidth = Math.max(20, tableWidth - 2);
        const innerHeight = Math.max(6, tableHeight - 2);
        const colGap = innerWidth >= 70 ? 2 : 1;
        const minLeftWidth = 26;
        const minRightWidth = 18;
        let leftWidth = Math.floor((innerWidth - colGap) * 0.58);
        leftWidth = Math.max(minLeftWidth, leftWidth);
        leftWidth = Math.min(leftWidth, innerWidth - colGap - minRightWidth);
        let rightWidth = innerWidth - leftWidth - colGap;
        if (rightWidth < minRightWidth) {
            rightWidth = Math.max(12, innerWidth - colGap - minLeftWidth);
            leftWidth = Math.max(10, innerWidth - colGap - rightWidth);
        }
        const actionHeight = 1;
        const rowGap = 1;
        const usableHeight = Math.max(4, innerHeight - actionHeight - rowGap);
        const minFullPanelHeight = 9;
        let topHeight = Math.floor(usableHeight / 2) + (usableHeight % 2);
        let bottomHeight = Math.max(4, usableHeight - topHeight);
        if (usableHeight >= minFullPanelHeight) {
            if (usableHeight >= minFullPanelHeight * 2) {
                topHeight = Math.max(topHeight, minFullPanelHeight);
                bottomHeight = Math.max(bottomHeight, minFullPanelHeight);
                if (topHeight + bottomHeight > usableHeight) {
                    bottomHeight = Math.max(4, usableHeight - topHeight);
                }
            }
            else {
                topHeight = minFullPanelHeight;
                bottomHeight = Math.max(4, usableHeight - topHeight);
            }
        }
        const top = 1;
        const left = 1;
        const rightStart = left + leftWidth + colGap;
        const bottomTop = top + topHeight + rowGap;
        const actionTop = top + innerHeight - actionHeight;
        this.place(this.flopPanel, { top, left, width: leftWidth, height: topHeight });
        this.place(this.playersPanel, { top, left: rightStart, width: rightWidth, height: topHeight });
        this.place(this.handPanel, { top: bottomTop, left, width: leftWidth, height: bottomHeight });
        // ACTIVITY and CHAT share the right column, stacked rather than side by
        // side. Measured, not guessed: at 120x30 - the size the door is played
        // at in fullscreen - that column is 35 wide, and splitting it across
        // gives each panel 15 usable characters, narrower than "22:14 sysop:
        // nice". Chat lines are wide and short, so they take the whole width
        // and fewer rows. Too few rows to split, and chat goes to the feed.
        if (this.hasRoomForChatPanel(bottomHeight)) {
            const chatHeight = Math.max(4, Math.floor(bottomHeight / 2));
            const feedHeight = bottomHeight - chatHeight;
            this.place(this.activityPanel, { top: bottomTop, left: rightStart, width: rightWidth, height: feedHeight });
            this.place(this.chatPanel, {
                top: bottomTop + feedHeight,
                left: rightStart,
                width: rightWidth,
                height: chatHeight,
            });
            this.chatPanel.hidden = this.activityPanel.hidden;
        }
        else {
            this.place(this.activityPanel, { top: bottomTop, left: rightStart, width: rightWidth, height: bottomHeight });
            this.chatPanel.hide();
        }
        this.place(this.tableActions, { top: actionTop, left, width: innerWidth, height: actionHeight });
        this.layoutActionButtons();
    }
    layoutActionButtons() {
        const rawWidth = Number(this.tableActions.width);
        const width = Number.isFinite(rawWidth) ? rawWidth : Number(this.tableActions.options.width) || 0;
        const buttonHeight = 1;
        const buttonTop = 0;
        const gap = width >= 58 ? 2 : 1;
        const order = constants_1.ACTION_BUTTON_ORDER;
        const available = Math.max(0, width - gap * Math.max(0, order.length - 1));
        const buttonWidth = Math.max(6, Math.floor(available / order.length));
        const totalButtonsWidth = buttonWidth * order.length + gap * Math.max(0, order.length - 1);
        let left = Math.max(0, Math.floor((width - totalButtonsWidth) / 2));
        order.forEach((key) => {
            const button = this.actionButtons[key];
            this.place(button, { top: buttonTop, left, width: buttonWidth, height: buttonHeight });
            button.setContent(this.formatButtonLabel(button.getContent(), buttonWidth));
            left += buttonWidth + gap;
        });
    }
    applyActionButtonPalette(key) {
        const palette = constants_1.ACTION_BUTTON_STYLES[key];
        const button = this.actionButtons[key];
        button.setStyle({
            ...palette.base,
            hover: palette.hover,
            focus: palette.focus,
        });
    }
    registerActionButtonEvents() {
        constants_1.ACTION_BUTTON_ORDER.forEach((key) => {
            const palette = constants_1.ACTION_BUTTON_STYLES[key];
            const button = this.actionButtons[key];
            button.on('mousedown', () => {
                button.setStyle({
                    ...palette.active,
                    hover: palette.hover,
                    focus: palette.focus,
                });
            });
            button.on('mouseup', () => {
                button.setStyle({
                    ...palette.base,
                    hover: palette.hover,
                    focus: palette.focus,
                });
            });
            button.on('mouseleave', () => {
                button.setStyle({
                    ...palette.base,
                    hover: palette.hover,
                    focus: palette.focus,
                });
            });
        });
    }
    formatButtonLabel(label, width) {
        const clean = (0, utils_1.stripBlessedTags)(String(label)).trim();
        const text = ` ${clean} `;
        if (text.length >= width)
            return text.slice(0, width);
        const padLeft = Math.floor((width - text.length) / 2);
        const padRight = width - text.length - padLeft;
        return `${' '.repeat(padLeft)}${text}${' '.repeat(padRight)}`;
    }
    buildOverlay() {
        // The SDK's Overlay, not a black box.
        //
        // This was a full-screen Box filled with solid black, so every dialog
        // opened on a blank screen with the lobby wiped out behind it, reported
        // as "many dialogs open up on a black screen instead of overlayed"
        // (2026-09-02). Overlay draws no background of its own - the modal sits
        // on top of the board it came from, and web clients get the dimming from
        // the CSS overlay it announces.
        //
        // Parented to the SCREEN, not the desktop: the desktop can be hidden and
        // the shade must not go with it.
        this.overlayShade = new blessed_1.Overlay({
            parent: this.screen,
            hidden: true,
            // The dialogs manage their own focus and dismissal; the shade must not
            // take focus away from them.
            tapToDismiss: false,
        });
        // Set z-index after creation to ensure dialogs appear on top of all UI (browser widget, etc.)
        this.overlayShade.z = 9999;
        // Consume mouse clicks on overlay to prevent focus loss from dialogs
        // Clicking the overlay should do nothing (user must interact with dialog or press ESC)
        this.overlayShade.on('click', () => {
            // Do nothing - prevent click from propagating and causing focus issues
            this.screen.render();
        });
    }
    /**
     * The engine options for cards drawn in a panel of this capacity.
     *
     * `capacity` is the panel's own answer to whether a full-size card fits;
     * the player's preference decides what to do with that room (always big,
     * always small, or fit the panel), along with faces, colour, back, hand
     * layout and spacing.
     */
    cardOptions(capacity, extra = {}) {
        const chrome = (0, card_style_1.resolveCardStyle)(this.cardPreferences, capacity === 'mini' ? card_style_1.FULL_CARD_ROWS - 1 : card_style_1.FULL_CARD_ROWS, this.unicodeCapable);
        return { ...(0, card_style_1.toRenderOptions)(chrome), ...extra };
    }
    renderBoardAndHand(boardCards, playerHand, flopCardSize, handCardSize, hasLiveHand) {
        if (boardCards.length > 0) {
            this.flopContent.setContent((0, utils_1.renderCardLines)(boardCards, this.cardOptions(flopCardSize)).join('\n'));
        }
        else {
            this.flopContent.setContent('Board not dealt yet.');
        }
        if (playerHand.length > 0) {
            this.handContent.setContent((0, utils_1.renderCardLines)(playerHand, this.cardOptions(handCardSize)).join('\n'));
        }
        else {
            this.handContent.setContent(hasLiveHand ? 'Waiting for cards...' : 'No hand on record.');
        }
    }
    async runDealAnimation(boardCards, playerHand, flopCardSize, handCardSize, emitSfx) {
        if (!this.screen || this.dealAnimationInProgress)
            return;
        this.dealAnimationInProgress = true;
        const drawDelay = 180;
        const flipDelay = 220;
        const phasePause = 350;
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const renderMixedHand = (cards, flipped, size) => {
            if (cards.length === 0)
                return;
            const framed = cards.map((card, index) => ({
                ...card,
                face: index < flipped ? 'front' : 'back',
            }));
            this.flopContent.setContent((0, utils_1.renderCardLines)(framed, this.cardOptions(size)).join('\n'));
        };
        const renderMixedPlayerHand = (cards, flipped, size) => {
            if (cards.length === 0)
                return;
            const framed = cards.map((card, index) => ({
                ...card,
                face: index < flipped ? 'front' : 'back',
            }));
            this.handContent.setContent((0, utils_1.renderCardLines)(framed, this.cardOptions(size)).join('\n'));
        };
        try {
            if (boardCards.length > 0) {
                for (let i = 1; i <= boardCards.length; i += 1) {
                    const partial = boardCards.slice(0, i);
                    this.flopContent.setContent((0, utils_1.renderCardLines)(partial, this.cardOptions(flopCardSize, { face: 'back' })).join('\n'));
                    emitSfx('card-flap');
                    this.screen.render();
                    await sleep(drawDelay);
                }
                await sleep(phasePause);
                for (let i = 1; i <= boardCards.length; i += 1) {
                    renderMixedHand(boardCards, i, flopCardSize);
                    emitSfx('card-flap');
                    this.screen.render();
                    await sleep(flipDelay);
                }
                await sleep(phasePause);
            }
            if (playerHand.length > 0) {
                for (let i = 1; i <= playerHand.length; i += 1) {
                    const partial = playerHand.slice(0, i);
                    this.handContent.setContent((0, utils_1.renderCardLines)(partial, this.cardOptions(handCardSize, { face: 'back' })).join('\n'));
                    emitSfx('card-flap');
                    this.screen.render();
                    await sleep(drawDelay);
                }
                await sleep(phasePause);
                for (let i = 1; i <= playerHand.length; i += 1) {
                    renderMixedPlayerHand(playerHand, i, handCardSize);
                    emitSfx('card-flap');
                    this.screen.render();
                    await sleep(flipDelay);
                }
            }
        }
        finally {
            this.dealAnimationInProgress = false;
        }
    }
    // ============================================================================
    // UNO RENDERING METHODS
    // ============================================================================
    renderUnoDiscardPile(topCard, currentColor, direction) {
        if (!topCard) {
            this.flopContent.setContent('No card played yet.');
            return;
        }
        // Render the top discard card using CardEngine
        const lines = [];
        // Add direction indicator
        // ASCII only: a real Amiga (and a C64) has no U+21BB. The sysop's rule
        // is the board's characters, nothing else (2026-09-02).
        const directionArrow = direction === 1 ? '{cyan-fg}>>{/}' : '{cyan-fg}<<{/}';
        lines.push(`Direction: ${directionArrow} ${direction === 1 ? 'Clockwise' : 'Counter-clockwise'}`);
        // Add current color indicator
        const colorNames = {
            'R': '{red-fg}RED{/}',
            'G': '{green-fg}GREEN{/}',
            'B': '{blue-fg}BLUE{/}',
            'Y': '{yellow-fg}YELLOW{/}',
        };
        lines.push(`Current Color: ${colorNames[currentColor]}`);
        lines.push('');
        // No "Top Card:" label - the card IS the top card, and the panel is eight
        // rows: two lines of state, a gap and a four-row card fills it exactly.
        // With the label and a second blank it ran one row past the panel and the
        // card was cut off (2026-09-02).
        lines.push(this.renderUnoCardAscii(topCard));
        this.flopContent.setContent(lines.join('\n'));
    }
    /**
     * The door's card values, in the vocabulary the SDK's card engine speaks.
     *
     * They are the same cards under different spellings - this door's engine
     * says 'Skip' and 'Draw2', the SDK's says 'skip' and 'draw2' - which is why
     * this file used to draw its own five-line box instead of asking the engine
     * that already renders UNO cards. House-rule cards (HR1-HR5, WildChange)
     * exist only in this door and have no engine equivalent; they keep a plain
     * face of their own.
     */
    toEngineUnoCard(card) {
        const values = {
            '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
            '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
            'Skip': 'skip', 'Reverse': 'reverse', 'Draw2': 'draw2',
            'Wild': 'wild', 'Wild4': 'wild4',
        };
        const value = values[card.value];
        if (!value)
            return null;
        return { color: card.color, value };
    }
    renderUnoCardAscii(card) {
        const colorTags = {
            'R': 'red-fg',
            'G': 'green-fg',
            'B': 'blue-fg',
            'Y': 'yellow-fg',
            'W': 'white-fg',
        };
        const colorTag = colorTags[card.color] || 'white-fg';
        // The SDK's card engine draws the card, and colours it. `ascii` because
        // the board is an Amiga, `mini` because the panel is four rows tall, and
        // `ansi` because the engine knows which parts of a card are which colour
        // - a flat blessed tag around the whole box does not. `ansiToTags` is how
        // raw ANSI becomes something a blessed widget will render.
        const engineCard = this.toEngineUnoCard(card);
        if (engineCard) {
            // 'mini' used to be hardcoded here, with a comment explaining that the
            // panel is four rows tall - which it is at 80x25 and is not after
            // Alt+Enter: "uno in cardlobby doesnt show the full size cards when it
            // can" (2026-09-02). Poker sized itself from its panel already; this is
            // the same rule, plus whatever the player asked for (lib/card-style.ts).
            const chrome = (0, card_style_1.resolveCardStyle)(this.cardPreferences, this.panelRows(this.flopContent) - 3, // two state lines and a gap
            this.unicodeCapable);
            const lines = cardEngine.renderUnoCardLines(engineCard, (0, card_style_1.toRenderOptions)(chrome));
            return lines.map((line) => ` ${(0, blessed_helpers_1.ansiToTags)(line)}`).join('\n');
        }
        // A house-rule card: the engine has never heard of it.
        const label = card.value.replace('WildChange', 'CHANGE');
        return [
            ` {${colorTag}}.---------.`,
            ` {${colorTag}}|${label.padEnd(9, ' ')}|`,
            ` {${colorTag}}|  HOUSE  |`,
            ` {${colorTag}}'---------'{/}`,
        ].join('\n');
    }
    renderUnoPlayerStatus(players, currentPlayerIndex, currentUserId) {
        const lines = [];
        lines.push(`{${constants_1.UI_THEME.accent}-fg}Players:{/}`);
        lines.push('');
        players.forEach((player, index) => {
            const isCurrent = index === currentPlayerIndex;
            const isYou = player.id === currentUserId;
            const turnMarker = isCurrent ? '{yellow-fg}>{/} ' : '  ';
            const unoMarker = player.hand.length === 1 ? ' {yellow-fg}!{/}' : '';
            const youMarker = isYou ? ` {${constants_1.UI_THEME.accent}-fg}(You){/}` : '';
            const botMarker = player.isBot ? ` {${constants_1.UI_THEME.dim}-fg}[BOT]{/}` : '';
            lines.push(`${turnMarker}${player.name}${youMarker}${botMarker}: ${player.hand.length} card${player.hand.length !== 1 ? 's' : ''}${unoMarker}`);
        });
        this.playersContent.setContent(lines.join('\n'));
    }
    /**
     * A hand of UNO cards drawn as cards, side by side, with the key that
     * plays each one under it - or null when the panel is too short or too
     * narrow to hold them, in which case the caller falls back to the list.
     *
     * Cards are joined column by column: renderUnoCardLines gives one card's
     * rows, and a hand is those rows concatenated across.
     */
    renderUnoHandAsCards(hand, playableIndices, selectedIndex) {
        const rows = this.panelRows(this.handContent);
        const chrome = (0, card_style_1.resolveCardStyle)(this.cardPreferences, rows - 4, this.unicodeCapable);
        if (chrome.size !== 'full')
            return null; // the list says more in less
        const drawnCards = [];
        for (const card of hand) {
            const engineCard = this.toEngineUnoCard(card);
            if (!engineCard)
                return null; // a house-rule card has no art
            drawnCards.push(cardEngine.renderUnoCardLines(engineCard, (0, card_style_1.toRenderOptions)(chrome))
                .map((line) => (0, blessed_helpers_1.ansiToTags)(line)));
        }
        if (drawnCards.length === 0)
            return null;
        const cardWidth = (0, utils_1.stripBlessedTags)(drawnCards[0][0] ?? '').length;
        const coords = this.handContent._getCoords?.();
        const panelWidth = (coords ? coords.xl - coords.xi : 0)
            || Number(this.handContent.width) || 36;
        const perRow = Math.max(1, Math.floor(panelWidth / (cardWidth + 1)));
        const cardRowCount = drawnCards[0].length;
        const rowsNeeded = Math.ceil(drawnCards.length / perRow) * (cardRowCount + 1);
        if (perRow < 2 || rowsNeeded > rows - 2)
            return null;
        const out = [];
        for (let start = 0; start < drawnCards.length; start += perRow) {
            const slice = drawnCards.slice(start, start + perRow);
            for (let row = 0; row < cardRowCount; row++) {
                out.push(slice.map((card) => card[row] ?? '').join(' '));
            }
            // The key that plays it, and whether it can be played at all.
            out.push(slice.map((_, offset) => {
                const index = start + offset;
                const label = index === 9 ? '0' : String(index + 1);
                const mark = index === selectedIndex
                    ? `{yellow-bg}{black-fg}[${label}]{/}{/}`
                    : playableIndices.includes(index)
                        ? `{green-fg}[${label}]{/}`
                        : `{gray-fg}[${label}]{/}`;
                const pad = Math.max(0, cardWidth - 3);
                return mark + ' '.repeat(pad);
            }).join(' '));
        }
        return out;
    }
    renderUnoHand(hand, playableIndices, selectedIndex) {
        if (hand.length === 0) {
            this.handContent.setContent('No cards in hand.');
            return;
        }
        const lines = [];
        lines.push(`{${constants_1.UI_THEME.accent}-fg}Your Hand:{/}`);
        lines.push('');
        // Drawn as CARDS when the panel can hold a row of them - which it can
        // the moment the door is given a real terminal ("uno in cardlobby
        // doesnt show the full size cards when it can", 2026-09-02). The
        // compact list below is what a short panel gets, and it is what every
        // panel used to get.
        const drawn = this.renderUnoHandAsCards(hand, playableIndices, selectedIndex);
        if (drawn) {
            this.handContent.setContent([...lines, ...drawn].join('\n'));
            return;
        }
        // Across the panel, not down it.
        //
        // One card per row needs eleven rows for a seven-card hand, and the panel
        // has eight - so the sysop was dealt seven cards and shown none of them
        // (2026-09-02). Each entry is about twelve columns and the panel is wide,
        // so they are laid out in as many columns as fit.
        const entries = [];
        hand.forEach((card, index) => {
            const isPlayable = playableIndices.includes(index);
            const isSelected = index === selectedIndex;
            const indexLabel = index === 9 ? '0' : String(index + 1);
            const colorTags = {
                'R': 'red-fg',
                'G': 'green-fg',
                'B': 'blue-fg',
                'Y': 'yellow-fg',
                'W': 'white-fg',
            };
            const colorTag = colorTags[card.color] || 'white-fg';
            const displayValue = card.value.replace('Wild4', 'W+4').replace('Wild', 'W');
            let marker = ' ';
            if (isSelected) {
                marker = '{yellow-bg}{black-fg}>{/}{/}';
            }
            else if (isPlayable) {
                marker = '{green-fg}+{/}';
            }
            else {
                marker = '{red-fg}-{/}';
            }
            entries.push(`[${indexLabel}] ${marker} {${colorTag}}${displayValue.padEnd(6, ' ')}{/}`);
        });
        // One entry is "[n] m VALUE" - four visible columns plus the six the value
        // is padded to, and a gap between neighbours.
        const entryWidth = 14;
        const coords = this.handContent._getCoords?.();
        const panelWidth = (coords ? coords.xl - coords.xi : 0) || Number(this.handContent.width) || 36;
        const perRow = Math.max(1, Math.floor(panelWidth / entryWidth));
        for (let i = 0; i < entries.length; i += perRow) {
            lines.push(entries.slice(i, i + perRow).join(' '));
        }
        lines.push('');
        lines.push(`{${constants_1.UI_THEME.dim}-fg}Press 1-9,0 to select, Enter to play{/}`);
        this.handContent.setContent(lines.join('\n'));
    }
    /**
     * The UNO context lines that sit above the log: whose action was last, and
     * a challenge window while one is open.
     *
     * This used to PREPEND straight into activityContent while the door's own
     * renderer replaced the whole thing from the other side. Two writers, two
     * strategies, one widget - which is why the panel jumped (2026-09-02). It
     * hands its lines to the one painter now.
     */
    renderUnoActivity(lastAction, challengeWindow) {
        const lines = [];
        if (lastAction) {
            lines.push(`{${constants_1.UI_THEME.accent}-fg}Last Action:{/}`);
            lines.push(lastAction);
            lines.push('');
        }
        if (challengeWindow) {
            const timeLeft = Math.max(0, Math.floor((challengeWindow.expiresAt - Date.now()) / 1000));
            const challengeType = challengeWindow.type === 'uno' ? 'UNO Challenge' : 'Wild Draw 4 Challenge';
            lines.push(`{yellow-bg}{black-fg} ${challengeType} OPEN! {/}{/}`);
            lines.push(`{${constants_1.UI_THEME.warning}-fg}Time remaining: ${timeLeft}s{/}`);
            lines.push('');
        }
        this.activityHeader = lines;
        this.paintActivity();
    }
    /** The door's own lines: hints for the moment, then the event log. */
    setActivityBody(lines) {
        this.activityBody = lines;
        this.paintActivity();
    }
    /**
     * Paint header + body into the activity log, wrapped to the panel's own
     * width and holding the reader's scroll position.
     *
     * The wrap has to be tag-aware: blessed counts `{yellow-fg}` against the
     * width and breaks wherever it runs out, which is how the panel came to
     * show "D Dea" on one row and "l" on the next.
     */
    paintActivity() {
        if (!this.activityContent)
            return;
        const coords = this.activityContent._getCoords?.();
        const width = (coords ? coords.xl - coords.xi : 0)
            || Number(this.activityContent.width)
            || 30;
        const wrapped = [];
        for (const line of [...this.activityHeader, ...this.activityBody]) {
            if (line === '') {
                wrapped.push('');
                continue;
            }
            wrapped.push(...(0, utils_1.wrapTagged)(line, Math.max(1, width)));
        }
        const previousScroll = this.activityContent.getScroll();
        const previousHeight = this.activityContent.getScrollHeight();
        const wasAtBottom = previousHeight === 0 || previousScroll >= Math.max(0, previousHeight - 1);
        this.activityContent.setContent(wrapped.join('\n'));
        const newHeight = this.activityContent.getScrollHeight();
        this.activityContent.setScroll(wasAtBottom ? newHeight : Math.min(previousScroll, newHeight));
    }
    /**
     * Hide all UI elements (for browser mode)
     */
    hide() {
        if (this.topBar)
            this.topBar.hidden = true;
        if (this.topInfoBar)
            this.topInfoBar.hidden = true;
        if (this.statusBar)
            this.statusBar.hidden = true;
        if (this.lobbyWindow)
            this.lobbyWindow.hidden = true;
        if (this.tableWindow)
            this.tableWindow.hidden = true;
        if (this.logWindow)
            this.logWindow.hidden = true;
        if (this.flopPanel)
            this.flopPanel.hidden = true;
        if (this.playersPanel)
            this.playersPanel.hidden = true;
        if (this.handPanel)
            this.handPanel.hidden = true;
        if (this.activityPanel)
            this.activityPanel.hidden = true;
        this.screen.render();
    }
    /**
     * Show all UI elements (return from browser mode)
     */
    show() {
        if (this.topBar)
            this.topBar.hidden = false;
        if (this.topInfoBar)
            this.topInfoBar.hidden = false;
        if (this.statusBar)
            this.statusBar.hidden = false;
        if (this.lobbyWindow)
            this.lobbyWindow.hidden = false;
        if (this.tableWindow)
            this.tableWindow.hidden = false;
        if (this.logWindow)
            this.logWindow.hidden = false;
        if (this.flopPanel)
            this.flopPanel.hidden = false;
        if (this.playersPanel)
            this.playersPanel.hidden = false;
        if (this.handPanel)
            this.handPanel.hidden = false;
        if (this.activityPanel)
            this.activityPanel.hidden = false;
        this.screen.render();
    }
}
exports.UIManager = UIManager;
