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

import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import contrib from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib';
import { DockablePanel } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList, createButton, createText, createLog, createDialogs, createModalManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { colorize, Tags } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { stripTags, cleanTags } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/helpers';

// Core state and services
import { createInitialState, addMessage, setChannel, AppState } from './core/state';
import { createCommandContext, executeCommand } from './core/command-exec';
import { getUserColor, formatMessage, formatSystemMessage, formatReactions } from './core/formatter';
import { createCommandRegistry } from './commands';
import { shouldShowEvent } from './core/socket-typing';

// Services
import { events, formatBBSEvent, getEventMessage, SocketEmitter, PresenceService, ExtendedEventBus } from './services';

// Handlers
import { MessageHandler } from './handlers/message';
import { KeystrokeHandler } from './handlers/keystroke';
import { CommandHandler } from './handlers/command';

// UI components
import { processKeystroke, renderTypingPreview } from './ui/typing-preview';
import { createScreen } from './ui/screen';
import { createMenuBar, MENU_HEIGHT } from './ui/menu-bar';
import { createStatusBar, updateStatusBar as updateStatusBarFn, STATUS_HEIGHT } from './ui/status-bar';
import { createInputBox, INPUT_HEIGHT } from './ui/input-box';
import { createChatLog, updateChatHeader as updateChatHeaderFn, TYPING_HEIGHT } from './ui/chat-log';

// Overlays
import { createHelpScreen } from './overlays/help-screen';
import { createSettingsOverlay } from './overlays/settings-overlay';
import { createProfileOverlay } from './overlays/profile-overlay';
// createDialogs now imported from SDK blessed-helpers

// Features
import { createInputHistory } from './features/input-history';
import { createFileSharing } from './features/file-sharing';
import { createDrawingCanvas } from './features/drawing-canvas';
import { createContextMenus } from './features/context-menus';

// Handlers
import { setupRoomHandlers } from './handlers/room-socket-handlers';
import { setupChatHandlers } from './handlers/chat-socket-handlers';
import { setupKeyboardShortcuts } from './handlers/keyboard-shortcuts';

// Utils
import { formatTime } from './utils/format';
import { AudioService } from './utils/audio';
import { mentionsUser, highlightMentions } from './utils/mentions';
import { parseContent } from './utils/markdown';
import { replaceEmojis } from './utils/emojis';

// Audio engine
import { AudioEngine } from '@amiexpress/bbs-door-sdk/engines/audio/audio-engine';

// Emoji system
import { EmojiPicker } from './ui/emoji-picker';
import { createEmojiCommand, createEmojiListCommand, createCustomEmojiCommand } from './commands/emoji';

// Event filtering
import { createEventsCommand } from './commands/events';

// Types
import { PRESENCE_INDICATORS } from './types';
import type { PresenceStatus, BBSEvent, Message } from './types';
import type { SlashCommand } from './commands/types';

// Import widget types
import type { Log } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib';

interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params: string[];
}

