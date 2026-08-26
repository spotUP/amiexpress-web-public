"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TYPING_HEIGHT = void 0;
exports.createChatLog = createChatLog;
exports.updateChatHeader = updateChatHeader;
exports.addBBSEvent = addBBSEvent;
/**
 * Chat log component
 * Main chat message display area
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const menu_bar_1 = require("./menu-bar");
const status_bar_1 = require("./status-bar");
const input_box_1 = require("./input-box");
const typing_preview_1 = require("./typing-preview");
Object.defineProperty(exports, "TYPING_HEIGHT", { enumerable: true, get: function () { return typing_preview_1.TYPING_HEIGHT; } });
const theme_1 = require("./theme");
function createChatLog(screen, sidebarWidth) {
    // Create dockable panel for chat
    const screenWidth = screen.width || 80;
    const screenHeight = screen.height || 24;
    // Account for sidebar width - no additional subtraction needed
    // Sidebar is 18 chars (including its border), screen is 80, so chat panel gets 62 chars
    const chatPanelWidth = screenWidth - sidebarWidth;
    const chatPanel = new blessed_1.DockablePanel({
        parent: screen,
        title: ' Chat ',
        label: ' Chat ',
        top: menu_bar_1.MENU_HEIGHT,
        left: sidebarWidth,
        width: chatPanelWidth,
        height: screenHeight - menu_bar_1.MENU_HEIGHT - status_bar_1.STATUS_HEIGHT - input_box_1.INPUT_HEIGHT,
        dockPosition: 'float',
        showMinimizeButton: true,
        resizable: true,
        draggable: true,
        minWidth: 40,
        minHeight: 10,
        zIndex: 1,
        persistenceKey: 'chat-main',
        // The layout owns this panel's size (updateLayout gives it exactly the
        // room left over beside the sidebar). Fit-to-content defaults to ON and
        // GROWS a panel to match its widest line, so long chat messages pushed
        // the panel from 58 columns to the full 80 - straight through the
        // sidebar and off the right of the screen, taking its border with it.
        fitContent: false,
        topConstraint: menu_bar_1.MENU_HEIGHT,
        bottomConstraint: status_bar_1.STATUS_HEIGHT + input_box_1.INPUT_HEIGHT,
        border: {
            type: 'line',
            labelStyle: { fg: 'white', bg: 'blue' } // Blue background for label
        },
        style: {
            fg: 'white',
            bg: 'black',
            // style.border.fg, NOT border.fg - Element reads the border colour from
            // style.border / border.style / style.fg and ignores a colour sitting
            // on the border object itself. With it in the wrong place this panel
            // drew grey while the source said otherwise.
            border: { fg: theme_1.PANEL_BORDER },
            focus: { border: { fg: theme_1.PANEL_BORDER_FOCUS } },
        },
    });
    // Explicitly set position after creation
    chatPanel.position.left = sidebarWidth;
    chatPanel.position.top = menu_bar_1.MENU_HEIGHT;
    const panelWidth = screenWidth - sidebarWidth;
    const panelHeight = screenHeight - menu_bar_1.MENU_HEIGHT - status_bar_1.STATUS_HEIGHT - input_box_1.INPUT_HEIGHT;
    const logWidth = panelWidth - 2;
    const logHeight = panelHeight - 2;
    // Use Log widget for proper chat functionality with type safety
    const chatLog = (0, blessed_helpers_1.createLog)({
        parent: chatPanel,
        top: 0,
        left: 0,
        // Matches updateLayout(): borders plus the scrollbar column.
        width: '100%-3',
        height: '100%-2',
        label: '',
        border: { type: 'none' },
        mouse: true,
        // Out of the Tab cycle: there is nothing to DO in the log, so a stop here
        // is a dead end for keyboard users. The mouse still scrolls it.
        focusable: false,
        scrollable: true,
        alwaysScroll: true,
        scrollOnInput: true,
        scrollback: 1000,
        tags: true,
        scrollbar: {
            ch: '█',
            style: { fg: 'cyan' }
        },
        style: {
            fg: 'white',
            bg: 'black',
        },
    });
    return { panel: chatPanel, log: chatLog };
}
function updateChatHeader(chatLog, channelName) {
    chatLog.setLabel(` ${channelName} `);
}
/**
 * Add a BBS event announcement to the chat log
 */
function addBBSEvent(chatLog, formattedEvent) {
    // Add the event to the log using the Log widget's add method
    chatLog.add(formattedEvent);
}
