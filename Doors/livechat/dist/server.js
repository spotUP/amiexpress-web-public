"use strict";
/**
 * LiveChat v3.2 - Desktop-Level Multi-User Chat
 *
 * Full-featured chat with advanced neo-blessed UI:
 * - Menu bar with keyboard shortcuts
 * - Simple list for channels with selection
 * - Table view for users with columns
 * - Popup dialogs and overlays
 * - Loading spinners
 * - Mouse support everywhere
 * - Settings panel with checkboxes
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
exports.createApp = createApp;
const blessed_1 = __importStar(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const door_input_manager_1 = require("@amiexpress/bbs-door-sdk/utils/door-input-manager");
// Local helper to strip blessed tags from text
function stripTags(text) {
    return text.replace(/{[^}]+}/g, '');
}
const DoorLoader_1 = require("@amiexpress/bbs-door-sdk/utils/DoorLoader");
// Core state and services
const state_1 = require("./core/state");
const formatter_1 = require("./core/formatter");
const socket_typing_1 = require("./core/socket-typing");
const initialization_1 = require("./core/initialization");
// Services
const services_1 = require("./services");
// UI components
const typing_preview_1 = require("./ui/typing-preview");
const screen_1 = require("./ui/screen");
const menu_bar_1 = require("./ui/menu-bar");
const status_bar_1 = require("./ui/status-bar");
const input_box_1 = require("./ui/input-box");
const chat_log_1 = require("./ui/chat-log");
const disconnection_modal_1 = require("./ui/disconnection-modal");
// Overlays
const help_screen_1 = require("./overlays/help-screen");
const settings_overlay_1 = require("./overlays/settings-overlay");
const profile_overlay_1 = require("./overlays/profile-overlay");
// createDialogs now imported from SDK blessed-helpers
// Features
const input_history_1 = require("./features/input-history");
const file_sharing_1 = require("./features/file-sharing");
const drawing_canvas_1 = require("./features/drawing-canvas");
const context_menus_1 = require("./features/context-menus");
const voice_channel_ux_1 = require("./features/voice-channel-ux");
// Handlers
const room_socket_handlers_1 = require("./handlers/room-socket-handlers");
const chat_socket_handlers_1 = require("./handlers/chat-socket-handlers");
const dm_sidebar_handlers_1 = require("./handlers/dm-sidebar-handlers");
const sidebar_items_builder_1 = require("./handlers/sidebar-items-builder");
const keyboard_shortcuts_1 = require("./handlers/keyboard-shortcuts");
const bbs_event_handler_1 = require("./handlers/bbs-event.handler");
const thread_handlers_1 = require("./handlers/thread-handlers");
const thread_view_1 = require("./ui/thread-view");
const pin_handlers_1 = require("./handlers/pin-handlers");
const pinned_panel_1 = require("./ui/pinned-panel");
const pin_1 = require("./commands/pin");
const msg_thread_1 = require("./commands/msg-thread");
const search_handlers_1 = require("./handlers/search-handlers");
const search_overlay_1 = require("./ui/search-overlay");
const search_1 = require("./commands/search");
const moderation_1 = require("./commands/moderation");
const dialog_helpers_1 = require("./ui/dialog-helpers");
const command_execution_handlers_1 = require("./handlers/command-execution-handlers");
const input_submit_handler_1 = require("./handlers/input-submit-handler");
// Utils
const format_1 = require("./utils/format");
const mentions_1 = require("./utils/mentions");
const markdown_1 = require("./utils/markdown");
const emojis_1 = require("./utils/emojis");
// Emoji system
const emoji_picker_1 = require("./ui/emoji-picker");
const emoji_1 = require("./commands/emoji");
// Format picker for text formatting
const format_picker_1 = require("./ui/format-picker");
// Animation system
const animations_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed/utils/animations");
// Event filtering
const events_1 = require("./commands/events");
// Types
const types_1 = require("./types");
// Helper to invalidate coordinate cache after direct position modification
function invalidateCache(element) {
    if (!element)
        return;
    element._coordsCacheValid = false;
    if (element.children) {
        for (const child of element.children) {
            invalidateCache(child);
        }
    }
}
async function createApp(session) {
    const { bbs, socket } = session;
    // Only enable wide mode for standalone chat page, not when running inside BBS terminal
    const chatOnly = session.bbsSession?.tempData?.chatOnly;
    if (chatOnly) {
        bbs.enableWideMode?.();
    }
    // Disable modem emulation for TUI apps - they need instant feedback
    // Save original speed to restore on exit
    const originalModemSpeed = bbs.getModemSpeed?.() || 0;
    if (originalModemSpeed > 0) {
        bbs.disableModemEmulation?.();
    }
    // ========== CREATE NEO-BLESSED SCREEN ==========
    const screen = (0, screen_1.createScreen)(bbs);
    // Note: Optimized rendering is now enabled by default in the SDK
    const ctx = (0, initialization_1.initializeLiveChat)(session, screen);
    const { username, userId, nodeId, secLevel, state, registry, socketEmitter, presenceService, eventBus, audio, messageHandler, commandHandler, onlineUsers, cmdCtx } = ctx;
    let { currentRoomLabel } = ctx;
    // Room state
    const initialRoomId = session.bbsSession?.currentRoomId;
    const initialRoomName = session.bbsSession?.currentRoomName;
    // ========== INPUT HANDLING ==========
    // Use DoorInputManager for proper input routing and cleanup.
    // WEB_ 2026-04-24: enableMouse MUST be true. xterm.js in this BBS
    // already emits SGR mouse sequences regardless — if blessed's parser
    // isn't armed, those sequences are misread as keystrokes and leak to
    // the chat area as literal '[<btn;col;row;M'. Previous fix of
    // disabling the parser + filtering them out also silently dropped
    // real mouse clicks, breaking dropdown menus, context menus, and
    // video-tile right-click. Arm the parser so blessed widgets with
    // `mouse: true` (menu bar, control buttons, video tiles) receive
    // proper events.
    const inputManager = new door_input_manager_1.DoorInputManager(session, screen, {
        enableGameMode: false, // Blessed UI mode, not ncurses game mode
        enableGrabKeys: false, // Blessed focus system handles keys
        enableMouse: true, // See WEB_ note above — required for clicks
        debug: false,
        debugName: 'LiveChat'
    });
    let showHelpFn = null;
    // Enable door input FIRST (this calls setupInputHandler which installs its
    // own doorInputHandler, so we have to wrap AFTER) — if we wrapped before,
    // our SGR-mouse filter was getting silently overwritten and the browser's
    // sticky xterm mouse-reporting leaked '[<btn;col;row;M' into the status
    // bar as literal text (2026-04-24 repro).
    inputManager.enable();
    // Diagnostic: confirm mouse events are reaching blessed's screen.
    screen.on('mousedown', (event) => {
        const els = screen.getElementsAt?.(event.x, event.y) || [];
        const elNames = els.map((e) => e.options?.label || e.type || e.constructor?.name || 'unknown').slice(0, 5);
        console.log('[livechat DIAG] mousedown at', event.x, event.y, '→ elements:', JSON.stringify(elNames));
    });
    // Now wrap the handler that setupInputHandler just installed, ONLY to
    // intercept F1 (Help). Do NOT filter any other escape sequences here —
    // `\x1b[<...M/m` is the SGR mouse protocol and blessed's parser
    // (enabled above) needs to see those to route clicks.
    if (session.bbsSession) {
        const innerHandler = session.bbsSession.doorInputHandler;
        session.bbsSession.doorInputHandler = (data) => {
            if (data === '\x1bOP' || data === '\x1b[11~') {
                if (showHelpFn)
                    showHelpFn();
                return true;
            }
            return innerHandler ? innerHandler(data) : true;
        };
    }
    // ========== LOADING SCREEN ==========
    // Layout constants for 80x24 terminal
    const SIDEBAR_WIDTH = 15; // Minimum sidebar width (will auto-expand via fitContent to fit content)
    // Track which tab is active in the sidebar
    let sidebarTab = 'channels';
    // ========== MENU BAR (at top) ==========
    const menuBar = (0, menu_bar_1.createMenuBar)(screen);
    // ========== CHAT LOG (Main Area) - CREATE FIRST so it renders behind fixed UI ==========
    // Chat log fills from sidebar to right edge
    const { panel: chatPanel, log: chatLog } = (0, chat_log_1.createChatLog)(screen, SIDEBAR_WIDTH);
    // Connect animation manager to chat log (done later after animationManager is created)
    // We'll use a deferred connection pattern
    // ========== STATUS BAR (at very bottom) ==========
    const statusBar = (0, status_bar_1.createStatusBar)(screen);
    // ========== INPUT BOX (above status bar) ==========
    const inputBox = (0, input_box_1.createInputBox)(screen);
    // ========== EMOJI BUTTON (next to input box) ==========
    const emojiButton = (0, input_box_1.createEmojiButton)(screen);
    // ========== EMOJI PICKER ==========
    const emojiPicker = new emoji_picker_1.EmojiPicker(screen);
    // ========== FORMAT PICKER ==========
    const formatPicker = new format_picker_1.FormatPicker(screen);
    // ========== ANIMATION MANAGER ==========
    const animationManager = (0, animations_1.createAnimationManager)({ fps: 10 });
    // ========== CURSOR BLINK STATE ==========
    // Typing cursors blink like xterm (530ms interval)
    let cursorBlinkOn = true;
    let cursorBlinkInterval = null;
    function startCursorBlink() {
        if (cursorBlinkInterval)
            return;
        cursorBlinkInterval = setInterval(() => {
            cursorBlinkOn = !cursorBlinkOn;
            // Only rebuild if there are typing buffers to show
            if (state.typingBuffers.size > 0) {
                rebuildChatContent();
                screen.render();
            }
        }, 530); // 530ms is standard xterm blink rate
    }
    function stopCursorBlink() {
        if (cursorBlinkInterval) {
            clearInterval(cursorBlinkInterval);
            cursorBlinkInterval = null;
        }
    }
    // Connect animation manager to chat log
    animationManager.connect({
        getLineContent: (idx) => chatLog.getLine(idx),
        setLineContent: (idx, content) => chatLog.setLine?.(idx, content),
        render: () => screen.render(),
        getVisibleRange: () => chatLog.getVisibleRange?.() || { start: 0, end: 100 },
    });
    // Wire up emoji button to show emoji picker
    emojiButton.on('press', () => {
        audio.playSound('click');
        if (!emojiPicker.isVisible()) {
            emojiPicker.show(screen, (emoji) => {
                const currentText = inputBox.getValue();
                inputBox.setValue(currentText + emoji.code + ' ');
                inputBox.focus();
                screen.render();
            }, () => {
                inputBox.focus();
                screen.render();
            });
        }
    });
    emojiButton.on('mouseenter', () => {
        audio.playSound('hover');
    });
    const inputHistory = (0, input_history_1.createInputHistory)(screen, inputBox);
    // ========== CHANNEL LIST (Left Sidebar) ==========
    // ========== COMMAND AUTOCOMPLETE ==========
    const commandSuggestions = (0, blessed_helpers_1.createList)({
        parent: screen,
        bottom: status_bar_1.STATUS_HEIGHT + input_box_1.INPUT_HEIGHT, // Position above input box
        left: 0,
        width: '100%',
        height: 10,
        label: ' Commands ',
        border: 'line',
        hidden: true,
        ch: ' ',
        mouse: true,
        clickable: true,
        keys: true,
        vi: true,
        style: {
            fg: 'cyan',
            bg: 'black',
            // Selected line: white text on cyan bg. The previous black-on-cyan
            // was unreadable on terminals that render dark fg on saturated bg
            // identically (or where the selection bar inherited the fg from
            // the base style and produced cyan-on-cyan).
            selected: { fg: 'white', bg: 'cyan' },
            border: { fg: 'yellow' },
        },
        scrollbar: {
            ch: ' ',
        },
        // @ts-ignore - zIndex exists but not in types
        zIndex: 10000,
    });
    // Ghost text overlay for inline completion preview
    const ghostText = (0, blessed_helpers_1.createBox)({
        parent: screen, // Parent to screen to avoid panel clipping
        bottom: status_bar_1.STATUS_HEIGHT + 1, // Align with input field content
        left: 10,
        width: 70,
        height: 1,
        focusable: false,
        mouse: false,
        clickable: false,
        tags: true,
        content: '',
        style: {
            fg: 'gray',
            bg: 'black',
        },
        // @ts-ignore - zIndex exists but not in types
        zIndex: 6000, // Above input box (5000) but below command suggestions (10000)
    });
    ghostText.hide();
    // Set high z-index to appear above other elements
    commandSuggestions.setIndex(1000);
    ghostText.setIndex(600);
    let commandSuggestionsVisible = false;
    let filteredCommands = [];
    let currentGhostCompletion = ''; // Track the current ghost text completion
    function showCommandSuggestions(input) {
        // Get all commands from registry
        const allCommands = registry.getAll();
        // Filter commands based on input (after the /)
        const searchTerm = input.slice(1).toLowerCase(); // Remove leading /
        filteredCommands = allCommands.filter(cmd => cmd.name.toLowerCase().startsWith(searchTerm) ||
            cmd.description.toLowerCase().includes(searchTerm)).sort((a, b) => {
            // Prioritize exact name matches
            const aNameMatch = a.name.toLowerCase().startsWith(searchTerm);
            const bNameMatch = b.name.toLowerCase().startsWith(searchTerm);
            if (aNameMatch && !bNameMatch)
                return -1;
            if (!aNameMatch && bNameMatch)
                return 1;
            return a.name.localeCompare(b.name);
        });
        if (filteredCommands.length === 0) {
            commandSuggestions.hide();
            ghostText.hide();
            commandSuggestionsVisible = false;
            currentGhostCompletion = '';
            // Release navigation key suppression
            inputBox.suppressNavigationKeys = false;
            screen.render();
            return;
        }
        // Format command items with name, usage, and description
        const chatWidth = screen.width || 80;
        const nameWidth = 12;
        const usageWidth = 20;
        const descWidth = Math.max(10, chatWidth - nameWidth - usageWidth - 6);
        const items = filteredCommands.map(cmd => {
            const name = cmd.name.padEnd(nameWidth).slice(0, nameWidth);
            const usage = (cmd.usage || '').padEnd(usageWidth).slice(0, usageWidth);
            const desc = (cmd.description || '').slice(0, descWidth);
            // Don't hardcode `{cyan-fg}` for the slash-name -- blessed's tag
            // parser respects the latest color tag, so an inline cyan-fg
            // overrides the List's `selected: { fg: 'white' }` wrapper and
            // keeps the name cyan-on-cyan (invisible) when the row is the
            // current selection. Let the base style's `fg: 'cyan'` colour the
            // name on non-selected rows and the selected style's white-fg
            // take over when highlighted.
            return `/${name} {gray-fg}${usage}{/gray-fg} ${desc}`;
        });
        // Ensure list width is updated to match screen
        commandSuggestions.position.width = chatWidth;
        commandSuggestions.position.left = 0;
        // Update items using List's setItems method
        commandSuggestions.setItems(items);
        commandSuggestions.select(0);
        // Invalidate caches to ensure clean render
        invalidateCache(inputBox);
        invalidateCache(commandSuggestions);
        commandSuggestions.show();
        commandSuggestions.setFront();
        commandSuggestionsVisible = true;
        // Suppress navigation keys in input so arrow keys navigate the list
        inputBox.suppressNavigationKeys = true;
        // Force focus back on the input. setFront() can shuffle z-order and
        // updateTypingPreview() (called from the same keystroke handler that
        // triggered this code path via the chain processKeystroke ->
        // rebuildChatContent -> chatLog.setContent) can cause blessed to
        // re-evaluate focus. Without this users see the channelList stay
        // focused -- arrow keys then scroll the sidebar instead of navigating
        // the suggestions list.
        inputBox.focus();
        // Re-focus on the next tick too. Any focus shift queued by a render
        // pass that runs between now and the next event-loop tick gets
        // reverted, so the suggestion-navigation keypress handler at the
        // bottom of this file reliably fires for up/down.
        setImmediate(() => {
            if (commandSuggestionsVisible) {
                inputBox.focus();
                screen.render();
            }
        });
        // Show ghost text for top match (Claude-style inline completion)
        if (filteredCommands.length > 0 && searchTerm.length > 0) {
            const topMatch = filteredCommands[0];
            const topMatchName = topMatch.name.toLowerCase();
            // Only show ghost text if top match starts with search term (exact prefix match)
            if (topMatchName.startsWith(searchTerm)) {
                // Calculate the remaining text that hasn't been typed
                const typedPortion = searchTerm;
                const remainingPortion = topMatchName.slice(searchTerm.length);
                // Store the full completion for use when Tab/Enter is pressed
                currentGhostCompletion = topMatch.name;
                // Position ghost text after the typed characters
                // Input format is "/{typed}" so position is at "/" (1 char) + typed length
                const cursorOffset = 1 + typedPortion.length;
                ghostText.position.left = cursorOffset;
                // Build content: typed portion in white, remaining in gray
                // TEMPORARILY DISABLED: Ghost text causes blessed coordinate corruption
                // ghostText.setContent(`{white-fg}${typedPortion}{/white-fg}{gray-fg}${remainingPortion}{/gray-fg}`);
                // ghostText.show();
                // ghostText.setFront();
            }
            else {
                // No exact prefix match - hide ghost text
                ghostText.hide();
                currentGhostCompletion = '';
            }
        }
        else {
            ghostText.hide();
            currentGhostCompletion = '';
        }
        screen.render();
    }
    function hideCommandSuggestions() {
        if (commandSuggestionsVisible) {
            commandSuggestions.hide();
            ghostText.hide();
            commandSuggestionsVisible = false;
            currentGhostCompletion = '';
            // Release navigation key suppression
            inputBox.suppressNavigationKeys = false;
            // Invalidate caches to force clean redraw and prevent border artifacts
            invalidateCache(commandSuggestions);
            invalidateCache(inputBox);
            invalidateCache(ghostText);
            screen.render();
        }
    }
    function selectCommandSuggestion() {
        const selected = commandSuggestions.selected;
        if (selected !== undefined && filteredCommands[selected]) {
            const cmd = filteredCommands[selected];
            // Insert command name with a space
            inputBox.setValue(`/${cmd.name} `);
            inputBox.focus();
            hideCommandSuggestions();
            screen.render();
        }
    }
    // Handle command suggestion navigation
    commandSuggestions.key(['up', 'k'], () => {
        commandSuggestions.up(1);
        screen.render();
    });
    commandSuggestions.key(['down', 'j'], () => {
        commandSuggestions.down(1);
        screen.render();
    });
    commandSuggestions.key(['enter'], () => {
        selectCommandSuggestion();
    });
    commandSuggestions.key(['escape'], () => {
        hideCommandSuggestions();
        inputBox.focus();
    });
    // ========== SIDEBAR PANEL (Left side) ==========
    const sidebarPanel = new blessed_1.DockablePanel({
        parent: screen,
        title: ' Sidebar ',
        label: ' Sidebar ',
        top: menu_bar_1.MENU_HEIGHT,
        left: 0,
        width: SIDEBAR_WIDTH,
        minWidth: 12, // Minimum usable width for "# general"
        maxWidth: 35, // Max 35 chars to leave room for chat (80 - 35 = 45 chars for chat)
        bottom: status_bar_1.STATUS_HEIGHT + input_box_1.INPUT_HEIGHT,
        dockPosition: 'left',
        resizable: chatOnly ? true : false,
        draggable: chatOnly ? true : false,
        zIndex: 1,
        topConstraint: menu_bar_1.MENU_HEIGHT,
        bottomConstraint: status_bar_1.STATUS_HEIGHT + input_box_1.INPUT_HEIGHT,
        border: { type: 'line', fg: 'cyan' },
        fitContent: { width: true, height: false }, // Auto-expand width to fit content dynamically
        style: {
            fg: 'white',
            bg: 'black',
        },
    });
    // ========== CHANNEL LIST (Inside Sidebar) ==========
    const channelList = (0, blessed_helpers_1.createList)({
        parent: sidebarPanel,
        top: 0,
        left: 0,
        width: '100%-2',
        height: '100%-2',
        label: ' [Ch] Us ', // Tabs: [active] inactive
        border: { type: 'none' },
        style: {
            fg: 'white',
            // NOTE: Don't use widget-level 'hover' or 'selected' - those apply to WHOLE widget
            // Use 'item.hover' and 'item.selected' for per-item styling
            item: {
                hover: { fg: 'yellow', bg: 'blue' },
                selected: { fg: 'white', bg: 'blue' },
            },
        },
        tags: true, // CRITICAL: Enable tag parsing for colored channel names
        mouse: true,
        clickable: true, // Enable click events
        keys: true,
        vi: true,
        scrollable: true,
        alwaysScroll: true,
        scrollbar: {
            ch: '█'
        },
        items: [],
    });
    channelList.on('mouseenter', () => {
        audio.playSound('hover');
    });
    // Default channels to show when server hasn't responded
    const defaultChannels = [
        { id: 'general', name: 'general', type: 'public' },
        { id: 'random', name: 'random', type: 'public' },
        { id: 'help', name: 'help', type: 'public' },
    ];
    // Track channel data for selection handling
    let channelItems = [];
    // Per-channel expand state.
    //   - `expandedChannels`: user explicitly expanded this channel (even
    //     when it's not the active one)
    //   - `collapsedChannels`: user explicitly collapsed this channel —
    //     needed so the active channel (which auto-expands) can still be
    //     forced closed by a second double-click.
    const expandedChannels = new Set();
    const collapsedChannels = new Set();
    function isCurrentChannel(targetId, targetName) {
        if (!state.currentChannel)
            return false;
        if (targetId && state.currentChannel === targetId)
            return true;
        if (targetName && state.currentChannel === targetName)
            return true;
        if (targetName && currentRoomLabel && currentRoomLabel === targetName)
            return true;
        return false;
    }
    // Initialize channel list data
    function updateChannelList() {
        // Use state channels if available, otherwise show defaults
        const channelsToShow = state.channels.length > 0 ? state.channels : defaultChannels.map(c => ({
            ...c,
            displayName: c.name,
            topic: '',
            createdBy: 'system',
            createdAt: new Date(),
            memberCount: 0,
            unreadCount: 0,
        }));
        // Build sidebar rows via the pure builder. Keeps server.ts under
        // the 2000-line limit and lets the row layout be unit-tested.
        const built = (0, sidebar_items_builder_1.buildSidebarItems)({
            channelsToShow,
            state,
            onlineUsers,
            presenceService,
            presenceIndicators: types_1.PRESENCE_INDICATORS,
            isCurrentChannel,
            expandedChannels,
            collapsedChannels,
            voiceChannelService: voiceChannel,
        });
        channelItems = built.channelItems;
        // Debug: show what items we're setting and calculate expected width
        channelList.setItems(built.items);
        // CRITICAL: Force screen render before fitToContent so blessed populates internal state
        if (screen) {
            screen.render();
        }
        sidebarPanel.fitToContent();
        // CRITICAL: Force list to update its width based on parent panel
        // When panel expands, child list doesn't auto-recalculate '100%-2' width
        const newListWidth = sidebarPanel.width - 2; // Panel width minus borders
        channelList.width = newListWidth;
        channelList.position.width = newListWidth;
        // Invalidate blessed's internal cache to force re-layout
        if (channelList._clines) {
            delete channelList._clines;
        }
        if (channelList._pclines) {
            delete channelList._pclines;
        }
        // CRITICAL: Force coordinate recalculation
        if (typeof channelList._invalidateCoords === 'function') {
            channelList._invalidateCoords();
        }
        // Re-render to apply new width
        screen.render();
        // Select active row: prefer the DM thread when the user is in DM context,
        // otherwise the active text channel.
        let currentIdx = -1;
        if (state.currentDmThread) {
            currentIdx = channelItems.findIndex(ch => ch.type === 'dm' && ch.id === state.currentDmThread);
        }
        if (currentIdx < 0) {
            currentIdx = channelItems.findIndex(ch => ch.type === 'text' && ch.id === state.currentChannel);
        }
        if (currentIdx >= 0) {
            channelList.select(currentIdx);
        }
        screen.render();
    }
    // Track last selected channel to detect changes
    let lastSelectedChannelIndex = -1;
    // Auto-join channel when selection changes (navigation)
    function joinSelectedChannel() {
        const index = channelList.selected || 0;
        if (index !== lastSelectedChannelIndex && index >= 0 && index < channelItems.length) {
            lastSelectedChannelIndex = index;
            const channel = channelItems[index];
            // Skip headers and spacers
            if (!channel || channel.type === 'header' || channel.type === 'spacer') {
                return;
            }
            if (channel.type === 'voice') {
                // Join voice channel
                const channelId = channel.id.replace('voice-', '');
                voiceChannel.joinVoiceChannel(channelId);
                voiceChannel.showGrid();
            }
            else if (!isCurrentChannel(channel.id, channel.name)) {
                // Join text channel
                if (state.currentChannel)
                    socket.emit('room:leave');
                socket.emit('room:join', { roomName: channel.name });
                voiceChannel.hideGrid();
            }
        }
    }
    // Handle channel selection - shared logic for both click and Enter
    function handleChannelSelect(index) {
        const channel = channelItems[index];
        // Skip headers and spacers
        if (!channel || channel.type === 'header' || channel.type === 'spacer') {
            return;
        }
        if (channel.type === 'user') {
            // Clicking a user row under an expanded channel opens a DM prompt.
            if (channel.username && channel.username !== username) {
                showDMPrompt(channel.username);
            }
            return;
        }
        if (channel.type === 'dm') {
            // Switch into a DM thread context.
            // Leave any current text room (so room:message no longer routes there)
            // and ask the server for the thread history.
            if (state.currentDmThread === channel.id) {
                // Already active — no-op, just keep focus on input.
                inputBox.focus();
                return;
            }
            if (state.currentChannel)
                socket.emit('room:leave');
            (0, state_1.setDmContext)(state, channel.id);
            // Wipe what's on screen so the previous channel's chat doesn't leak.
            try {
                chatLog.setContent('');
            }
            catch { /* ignore */ }
            voiceChannel.hideGrid();
            addSystemMessage(`{cyan-fg}--- DM with ${channel.name} ---{/cyan-fg}`);
            socket.emit('chat:dm-history', { threadId: channel.id, limit: 50 });
            updateChannelList();
            updateStatusBar();
            inputBox.focus();
            return;
        }
        if (channel.type === 'voice') {
            // Join voice channel
            const channelId = channel.id.replace('voice-', '');
            voiceChannel.joinVoiceChannel(channelId);
            voiceChannel.showGrid(); // Show the video grid
            addSystemMessage(`Joining voice channel: ${channel.name}`);
        }
        else if (!isCurrentChannel(channel.id, channel.name)) {
            // Join text channel — joining auto-expands the user list underneath.
            if (state.currentDmThread)
                (0, state_1.clearDmContext)(state);
            if (state.currentChannel)
                socket.emit('room:leave');
            socket.emit('room:join', { roomName: channel.name });
            voiceChannel.hideGrid(); // Hide video grid when viewing text
        }
        else {
            // Click on the channel we're already in. Two meaningful actions:
            //   1. If the video grid is covering the chat (we're in voice),
            //      hide it to return the user to the text-chat view. This is
            //      the "click general to go back to chat" reflex.
            //   2. Otherwise, toggle the expand/collapse state of this
            //      channel's member list.
            if (voiceChannel?.isGridVisible?.()) {
                voiceChannel.hideGrid();
            }
            else {
                const id = channel.id;
                const currentlyExpanded = collapsedChannels.has(id) ? false : true;
                if (currentlyExpanded) {
                    expandedChannels.delete(id);
                    collapsedChannels.add(id);
                }
                else {
                    collapsedChannels.delete(id);
                    expandedChannels.add(id);
                }
                updateChannelList();
            }
        }
        // Return focus to input after text channel selection only
        if (channel.type !== 'voice') {
            inputBox.focus();
        }
    }
    // Handle channel selection with Enter key or click (blessed emits 'select' for both)
    channelList.on('select', (_item, index) => {
        handleChannelSelect(index);
    });
    // Navigation keys just move selection, don't auto-join
    channelList.key(['up', 'down', 'home', 'end', 'pageup', 'pagedown'], () => {
        screen.render();
    });
    // Escape from channel list returns to input
    channelList.key(['escape'], () => {
        inputBox.focus();
        screen.render();
    });
    // ========== USER LIST (Inside Sidebar - same position as channels) ==========
    const userList = (0, blessed_helpers_1.createList)({
        parent: sidebarPanel,
        top: 0,
        left: 0,
        width: '100%-2',
        height: '100%-2',
        label: ' Ch [Us] ', // Tabs: inactive [active]
        border: { type: 'none' },
        mouse: true,
        clickable: true, // Enable click events
        interactive: true, // Enable interactive selection
        keys: true, // Enable arrow key navigation
        vi: true, // j/k for up/down
        scrollable: true,
        tags: true,
        hidden: true, // Hidden by default, channels shown first
        style: {
            fg: 'white',
            // NOTE: Don't use widget-level 'hover' or 'selected' - those apply to WHOLE widget
            // Use 'item.hover' and 'item.selected' for per-item styling
            item: {
                hover: { fg: 'yellow', bg: 'magenta' },
                selected: { fg: 'black', bg: 'magenta' },
            },
        },
    });
    function updateUserTable() {
        const items = [];
        // Simpler format for narrower sidebar
        for (const [uid, u] of onlineUsers) {
            const presence = presenceService.get(parseInt(uid));
            const status = presence?.status || u.status;
            const indicator = types_1.PRESENCE_INDICATORS[status] || '*';
            const name = u.username.slice(0, 12);
            items.push(`${indicator} ${name}`);
        }
        userList.setItems(items);
        // Keep tabs in label
        userList.setLabel(` Ch [Us] (${onlineUsers.size}) `);
        // Also refresh the channel list — expanded channels render their
        // members inline, so a user joining/leaving must redraw both views.
        if (typeof updateChannelList === 'function')
            updateChannelList();
    }
    // Function to switch sidebar tabs
    function switchSidebarTab(tab) {
        sidebarTab = tab;
        if (tab === 'channels') {
            userList.hide();
            channelList.show();
        }
        else {
            channelList.hide();
            userList.show();
        }
        screen.render();
    }
    // Handle user selection for DM
    userList.on('select', (item, index) => {
        const text = typeof item === 'string' ? item : item.content || '';
        // Format is "* username" - extract username
        const match = text.match(/^.\s+(\S+)/);
        if (match) {
            const targetUser = match[1];
            if (targetUser && targetUser !== username) {
                showUserProfile(targetUser);
            }
        }
    });
    // Escape from user list returns to input
    userList.key(['escape'], () => {
        inputBox.focus();
        screen.render();
    });
    // Typing preview - now integrated into chat log (not a separate bar)
    // Keep the typingBar element for layout compatibility but hide it
    const typingBar = (0, blessed_helpers_1.createBox)({
        parent: screen,
        bottom: status_bar_1.STATUS_HEIGHT + input_box_1.INPUT_HEIGHT, // Above input box
        left: SIDEBAR_WIDTH,
        right: 0,
        height: chat_log_1.TYPING_HEIGHT,
        tags: true,
        focusable: false,
        mouse: false,
        clickable: false,
        style: {
            fg: 'cyan',
            bg: 'black',
        },
        content: '',
        hidden: true, // Hide since typing previews are now in chat log
    });
    // ========== RESPONSIVE LAYOUT ==========
    // Dynamic layout engine that handles screen resize, sidebar drag/resize, and docking
    let lastGeom = '';
    let geomProbed = false;
    function updateLayout() {
        const width = screen.width;
        const height = screen.height;
        // Validate dimensions
        if (!width || !height || width <= 0 || height <= 0 || !isFinite(width) || !isFinite(height)) {
            return;
        }
        // Calculate available space
        const menuHeight = menu_bar_1.MENU_HEIGHT;
        const footerHeight = status_bar_1.STATUS_HEIGHT + input_box_1.INPUT_HEIGHT;
        const contentHeight = height - menuHeight - footerHeight;
        // Sidebar state
        const sidebarVisible = !sidebarPanel.hidden;
        const sidebarDock = sidebarPanel.getDockPosition();
        const sidebarW = sidebarVisible ? sidebarPanel.width : 0;
        // 1. Sidebar Panel Layout
        // We only force dimensions/position if docked. Floating panels manage themselves.
        if (sidebarVisible) {
            if (sidebarDock === 'left') {
                sidebarPanel.position.left = 0;
                sidebarPanel.position.top = menuHeight;
                sidebarPanel.position.height = contentHeight;
            }
            else if (sidebarDock === 'right') {
                sidebarPanel.position.left = width - sidebarW;
                sidebarPanel.position.top = menuHeight;
                sidebarPanel.position.height = contentHeight;
            }
            else if (sidebarDock === 'top') {
                // If docked top, we might need to adjust contentHeight, but let's keep it simple for now
                // sidebarPanel.position.top = menuHeight;
            }
        }
        // 2. Chat Panel Layout
        let chatLeft = 0;
        let chatWidth = width;
        if (sidebarVisible) {
            if (sidebarDock === 'left') {
                chatLeft = sidebarW;
                chatWidth = width - sidebarW;
            }
            else if (sidebarDock === 'right') {
                chatLeft = 0;
                chatWidth = width - sidebarW;
            }
            // If floating or top/bottom, chat takes full width (sidebar floats on top)
        }
        chatPanel.position.left = chatLeft;
        chatPanel.position.top = menuHeight;
        chatPanel.position.width = chatWidth;
        chatPanel.position.height = contentHeight;
        // 3. Inner Chat Log Layout
        // chatWidth - 3, not - 2: the panel's two border columns plus one column
        // for the scrollbar, which Element draws at the log's own last column.
        chatLog.position.width = Math.max(1, chatWidth - 3);
        chatLog.position.height = Math.max(1, contentHeight - 2);
        // 4. Footer & Overlays
        statusBar.position.width = width;
        inputBox.position.width = width - input_box_1.EMOJI_BUTTON_WIDTH;
        emojiButton.position.left = width - input_box_1.EMOJI_BUTTON_WIDTH;
        menuBar.element.position.width = width;
        // Command suggestions
        commandSuggestions.width = width;
        commandSuggestions.position.width = width;
        ghostText.position.width = width;
        if (commandSuggestionsVisible) {
            commandSuggestions.setFront();
            ghostText.setFront();
        }
        // Typing bar (hidden but updated)
        typingBar.position.left = chatLeft;
        typingBar.position.width = chatWidth;
        // Geometry diagnostics: the chat panel's right border went missing at
        // 80x25 and the factory geometry reproduces correctly in isolation, so
        // the live numbers are what differ. This door runs CLIENT-side, so the
        // only place the numbers are readable is the chat log itself.
        // The COMPUTED coords decide the border, not position.width: the right
        // vertical is a single write at xl-1 guarded by `< screen.width`, while
        // the horizontals loop `x < xl` and skip out-of-range columns - so an xl
        // one past the screen loses only the right vertical, which is the exact
        // symptom.
        const pc = chatPanel._getCoords?.() ?? chatPanel.lpos;
        const lc = chatLog._getCoords?.() ?? chatLog.lpos;
        const geom = `[geom] scr=${width}x${height} sb(${sidebarDock},vis=${sidebarVisible},w=${sidebarW}) chat(l=${chatLeft},w=${chatWidth},rw=${chatPanel.width},xi=${pc?.xi},xl=${pc?.xl}) log(w=${chatWidth - 3},rw=${chatLog.width},xi=${lc?.xi},xl=${lc?.xl})`;
        if (geom !== lastGeom) {
            lastGeom = geom;
            console.log(`[LiveChat/geom] ${geom}`);
            try {
                chatLog.add(`{yellow-fg}${geom}{/yellow-fg}`);
            }
            catch { /* log not ready during first layout */ }
        }
        // One-shot buffer probe: is the panel's right border actually IN the
        // buffer at column xl-1, or is it lost between buffer and terminal? The
        // coords say it should be at 79 and nothing overlaps it, so this settles
        // which half of the pipeline to fix.
        if (!geomProbed) {
            geomProbed = true;
            setTimeout(() => {
                try {
                    const buf = screen.buffer;
                    const last = screen.lastBuffer;
                    const rows = [3, 6, 10];
                    for (const y of rows) {
                        if (!buf?.[y])
                            continue;
                        const cells = (b) => [76, 77, 78, 79]
                            .map(x => `${x}:${JSON.stringify(b?.[y]?.[x]?.[1] ?? null)}`).join(' ');
                        console.log(`[LiveChat/buf] row=${y} buffer[ ${cells(buf)} ] last[ ${cells(last)} ]`);
                    }
                }
                catch (err) {
                    console.log('[LiveChat/buf] probe failed:', err);
                }
            }, 2500);
        }
        // 5. Invalidate Caches
        invalidateCache(sidebarPanel);
        invalidateCache(chatPanel);
        invalidateCache(chatLog);
        invalidateCache(statusBar);
        invalidateCache(inputBox);
        invalidateCache(emojiButton);
        invalidateCache(menuBar.element);
        invalidateCache(commandSuggestions);
        invalidateCache(ghostText);
        invalidateCache(typingBar);
        screen.render();
    }
    // Lay the panels out ONCE, now.
    //
    // updateLayout() was only ever reached from a panel event or from the
    // resize handler, so the door depended on a resize arriving after it
    // started. When the terminal settles its size before the door opens -
    // which is what it does now - that event never comes, the panels keep the
    // positions they were constructed with, and the whole UI renders on top of
    // itself (reported live 2026-08-25 with screenshots, in both the in-BBS
    // door and the standalone /chat page). A door has to lay itself out
    // without waiting to be told the size changed.
    updateLayout();
    // Bind layout updates to sidebar events
    sidebarPanel.on('drag', updateLayout);
    sidebarPanel.on('resize', updateLayout);
    sidebarPanel.on('dock', updateLayout);
    sidebarPanel.on('hide', updateLayout);
    sidebarPanel.on('show', updateLayout);
    // UI sounds for panel events
    sidebarPanel.on('dock', () => audio.playSound('dock'));
    sidebarPanel.on('minimize', () => audio.playSound('minimize'));
    sidebarPanel.on('maximize', () => audio.playSound('maximize'));
    chatPanel.on('dock', () => audio.playSound('dock'));
    chatPanel.on('minimize', () => audio.playSound('minimize'));
    chatPanel.on('maximize', () => audio.playSound('maximize'));
    // ========== MOBILE CAROUSEL (for small screens) ==========
    let mobileMode = false;
    // Create mobile carousel for swipe navigation between sidebar and chat
    const mobileCarousel = new blessed_1.MobileCarousel({
        parent: screen,
        top: menu_bar_1.MENU_HEIGHT,
        left: 0,
        width: '100%',
        height: screen.height - menu_bar_1.MENU_HEIGHT - status_bar_1.STATUS_HEIGHT - input_box_1.INPUT_HEIGHT,
        tabLabels: ['Sidebar', 'Chat'], // Tab labels for navigation bar
        showTabBar: true, // Show clickable tab bar at top
        showIndicators: true, // Show page dots at bottom
        swipeable: true,
        controlKeys: true,
        swipeThreshold: 3, // Low threshold for easy swiping
        hidden: true, // Start hidden, only show on mobile breakpoint
        style: {
            fg: 'white',
            bg: 'black',
        },
        onPageChange: (page, _panel) => {
            audio.playSound('click');
        },
    });
    // Track saved panel states for restoring after mobile mode
    let savedSidebarParent = null;
    let savedChatParent = null;
    let savedSidebarPosition = null;
    let savedChatPosition = null;
    function enterMobileMode() {
        if (mobileMode)
            return;
        console.log(`[LiveChat/layout] enterMobileMode at ${screen.width}x${screen.height}`);
        mobileMode = true;
        // Save current panel parents and positions
        savedSidebarParent = sidebarPanel.parent;
        savedChatParent = chatPanel.parent;
        savedSidebarPosition = {
            top: sidebarPanel.position.top,
            left: sidebarPanel.position.left,
            width: sidebarPanel.position.width,
            height: sidebarPanel.position.height,
        };
        savedChatPosition = {
            top: chatPanel.position.top,
            left: chatPanel.position.left,
            width: chatPanel.position.width,
            height: chatPanel.position.height,
        };
        // Detach panels from screen
        sidebarPanel.detach();
        chatPanel.detach();
        // Reset panel positions for carousel
        sidebarPanel.position.top = 0;
        sidebarPanel.position.left = 0;
        chatPanel.position.top = 0;
        chatPanel.position.left = 0;
        // Add panels to carousel with labels
        mobileCarousel.addPanel(sidebarPanel, 'Sidebar');
        mobileCarousel.addPanel(chatPanel, 'Chat');
        // Show panels (they were detached, carousel will manage visibility)
        sidebarPanel.show();
        chatPanel.show();
        // Show carousel starting on chat page (index 1)
        mobileCarousel.show();
        mobileCarousel.showPage(1); // Start on Chat tab
        // Update carousel height
        const contentHeight = screen.height - menu_bar_1.MENU_HEIGHT - status_bar_1.STATUS_HEIGHT - input_box_1.INPUT_HEIGHT;
        mobileCarousel.position.height = contentHeight;
        screen.render();
    }
    function exitMobileMode() {
        if (!mobileMode)
            return;
        console.log(`[LiveChat/layout] exitMobileMode at ${screen.width}x${screen.height}`);
        mobileMode = false;
        // Hide carousel
        mobileCarousel.hide();
        // Remove panels from carousel
        mobileCarousel.removePanel(sidebarPanel);
        mobileCarousel.removePanel(chatPanel);
        // Re-attach panels to screen
        screen.append(sidebarPanel);
        screen.append(chatPanel);
        // Restore saved positions
        if (savedSidebarPosition) {
            sidebarPanel.position.top = savedSidebarPosition.top;
            sidebarPanel.position.left = savedSidebarPosition.left;
            sidebarPanel.position.width = savedSidebarPosition.width;
            sidebarPanel.position.height = savedSidebarPosition.height;
        }
        if (savedChatPosition) {
            chatPanel.position.top = savedChatPosition.top;
            chatPanel.position.left = savedChatPosition.left;
            chatPanel.position.width = savedChatPosition.width;
            chatPanel.position.height = savedChatPosition.height;
        }
        // Show both panels
        sidebarPanel.show();
        chatPanel.show();
        // Run normal layout
        updateLayout();
    }
    // Handle terminal resize
    screen.responsiveLayout.onResize((width, height) => {
        const breakpoint = screen.responsiveLayout.getBreakpoint();
        if (breakpoint === 'small') {
            // Switch to mobile carousel mode
            enterMobileMode();
            // Update carousel dimensions
            const contentHeight = height - menu_bar_1.MENU_HEIGHT - status_bar_1.STATUS_HEIGHT - input_box_1.INPUT_HEIGHT;
            mobileCarousel.position.height = contentHeight;
            screen.render();
        }
        else {
            // Exit mobile mode if we were in it
            if (mobileMode) {
                exitMobileMode();
            }
            else {
                updateLayout();
            }
        }
    });
    function getChannelDisplayName(channelId) {
        if (!channelId)
            return '';
        if (channelId === state.currentChannel && currentRoomLabel) {
            return currentRoomLabel;
        }
        if (initialRoomId && channelId === initialRoomId && initialRoomName) {
            return initialRoomName;
        }
        // Validate state.channels exists before calling .find()
        if (!state || !state.channels || !Array.isArray(state.channels)) {
            return channelId;
        }
        const match = state.channels.find(ch => ch.id === channelId || ch.name === channelId);
        if (match)
            return match.name;
        return channelId;
    }
    // Track the current video render mode so we can include it in the chat
    // header. Seeded to 'halfblock' (default); updated by onRenderModeChange.
    let currentRenderMode = 'halfblock';
    function updateChatHeader() {
        const channelName = getChannelDisplayName(state.currentChannel) || 'Lobby';
        const inVoice = !!(voiceChannel && voiceChannel.isInVoiceChannel?.());
        const modeSuffix = inVoice ? ` [${currentRenderMode.toUpperCase()}]` : '';
        const fullLabel = ` ${channelName}${modeSuffix} `;
        // Inner Log label (chatLog is borderless, label rarely visible).
        (0, chat_log_1.updateChatHeader)(chatLog, channelName + modeSuffix);
        // Outer DockablePanel label — this is what the user actually sees
        // across the top of the chat panel border.
        if (chatPanel && chatPanel.setLabel) {
            chatPanel.setLabel(fullLabel);
            chatPanel.screen?.render?.();
        }
    }
    function updateStatusBar() {
        (0, status_bar_1.updateStatusBar)(statusBar, state, presenceService, username, userId, nodeId, getChannelDisplayName, updateChatHeader);
    }
    // Escape on the menu bar (with no dropdown open) returns to where typing
    // happens, so the menus are enterable AND leavable from the keyboard.
    menuBar.element.on('exit', () => {
        inputBox.focus();
        screen.render();
    });
    // ========== FOCUS BORDERS ==========
    // NOTE: Active panel borders (white on focus) are now handled automatically by SDK!
    // No need for manual focus handlers - the SDK's screen.setFocused() method
    // automatically changes border colors: white for focused, original color for blurred.
    // This applies to all panels: inputBox, channelList, userList, and chatLog.
    // ========== POPUP DIALOGS ==========
    // Note: Dialog widgets (Message, Prompt, Question) have built-in fixed heights.
    // Don't pass height: 'shrink' as it breaks nested element rendering.
    const { modalOverlay, showModal, hideModal: originalHideModal, messageDialog, promptDialog, questionDialog, showMessageDialog, showPromptDialog, showConfirmDialog } = (0, blessed_helpers_1.createDialogs)(screen, inputBox);
    // Wrap hideModal to restore commandSuggestions z-order after hiding modals
    const hideModal = (widget) => {
        originalHideModal(widget);
        // If commandSuggestions is visible, restore it to front
        // This ensures it stays above modals that called setFront()
        if (!commandSuggestions.hidden && commandSuggestionsVisible) {
            commandSuggestions.setFront();
            ghostText.setFront();
        }
    };
    // Password dialog for private rooms
    const passwordOverlay = (0, blessed_helpers_1.createBox)({
        parent: screen,
        top: 'center',
        left: 'center',
        width: '50%',
        height: 8,
        label: ' Enter Room Password ',
        border: { type: 'line' },
        shadow: true,
        hidden: true,
        ch: ' ',
        style: {
            fg: 'white',
            bg: 'black',
            border: { fg: 'red' },
        },
        trapFocus: true,
    });
    const passwordInput = blessed_1.default.passbox({
        parent: passwordOverlay,
        top: 2,
        left: 2,
        width: '100%-6',
        height: 1,
        border: { type: 'line' },
        inputOnFocus: true,
        mouse: true,
        style: {
            fg: 'white',
            border: { fg: 'gray' },
        },
    });
    const passwordSubmitBtn = (0, blessed_helpers_1.createButton)({
        parent: passwordOverlay,
        bottom: 1,
        left: 'center',
        width: 12,
        height: 1,
        content: ' Join ',
        mouse: true,
        style: {
            fg: 'white',
            bg: 'green',
            focus: { fg: 'white', bg: 'lightblue' },
            hover: { fg: 'white', bg: 'lightblue' },
        },
    });
    let pendingPrivateRoom = '';
    passwordSubmitBtn.on('press', () => {
        audio.playSound('click');
        const password = passwordInput.getValue();
        if (pendingPrivateRoom && password) {
            socket.emit('room:join', { roomName: pendingPrivateRoom, password });
            addSystemMessage(`Joining private room #${pendingPrivateRoom}...`);
        }
        passwordInput.clearValue();
        hideModal(passwordOverlay);
    });
    passwordOverlay.key(['escape'], () => {
        passwordInput.clearValue();
        hideModal(passwordOverlay);
    });
    passwordInput.on('submit', () => {
        passwordSubmitBtn.emit('press');
    });
    // ========== HELP SCREEN ==========
    const showHelp = (0, help_screen_1.createHelpScreen)(screen, inputBox);
    // Set the F1 handler function reference (defined earlier but set here)
    showHelpFn = showHelp;
    // Progress bar for file sharing
    const fileProgressBar = blessed_1.default.progressbar({
        parent: screen,
        top: 'center',
        left: 'center',
        width: '60%',
        height: 3,
        label: ' File Transfer ',
        border: { type: 'line' },
        filled: 0,
        ch: '\u2588', // Full block character
        pch: '\u2591', // Light shade character
        style: {
            fg: 'green',
            bg: 'black',
            border: { fg: 'green' },
        },
        hidden: true,
    });
    // Loading spinner (using SDK DoorLoader)
    const loader = new DoorLoader_1.DoorLoader(screen, {
        overlay: true,
        overlayOpacity: 0.5,
        spinner: true,
        barColor: 'cyan',
    });
    // ========== SETTINGS OVERLAY ==========
    const settingsOverlay = (0, settings_overlay_1.createSettingsOverlay)(screen, state, presenceService, socketEmitter, userId, updateStatusBar, hideModal);
    // ========== CREATE DIALOG HELPERS ==========
    const { showHelpDialog, showSettingsOverlay, showNewMessagePrompt, showRoomMenu, showUserList, showDMPrompt } = (0, dialog_helpers_1.createDialogHelpers)(showHelp, showModal, showPromptDialog, showMessageDialog, settingsOverlay, inputBox, screen, socket, state, onlineUsers, addSystemMessage, addChatMessage, emojis_1.replaceEmojis, types_1.PRESENCE_INDICATORS);
    const { overlay: profileOverlay, showProfile: showUserProfile } = (0, profile_overlay_1.createProfileOverlay)(screen, inputBox, onlineUsers, username, state, formatter_1.getUserColor, getChannelDisplayName, showMessageDialog, showDMPrompt, showModal, hideModal);
    // ========== DRAWING CANVAS (for drawing channels) ==========
    const { drawingCanvas, drawingChannels, isDrawingChannel, enterDrawingMode, exitDrawingMode } = (0, drawing_canvas_1.createDrawingCanvas)(screen, socket, state, chatLog, typingBar, bbs, inputBox, getChannelDisplayName, updateChannelList, updateStatusBar, addSystemMessage, menu_bar_1.MENU_HEIGHT, SIDEBAR_WIDTH, status_bar_1.STATUS_HEIGHT, input_box_1.INPUT_HEIGHT);
    // ========== FILE SHARING ==========
    const { fileSharingOverlay, showFileSharing } = (0, file_sharing_1.createFileSharing)(screen, socket, state, username, addSystemMessage, addChatMessage, addActivity, audio, showModal, hideModal);
    // ========== CONTEXT MENUS ==========
    // secLevel >= 255 is the AmiExpress sysop tier; any door admin item
    // (kick/ban/archive/etc) is gated on this.
    const isSysop = (session?.user?.secLevel ?? 0) >= 255;
    const hiddenTiles = new Set();
    const { contextMenu, showContextMenu, hideContextMenu } = (0, context_menus_1.createContextMenus)(screen, inputBox, showUserProfile, showDMPrompt, addSystemMessage, socket, {
        isSysop,
        onFocusTile: (uid) => {
            const vg = voiceChannel.videoGrid;
            if (!vg)
                return;
            if (vg.getViewMode() !== 'speaker')
                vg.toggleViewMode();
            vg.setActiveSpeaker(uid);
            addSystemMessage(`{cyan-fg}Focused stream: user ${uid}{/cyan-fg}`);
        },
        onHideTile: (uid) => {
            hiddenTiles.add(uid);
            const vg = voiceChannel.videoGrid;
            vg?.removeParticipant(uid);
            addSystemMessage(`Hidden stream for user ${uid} (rejoin voice to restore).`);
        },
        onMuteRemote: (uid) => {
            socket.emit('voice:mute-remote', { userId: uid });
            addSystemMessage(`{yellow-fg}Muted remote audio for user ${uid}{/yellow-fg}`);
        },
        onToggleChannelExpand: (channelName) => {
            // Find the channel by name and flip its collapse state.
            const ch = channelItems.find(c => c.type === 'text' && c.name === channelName);
            if (!ch)
                return;
            const id = ch.id;
            const currentlyExpanded = collapsedChannels.has(id) ? false : true;
            if (currentlyExpanded) {
                expandedChannels.delete(id);
                collapsedChannels.add(id);
            }
            else {
                collapsedChannels.delete(id);
                expandedChannels.add(id);
            }
            updateChannelList();
        },
    });
    // ========== VOICE CHANNEL (Discord-style UX) ==========
    const voiceChannel = (0, voice_channel_ux_1.createEnhancedVoiceChannel)({
        parent: sidebarPanel, // Parent to sidebar so controls appear at bottom of sidebar (Discord-style)
        channelList,
        screen,
        socket,
        ctx: session, // Pass session as ctx for audio API access
        userId,
        username,
        chatPanel, // Pass chat panel so video grid renders in correct location
        onJoinVoice: (channelId) => {
            addSystemMessage(`Joined voice channel`);
            updateChatHeader(); // add [MODE] tag to chat panel label
        },
        onLeaveVoice: () => {
            addSystemMessage(`Left voice channel`);
            updateChatHeader(); // strip [MODE] tag
        },
        onRenderModeChange: (mode) => {
            currentRenderMode = mode;
            addSystemMessage(`{magenta-fg}Video render mode: ${mode}{/magenta-fg}`);
            updateChatHeader();
        },
        onTileRightClick: (uid, x, y) => {
            showContextMenu(x, y, 'video', uid);
        },
    });
    // ========== MOUSE HANDLING & SCROLL WHEEL ==========
    // Using built-in blessed widget click events instead of custom screen-level handler
    // Input box click to focus
    inputBox.on('click', () => {
        inputBox.focus();
        screen.render();
    });
    // Helper to get position for format picker based on selection
    const getSelectionPosition = (selection) => {
        // Position relative to input box and selection start
        // Use absolute screen coordinates (aleft/atop)
        const inputLeft = inputBox.aleft || 0;
        const inputTop = inputBox.atop || 0;
        // Account for 1-cell border
        return {
            x: inputLeft + 1 + (selection.start || 0),
            y: inputTop + 1,
        };
    };
    // Auto-show format picker when text is selected (keyboard or mouse)
    inputBox.on('select', (selection) => {
        if (selection && selection.text && !formatPicker.isVisible()) {
            formatPicker.show(screen, (format) => {
                // Wrap selected text with format tags
                const wrappedText = format.wrap(selection.text);
                inputBox.replaceSelection?.(wrappedText);
                // Update content immediately for live preview
                if (inputBox.options.tags) {
                    inputBox.setContent(inputBox.getValue());
                }
                inputBox.focus();
                screen.render();
            }, () => {
                inputBox.focus();
                screen.render();
            }, getSelectionPosition(selection));
        }
    });
    // Input box right-click to show format picker (when text is selected)
    inputBox.on('rightclick', () => {
        const selection = inputBox.getSelection?.();
        if (selection && selection.text) {
            formatPicker.show(screen, (format) => {
                // Wrap selected text with format tags
                const wrappedText = format.wrap(selection.text);
                inputBox.replaceSelection?.(wrappedText);
                // Update content immediately for live preview
                if (inputBox.options.tags) {
                    inputBox.setContent(inputBox.getValue());
                }
                inputBox.focus();
                screen.render();
            }, () => {
                inputBox.focus();
                screen.render();
            }, getSelectionPosition(selection));
        }
    });
    // Chat log left-click to focus
    chatLog.on('click', () => {
        chatLog.focus();
        screen.render();
    });
    // Chat log right-click to show context menu
    chatLog.on('rightclick', (data) => {
        chatLog.focus();
        // Don't show context menu if clicking near the edges (resize handle area)
        // Resize handles are 3 cols wide and 2 rows tall at each corner
        const x = data?.x || 0;
        const y = data?.y || 0;
        const width = chatLog.width || 80;
        const height = chatLog.height || 24;
        // Check if click is in a resize handle area (corners or edges)
        const nearLeft = x < 2;
        const nearRight = x > width - 3;
        const nearTop = y < 2;
        const nearBottom = y > height - 2;
        // Only show context menu if NOT in a resize handle area
        if (!nearLeft && !nearRight && !nearTop && !nearBottom) {
            showContextMenu(x, y, 'chat');
        }
        screen.render();
    });
    // User list left-click to focus
    userList.on('click', () => {
        userList.focus();
        screen.render();
    });
    // User list right-click to show context menu. Resolve the target row
    // from the actual click Y — `list.selected` is set by the last
    // left-click and will be stale (or 0) if the user right-clicks without
    // first selecting something.
    function rowAtClick(list, event) {
        const pos = list._getCoords?.();
        if (!pos)
            return undefined;
        const hasDrawnBorder = !!(list.options?.border && list.options.border.type && list.options.border.type !== 'none');
        const border = hasDrawnBorder ? 1 : 0;
        const pad = list.options?.padding;
        const padTop = typeof pad === 'number' ? pad : (pad?.top ?? 0);
        const relY = (event?.y ?? 0) - pos.yi - border - padTop;
        if (relY < 0)
            return undefined;
        const scroll = list.getScroll?.() ?? 0;
        return relY + scroll;
    }
    userList.on('rightclick', (event) => {
        userList.focus();
        const items = userList.items || [];
        const row = rowAtClick(userList, event);
        console.log('[livechat DIAG] userList rightclick x=%d y=%d row=%s items.len=%d', event?.x, event?.y, row, items.length);
        if (row !== undefined && row >= 0 && row < items.length) {
            const text = typeof items[row] === 'string' ? items[row] : items[row]?.content || '';
            const match = text.match(/^.\s+(\S+)/);
            console.log('[livechat DIAG] userList rightclick text=%j match=%j', text, match);
            if (match && match[1] && match[1] !== username) {
                showContextMenu(event.x || 0, event.y || 0, 'user', match[1]);
            }
        }
        screen.render();
    });
    // Channel list left-click: focus + let blessed's internal List._onClick
    // compute the row and fire 'select'. The 'select' handler calls
    // handleChannelSelect which joins on first click and toggles
    // expand/collapse when the user clicks the channel they're already in.
    channelList.on('click', () => {
        channelList.focus();
        screen.render();
    });
    // Space on the highlighted channel toggles expand/collapse. This is
    // independent of "current" channel, so with a 500-user list the user
    // can still navigate to any channel and collapse it without scrolling
    // back to the channel name.
    function toggleChannelExpand(id) {
        const currentlyExpanded = collapsedChannels.has(id) ? false : true;
        if (currentlyExpanded) {
            expandedChannels.delete(id);
            collapsedChannels.add(id);
        }
        else {
            collapsedChannels.delete(id);
            expandedChannels.add(id);
        }
        updateChannelList();
        screen.render();
    }
    channelList.key(['space'], () => {
        const sel = channelList.selected;
        const item = sel !== undefined ? channelItems[sel] : undefined;
        if (item && item.type === 'text')
            toggleChannelExpand(item.id);
    });
    // Right arrow = force-expand, Left arrow = force-collapse on the
    // highlighted channel — matches file-browser / tree-widget UX.
    channelList.key(['right'], () => {
        const sel = channelList.selected;
        const item = sel !== undefined ? channelItems[sel] : undefined;
        if (!item || item.type !== 'text')
            return;
        if (collapsedChannels.has(item.id) || !expandedChannels.has(item.id)) {
            collapsedChannels.delete(item.id);
            expandedChannels.add(item.id);
            updateChannelList();
            screen.render();
        }
    });
    channelList.key(['left'], () => {
        const sel = channelList.selected;
        const item = sel !== undefined ? channelItems[sel] : undefined;
        if (!item || item.type !== 'text')
            return;
        expandedChannels.delete(item.id);
        collapsedChannels.add(item.id);
        updateChannelList();
        screen.render();
    });
    // Channel list right-click to show context menu. Uses the row under
    // the cursor (via rowAtClick), not `.selected` — right-click shouldn't
    // require a prior left-click to select.
    channelList.on('rightclick', (event) => {
        channelList.focus();
        const row = rowAtClick(channelList, event);
        const item = row !== undefined ? channelItems[row] : undefined;
        console.log('[livechat DIAG] channelList rightclick x=%d y=%d row=%s item=%s', event?.x, event?.y, row, item ? `${item.type}:${item.username || item.name}` : 'none');
        if (item) {
            const x = event.x || 0;
            const y = event.y || 0;
            if (item.type === 'user' && item.username) {
                showContextMenu(x, y, 'user', item.username);
            }
            else if (item.type === 'text' || item.type === 'voice') {
                showContextMenu(x, y, 'channel', item.name);
            }
        }
        screen.render();
    });
    // Scroll wheel support with built-in blessed events
    chatLog.on('wheelup', () => { chatLog.scroll(-3); screen.render(); });
    chatLog.on('wheeldown', () => { chatLog.scroll(3); screen.render(); });
    userList.on('wheelup', () => { userList.scroll(-2); screen.render(); });
    userList.on('wheeldown', () => { userList.scroll(2); screen.render(); });
    channelList.on('wheelup', () => { channelList.up(2); setTimeout(joinSelectedChannel, 0); screen.render(); });
    channelList.on('wheeldown', () => { channelList.down(2); setTimeout(joinSelectedChannel, 0); screen.render(); });
    // ========== HELPER FUNCTIONS ==========
    function addChatMessage(line, applyMarkdown = true) {
        const parsed = applyMarkdown ? (0, markdown_1.parseContent)(line) : line;
        const highlighted = (0, mentions_1.highlightMentions)(parsed, username);
        appendLineToLog(highlighted);
        screen.render();
    }
    function addSystemMessage(msg) {
        appendLineToLog(`{gray-fg}*** ${msg} ***{/gray-fg}`);
        screen.render();
    }
    function addMessageFromUser(from, content, timestamp) {
        const time = (0, format_1.formatTime)(timestamp || new Date());
        const color = (0, formatter_1.getUserColor)(from);
        const parsed = (0, markdown_1.parseContent)(content);
        const highlighted = (0, mentions_1.highlightMentions)(parsed, username);
        appendLineToLog(`{gray-fg}[${time}]{/gray-fg} <{${color}-fg}${from}{/${color}-fg}> ${highlighted}`);
        screen.render();
    }
    // Track logical chat messages separately
    const chatMessages = [];
    // Helper function to rebuild chat content from logical messages + previews
    function rebuildChatContent() {
        const previewLines = Array.from(state.typingBuffers.values()).map(buf => {
            const color = (0, formatter_1.getUserColor)(buf.username);
            const time = (0, format_1.formatTime)(new Date());
            // Blinking cursor with user's chat color
            const cursor = cursorBlinkOn ? `{${color}-fg}{inverse} {/inverse}{/${color}-fg}` : ' ';
            return `{gray-fg}[${time}]{/gray-fg} <{${color}-fg}${buf.username}{/${color}-fg}> ${buf.buffer}${cursor}`;
        });
        // Start/stop cursor blink interval based on whether there are typing previews
        if (previewLines.length > 0) {
            startCursorBlink();
        }
        else {
            stopCursorBlink();
        }
        // For animated lines (~pulse~, ~rainbow~, etc.) the raw chatMessages
        // entry still contains the unparsed `~tag~..~/tag~` markup. The
        // animationManager periodically writes the rendered frame into the
        // chatLog via setLine() — but setContent() below would overwrite that
        // with raw markup on every typing keystroke, causing the user to see
        // literal `~pulse~abc~/pulse~` text whenever they type. Substitute
        // the manager's most recent rendered frame for any animated indices.
        const renderedMessages = chatMessages.map((line, idx) => {
            const animFrame = animationManager.getRendered?.(idx);
            return animFrame != null && animFrame !== '' ? animFrame : line;
        });
        // CRITICAL: Use CRLF for separation to force margin return
        const fullContent = [...renderedMessages, ...previewLines].join('\r\n');
        chatLog.setContent(fullContent);
        chatLog.setScrollPerc(100);
    }
    function appendLineToLog(line) {
        chatMessages.push(line);
        // Register animated lines
        const lineIndex = chatMessages.length - 1;
        if ((0, animations_1.hasAnimationTags)(line)) {
            animationManager.registerLine(lineIndex, line);
        }
        rebuildChatContent();
        screen.render();
    }
    // updateTypingPreview is called on EVERY keystroke (locally + on every
    // received chat:keystroke broadcast from other users). With a long
    // chatMessages backlog (default 1000 lines), rebuilding the entire
    // chat-panel content + .setContent() + screen.render() per keystroke
    // is the dominant cost driving the typing lag users reported.
    //
    // Two-layer optimisation:
    //   (a) Throttle to ~30fps (33ms) with a trailing flush so the last
    //       state always lands. Faster than the previous 60ms cap (felt
    //       sluggish) but still cheap enough to absorb burst typing.
    //   (b) Skip the rebuild entirely if neither typingBuffers nor the
    //       chatMessages array has changed since the last successful run
    //       AND no animated lines exist. The latter two cover ~all
    //       no-op invocations driven by the cursor-blink interval and
    //       redundant chat:keystroke broadcasts.
    let _typingPreviewTimer = null;
    let _typingPreviewLastRun = 0;
    let _lastTypingFingerprint = '';
    let _lastChatMessageCount = -1;
    const _TYPING_PREVIEW_MIN_MS = 33;
    function _typingFingerprint() {
        // Cheap hash of all active typing buffers + message count + animation
        // count. Anything that would change the rendered chat panel touches one
        // of these. Stringifying is fine -- typingBuffers is small (1 entry per
        // typing user, capped at 3 displayed).
        const parts = [];
        for (const [uid, buf] of state.typingBuffers) {
            parts.push(`${uid}:${buf.username}:${buf.buffer}`);
        }
        parts.push(`m=${chatMessages.length}`);
        parts.push(`a=${animationManager?.getAnimatedLineCount?.() ?? 0}`);
        return parts.join('|');
    }
    function _doRebuild() {
        const fp = _typingFingerprint();
        if (fp === _lastTypingFingerprint && chatMessages.length === _lastChatMessageCount) {
            return; // Nothing user-visible changed -- skip the expensive setContent.
        }
        _lastTypingFingerprint = fp;
        _lastChatMessageCount = chatMessages.length;
        rebuildChatContent();
        screen.render();
    }
    function updateTypingPreview() {
        const now = Date.now();
        const since = now - _typingPreviewLastRun;
        if (since >= _TYPING_PREVIEW_MIN_MS) {
            _typingPreviewLastRun = now;
            if (_typingPreviewTimer) {
                clearTimeout(_typingPreviewTimer);
                _typingPreviewTimer = null;
            }
            _doRebuild();
            return;
        }
        if (_typingPreviewTimer)
            return;
        _typingPreviewTimer = setTimeout(() => {
            _typingPreviewTimer = null;
            _typingPreviewLastRun = Date.now();
            _doRebuild();
        }, _TYPING_PREVIEW_MIN_MS - since);
    }
    // Events and activity now go to chat log (use appendLineToLog for proper tracking)
    function updateEventsFeed(event) {
        appendLineToLog(`{gray-fg}[EVENT] ${event}{/gray-fg}`);
        screen.render();
    }
    function addActivity(activity) {
        appendLineToLog(`{yellow-fg}[${(0, format_1.formatTime)(new Date())}] ${activity}{/yellow-fg}`);
        screen.render();
    }
    // ========== REGISTER EMOJI COMMANDS ==========
    // Register after addSystemMessage is defined
    registry.register((0, emoji_1.createEmojiCommand)(screen, emojiPicker, inputBox, addSystemMessage));
    registry.register((0, emoji_1.createEmojiListCommand)(addSystemMessage));
    registry.register((0, emoji_1.createCustomEmojiCommand)(addSystemMessage));
    // ========== REGISTER EVENT FILTERING COMMAND ==========
    registry.register((0, events_1.createEventsCommand)(state, addSystemMessage, updateStatusBar));
    // ========== REGISTER PIN COMMANDS ==========
    registry.register(pin_1.pinCmd);
    registry.register(pin_1.unpinCmd);
    registry.register(pin_1.pinnedCmd);
    // ========== REGISTER THREAD COMMANDS ==========
    registry.register(msg_thread_1.replyCmd);
    registry.register(msg_thread_1.threadCmd);
    registry.register(msg_thread_1.editCmd);
    // ========== REGISTER SEARCH COMMAND ==========
    registry.register(search_1.searchCmd);
    // ========== REGISTER MODERATION COMMANDS ==========
    registry.register(moderation_1.kickCmd);
    registry.register(moderation_1.banCmd);
    registry.register(moderation_1.unbanCmd);
    registry.register(moderation_1.muteCmd);
    registry.register(moderation_1.unmuteCmd);
    function showLoading(text) {
        loader.show(text);
    }
    function hideLoading() {
        loader.hide();
    }
    // Confirmation dialog (using Question widget)
    function showConfirm(text, callback) {
        showConfirmDialog(text, (answer) => {
            callback(answer);
        });
    }
    // File transfer progress
    function showFileProgress(filename) {
        fileProgressBar.setLabel(` Transferring: ${filename} `);
        fileProgressBar.setProgress(0);
        fileProgressBar.show();
        screen.render();
    }
    function updateFileProgress(percent) {
        fileProgressBar.setProgress(percent);
        screen.render();
    }
    function hideFileProgress() {
        fileProgressBar.hide();
        inputBox.focus();
        screen.render();
    }
    // Drawing channel menu - create or join a drawing channel
    function showDrawMenu() {
        showPromptDialog('Create/join drawing channel (name without art: prefix):', 'whiteboard', (err, value) => {
            if (!err && value && value.trim()) {
                // Normalize channel name - remove art: prefix if user typed it
                let channelName = value.trim().replace(/^art:/i, '');
                // Add art: prefix for consistency
                const fullName = `art:${channelName}`;
                // Track this as a drawing channel
                drawingChannels.add(fullName);
                // Join the drawing channel room
                socket.emit('room:join', { room: fullName });
                state.currentChannel = fullName;
                currentRoomLabel = fullName;
                updateStatusBar();
                // Enter drawing mode for this channel
                enterDrawingMode(fullName);
                addSystemMessage(`Joined drawing channel #${fullName}`);
            }
            screen.render();
        });
    }
    // Join private room (shows password dialog)
    function joinPrivateRoom(roomName) {
        pendingPrivateRoom = roomName;
        passwordOverlay.setLabel(` Password for #${roomName} `);
        showModal(passwordOverlay);
        passwordInput.focus();
        screen.render();
    }
    // ========== ROOM SOCKET HANDLERS ==========
    // Setter function for currentRoomLabel to prevent stale references
    const setCurrentRoomLabel = (value) => { currentRoomLabel = value; };
    (0, room_socket_handlers_1.setupRoomHandlers)(socket, state, onlineUsers, userId, username, nodeId, presenceService, updateChannelList, updateUserTable, updateStatusBar, addSystemMessage, addActivity, audio, hideLoading, state_1.setChannel, setCurrentRoomLabel, showMessageDialog, inputBox, screen);
    // Clear typing preview lines when switching channels
    // setupRoomHandlers already clears state.typingBuffers via setChannel,
    // but typingPreviewLines is a separate Map that also needs clearing
    socket.on('room:joined', () => {
        // New room joined
    });
    // ========== CHAT SOCKET HANDLERS ==========
    (0, chat_socket_handlers_1.setupChatHandlers)(socket, state, userId, username, onlineUsers, presenceService, chatLog, updateUserTable, addSystemMessage, addChatMessage, addActivity, updateEventsFeed, audio, mentions_1.mentionsUser, formatter_1.getUserColor, formatter_1.formatMessage, typing_preview_1.processKeystroke, updateTypingPreview, screen, socket_typing_1.shouldShowEvent, services_1.getEventMessage, eventBus, state_1.addMessage, messageHandler, format_1.formatTime);
    // ========== BBS EVENT HANDLERS ==========
    // Listen to BBS system events (login, logout, upload, download, door activity)
    const bbsEventHandler = new bbs_event_handler_1.BBSEventHandler(socket);
    bbsEventHandler.onEvent((event) => {
        const formattedEvent = bbsEventHandler.formatEvent(event);
        // Use appendLineToLog instead of chatLog.add() to maintain chatMessages consistency
        appendLineToLog(formattedEvent);
        screen.render();
    });
    bbsEventHandler.listen();
    // ========== THREAD HANDLERS ==========
    let currentThreadView = null;
    (0, thread_handlers_1.setupThreadListeners)(socket, (data) => {
        // Thread created
        addSystemMessage(`Thread created: ${data.title}`);
    }, (data) => {
        // Thread reply received
        addSystemMessage(`New reply in thread`);
        if (currentThreadView) {
            currentThreadView.destroy();
            (0, thread_handlers_1.getThreadMessages)(socket, data.threadId);
        }
    }, (data) => {
        // Thread messages received - show thread view
        if (currentThreadView)
            currentThreadView.destroy();
        currentThreadView = (0, thread_view_1.createThreadView)(screen, data);
    });
    // ========== PIN HANDLERS ==========
    let currentPinnedPanel = null;
    let pinnedMessages = [];
    (0, pin_handlers_1.setupPinListeners)(socket, (data) => {
        // Pin updated - store and refresh if panel open
        pinnedMessages = data.pinnedMessages;
        addSystemMessage(`Pinned messages updated (${pinnedMessages.length} total)`);
        if (currentPinnedPanel) {
            currentPinnedPanel.destroy();
            currentPinnedPanel = (0, pinned_panel_1.createPinnedPanel)(screen, pinnedMessages);
        }
    }, (data) => {
        // Pin list received - show panel
        pinnedMessages = data.pinnedMessages;
        if (currentPinnedPanel)
            currentPinnedPanel.destroy();
        currentPinnedPanel = (0, pinned_panel_1.createPinnedPanel)(screen, pinnedMessages);
    });
    // ========== SEARCH HANDLERS ==========
    const currentSearchOverlayRef = { current: null };
    (0, search_handlers_1.setupSearchListeners)(socket, (data) => {
        // Search results received
        if (currentSearchOverlayRef.current) {
            currentSearchOverlayRef.current.updateResults(data.results);
            addSystemMessage(`Found ${data.count} results for "${data.query}"`);
        }
    });
    // ========== MODERATION EVENT LISTENERS ==========
    socket.on('chat:kicked', (data) => {
        addSystemMessage(`{red-fg}You have been kicked${data.reason ? ': ' + data.reason : ''}{/red-fg}`);
        addSystemMessage(`{yellow-fg}Disconnecting...{/yellow-fg}`);
        setTimeout(() => cleanup(), 2000);
    });
    socket.on('chat:banned', (data) => {
        addSystemMessage(`{red-fg}You have been banned${data.duration ? ' for ' + data.duration + 's' : ''}${data.reason ? ': ' + data.reason : ''}{/red-fg}`);
        addSystemMessage(`{yellow-fg}Disconnecting...{/yellow-fg}`);
        setTimeout(() => cleanup(), 2000);
    });
    socket.on('chat:muted', (data) => {
        addSystemMessage(`{yellow-fg}You have been muted${data.duration ? ' for ' + data.duration + 's' : ''}{/yellow-fg}`);
    });
    // ========== DM SIDEBAR / CONTEXT EVENT LISTENERS ==========
    (0, dm_sidebar_handlers_1.setupDmSidebarHandlers)({ socket, state, userId, screen, updateChannelList, addChatMessage });
    // ========== CONNECTION ERROR HANDLING ==========
    let reconnectAttempts = 0;
    let userCancelled = false; // Track if user clicked cancel
    const MAX_RECONNECT_ATTEMPTS = 3;
    // Create disconnection modal (will be shown when needed)
    const disconnectionModal = (0, disconnection_modal_1.createDisconnectionModal)({
        screen,
        onRetry: () => {
            reconnectAttempts++;
            if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
                addSystemMessage('{yellow-fg}Attempting to reconnect...{/yellow-fg}');
                // The socket will automatically try to reconnect via socket.io
                setTimeout(() => {
                    if (!socket.connected) {
                        disconnectionModal.showError(`{red-fg}Lost connection to server{/red-fg}\n\n` +
                            `Reconnection failed\n\n` +
                            `Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
                    }
                }, 3000);
            }
            else {
                addSystemMessage('{red-fg}Maximum reconnection attempts reached. Please restart LiveChat.{/red-fg}');
                disconnectionModal.hide();
                setTimeout(() => cleanup(), 2000);
            }
        },
        onCancel: () => {
            // User chose "Cancel" - exit gracefully without message
            userCancelled = true;
            cleanup();
        },
    });
    function showConnectionErrorDialog(errorMessage) {
        // Don't show multiple dialogs or if user already cancelled
        if (userCancelled)
            return;
        disconnectionModal.showError(`{red-fg}Lost connection to server{/red-fg}\n\n` +
            `${errorMessage}\n\n` +
            `Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
    }
    socket.on('disconnect', (reason) => {
        console.log('[LIVECHAT DEBUG] Socket disconnected, reason:', reason);
        if (reason !== 'io client disconnect') {
            // Server initiated disconnect or connection lost
            showConnectionErrorDialog(`Disconnected: ${reason}`);
        }
        // CRITICAL: Always call cleanup on disconnect to restore BBS input
        console.log('[LIVECHAT DEBUG] Calling cleanup() from disconnect handler');
        cleanup();
    });
    socket.on('connect_error', (error) => {
        showConnectionErrorDialog(`Connection error: ${error.message}`);
    });
    socket.on('connect', () => {
        reconnectAttempts = 0;
        disconnectionModal.hide();
        addSystemMessage('{green-fg}Reconnected to server!{/green-fg}');
    });
    // ========== INPUT HANDLING ==========
    // Wrapper for handleCommandActions to match submit handler signature
    const commandActionHandler = (r) => (0, command_execution_handlers_1.handleCommandActions)(r, socket, state, onlineUsers, currentSearchOverlayRef, search_overlay_1.createSearchOverlay, search_handlers_1.searchMessages, addSystemMessage, thread_handlers_1.replyToThread, pin_handlers_1.pinMessage, pin_handlers_1.unpinMessage, pin_handlers_1.getPinnedMessages, screen, inputBox, cleanup, showConfirm // Pass showConfirm for quit confirmation
    );
    // Wrap async handler to satisfy blessed's sync event handler type requirement
    const asyncSubmitHandler = (0, input_submit_handler_1.createSubmitHandler)(socket, state, registry, cmdCtx, userId, username, onlineUsers, presenceService, socketEmitter, inputHistory, inputBox, screen, chatLog, currentSearchOverlayRef, drawingChannels, currentRoomLabel, hideCommandSuggestions, commandActionHandler, showLoading, showUserList, addChatMessage, addSystemMessage, thread_handlers_1.replyToThread, pin_handlers_1.pinMessage, pin_handlers_1.unpinMessage, pin_handlers_1.getPinnedMessages, search_overlay_1.createSearchOverlay, search_handlers_1.searchMessages, cleanup, showSettingsOverlay, showHelpDialog, showDrawMenu, enterDrawingMode, updateStatusBar, updateUserTable, showFileSharing, updateTypingPreview, () => {
        // Clear chat log - both the tracked messages and the display
        chatMessages.length = 0;
        chatLog.setContent('');
        screen.render();
    }, 
    // tryJoinVoiceChannel - check if channel name matches a voice channel
    (channelName) => {
        const match = channelItems.find(c => c.type === 'voice' && c.name.toLowerCase() === channelName.toLowerCase());
        if (match) {
            const channelId = match.id.replace('voice-', '');
            voiceChannel.joinVoiceChannel(channelId);
            voiceChannel.showGrid();
            addSystemMessage(`Joining voice channel: ${match.name}`);
            return true;
        }
        return false;
    });
    inputBox.on('submit', (value) => { asyncSubmitHandler(value); });
    // Live typing indicator and command autocomplete
    inputBox.on('keypress', (ch, key) => {
        // Handle Enter key - submit message instead of inserting newline
        if (key.name === 'enter' || key.name === 'return') {
            if (commandSuggestionsVisible) {
                // If ghost completion exists, accept it; otherwise select from dropdown
                if (currentGhostCompletion) {
                    inputBox.setValue(`/${currentGhostCompletion} `);
                    inputBox.focus();
                    hideCommandSuggestions();
                    screen.render();
                }
                else {
                    selectCommandSuggestion();
                }
                return;
            }
            // For regular messages, explicitly trigger submit since Textarea defaults to newline
            inputBox.submit();
            return;
        }
        // Tab/Shift+Tab: accept ghost completion if available, otherwise let screen-level handler cycle focus
        if (key.name === 'tab') {
            if (commandSuggestionsVisible && currentGhostCompletion) {
                // Accept ghost completion
                inputBox.setValue(`/${currentGhostCompletion} `);
                inputBox.focus();
                hideCommandSuggestions();
                screen.render();
                return;
            }
            // Don't handle Tab here - let screen-level key handler cycle focus
            // (keyboard-shortcuts.ts binds screen.key(['tab'], cycleFocusForward))
            hideCommandSuggestions();
            return;
        }
        // Handle command autocomplete navigation when dropdown is visible
        if (commandSuggestionsVisible) {
            // Right arrow: accept ghost text completion (if available)
            // But ONLY if shift is not pressed (Shift+Right is for selection)
            if ((key.name === 'right' && !key.shift) && currentGhostCompletion) {
                // Accept the ghost completion
                inputBox.setValue(`/${currentGhostCompletion} `);
                inputBox.focus();
                hideCommandSuggestions();
                screen.render();
                return;
            }
            else if (key.name === 'down' && !key.shift) {
                commandSuggestions.down(1);
                screen.render();
                return;
            }
            else if (key.name === 'up' && !key.shift) {
                commandSuggestions.up(1);
                screen.render();
                return;
            }
            else if (key.name === 'escape') {
                hideCommandSuggestions();
                return;
            }
        }
        // Keystroke transmission for typing indicators + local echo
        if (key.name === 'backspace') {
            socketEmitter.keystroke(state.currentChannel, userId, 'BACKSPACE');
            // Local echo: update own typing preview
            (0, typing_preview_1.processKeystroke)(state.typingBuffers, userId, username, 'BACKSPACE', (0, formatter_1.getUserColor)(username));
            updateTypingPreview();
        }
        else if (ch && !key.ctrl && !key.meta && key.name !== 'enter') {
            socketEmitter.keystroke(state.currentChannel, userId, ch);
            // Local echo: update own typing preview
            (0, typing_preview_1.processKeystroke)(state.typingBuffers, userId, username, ch, (0, formatter_1.getUserColor)(username));
            updateTypingPreview();
        }
        // Check for command autocomplete trigger
        // Use setTimeout to get the updated value after the keypress
        setTimeout(() => {
            const currentValue = inputBox.getValue();
            // NOTE: Do NOT call setContent() here - it overrides the textbox's internal
            // _updateContent() which handles effect conversion and selection markers.
            // The textbox automatically updates its own content when needed.
            if (currentValue.startsWith('/') && currentValue.length > 0) {
                // Show command suggestions
                showCommandSuggestions(currentValue);
            }
            else {
                // Hide suggestions if not a command
                hideCommandSuggestions();
            }
            // CRITICAL: Don't call screen.render() here - showCommandSuggestions/hideCommandSuggestions
            // already render, and calling screen.render() again causes blessed buffer corruption
            // where the Commands box border bleeds into the input box
        }, 0);
    });
    // ========== GLOBAL KEYBOARD SHORTCUTS ==========
    // Wrapper for switchSidebarTab to match expected signature
    const switchSidebarTabWrapper = (t) => {
        if (t === 'channels' || t === 'users') {
            switchSidebarTab(t);
        }
    };
    // Getter function for current sidebar tab value (prevents stale references)
    const getSidebarTab = () => sidebarTab;
    const { updateChatLayout } = (0, keyboard_shortcuts_1.setupKeyboardShortcuts)(screen, chatPanel, drawingCanvas, inputBox, getSidebarTab, channelList, userList, emojiPicker, showHelp, switchSidebarTabWrapper, addSystemMessage, showFileSharing, showSettingsOverlay, showConfirm, cleanup, SIDEBAR_WIDTH, chatLog, typingBar);
    // F5 / Ctrl+Shift+F: Format picker (requires text selection)
    const showFormatPicker = () => {
        if (formatPicker.isVisible())
            return;
        const selection = inputBox.getSelection?.();
        if (selection && selection.text) {
            formatPicker.show(screen, (format) => {
                const wrappedText = format.wrap(selection.text);
                inputBox.replaceSelection?.(wrappedText);
                // Update content immediately for live preview
                if (inputBox.options.tags) {
                    inputBox.setContent(inputBox.getValue());
                }
                inputBox.focus();
                screen.render();
            }, () => {
                inputBox.focus();
                screen.render();
            }, getSelectionPosition(selection));
        }
        else {
            addSystemMessage('Select text first (Shift+Arrow keys), then press F5 for formatting');
            inputBox.focus();
        }
    };
    screen.key(['f5'], showFormatPicker);
    // Press `r` (outside the input box) to cycle the outgoing webcam render
    // mode. Only fires when we're in a voice channel so it doesn't collide
    // with people typing the letter 'r' elsewhere in the UI.
    screen.key(['r'], () => {
        if (screen.focused === inputBox)
            return;
        if (!voiceChannel.isInVoiceChannel())
            return;
        voiceChannel.cycleRenderMode().catch(err => {
            console.log('[livechat] cycleRenderMode failed:', err?.message ?? err);
        });
    });
    // ========== MENU BAR CLICK HANDLERS ==========
    menuBar.setHandlers({
        onHelp: () => showHelp(),
        onList: () => {
            // Toggle sidebar visibility (same as F2)
            if (sidebarTab === 'channels') {
                channelList.toggle();
            }
            else {
                userList.toggle();
            }
            screen.render();
        },
        onChTab: () => {
            // Switch between channels and users tab (same as F3)
            switchSidebarTab(sidebarTab === 'channels' ? 'users' : 'channels');
        },
        onEmoji: () => {
            // Show emoji picker (same as F4)
            if (!emojiPicker.isVisible()) {
                emojiPicker.show(screen, (emoji) => {
                    const currentText = inputBox.getValue();
                    inputBox.setValue(currentText + emoji.code + ' ');
                    inputBox.focus();
                    screen.render();
                }, () => {
                    inputBox.focus();
                    screen.render();
                });
            }
        },
        onFiles: () => showFileSharing(),
        onPins: () => {
            (0, pin_handlers_1.getPinnedMessages)(socket, state.currentChannel);
            screen.render();
        },
        onSearch: () => {
            // Open search overlay (same as Ctrl+F)
            if (currentSearchOverlayRef.current)
                currentSearchOverlayRef.current.destroy();
            currentSearchOverlayRef.current = (0, search_overlay_1.createSearchOverlay)(screen, (query, filters) => {
                if (query && query.length >= 2) {
                    (0, search_handlers_1.searchMessages)(socket, query, {
                        roomId: state.currentChannel,
                        ...filters
                    });
                }
                else {
                    addSystemMessage('Search query must be at least 2 characters');
                }
            }, () => {
                if (currentSearchOverlayRef.current) {
                    currentSearchOverlayRef.current.destroy();
                    currentSearchOverlayRef.current = null;
                }
                inputBox.focus();
            });
            screen.render();
        },
        onSettings: () => showSettingsOverlay(),
        onJoinChannel: () => {
            // Use the existing channel-list tab so it's consistent with F2.
            sidebarTab !== 'channels' && switchSidebarTab('channels');
            if (channelList.hidden)
                channelList.toggle();
            channelList.focus();
            screen.render();
        },
        onLeaveChannel: () => {
            const ch = state.currentChannel;
            if (!ch || ch === 'general' || ch === 'lobby') {
                addSystemMessage('{yellow-fg}Cannot leave the default channel.{/yellow-fg}');
                return;
            }
            socket.emit('room:leave', { roomId: ch });
            addSystemMessage(`Leaving {cyan-fg}${ch}{/cyan-fg}...`);
        },
        onThreads: () => {
            // No dedicated overlay yet — surface what /threads does.
            addSystemMessage('{yellow-fg}Threads: use /threads or reply on any message to open the thread view.{/yellow-fg}');
        },
        onRenderMode: () => {
            if (!voiceChannel.isInVoiceChannel()) {
                addSystemMessage('{yellow-fg}Render mode applies to the webcam stream — join a voice channel first.{/yellow-fg}');
                return;
            }
            voiceChannel.cycleRenderMode().catch(() => { });
        },
        onToggleView: () => {
            // Fullscreen (speaker mode) <-> grid split-view
            const vg = voiceChannel.videoGrid;
            if (!vg) {
                addSystemMessage('{yellow-fg}Video grid not active — join a voice channel and enable video.{/yellow-fg}');
                return;
            }
            vg.toggleViewMode();
            addSystemMessage(`View: ${vg.getViewMode() === 'speaker' ? 'Fullscreen (focus)' : 'Grid (split)'}`);
        },
        onToggleSidebar: () => {
            if (sidebarTab === 'channels')
                channelList.toggle();
            else
                userList.toggle();
            screen.render();
        },
        onClearChat: () => {
            chatLog.setContent('');
            screen.render();
        },
        onAbout: () => {
            addSystemMessage('{cyan-fg}LiveChat v3.2.0 — AmiExpress multi-user chat. Real-time text, voice, video, drawing channels.{/cyan-fg}');
        },
        onShortcuts: () => {
            addSystemMessage('{cyan-fg}Shortcuts:{/cyan-fg} F1 help  F2 sidebar  F3 tab  F4 emoji  F5 format  F6 files  F7 pins  Tab focus  Ctrl+F search  Ctrl+S settings  Ctrl+Q quit  r render-mode (in voice)');
        },
        onQuit: () => {
            showConfirm('Are you sure you want to quit LiveChat?', (confirmed) => {
                if (confirmed) {
                    cleanup();
                }
            });
        },
    });
    // Additional keyboard shortcuts
    // Ctrl+F: Open search overlay
    screen.key(['C-f'], () => {
        if (currentSearchOverlayRef.current)
            currentSearchOverlayRef.current.destroy();
        currentSearchOverlayRef.current = (0, search_overlay_1.createSearchOverlay)(screen, (query, filters) => {
            if (query && query.length >= 2) {
                (0, search_handlers_1.searchMessages)(socket, query, {
                    roomId: state.currentChannel,
                    ...filters
                });
            }
            else {
                addSystemMessage('Search query must be at least 2 characters');
            }
        }, () => {
            if (currentSearchOverlayRef.current) {
                currentSearchOverlayRef.current.destroy();
                currentSearchOverlayRef.current = null;
            }
            inputBox.focus();
        });
        screen.render();
    });
    // F7: Show pinned messages
    screen.key(['f7'], () => {
        (0, pin_handlers_1.getPinnedMessages)(socket, state.currentChannel);
        screen.render();
    });
    // Escape key: close dialogs and return focus to input
    // Note: Drawing canvas handles its own escape key for exiting drawing mode
    screen.key(['escape'], () => {
        // Close any open dialogs
        if (!settingsOverlay.hidden) {
            hideModal(settingsOverlay);
            return; // Don't continue to inputBox.focus() since hideModal handles it
        }
        if (!profileOverlay.hidden) {
            hideModal(profileOverlay);
            return;
        }
        if (!fileSharingOverlay.hidden) {
            hideModal(fileSharingOverlay);
            return;
        }
        inputBox.focus();
        screen.render();
    });
    screen.key(['C-c', 'C-q'], () => {
        showConfirm('Are you sure you want to quit LiveChat?', (confirmed) => {
            if (confirmed) {
                cleanup();
            }
        });
    });
    // ========== CLEANUP ==========
    function cleanup() {
        console.log('[LIVECHAT CLEANUP] Starting cleanup...');
        state.running = false;
        // Stop cursor blink interval
        stopCursorBlink();
        // Send leave room only if we are in a room
        if (state.currentChannel) {
            socket.emit('room:leave');
        }
        services_1.events.clear();
        console.log('[LIVECHAT CLEANUP] Calling inputManager.disable()...');
        // CRITICAL: Disable door input FIRST (before screen.destroy)
        // This restores BBS input state properly
        inputManager.disable();
        console.log('[LIVECHAT CLEANUP] inputManager.disable() completed');
        console.log('[LIVECHAT CLEANUP] Calling screen.destroy()...');
        screen.destroy();
        console.log('[LIVECHAT CLEANUP] screen.destroy() completed');
        // Restore fixed terminal mode only if we enabled wide mode
        if (chatOnly) {
            bbs.disableWideMode?.();
        }
        // Restore modem emulation if it was enabled before
        if (originalModemSpeed > 0) {
            bbs.setModemSpeed?.(originalModemSpeed);
        }
        console.log('[LIVECHAT CLEANUP] Writing goodbye message...');
        bbs.write('\x1b[2J\x1b[H');
        bbs.writeLine('\x1b[33mThanks for using LiveChat v3.2! Goodbye.\x1b[0m');
        state.running = false;
        console.log('[LIVECHAT CLEANUP] Cleanup completed successfully');
    }
    // ========== MAIN ==========
    return {
        state,
        async run() {
            try {
                // Clear screen before drawing UI (prevent BBS log bleed-through)
                bbs.write('\x1b[2J\x1b[H'); // Clear screen and home cursor
                // Initial UI setup
                updateChannelList();
                // CRITICAL: Update chat layout after sidebar width changes from fitToContent
                updateChatLayout();
                updateUserTable();
                updateStatusBar();
                // CRITICAL: Reset input label to ensure it's correct after all initialization
                inputBox.setLabel(' Message ');
                // Ensure command suggestions appear above everything else
                // (must be called after all other elements are created)
                // Use 10000 to be above modals (which call setFront() dynamically)
                commandSuggestions.setIndex(10000);
                commandSuggestions.setFront();
                ghostText.setIndex(10001);
                ghostText.setFront();
                // Start animation manager for animated text effects
                animationManager.start();
                // Force initial layout calculation to ensure full-width elements are properly sized
                // Emit a resize event to trigger the responsive layout manager
                screen.emit('resize');
                screen.render();
                // Focus input and start reading
                inputBox.focus();
                inputBox.readInput();
                // Welcome messages
                addSystemMessage('Welcome to LiveChat v3.2!');
                addChatMessage('{cyan-fg}Hotkeys:{/cyan-fg}', false);
                addChatMessage('  {white-fg}F1{/white-fg}=Help  {white-fg}F2{/white-fg}=Sidebar  {white-fg}F3{/white-fg}=Switch Tab  {white-fg}F4{/white-fg}=Emoji Picker', false);
                addChatMessage('  {white-fg}F5{/white-fg}=Art Channel  {white-fg}F6{/white-fg}=Files  {white-fg}Tab{/white-fg}=Focus Cycle', false);
                addChatMessage('  {white-fg}^S{/white-fg}=Settings  {white-fg}^E{/white-fg}=Emoji  {white-fg}^C/^Q{/white-fg}=Quit  {white-fg}Esc{/white-fg}=Close/Return', false);
                addChatMessage('{yellow-fg}Commands:{/yellow-fg} /help /join /leave /msg /me /who /away /back /clear /emoji /events', false);
                addChatMessage('{gray-fg}Type a message and press Enter to send{/gray-fg}', false);
                // Request room list
                addSystemMessage('Loading rooms...');
                socket.emit('room:list', {});
                // Request DM thread list for the sidebar.
                socket.emit('chat:dm-threads:list');
                // Wait for exit
                await new Promise((resolve) => {
                    screen.on('destroy', resolve);
                });
            }
            finally {
                // CRITICAL: Ensure cleanup() is ALWAYS called on door exit
                // This prevents BBS input from breaking when door exits abnormally
                console.log('[LIVECHAT DEBUG] run() exiting, calling cleanup() from finally block');
                if (state.running) {
                    cleanup();
                }
            }
        }
    };
}