export async function createApp(session: DoorSession) {
  console.log('[LiveChat DEBUG] createApp called - LiveChat 3.0 with updated UI');
  const { bbs, user, socket } = session;
  const username = user?.username || 'Guest';
  const userId = parseInt(user?.id, 10) || 0;
  const nodeId = session.bbsSession?.nodeId || 1;
  const secLevel = user?.secLevel || 10;

  // Initialize state
  const state = createInitialState();
  const registry = createCommandRegistry();
  const initialRoomId = session.bbsSession?.currentRoomId as string | undefined;
  const initialRoomName = session.bbsSession?.currentRoomName as string | undefined;
  let currentRoomLabel = initialRoomName || '';
  if (initialRoomId) {
    state.currentChannel = initialRoomId;
  }

  // Services
  const socketEmitter = new SocketEmitter(socket);
  const presenceService = new PresenceService();
  const eventBus = new ExtendedEventBus(socket);
  const audioEngine = new AudioEngine({ enabled: true, sfxVolume: 0.5 });
  const audio = new AudioService(audioEngine);

  // Handlers for message history and processing
  const messageHandler = new MessageHandler();
  const commandHandler = new CommandHandler();

  // Initialize self presence
  presenceService.setStatus(userId, 'online');

  // Online users map with extended info
  const onlineUsers = new Map<string, {
    username: string;
    status: PresenceStatus;
    nodeId?: number;
    activity?: string;
    joinedAt: Date;
  }>();
  onlineUsers.set(String(userId), {
    username,
    status: 'online',
    nodeId,
    joinedAt: new Date()
  });

  // Command context
  const cmdCtx = createCommandContext(state, { id: userId, username, securityLevel: secLevel });

  // ========== CREATE NEO-BLESSED SCREEN ==========
  const screen = createScreen(bbs);

  // ========== INPUT HANDLING ==========
  // Wire up terminal input to the blessed screen
  // The BBS calls doorInputHandler with raw terminal input
  // Also handle F1 key directly since it may not pass through correctly
  let showHelpFn: (() => void) | null = null;  // Will be set later after showHelp is defined

  if (session.bbsSession) {
    session.bbsSession.doorInputHandler = (data: string) => {
      // Handle F1 directly (escape sequences: \x1bOP or \x1b[11~)
      if (data === '\x1bOP' || data === '\x1b[11~') {
        if (showHelpFn) showHelpFn();
        return true;
      }
      screen._handleData(data);
      return true;
    };
  }

  // Layout constants for 80x24 terminal
  const SIDEBAR_WIDTH = 18;  // Single combined sidebar

  // Track which tab is active in the sidebar
  let sidebarTab: 'channels' | 'users' = 'channels';

  // ========== MENU BAR (at top) ==========
  const menuBar = createMenuBar(screen);

  // ========== STATUS BAR (at very bottom) ==========
  const statusBar = createStatusBar(screen);

  // ========== INPUT BOX (above status bar) ==========
  const inputBox = createInputBox(screen);

  // ========== EMOJI PICKER ==========
  const emojiPicker = new EmojiPicker(screen);

  // ========== COMMAND AUTOCOMPLETE ==========
  const commandSuggestions = createList({
    parent: screen,
    bottom: INPUT_HEIGHT + STATUS_HEIGHT,
    left: 0,
    width: 80,  // Full screen width to fit command descriptions
    height: 10,
    label: ' Commands ',
    border: { type: 'line' },
    hidden: true,
    mouse: true,
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

  // Set high z-index to appear above other elements
  commandSuggestions.setIndex(1000);

  let commandSuggestionsVisible = false;
  let filteredCommands: SlashCommand[] = [];

  function showCommandSuggestions(input: string) {
    // Get all commands from registry
    const allCommands = registry.getAll();

    // Filter commands based on input (after the /)
    const searchTerm = input.slice(1).toLowerCase(); // Remove leading /
    filteredCommands = allCommands.filter(cmd =>
      cmd.name.toLowerCase().startsWith(searchTerm) ||
      cmd.description.toLowerCase().includes(searchTerm)
    ).sort((a, b) => {
      // Prioritize exact name matches
      const aNameMatch = a.name.toLowerCase().startsWith(searchTerm);
      const bNameMatch = b.name.toLowerCase().startsWith(searchTerm);
      if (aNameMatch && !bNameMatch) return -1;
      if (!aNameMatch && bNameMatch) return 1;
      return a.name.localeCompare(b.name);
    });

    if (filteredCommands.length === 0) {
      commandSuggestions.hide();
      commandSuggestionsVisible = false;
      screen.render();
      return;
    }

    // Format command items with name, usage, and description
    const items = filteredCommands.map(cmd => {
      const nameWidth = 15;
      const usageWidth = 25;
      const name = cmd.name.padEnd(nameWidth);
      const usage = (cmd.usage || '').padEnd(usageWidth).slice(0, usageWidth);
      const desc = cmd.description || '';
      return `{cyan-fg}/${name}{/cyan-fg} {gray-fg}${usage}{/gray-fg} ${desc}`;
    });

    commandSuggestions.setItems(items);
    commandSuggestions.select(0);
    commandSuggestions.show();
    commandSuggestionsVisible = true;
    screen.render();
  }

  function hideCommandSuggestions() {
    if (commandSuggestionsVisible) {
      commandSuggestions.hide();
      commandSuggestionsVisible = false;
      screen.render();
    }
  }

  function selectCommandSuggestion() {
    const selected = (commandSuggestions as any).selected;
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

  const inputHistory = createInputHistory(screen, inputBox);

  // ========== SIDEBAR TAB BAR ==========
  const sidebarTabs = createBox({
    parent: screen,
    top: MENU_HEIGHT,
    left: 0,
    width: SIDEBAR_WIDTH,
    height: 1,
    tags: true,
    mouse: true,  // Enable mouse support for tab clicking
    ch: ' ',  // Fill character for background
    style: {
      fg: 'white',
      bg: 'blue',  // Blue background like menu bar
    },
  });

  function updateSidebarTabs() {
    const chTab = sidebarTab === 'channels' ? '{inverse}[Ch]{/inverse}' : ' Ch ';
    const usTab = sidebarTab === 'users' ? '{inverse}[Us]{/inverse}' : ' Us ';
    sidebarTabs.setContent(` ${chTab} ${usTab}`);
  }

  // Direct click handler for sidebar tabs
  sidebarTabs.on('click', (event: any) => {
    // Determine which tab was clicked based on x position
    const pos = sidebarTabs._getCoords?.();
    if (pos && event.x !== undefined) {
      const relativeX = event.x - pos.xi;
      // Ch tab is roughly 0-8, Us tab is roughly 9-17
      const newTab = relativeX < 9 ? 'channels' : 'users';
      if (newTab !== sidebarTab) {
        switchSidebarTab(newTab);
      }
      // Keep focus on input for better UX
      inputBox.focus();
    }
  });

  // Also handle mousedown for more responsive tab clicking
  sidebarTabs.on('mousedown', (event: any) => {
    const pos = sidebarTabs._getCoords?.();
    if (pos && event.x !== undefined) {
      const relativeX = event.x - pos.xi;
      const newTab: 'channels' | 'users' = relativeX < 9 ? 'channels' : 'users';
      if (newTab !== sidebarTab) {
        switchSidebarTab(newTab);
      }
    }
  });

  // ========== CHANNEL LIST (Left Sidebar) ==========
  // Create dockable panel for channels
  const channelPanel = new DockablePanel({
    parent: screen,
    title: ' Channels ',
    top: MENU_HEIGHT + 1,  // Below tab bar
    left: 0,
    width: SIDEBAR_WIDTH,
    bottom: STATUS_HEIGHT + INPUT_HEIGHT,
    dockPosition: 'float',
    showMinimizeButton: true,
    resizable: true,
    draggable: true,
    minWidth: 15,
    minHeight: 10,
    border: { type: 'line', fg: 'cyan' },
    style: { border: { fg: 'cyan' } },
  });

  const channelList = createList({
    parent: channelPanel,
    top: 1,
    left: 1,
    width: '100%-2',
    height: '100%-2',
    label: '',
    border: { type: 'none' },
    style: {
      fg: 'white',
      selected: { fg: 'white', bg: 'blue' },
    } as any,
    tags: true,  // CRITICAL: Enable tag parsing for colored channel names
    mouse: true,
    keys: true,
    vi: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: '|',
      track: { ch: '|', bg: 'black' },
      style: { fg: 'cyan', bg: 'cyan' }
    } as any,
    items: [],
  });

  // Resize handling is now done by DockablePanel

  // Default channels to show when server hasn't responded
  const defaultChannels = [
    { id: 'general', name: 'general', type: 'public' as const },
    { id: 'random', name: 'random', type: 'public' as const },
    { id: 'help', name: 'help', type: 'public' as const },
  ];

  // Track channel data for selection handling
  let channelItems: Array<{ id: string; name: string }> = [];

  function isCurrentChannel(targetId?: string, targetName?: string): boolean {
    if (!state.currentChannel) return false;
    if (targetId && state.currentChannel === targetId) return true;
    if (targetName && state.currentChannel === targetName) return true;
    if (targetName && currentRoomLabel && currentRoomLabel === targetName) return true;
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

    // Build simple list items (no # prefix, no tree structure)
    // Active channel = white, unread = green, inactive = grey
    channelItems = channelsToShow.map(ch => ({ id: ch.id, name: ch.name }));
    const items = channelsToShow.map(ch => {
      const unread = ch.unreadCount ? ` (${ch.unreadCount})` : '';
      const isActive = isCurrentChannel(ch.id, ch.name);
      const hasUnread = ch.unreadCount && ch.unreadCount > 0;

      let color: string;
      let endColor: string;
      if (isActive) {
        color = '{white-fg}';
        endColor = '{/white-fg}';
      } else if (hasUnread) {
        color = '{green-fg}';
        endColor = '{/green-fg}';
      } else {
        color = '{gray-fg}';
        endColor = '{/gray-fg}';
      }

      return color + ch.name + unread + endColor;
    });

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
    const index = (channelList as any).selected || 0;
    if (index !== lastSelectedChannelIndex && index >= 0 && index < channelItems.length) {
      lastSelectedChannelIndex = index;
      const channel = channelItems[index];
    if (channel && !isCurrentChannel(channel.id, channel.name)) {
      if (state.currentChannel) socket.emit('room:leave');
      socket.emit('room:join', { roomName: channel.name });
    }
  }
  }

  // Handle channel selection with Enter (also focus input after)
  channelList.on('select', (_item: any, index: number) => {
    const channel = channelItems[index];
    if (channel) {
      if (!isCurrentChannel(channel.id, channel.name)) {
        if (state.currentChannel) socket.emit('room:leave');
        socket.emit('room:join', { roomName: channel.name });
      }
      // Return focus to input after pressing Enter
      inputBox.focus();
    }
  });

  // Auto-join on navigation keys (up/down/home/end/pageup/pagedown)
  channelList.key(['up', 'down', 'home', 'end', 'pageup', 'pagedown'], () => {
    // Defer to next tick so the selection has updated
    setTimeout(joinSelectedChannel, 0);
  });

  // Escape from channel list returns to input
  channelList.key(['escape'], () => {
    inputBox.focus();
    screen.render();
  });

  // Direct click handler for channelList - ensures focus on click and joins
  channelList.on('click', () => {
    channelList.focus();
    // Defer join to next tick so selection is updated
    setTimeout(joinSelectedChannel, 0);
    screen.render();
  });

  // ========== USER LIST (Left Sidebar - same position as channels) ==========
  // Create dockable panel for users
  const userPanel = new DockablePanel({
    parent: screen,
    title: ' Users ',
    top: MENU_HEIGHT + 1,  // Below tab bar
    left: 0,
    width: SIDEBAR_WIDTH,
    bottom: STATUS_HEIGHT + INPUT_HEIGHT,
    dockPosition: 'float',
    showMinimizeButton: true,
    resizable: true,
    draggable: true,
    minWidth: 15,
    minHeight: 10,
    border: { type: 'line', fg: 'magenta' },
    style: { border: { fg: 'magenta' } },
    hidden: true,  // Hidden by default, channels shown first
  });

  const userList = createList({
    parent: userPanel,
    top: 1,
    left: 1,
    width: '100%-2',
    height: '100%-2',
    label: '',
    border: { type: 'none' },
    mouse: true,
    keys: true,  // Enable arrow key navigation
    vi: true,    // j/k for up/down
    scrollable: true,
    tags: true,
    style: {
      fg: 'white',
      selected: { fg: 'black', bg: 'magenta' },
    },
  });

  // Resize handling is now done by DockablePanel

  function updateUserTable() {
    const items: string[] = [];
    // Simpler format for narrower sidebar
    for (const [uid, u] of onlineUsers) {
      const presence = presenceService.get(parseInt(uid));
      const status = presence?.status || u.status;
      const indicator = PRESENCE_INDICATORS[status] || '*';
      const name = u.username.slice(0, 12);
      items.push(`${indicator} ${name}`);
    }

    userList.setItems(items);
    userList.setLabel(` Users (${onlineUsers.size}) `);
  }

  // Function to switch sidebar tabs
  function switchSidebarTab(tab: 'channels' | 'users') {
    sidebarTab = tab;
    updateSidebarTabs();
    if (tab === 'channels') {
      userPanel.hide();
      channelPanel.show();
    } else {
      channelPanel.hide();
      userPanel.show();
    }
    screen.render();
  }

  // Handle user selection for DM
  userList.on('select', (item: any, index: number) => {
    const text = typeof item === 'string' ? item : (item as any).content || '';
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

  // Direct click handler for userList - ensures focus on click
  userList.on('click', () => {
    userList.focus();
    screen.render();
  });

  // ========== CHAT LOG (Main Area) ==========
  // Chat log fills from sidebar to right edge
  const { panel: chatPanel, log: chatLog } = createChatLog(screen, SIDEBAR_WIDTH);

  // Typing preview - visible bar above input box showing who is typing in real-time
  const typingBar = createBox({
    parent: screen,
    bottom: STATUS_HEIGHT + INPUT_HEIGHT,  // Above input box
    left: SIDEBAR_WIDTH,
    right: 0,
    height: TYPING_HEIGHT,
    tags: true,
    style: {
      fg: 'cyan',
      bg: 'black',
    },
    content: '',
  });

  // ========== RESPONSIVE LAYOUT ==========
  // Handle terminal resize and adjust layout for different screen sizes
  screen.responsiveLayout.onResize((width, height) => {
    const breakpoint = screen.responsiveLayout.getBreakpoint();

    if (breakpoint === 'small') {
      // Hide sidebar on small screens (< 80 cols)
      channelPanel.hide();
      userPanel.hide();
      sidebarTabs.hide();
      chatPanel.options.left = 0;
      chatPanel.options.width = '100%';
      (typingBar as any).left = 0;
    } else {
      // Show sidebar on medium/large screens
      sidebarTabs.show();
      if (sidebarTab === 'channels') {
        channelPanel.show();
      } else {
        userPanel.show();
      }
      chatPanel.options.left = SIDEBAR_WIDTH;
      chatPanel.options.width = undefined;
      chatPanel.options.right = 0;
      (typingBar as any).left = SIDEBAR_WIDTH;
    }

    screen.render();
  });

  function getChannelDisplayName(channelId?: string): string {
    if (!channelId) return '';
    if (channelId === state.currentChannel && currentRoomLabel) {
      return currentRoomLabel;
    }
    if (initialRoomId && channelId === initialRoomId && initialRoomName) {
      return initialRoomName;
    }
    const match = state.channels.find(ch => ch.id === channelId || ch.name === channelId);
    if (match) return match.name;
    return channelId;
  }

  function updateChatHeader() {
    const label = getChannelDisplayName(state.currentChannel) || 'Lobby';
    updateChatHeaderFn(chatLog, label);
  }

  function updateStatusBar() {
    updateStatusBarFn(
      statusBar,
      state,
      presenceService,
      username,
      userId,
      nodeId,
      getChannelDisplayName,
      updateChatHeader
    );
  }

  // ========== FOCUS BORDERS ==========
  // NOTE: Active panel borders (white on focus) are now handled automatically by SDK!
  // No need for manual focus handlers - the SDK's screen.setFocused() method
  // automatically changes border colors: white for focused, original color for blurred.
  // This applies to all panels: inputBox, channelList, userList, and chatLog.

  // ========== POPUP DIALOGS ==========
  // Note: Dialog widgets (Message, Prompt, Question) have built-in fixed heights.
  // Don't pass height: 'shrink' as it breaks nested element rendering.
  const { modalOverlay, showModal, hideModal, messageDialog, promptDialog, questionDialog, showMessageDialog, showPromptDialog, showConfirmDialog } = createDialogs(screen, inputBox);

  // Password dialog for private rooms
  const passwordOverlay = createBox({
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
  });

  const passwordInput = blessed.passbox({
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

  const passwordSubmitBtn = createButton({
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
      focus: { bg: 'cyan' },
    },
  });

  let pendingPrivateRoom = '';

  passwordSubmitBtn.on('press', () => {
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
  const showHelp = createHelpScreen(screen, inputBox);

  // Set the F1 handler function reference (defined earlier but set here)
  showHelpFn = showHelp;

  // Progress bar for file sharing
  const fileProgressBar = blessed.progressbar({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '60%',
    height: 3,
    label: ' File Transfer ',
    border: { type: 'line' },
    filled: 0,
    ch: '\u2588',  // Full block character
    pch: '\u2591', // Light shade character
    style: {
      fg: 'green',
      bg: 'black',
      border: { fg: 'green' },
    },
    hidden: true,
  });

  // Loading spinner
  const loadingBox = blessed.loading({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '50%',
    height: 5,
    label: ' Loading ',
    border: { type: 'line' },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'cyan' },
    },
    hidden: true,
  });

  // ========== SETTINGS OVERLAY ==========
  const settingsOverlay = createSettingsOverlay(
    screen,
    state,
    presenceService,
    socketEmitter,
    userId,
    updateStatusBar,
    hideModal
  );
  const { overlay: profileOverlay, showProfile: showUserProfile } = createProfileOverlay(
    screen,
    inputBox,
    onlineUsers,
    username,
    state,
    getUserColor,
    getChannelDisplayName,
    showMessageDialog,
    showDMPrompt,
    showModal,
    hideModal
  );

  // ========== DRAWING CANVAS (for drawing channels) ==========
  const { drawingCanvas, drawingChannels, isDrawingChannel, enterDrawingMode, exitDrawingMode } = createDrawingCanvas(screen, socket, state, chatLog, typingBar, bbs, inputBox, getChannelDisplayName, updateChannelList, updateStatusBar, addSystemMessage, MENU_HEIGHT, SIDEBAR_WIDTH, STATUS_HEIGHT, INPUT_HEIGHT);

  // ========== FILE SHARING ==========
  const { fileSharingOverlay, showFileSharing } = createFileSharing(screen, socket, state, username, addSystemMessage, addChatMessage, addActivity, audio, showModal, hideModal);

  // ========== CONTEXT MENUS ==========
  const { contextMenu, showContextMenu, hideContextMenu } = createContextMenus(screen, inputBox, showUserProfile, showDMPrompt, addSystemMessage, socket);

  // ========== MOUSE HANDLING & SCROLL WHEEL ==========
  // Using built-in blessed widget click events instead of custom screen-level handler

  // Sidebar tabs click handling
  sidebarTabs.on('click', (data: any) => {
    const relativeX = data.x - (sidebarTabs as any).aleft;
    switchSidebarTab(relativeX < 7 ? 'channels' : 'users');
  });

  // Input box click to focus
  inputBox.on('click', () => {
    inputBox.focus();
    screen.render();
  });

  // Chat log click to focus and show context menu
  chatLog.on('click', () => {
    chatLog.focus();
    showContextMenu(0, 0, 'chat');
    screen.render();
  });

  // User list click to focus and show user context menu
  userList.on('click', (data: any) => {
    userList.focus();
    const selected = (userList as any).selected;
    const items = (userList as any).items || [];
    if (selected !== undefined && items[selected]) {
      const text = typeof items[selected] === 'string' ? items[selected] : (items[selected] as any)?.content || '';
      const match = text.match(/^.\s+(\S+)/);
      if (match && match[1] && match[1] !== username) {
        showContextMenu(0, 0, 'user', match[1]);
      }
    }
    screen.render();
  });

  // Channel list click to focus and show channel context menu
  channelList.on('click', () => {
    channelList.focus();
    const selected = (channelList as any).selected;
    if (selected !== undefined && channelItems[selected]) {
      showContextMenu(0, 0, 'channel', channelItems[selected].name);
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

  function addChatMessage(line: string, applyMarkdown = true) {
    const parsed = applyMarkdown ? parseContent(line) : line;
    const highlighted = highlightMentions(parsed, username);
    chatLog.log(highlighted);
    screen.render();
  }

  function addSystemMessage(msg: string) {
    chatLog.log(`{gray-fg}*** ${msg} ***{/gray-fg}`);
    screen.render();
  }

  function addMessageFromUser(from: string, content: string, timestamp?: Date) {
    const time = formatTime(timestamp || new Date());
    const color = getUserColor(from);
    const parsed = parseContent(content);
    const highlighted = highlightMentions(parsed, username);
    chatLog.log(`{gray-fg}[${time}]{/gray-fg} <{${color}-fg}${from}{/${color}-fg}> ${highlighted}`);
    screen.render();
  }

  // Track the typing preview content
  const typingPreviewLines = new Map<number, string>();

  function updateTypingPreview() {
    const now = Date.now();
    let hasChanges = false;

    // Update typing preview content for each user
    for (const [userId, buf] of state.typingBuffers) {
      if (now - buf.lastUpdate > 5000) {
        // Expired - remove from preview
        if (typingPreviewLines.has(userId)) {
          typingPreviewLines.delete(userId);
          hasChanges = true;
        }
        continue;
      }

      if (buf.buffer.length > 0) {
        const color = getUserColor(buf.username);
        const line = `{${color}-fg}${buf.username}:{/${color}-fg} ${buf.buffer}{inverse} {/inverse}`;

        // Only update if content changed
        if (typingPreviewLines.get(userId) !== line) {
          typingPreviewLines.set(userId, line);
          hasChanges = true;
        }
      } else if (typingPreviewLines.has(userId)) {
        typingPreviewLines.delete(userId);
        hasChanges = true;
      }
    }

    // Display current typing preview in the typing bar
    if (hasChanges) {
      const lines = Array.from(typingPreviewLines.values());
      typingBar.setContent(lines.join('  ') || '');
      screen.render();
    }
  }

  // Events and activity now go to chat log
  function updateEventsFeed(event: string) {
    chatLog.log(`{gray-fg}[EVENT] ${event}{/gray-fg}`);
    screen.render();
  }

  function addActivity(activity: string) {
    chatLog.log(`{yellow-fg}[${formatTime(new Date())}] ${activity}{/yellow-fg}`);
    screen.render();
  }

  // ========== REGISTER EMOJI COMMANDS ==========
  // Register after addSystemMessage is defined
  registry.register(createEmojiCommand(screen, emojiPicker, inputBox, addSystemMessage));
  registry.register(createEmojiListCommand(addSystemMessage));
  registry.register(createCustomEmojiCommand(addSystemMessage));

  // ========== REGISTER EVENT FILTERING COMMAND ==========
  registry.register(createEventsCommand(state, addSystemMessage, updateStatusBar));


  function showHelpDialog() {
    // Show the comprehensive help overlay
    showHelp();
  }

  function showSettingsOverlay() {
    showModal(settingsOverlay);
  }

  function showNewMessagePrompt() {
    inputBox.focus();
    screen.render();
  }

  function showRoomMenu() {
    showPromptDialog('Enter room name to join:', '', (err, value) => {
      if (!err && value) {
        const roomName = value.replace(/^#/, '');
        if (isCurrentChannel(undefined, roomName)) {
          addSystemMessage(`Already in #${roomName}`);
          inputBox.focus();
          screen.render();
          return;
        }
        if (state.currentChannel) socket.emit('room:leave');
        socket.emit('room:join', { roomName });
        addSystemMessage(`Joining #${roomName}...`);
      }
      inputBox.focus();
      screen.render();
    });
  }

  function showUserList() {
    const users = Array.from(onlineUsers.values())
      .map(u => `${PRESENCE_INDICATORS[u.status]} ${u.username}`)
      .join('\n');
    showMessageDialog(
      '{bold}Users Online{/bold}\n\n' + users,
      () => { inputBox.focus(); }
    );
  }

  function showDMPrompt(targetUser: string) {
    showPromptDialog(`Message to @${targetUser}:`, '', (err, value) => {
      if (!err && value) {
        const processedMsg = replaceEmojis(value);
        socket.emit('chat:dm', { to: targetUser, message: processedMsg });
        addChatMessage(`{magenta-fg}[DM to ${targetUser}]: ${processedMsg}{/magenta-fg}`);
      }
      inputBox.focus();
      screen.render();
    });
  }

  function showLoading(text: string) {
    loadingBox.load(text);
  }

  function hideLoading() {
    loadingBox.stop();
  }

  // Confirmation dialog (using Question widget)
  function showConfirm(text: string, callback: (confirmed: boolean) => void) {
    showConfirmDialog(text, (answer: boolean) => {
      callback(answer);
    });
  }

  // File transfer progress
  function showFileProgress(filename: string) {
    fileProgressBar.setLabel(` Transferring: ${filename} `);
    fileProgressBar.setProgress(0);
    fileProgressBar.show();
    screen.render();
  }

  function updateFileProgress(percent: number) {
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
  function joinPrivateRoom(roomName: string) {
    pendingPrivateRoom = roomName;
    passwordOverlay.setLabel(` Password for #${roomName} `);
    showModal(passwordOverlay);
    passwordInput.focus();
    screen.render();
  }

  // ========== ROOM SOCKET HANDLERS ==========
  setupRoomHandlers(socket, state, onlineUsers, userId, username, nodeId, presenceService, updateChannelList, updateUserTable, updateStatusBar, addSystemMessage, addActivity, audio, hideLoading, setChannel, currentRoomLabel, showMessageDialog, inputBox, screen);

  // ========== CHAT SOCKET HANDLERS ==========
  setupChatHandlers(socket, state, userId, username, onlineUsers, presenceService, chatLog, updateUserTable, addSystemMessage, addChatMessage, addActivity, updateEventsFeed, audio, mentionsUser, getUserColor, formatMessage, processKeystroke, updateTypingPreview, screen, shouldShowEvent, getEventMessage, eventBus, addMessage, messageHandler, formatTime);


  // ========== INPUT HANDLING ==========

  inputBox.on('submit', async (value: string) => {
    try {
      // Hide command suggestions on submit
      hideCommandSuggestions();

      const msg = value.trim();
      if (!msg) {
        inputBox.clearValue();
        inputBox.focus();
        screen.render();
        return;
      }

    // Check if we're editing an existing message
    const isEditing = inputHistory.getEditingId() !== null;
    const editId = inputHistory.getEditingId();

    // Reset editing state
    inputHistory.reset();

    inputBox.clearValue();
    inputBox.focus();

    // Clear typing indicator
    socketEmitter.keystrokeSubmit(state.currentChannel, userId);

    if (msg.startsWith('/')) {
      cmdCtx.currentChannel = state.currentChannel;
      const r = await executeCommand(msg, registry, cmdCtx);
      const cmdName = msg.slice(1).split(' ')[0].toLowerCase();

      if (r.action === 'quit') {
        cleanup();
        return;
      }

      // Handle various commands
      if (r.action === 'join' && r.data?.channel) {
        if (state.currentChannel) socket.emit('room:leave');
        socket.emit('room:join', { roomName: r.data.channel });
        showLoading(`Joining #${r.data.channel}...`);
      }

      if (r.action === 'leave' || cmdName === 'leave' || cmdName === 'part') {
        socket.emit('room:leave');
      }

      if (cmdName === 'create' && r.data?.name) {
        socket.emit('room:create', { roomName: r.data.name, topic: r.data.topic || '', isPublic: true });
      }

      if (cmdName === 'who' || cmdName === 'users') {
        showUserList();
      }

      if (cmdName === 'kick' && r.data?.target) {
        socket.emit('room:kick', { targetUsername: r.data.target });
      }

      if ((cmdName === 'msg' || cmdName === 'dm' || cmdName === 'pm') && r.data?.target && r.data?.message) {
        const processedMsg = replaceEmojis(r.data.message);
        socket.emit('chat:dm', { to: r.data.target, message: processedMsg });
        addChatMessage(`{magenta-fg}[DM to ${r.data.target}]: ${processedMsg}{/magenta-fg}`);
      }

      if (cmdName === 'me' && r.message?.startsWith('ACTION:')) {
        const processedMsg = replaceEmojis(r.message);
        socket.emit('room:message', { message: processedMsg });
        const action = processedMsg.replace('ACTION: ', '');
        addChatMessage(`{magenta-fg}* ${action}{/magenta-fg}`);
      }

      if (cmdName === 'away' || cmdName === 'afk') {
        presenceService.setStatus(userId, 'away', r.data?.message);
        socket.emit('chat:presence', { status: 'away', custom: r.data?.message });
        const u = onlineUsers.get(String(userId));
        if (u) u.status = 'away';
        updateUserTable();
        updateStatusBar();
        addSystemMessage('You are now away');
      }

      if (cmdName === 'back' || cmdName === 'online') {
        presenceService.setStatus(userId, 'online');
        socket.emit('chat:presence', { status: 'online' });
        const u = onlineUsers.get(String(userId));
        if (u) u.status = 'online';
        updateUserTable();
        updateStatusBar();
        addSystemMessage('You are now online');
      }

      if (cmdName === 'clear' || cmdName === 'cls') {
        chatLog.setContent('');
      }

      if (cmdName === 'settings') {
        showSettingsOverlay();
      }

      if (cmdName === 'help') {
        showHelpDialog();
      }

      // Drawing commands - create/join a drawing channel
      if (cmdName === 'draw' || cmdName === 'whiteboard' || cmdName === 'art') {
        const args = msg.split(' ').slice(1);
        if (args.length === 0) {
          // Show the drawing channel menu
          showDrawMenu();
        } else {
          // Create/join specific drawing channel
          let channelName = args[0].replace(/^art:/i, '');
          const fullName = `art:${channelName}`;
          drawingChannels.add(fullName);
          socket.emit('room:join', { room: fullName });
          state.currentChannel = fullName;
          currentRoomLabel = fullName;
          updateStatusBar();
          enterDrawingMode(fullName);
          addSystemMessage(`Joined drawing channel #${fullName}`);
        }
      }

      // File sharing commands
      if (cmdName === 'files' || cmdName === 'file' || cmdName === 'share') {
        showFileSharing();
      }

      if (r.error) addSystemMessage(`Error: ${r.error}`);
      if (r.message && !r.message.startsWith('ACTION:')) addChatMessage(r.message);
    } else {
      // Regular message or edit
      const time = formatTime(new Date());
      const color = getUserColor(username);

      if (isEditing && editId) {
        // Editing an existing message
        const processedMsg = replaceEmojis(msg);
        socket.emit('chat:edit', { messageId: editId, newText: processedMsg });
        addSystemMessage(`(edited) ${msg}`);
      } else {
        // New message - generate ID and add to history
        const messageId = `${userId}-${Date.now()}`;
        const processedMsg = replaceEmojis(msg);
        socket.emit('room:message', { message: processedMsg, messageId });
        addChatMessage(`{gray-fg}[${time}]{/gray-fg} <{${color}-fg}${username}{/${color}-fg}> ${processedMsg}`);

        // Add to history with ID
        inputHistory.add(messageId, msg);
      }
    }

      // Force complete clear by hiding and showing the input box
      inputBox.clearValue();
      inputBox.hide();
      screen.render();
      inputBox.show();
      inputBox.focus();
      screen.render();
    } catch (error) {
      console.error('[LiveChat] Error in submit handler:', error);
      addSystemMessage(`{red-fg}Error: ${error instanceof Error ? error.message : 'Unknown error'}{/red-fg}`);
      inputBox.clearValue();
      inputBox.focus();
      screen.render();
    }
  });

  // Live typing indicator and command autocomplete
  inputBox.on('keypress', (ch: string, key: any) => {
    // Handle command autocomplete navigation when dropdown is visible
    if (commandSuggestionsVisible) {
      if (key.name === 'down' || (key.name === 'tab' && !key.shift)) {
        commandSuggestions.down(1);
        screen.render();
        return;
      } else if (key.name === 'up' || (key.name === 'tab' && key.shift)) {
        commandSuggestions.up(1);
        screen.render();
        return;
      } else if (key.name === 'enter' || key.name === 'return') {
        selectCommandSuggestion();
        return;
      } else if (key.name === 'escape') {
        hideCommandSuggestions();
        return;
      }
    }

    // Keystroke transmission for typing indicators
    if (key.name === 'backspace') {
      socketEmitter.keystroke(state.currentChannel, userId, 'BACKSPACE');
    } else if (ch && !key.ctrl && !key.meta && key.name !== 'enter') {
      socketEmitter.keystroke(state.currentChannel, userId, ch);
    }

    // Check for command autocomplete trigger
    // Use setTimeout to get the updated value after the keypress
    setTimeout(() => {
      const currentValue = inputBox.getValue();

      if (currentValue.startsWith('/') && currentValue.length > 0) {
        // Show command suggestions
        showCommandSuggestions(currentValue);
      } else {
        // Hide suggestions if not a command
        hideCommandSuggestions();
      }
    }, 0);
  });
  // ========== GLOBAL KEYBOARD SHORTCUTS ==========
  // Wrapper for switchSidebarTab to match expected signature
  const switchSidebarTabWrapper = (t: string) => {
    if (t === 'channels' || t === 'users') {
      switchSidebarTab(t);
    }
  };
  const { updateChatLayout } = setupKeyboardShortcuts(screen, chatLog, drawingCanvas, inputBox, sidebarTab, channelList, userList, sidebarTabs, emojiPicker, showHelp, switchSidebarTabWrapper, addSystemMessage, showFileSharing, showSettingsOverlay, showConfirm, cleanup, SIDEBAR_WIDTH);

  // Escape key: close dialogs and return focus to input
  // Note: Drawing canvas handles its own escape key for exiting drawing mode
  screen.key(['escape'], () => {
    // Close any open dialogs
    if (!settingsOverlay.hidden) {
      hideModal(settingsOverlay);
      return;  // Don't continue to inputBox.focus() since hideModal handles it
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
    socket.emit('room:leave');
    events.clear();

    // Remove all socket listeners to prevent memory leaks
    socket.removeAllListeners('chat:keystroke');
    socket.removeAllListeners('chat:keystroke-submit');
    socket.removeAllListeners('chat:keystroke-clear');
    socket.removeAllListeners('chat:message');
    socket.removeAllListeners('chat:edited');
    socket.removeAllListeners('chat:dm');
    socket.removeAllListeners('chat:presence');
    socket.removeAllListeners('chat:reaction');
    socket.removeAllListeners('bbs:event');
    socket.removeAllListeners('room:joined');
    socket.removeAllListeners('room:left');
    socket.removeAllListeners('room:list');
    socket.removeAllListeners('room:kicked');
    socket.removeAllListeners('room:error');

    // Disable mouse and clean up input handler
    screen.disableMouse();
    if (session.bbsSession) {
      delete session.bbsSession.doorInputHandler;
    }

    screen.destroy();
    bbs.write('\x1b[2J\x1b[H');
    bbs.writeLine('\x1b[33mThanks for using LiveChat v3.2! Goodbye.\x1b[0m');
    state.running = false;
  }

  // ========== MAIN ==========

  return {
    state,
    async run() {
      // Clear screen before drawing UI (prevent BBS log bleed-through)
      bbs.write('\x1b[2J\x1b[H');  // Clear screen and home cursor

      // Initial UI setup
      updateSidebarTabs();
      updateChannelList();
      updateUserTable();
      updateStatusBar();

      // Ensure command suggestions appear above everything else
      // (must be called after all other elements are created)
      commandSuggestions.setIndex(9999);

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
      await new Promise<void>((resolve) => {
        screen.on('destroy', resolve);
      });
    }
  };
}
