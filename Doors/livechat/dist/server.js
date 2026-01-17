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
    // Wire up terminal input to the blessed screen
    // Audio is now handled client-side in hybrid mode
    let showHelpFn = null;
    if (session.bbsSession) {
        // CRITICAL: Set ALL THREE flags for input routing (see TYPESCRIPT_DOOR_TROUBLESHOOTING.md)
        session.bbsSession.inDoorManager = true;
        session.bbsSession.mouseEventsEnabled = true; // Enable mouse hover/move events
        session.bbsSession.doorInputHandler = (data) => {
            // Handle F1 directly (escape sequences: \x1bOP or \x1b[11~)
            if (data === '\x1bOP' || data === '\x1b[11~') {
                if (showHelpFn)
                    showHelpFn();
                return true;
            }
            screen.program.emit('data', data);
            return true;
        };
    }
    // ========== LOADING SCREEN ==========
    // Layout constants for 80x24 terminal
    const SIDEBAR_WIDTH = 18; // Single combined sidebar
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
        parent: screen, // Parent to screen for full width alignment
        bottom: status_bar_1.STATUS_HEIGHT + input_box_1.INPUT_HEIGHT, // Position above input box
        left: 0,
        width: '100%', // Full width of screen
        height: 10,
        label: ' Commands ',
        border: { type: 'line' },
        hidden: true,
        mouse: true,
        clickable: true,
        keys: true,
        vi: true,
        style: {
            fg: 'white',
            bg: 'black',
            border: { fg: 'cyan' },
            selected: { fg: 'black', bg: 'cyan' },
        },
        scrollbar: {
            ch: ' ',
        },
    });
    // Ghost text overlay for inline completion preview
    const ghostText = (0, blessed_helpers_1.createBox)({
        parent: screen, // Parent to screen to avoid panel clipping
        bottom: status_bar_1.STATUS_HEIGHT + 1, // Align with input field content
        left: 10,
        width: 70,
        height: 1,
        tags: true,
        content: '',
        style: {
            fg: 'gray',
            bg: 'black',
        },
    });
    ghostText.hide();
    // Set high z-index to appear above other elements
    commandSuggestions.setIndex(1000);
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
            screen.render();
            return;
        }
        // Format command items with name, usage, and description
        // Dynamically calculate width based on screen width
        const chatWidth = screen.width || 80;
        const nameWidth = 12;
        const usageWidth = 20;
        // Description gets the remaining space (minus borders and spacing)
        const descWidth = Math.max(10, chatWidth - nameWidth - usageWidth - 6);
        const items = filteredCommands.map(cmd => {
            const name = cmd.name.padEnd(nameWidth).slice(0, nameWidth);
            const usage = (cmd.usage || '').padEnd(usageWidth).slice(0, usageWidth);
            const desc = (cmd.description || '').slice(0, descWidth);
            return `{cyan-fg}/${name}{/cyan-fg} {gray-fg}${usage}{/gray-fg} ${desc}`;
        });
        // Ensure list width is updated to match screen
        commandSuggestions.width = chatWidth;
        commandSuggestions.position.width = chatWidth;
        commandSuggestions.position.left = 0;
        invalidateCache(commandSuggestions);
        commandSuggestions.setItems(items);
        commandSuggestions.select(0);
        commandSuggestions.show();
        commandSuggestions.setFront();
        commandSuggestionsVisible = true;
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
                ghostText.setContent(`{white-fg}${typedPortion}{/white-fg}{gray-fg}${remainingPortion}{/gray-fg}`);
                ghostText.show();
                ghostText.setFront();
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
        bottom: status_bar_1.STATUS_HEIGHT + input_box_1.INPUT_HEIGHT,
        dockPosition: 'left',
        resizable: true,
        draggable: true,
        persistenceKey: 'sidebar',
        zIndex: 1,
        topConstraint: menu_bar_1.MENU_HEIGHT,
        bottomConstraint: status_bar_1.STATUS_HEIGHT + input_box_1.INPUT_HEIGHT,
        border: { type: 'line', fg: 'cyan' },
        fitContent: { width: true, height: false }, // Auto-expand width to fit content
        style: {
            fg: 'white',
            bg: 'lightblack', // Dark grey for panel backgrounds
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
        // Build channel list with text and voice channels
        // CRITICAL: channelItems must be built in SAME order as items for index matching
        channelItems = [];
        const items = [];
        // Add TEXT CHANNELS header
        items.push('{cyan-fg}{bold}TEXT CHANNELS{/bold}{/cyan-fg}');
        channelItems.push({ id: '', name: '', type: 'header' });
        // Add text channels
        channelsToShow.forEach(ch => {
            const unread = ch.unreadCount ? ` (${ch.unreadCount})` : '';
            const isActive = isCurrentChannel(ch.id, ch.name);
            const hasUnread = ch.unreadCount && ch.unreadCount > 0;
            let color;
            let endColor;
            if (isActive) {
                color = '{white-fg}';
                endColor = '{/white-fg}';
            }
            else if (hasUnread) {
                color = '{green-fg}';
                endColor = '{/green-fg}';
            }
            else {
                color = '{gray-fg}';
                endColor = '{/gray-fg}';
            }
            items.push(color + '# ' + ch.name + unread + endColor);
            channelItems.push({ id: ch.id, name: ch.name, type: 'text' });
        });
        // Add spacer
        items.push('');
        channelItems.push({ id: '', name: '', type: 'spacer' });
        // Add VOICE CHANNELS header
        items.push('{cyan-fg}{bold}VOICE CHANNELS{/bold}{/cyan-fg}');
        channelItems.push({ id: '', name: '', type: 'header' });
        // Add voice channels
        const voiceChannels = voiceChannel.getVoiceChannels();
        if (voiceChannels.length === 0) {
            // Add default voice channel if none exist
            const isInVoice = voiceChannel.isInVoiceChannel();
            const icon = isInVoice ? '{green-fg}[V]{/green-fg}' : '{gray-fg}[V]{/gray-fg}';
            items.push(icon + ' General {gray-fg}(0){/gray-fg}');
            channelItems.push({ id: 'voice-general', name: 'General', type: 'voice' });
        }
        else {
            voiceChannels.forEach(vc => {
                const count = vc.participants.length;
                const isInVoice = voiceChannel.getCurrentVoiceChannel() === vc.id;
                const icon = isInVoice ? '{green-fg}[V]{/green-fg}' : count > 0 ? '{cyan-fg}[V]{/cyan-fg}' : '{gray-fg}[V]{/gray-fg}';
                items.push(icon + ' ' + vc.name + ' {gray-fg}(' + count + '){/gray-fg}');
                channelItems.push({ id: 'voice-' + vc.id, name: vc.name, type: 'voice' });
            });
        }
        channelList.setItems(items);
        // Select current channel if in the list
        const currentIdx = channelItems.findIndex(ch => ch.id === state.currentChannel);
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
        if (channel.type === 'voice') {
            // Join voice channel
            const channelId = channel.id.replace('voice-', '');
            voiceChannel.joinVoiceChannel(channelId);
            voiceChannel.showGrid(); // Show the video grid
            addSystemMessage(`Joining voice channel: ${channel.name}`);
        }
        else if (!isCurrentChannel(channel.id, channel.name)) {
            // Join text channel
            if (state.currentChannel)
                socket.emit('room:leave');
            socket.emit('room:join', { roomName: channel.name });
            voiceChannel.hideGrid(); // Hide video grid when viewing text
        }
        // Return focus to input after selection
        inputBox.focus();
    }
    // Handle channel selection with Enter key (emits 'select item')
    channelList.on('select item', (_item, index) => {
        handleChannelSelect(index);
    });
    // Handle channel selection with click (emits 'select')
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
        style: {
            fg: 'cyan',
            bg: 'black',
        },
        content: '',
        hidden: true, // Hide since typing previews are now in chat log
    });
    // ========== RESPONSIVE LAYOUT ==========
    // Dynamic layout engine that handles screen resize, sidebar drag/resize, and docking
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
        chatLog.position.width = Math.max(1, chatWidth - 2);
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
    function updateChatHeader() {
        const label = getChannelDisplayName(state.currentChannel) || 'Lobby';
        (0, chat_log_1.updateChatHeader)(chatLog, label);
    }
    function updateStatusBar() {
        (0, status_bar_1.updateStatusBar)(statusBar, state, presenceService, username, userId, nodeId, getChannelDisplayName, updateChatHeader);
    }
    // ========== FOCUS BORDERS ==========
    // NOTE: Active panel borders (white on focus) are now handled automatically by SDK!
    // No need for manual focus handlers - the SDK's screen.setFocused() method
    // automatically changes border colors: white for focused, original color for blurred.
    // This applies to all panels: inputBox, channelList, userList, and chatLog.
    // ========== POPUP DIALOGS ==========
    // Note: Dialog widgets (Message, Prompt, Question) have built-in fixed heights.
    // Don't pass height: 'shrink' as it breaks nested element rendering.
    const { modalOverlay, showModal, hideModal, messageDialog, promptDialog, questionDialog, showMessageDialog, showPromptDialog, showConfirmDialog } = (0, blessed_helpers_1.createDialogs)(screen, inputBox);
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
    const { contextMenu, showContextMenu, hideContextMenu } = (0, context_menus_1.createContextMenus)(screen, inputBox, showUserProfile, showDMPrompt, addSystemMessage, socket);
    // ========== VOICE CHANNEL (Discord-style UX) ==========
    const voiceChannel = (0, voice_channel_ux_1.createEnhancedVoiceChannel)({
        parent: sidebarPanel,
        channelList,
        screen,
        socket,
        ctx: session, // Pass session as ctx for audio API access
        userId,
        username,
        chatPanel, // Pass chat panel so video grid renders in correct location
        onJoinVoice: (channelId) => {
            addSystemMessage(`Joined voice channel`);
        },
        onLeaveVoice: () => {
            addSystemMessage(`Left voice channel`);
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
    // User list right-click to show context menu
    userList.on('rightclick', (event) => {
        userList.focus();
        const selected = userList.selected;
        const items = userList.items || [];
        if (selected !== undefined && items[selected]) {
            const text = typeof items[selected] === 'string' ? items[selected] : items[selected]?.content || '';
            const match = text.match(/^.\s+(\S+)/);
            if (match && match[1] && match[1] !== username) {
                // Use screen-absolute coordinates from click event
                const x = event.x || 0;
                const y = event.y || 0;
                showContextMenu(x, y, 'user', match[1]);
            }
        }
        screen.render();
    });
    // Channel list left-click to select and join channel
    channelList.on('click', (mouse) => {
        channelList.focus();
        // Calculate item index from click position
        const listTop = channelList.atop || 0;
        const borderOffset = 1; // Top border
        const scrollOffset = channelList.childBase || 0;
        const clickedRow = (mouse?.y || 0) - listTop - borderOffset + scrollOffset;
        if (clickedRow >= 0 && clickedRow < channelItems.length) {
            channelList.select(clickedRow);
            handleChannelSelect(clickedRow);
        }
        screen.render();
    });
    // Channel list right-click to show context menu
    channelList.on('rightclick', (event) => {
        channelList.focus();
        const selected = channelList.selected;
        if (selected !== undefined && channelItems[selected]) {
            // Use screen-absolute coordinates from click event
            const x = event.x || 0;
            const y = event.y || 0;
            showContextMenu(x, y, 'channel', channelItems[selected].name);
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
        // CRITICAL: Use CRLF for separation to force margin return
        const fullContent = [...chatMessages, ...previewLines].join('\r\n');
        // FORCE REDRAW: Tell the screen to ignore its previous state
        if (screen && screen.forceFullRedraw) {
            screen.forceFullRedraw();
        }
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
    function updateTypingPreview() {
        rebuildChatContent();
        screen.render();
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
        if (reason !== 'io client disconnect') {
            // Server initiated disconnect or connection lost
            showConnectionErrorDialog(`Disconnected: ${reason}`);
        }
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
        // Handle command autocomplete navigation when dropdown is visible
        if (commandSuggestionsVisible) {
            // Tab or Right arrow: accept ghost text completion (if available)
            if ((key.name === 'tab' || key.name === 'right') && currentGhostCompletion) {
                // Accept the ghost completion
                inputBox.setValue(`/${currentGhostCompletion} `);
                inputBox.focus();
                hideCommandSuggestions();
                screen.render();
                return;
            }
            else if (key.name === 'down') {
                commandSuggestions.down(1);
                screen.render();
                return;
            }
            else if (key.name === 'up') {
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
            // Update content to render tags if enabled
            if (inputBox.options.tags) {
                inputBox.setContent(currentValue);
            }
            if (currentValue.startsWith('/') && currentValue.length > 0) {
                // Show command suggestions
                showCommandSuggestions(currentValue);
            }
            else {
                // Hide suggestions if not a command
                hideCommandSuggestions();
            }
            screen.render();
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
        state.running = false;
        // Stop cursor blink interval
        stopCursorBlink();
        // Send leave room only if we are in a room
        if (state.currentChannel) {
            socket.emit('room:leave');
        }
        services_1.events.clear();
        // Disable mouse and clean up input handler
        screen.disableMouse();
        if (session.bbsSession) {
            delete session.bbsSession.doorInputHandler;
        }
        screen.destroy();
        // Restore fixed terminal mode only if we enabled wide mode
        if (chatOnly) {
            bbs.disableWideMode?.();
        }
        // Restore modem emulation if it was enabled before
        if (originalModemSpeed > 0) {
            bbs.setModemSpeed?.(originalModemSpeed);
        }
        bbs.write('\x1b[2J\x1b[H');
        bbs.writeLine('\x1b[33mThanks for using LiveChat v3.2! Goodbye.\x1b[0m');
        state.running = false;
    }
    // ========== MAIN ==========
    return {
        state,
        async run() {
            // Clear screen before drawing UI (prevent BBS log bleed-through)
            bbs.write('\x1b[2J\x1b[H'); // Clear screen and home cursor
            // Initial UI setup
            updateChannelList();
            updateUserTable();
            updateStatusBar();
            // Ensure command suggestions appear above everything else
            // (must be called after all other elements are created)
            commandSuggestions.setIndex(9999);
            commandSuggestions.setFront();
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
            // Wait for exit
            await new Promise((resolve) => {
                screen.on('destroy', resolve);
            });
        }
    };
}
