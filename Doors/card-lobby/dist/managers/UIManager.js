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
const constants_1 = require("../lib/constants");
const utils_1 = require("../lib/utils");
const cardEngine = new bbs_door_sdk_1.CardEngine();
class UIManager {
    constructor(screen, desktop) {
        this.dealAnimationInProgress = false;
        this.menuButtons = [];
        this.menus = [];
        this.screen = screen;
        this.desktop = desktop;
    }
    getDealAnimationInProgress() {
        return this.dealAnimationInProgress;
    }
    buildTopBar(callbacks) {
        const { focusLobby, focusTable, showProfileWindow, showLeaderboardWindow, showAchievementsWindow, showBulletinsWindow, exitDoor, runAction } = callbacks;
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
            style: { fg: constants_1.UI_THEME.topBar.fg, bg: constants_1.UI_THEME.topBar.bg },
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
        const menuDefs = [
            {
                label: 'Lobby',
                items: [
                    { label: 'Focus Lobby', action: () => runAction(focusLobby) },
                ],
            },
            {
                label: 'Table',
                items: [
                    { label: 'Focus Table', action: () => runAction(focusTable) },
                ],
            },
            {
                label: 'Views',
                items: [
                    { label: 'Profile', action: () => runAction(showProfileWindow) },
                    { label: 'Leaders', action: () => runAction(showLeaderboardWindow) },
                    { label: 'Achievements', action: () => runAction(showAchievementsWindow) },
                    { label: 'Bulletins', action: () => runAction(showBulletinsWindow) },
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
    }
    buildStatusBar() {
        this.statusBar = (0, blessed_helpers_1.createBox)({
            // Panel adds a line border unless the key is present; these are
            // bars and content areas, and the window around them carries the frame.
            border: undefined,
            parent: this.desktop,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 1,
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
            style: constants_1.UI_THEME.statusBar,
            content: ' Loading Card Lobby... ',
        });
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
            tableHeight: mainHeight,
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
        this.layoutTablePanels();
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
        this.place(this.activityPanel, { top: bottomTop, left: rightStart, width: rightWidth, height: bottomHeight });
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
    renderBoardAndHand(boardCards, playerHand, flopCardSize, handCardSize, hasLiveHand) {
        if (boardCards.length > 0) {
            this.flopContent.setContent((0, utils_1.renderCardLines)(boardCards, { layout: 'flat-condensed', size: flopCardSize }).join('\n'));
        }
        else {
            this.flopContent.setContent('Board not dealt yet.');
        }
        if (playerHand.length > 0) {
            this.handContent.setContent((0, utils_1.renderCardLines)(playerHand, { layout: 'flat-condensed', size: handCardSize }).join('\n'));
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
            this.flopContent.setContent((0, utils_1.renderCardLines)(framed, { layout: 'flat-condensed', size }).join('\n'));
        };
        const renderMixedPlayerHand = (cards, flipped, size) => {
            if (cards.length === 0)
                return;
            const framed = cards.map((card, index) => ({
                ...card,
                face: index < flipped ? 'front' : 'back',
            }));
            this.handContent.setContent((0, utils_1.renderCardLines)(framed, { layout: 'flat-condensed', size }).join('\n'));
        };
        try {
            if (boardCards.length > 0) {
                for (let i = 1; i <= boardCards.length; i += 1) {
                    const partial = boardCards.slice(0, i);
                    this.flopContent.setContent((0, utils_1.renderCardLines)(partial, { layout: 'flat-condensed', size: flopCardSize, face: 'back' }).join('\n'));
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
                    this.handContent.setContent((0, utils_1.renderCardLines)(partial, { layout: 'flat-condensed', size: handCardSize, face: 'back' }).join('\n'));
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
        const directionArrow = direction === 1 ? '{cyan-fg}\u21BB{/}' : '{cyan-fg}\u21BA{/}';
        lines.push(`Direction: ${directionArrow} ${direction === 1 ? 'Clockwise' : 'Counter-clockwise'}`);
        lines.push('');
        // Add current color indicator
        const colorNames = {
            'R': '{red-fg}RED{/}',
            'G': '{green-fg}GREEN{/}',
            'B': '{blue-fg}BLUE{/}',
            'Y': '{yellow-fg}YELLOW{/}',
        };
        lines.push(`Current Color: ${colorNames[currentColor]}`);
        lines.push('');
        // Render the card (using simplified ASCII representation)
        lines.push('Top Card:');
        lines.push(this.renderUnoCardAscii(topCard));
        this.flopContent.setContent(lines.join('\n'));
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
        const displayValue = card.value.replace('Wild4', 'W+4').replace('Wild', 'W');
        // Simple card representation
        return [
            ` {${colorTag}}._______. `,
            ` {${colorTag}}|       | `,
            ` {${colorTag}}|  ${displayValue.padEnd(4, ' ')} | `,
            ` {${colorTag}}|       | `,
            ` {${colorTag}}'-------' {/}`,
        ].join('\n');
    }
    renderUnoPlayerStatus(players, currentPlayerIndex, currentUserId) {
        const lines = [];
        lines.push(`{${constants_1.UI_THEME.accent}-fg}Players:{/}`);
        lines.push('');
        players.forEach((player, index) => {
            const isCurrent = index === currentPlayerIndex;
            const isYou = player.id === currentUserId;
            const turnMarker = isCurrent ? '{yellow-fg}\u2192{/} ' : '  ';
            const unoMarker = player.hand.length === 1 ? ' {yellow-fg}\u26A0{/}' : '';
            const youMarker = isYou ? ` {${constants_1.UI_THEME.accent}-fg}(You){/}` : '';
            const botMarker = player.isBot ? ` {${constants_1.UI_THEME.dim}-fg}[BOT]{/}` : '';
            lines.push(`${turnMarker}${player.name}${youMarker}${botMarker}: ${player.hand.length} card${player.hand.length !== 1 ? 's' : ''}${unoMarker}`);
        });
        this.playersContent.setContent(lines.join('\n'));
    }
    renderUnoHand(hand, playableIndices, selectedIndex) {
        if (hand.length === 0) {
            this.handContent.setContent('No cards in hand.');
            return;
        }
        const lines = [];
        lines.push(`{${constants_1.UI_THEME.accent}-fg}Your Hand:{/}`);
        lines.push('');
        // Render cards with indices
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
                marker = '{green-fg}\u2713{/}';
            }
            else {
                marker = '{red-fg}\u2717{/}';
            }
            lines.push(`[${indexLabel}] ${marker} {${colorTag}}${displayValue.padEnd(6, ' ')}{/}`);
        });
        lines.push('');
        lines.push(`{${constants_1.UI_THEME.dim}-fg}Press 1-9,0 to select, Enter to play{/}`);
        this.handContent.setContent(lines.join('\n'));
    }
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
        if (this.activityContent) {
            const existingContent = this.activityContent.getContent();
            const newContent = lines.join('\n') + (existingContent ? '\n\n' + existingContent : '');
            // Keep last 20 lines to prevent overflow
            const allLines = newContent.split('\n');
            const trimmed = allLines.slice(0, 20).join('\n');
            this.activityContent.setContent(trimmed);
        }
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
