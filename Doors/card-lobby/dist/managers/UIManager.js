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
            parent: this.desktop,
            top: 0,
            left: 0,
            width: '100%',
            height: 1,
            fixed: true,
            hidden: false,
            style: { fg: 'white', bg: 'blue' },
            content: '',
        });
        this.topInfoBar = (0, blessed_helpers_1.createBox)({
            parent: this.desktop,
            top: 0,
            left: 0,
            width: '100%',
            height: 1,
            tags: true,
            hidden: true,
            style: { fg: 'white', bg: 'blue' },
            content: ' Card Lobby ',
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
                parent: this.topBar,
                top: 0,
                left,
                width: menu.label.length + 2,
                height: 1,
                content: `{bold}${menu.label}{/bold}`,
                style: { fg: 'white', bg: 'blue', focus: { fg: 'black', bg: 'cyan' } },
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
            parent: this.desktop,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 1,
            tags: true,
            style: constants_1.UI_THEME.statusBar,
            content: ' Loading Card Lobby... ',
        });
    }
    buildWindows(callbacks) {
        const { onLobbySelect, createTableFlow, joinSelectedTable, observeSelectedTable, toggleFilters, manualRefresh, runAction } = callbacks;
        const height = this.screen.height || 24;
        const width = this.screen.width || 80;
        const topOffset = 1;
        const statusHeight = 1;
        const logHeight = 4;
        const tableHeight = height - topOffset - statusHeight;
        const mainHeight = tableHeight - logHeight;
        const minLobbyWidth = 22;
        const minTableWidth = 40;
        let leftWidth = Math.floor(width * 0.35);
        leftWidth = Math.max(minLobbyWidth, leftWidth);
        leftWidth = Math.min(leftWidth, width - minTableWidth);
        if (leftWidth < 10) {
            leftWidth = Math.max(10, width - minTableWidth);
        }
        const rightWidth = Math.max(minTableWidth, width - leftWidth);
        this.layout = {
            width,
            height,
            topOffset,
            statusHeight,
            logHeight,
            mainHeight,
            tableHeight,
            leftWidth,
            rightWidth,
        };
        this.lobbyWindow = (0, blessed_helpers_1.createBox)({
            parent: this.desktop,
            top: topOffset,
            left: 0,
            width: leftWidth,
            height: mainHeight,
            label: ' Lobby ',
            border: { type: 'line' },
            style: { border: constants_1.UI_THEME.windowBorder, bg: constants_1.UI_THEME.windowBg },
        });
        this.tableWindow = (0, blessed_helpers_1.createBox)({
            parent: this.desktop,
            top: topOffset,
            left: leftWidth,
            width: rightWidth,
            height: mainHeight,
            border: { type: 'line' },
            label: ' Table ',
            style: { border: constants_1.UI_THEME.windowBorder, bg: constants_1.UI_THEME.windowBg },
        });
        let tableListMap = {};
        this.lobbyList = (0, blessed_helpers_1.createList)({
            parent: this.lobbyWindow,
            top: 1,
            left: 1,
            right: 1,
            bottom: 2,
            wrapItems: false,
            keys: true,
            mouse: true,
            vi: true,
            tags: true,
            style: {
                fg: 'white',
                selected: { fg: 'black', bg: constants_1.UI_THEME.highlightBg },
            },
            scrollbar: {
                ch: '|',
                track: { ch: '|', bg: 'black' },
                style: { fg: constants_1.UI_THEME.accent, bg: constants_1.UI_THEME.accent },
            },
            items: [],
        });
        this.lobbyList.on('select', (_, index) => {
            onLobbySelect(index, tableListMap);
        });
        this.lobbyActions = blessed_1.default.listbar({
            parent: this.lobbyWindow,
            bottom: 0,
            left: 0,
            right: 0,
            height: 1,
            itemPadding: 1,
            itemGap: 2,
            mouse: true,
            keys: true,
            vi: true,
            autoCommandKeys: true,
            style: {
                fg: 'white',
                bg: 'blue',
                item: { fg: 'white', bg: 'blue' },
                selected: { fg: 'black', bg: 'cyan' },
            },
            items: {
                '[C]reate': { callback: () => runAction(createTableFlow), keys: ['c'] },
                '[J]oin': { callback: () => runAction(joinSelectedTable), keys: ['j'] },
                '[O]bserve': { callback: () => runAction(observeSelectedTable), keys: ['o'] },
                '[F]ilter': { callback: () => runAction(toggleFilters), keys: ['f'] },
                '[R]efresh': { callback: () => runAction(manualRefresh), keys: ['r'] },
            },
        });
        this.tableContent = blessed_1.default.scrollabletext({
            parent: this.tableWindow,
            top: 1,
            left: 1,
            right: 1,
            bottom: 1,
            tags: true,
            scrollable: true,
            alwaysScroll: true,
            keys: true,
            mouse: true,
            style: {
                fg: 'white',
            },
            content: 'Select a table to view details.',
        });
        this.tableActions = (0, blessed_helpers_1.createBox)({
            parent: this.tableWindow,
            top: 0,
            left: 1,
            right: 1,
            height: 1,
            style: { fg: 'white', bg: 'black' },
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
            border: { type: 'line', labelStyle: { fg: 'yellow' } },
            label: ' Activity ',
            tags: true,
            scrollable: true,
            alwaysScroll: true,
            style: { fg: 'white', border: constants_1.UI_THEME.windowBorder, bg: 'black' },
            scrollbar: {
                ch: '|',
                track: { ch: '|', bg: 'black' },
                style: { fg: constants_1.UI_THEME.accent, bg: constants_1.UI_THEME.accent },
            },
        });
        this.buildTablePanels();
    }
    setTableListMap(map) {
        // Method to allow setting tableListMap from outside
        // This is a workaround since the callback closure captures the local variable
    }
    buildTablePanels() {
        const panelStyle = { border: constants_1.UI_THEME.windowBorder, bg: constants_1.UI_THEME.windowBg };
        const contentStyle = { fg: 'white', bg: 'black' };
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
            border: { type: 'line', labelStyle: { fg: 'yellow' } },
            style: panelStyle,
        });
        this.flopContent = (0, blessed_helpers_1.createBox)({
            parent: this.flopPanel,
            top: 1,
            left: 1,
            right: 1,
            bottom: 1,
            tags: true,
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
            border: { type: 'line', labelStyle: { fg: 'yellow' } },
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
                track: { ch: '|', bg: 'black' },
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
            border: { type: 'line', labelStyle: { fg: 'yellow' } },
            style: panelStyle,
        });
        this.handContent = (0, blessed_helpers_1.createBox)({
            parent: this.handPanel,
            top: 1,
            left: 1,
            right: 1,
            bottom: 1,
            tags: true,
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
            border: { type: 'line', labelStyle: { fg: 'yellow' } },
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
                track: { ch: '|', bg: 'black' },
                style: scrollbarStyle,
            },
            content: '',
        });
        this.layoutTablePanels();
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
        this.flopPanel.options.top = top;
        this.flopPanel.options.left = left;
        this.flopPanel.options.width = leftWidth;
        this.flopPanel.options.height = topHeight;
        this.playersPanel.options.top = top;
        this.playersPanel.options.left = rightStart;
        this.playersPanel.options.width = rightWidth;
        this.playersPanel.options.height = topHeight;
        this.handPanel.options.top = bottomTop;
        this.handPanel.options.left = left;
        this.handPanel.options.width = leftWidth;
        this.handPanel.options.height = bottomHeight;
        this.activityPanel.options.top = bottomTop;
        this.activityPanel.options.left = rightStart;
        this.activityPanel.options.width = rightWidth;
        this.activityPanel.options.height = bottomHeight;
        this.tableActions.options.top = actionTop;
        this.tableActions.options.left = left;
        this.tableActions.options.width = innerWidth;
        this.tableActions.options.height = actionHeight;
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
            button.options.top = buttonTop;
            button.options.height = buttonHeight;
            button.options.left = left;
            button.options.width = buttonWidth;
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
        this.overlayShade = (0, blessed_helpers_1.createBox)({
            parent: this.desktop,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            hidden: true,
            style: {
                bg: 'black',
            },
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
        lines.push('{cyan-fg}Players:{/}');
        lines.push('');
        players.forEach((player, index) => {
            const isCurrent = index === currentPlayerIndex;
            const isYou = player.id === currentUserId;
            const turnMarker = isCurrent ? '{yellow-fg}\u2192{/} ' : '  ';
            const unoMarker = player.hand.length === 1 ? ' {yellow-fg}\u26A0{/}' : '';
            const youMarker = isYou ? ' {cyan-fg}(You){/}' : '';
            const botMarker = player.isBot ? ' {gray-fg}[BOT]{/}' : '';
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
        lines.push('{cyan-fg}Your Hand:{/}');
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
        lines.push('{gray-fg}Press 1-9,0 to select, Enter to play{/}');
        this.handContent.setContent(lines.join('\n'));
    }
    renderUnoActivity(lastAction, challengeWindow) {
        const lines = [];
        if (lastAction) {
            lines.push(`{cyan-fg}Last Action:{/}`);
            lines.push(lastAction);
            lines.push('');
        }
        if (challengeWindow) {
            const timeLeft = Math.max(0, Math.floor((challengeWindow.expiresAt - Date.now()) / 1000));
            const challengeType = challengeWindow.type === 'uno' ? 'UNO Challenge' : 'Wild Draw 4 Challenge';
            lines.push(`{yellow-bg}{black-fg} ${challengeType} OPEN! {/}{/}`);
            lines.push(`{yellow-fg}Time remaining: ${timeLeft}s{/}`);
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
}
exports.UIManager = UIManager;
