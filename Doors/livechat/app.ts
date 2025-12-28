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
import { DockablePanel, Question } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList, createButton, createText, createLog, createDialogs, createModalManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { colorize, Tags } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { stripTags, cleanTags } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/helpers';
import { DoorLoader } from '@amiexpress/bbs-door-sdk/utils/DoorLoader';

// Core state and services
import { addMessage, setChannel, AppState } from './core/state';
import { executeCommand } from './core/command-exec';
import { getUserColor, formatMessage, formatSystemMessage, formatReactions } from './core/formatter';
import { shouldShowEvent } from './core/socket-typing';
import { initializeLiveChat } from './core/initialization';

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
import { createChatLog, updateChatHeader as updateChatHeaderFn, addBBSEvent, TYPING_HEIGHT } from './ui/chat-log';

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
import { BBSEventHandler } from './handlers/bbs-event.handler';
import { setupThreadListeners, replyToThread, getThreadMessages, cleanupThreadListeners } from './handlers/thread-handlers';
import { createThreadView } from './ui/thread-view';
import { setupPinListeners, pinMessage, unpinMessage, getPinnedMessages, cleanupPinListeners } from './handlers/pin-handlers';
import { createPinnedPanel } from './ui/pinned-panel';
import { pinCmd, unpinCmd, pinnedCmd } from './commands/pin';
import { setupSearchListeners, searchMessages, cleanupSearchListeners } from './handlers/search-handlers';
import { createSearchOverlay } from './ui/search-overlay';
import { searchCmd } from './commands/search';
import { kickCmd, banCmd, unbanCmd, muteCmd, unmuteCmd } from './commands/moderation';
import { createDialogHelpers } from './ui/dialog-helpers';
import { handleCommandActions } from './handlers/command-execution-handlers';
import { createSubmitHandler } from './handlers/input-submit-handler';

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
  const { bbs, socket } = session;
  bbs.enableWideMode?.();

  const ctx = initializeLiveChat(session);
  const { username, userId, nodeId, secLevel, state, registry, socketEmitter, presenceService,
    eventBus, audioEngine, audio, messageHandler, commandHandler, onlineUsers, cmdCtx } = ctx;
  let { currentRoomLabel } = ctx;

  // Room state
  const initialRoomId = session.bbsSession?.currentRoomId as string | undefined;
  const initialRoomName = session.bbsSession?.currentRoomName as string | undefined;

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

  // ========== LOADING SCREEN ==========
  const loader = new DoorLoader(screen, {
    overlay: true,
    overlayOpacity: 0.6,
    barColor: 'cyan',
  });

  loader.show('Initializing LiveChat...');
  screen.render();

  await loader.delay(100);
  loader.update(25, 'Creating chat interface...');

  // Layout constants for 80x24 terminal
  const SIDEBAR_WIDTH = 18;  // Single combined sidebar

  // Track which tab is active in the sidebar
  let sidebarTab: 'channels' | 'users' = 'channels';

  // ========== MENU BAR (at top) ==========
  const menuBar = createMenuBar(screen);

  // ========== CHAT LOG (Main Area) - CREATE FIRST so it renders behind fixed UI ==========
  // Chat log fills from sidebar to right edge
  const { panel: chatPanel, log: chatLog } = createChatLog(screen, SIDEBAR_WIDTH);

  // ========== STATUS BAR (at very bottom) ==========
  const statusBar = createStatusBar(screen);

  // ========== INPUT BOX (above status bar) ==========
  const inputBox = createInputBox(screen);

  // ========== EMOJI PICKER ==========
  const emojiPicker = new EmojiPicker(screen);

  loader.update(50, 'Setting up features...');

  // ========== COMMAND AUTOCOMPLETE ==========
  const commandSuggestions = createList({
    parent: screen,
    bottom: INPUT_HEIGHT + STATUS_HEIGHT,
    left: 0,
    width: '100%',  // Full screen width to fit command descriptions
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
  const ghostText = createBox({
    parent: screen,
    bottom: INPUT_HEIGHT + STATUS_HEIGHT - 1,  // Align with input field content
    left: 10,  // Will be dynamically positioned based on cursor
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
  let filteredCommands: SlashCommand[] = [];
  let currentGhostCompletion = '';  // Track the current ghost text completion

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
      ghostText.hide();
      commandSuggestionsVisible = false;
      currentGhostCompletion = '';
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
      } else {
        // No exact prefix match - hide ghost text
        ghostText.hide();
        currentGhostCompletion = '';
      }
    } else {
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
  const channelList = createList({
    parent: screen,
    top: MENU_HEIGHT + 1,  // Below tab bar
    left: 0,
    width: SIDEBAR_WIDTH,
    bottom: STATUS_HEIGHT + INPUT_HEIGHT,
    label: ' Channels ',
    border: { type: 'line' },
    style: {
      fg: 'white',
      border: { fg: 'cyan' },
      selected: { fg: 'white', bg: 'blue' },
      hover: { fg: 'yellow', bg: 'blue' },
      item: { hover: { fg: 'yellow', bg: 'blue' } },
    } as any,
    tags: true,  // CRITICAL: Enable tag parsing for colored channel names
    mouse: true,
    clickable: true,  // Enable click events
    keys: true,
    vi: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: '█'
    },
    items: [],
  });

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
  const userList = createList({
    parent: screen,
    top: MENU_HEIGHT + 1,  // Below tab bar
    left: 0,
    width: SIDEBAR_WIDTH,
    bottom: STATUS_HEIGHT + INPUT_HEIGHT,
    label: ' Users ',
    border: { type: 'line' },
    mouse: true,
    clickable: true,  // Enable click events
    keys: true,  // Enable arrow key navigation
    vi: true,    // j/k for up/down
    scrollable: true,
    tags: true,
    hidden: true,  // Hidden by default, channels shown first
    style: {
      fg: 'white',
      border: { fg: 'magenta' },
      selected: { fg: 'black', bg: 'magenta' },
      hover: { fg: 'yellow', bg: 'magenta' },
      item: { hover: { fg: 'yellow', bg: 'magenta' } },
    } as any,
  });

  function updateUserTable() {
    const items: string[] = [];
    // Simpler format for narrower sidebar
    for (const [uid, u] of onlineUsers) {
      const presence = presenceService.get(parseInt(uid));
      const status = presence?.status || u.status;
      const indicator = PRESENCE_INDICATORS[status as PresenceStatus] || '*';
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
      userList.hide();
      channelList.show();
    } else {
      channelList.hide();
      userList.show();
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

  // Typing preview - now integrated into chat log (not a separate bar)
  // Keep the typingBar element for layout compatibility but hide it
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
    hidden: true,  // Hide since typing previews are now in chat log
  });

  // ========== RESPONSIVE LAYOUT ==========
  // Handle terminal resize and adjust layout for different screen sizes
  // NOTE: Must update element.position (not element.options) because _getCoords() reads from position
  screen.responsiveLayout.onResize((width, height) => {
    console.log(`[LiveChat] Responsive layout resize: ${width}x${height}`);
    const breakpoint = screen.responsiveLayout.getBreakpoint();

    // Update chat panel dimensions based on new screen size
    // Use position properties, not options (options are only read at construction)
    const chatWidth = width - SIDEBAR_WIDTH;
    const chatHeight = height - MENU_HEIGHT - STATUS_HEIGHT - INPUT_HEIGHT - TYPING_HEIGHT;

    // Update full-width elements (percentage widths need recalculation on resize)
    statusBar.position.width = width;
    inputBox.position.width = width;
    menuBar.position.width = width;
    commandSuggestions.position.width = width;  // Full width for command suggestions

    if (breakpoint === 'small') {
      // Hide sidebar on small screens (< 80 cols)
      channelList.hide();
      userList.hide();
      sidebarTabs.hide();
      chatPanel.position.left = 0;
      chatPanel.position.width = width;
      chatPanel.position.height = chatHeight;
      // Update chatLog to match panel (minus 2 for resize handles)
      chatLog.position.width = width - 2;
      chatLog.position.height = chatHeight - 2;
      typingBar.position.left = 0;
      typingBar.position.width = width;
    } else {
      // Show sidebar on medium/large screens
      sidebarTabs.show();
      if (sidebarTab === 'channels') {
        channelList.show();
      } else {
        userList.show();
      }
      chatPanel.position.left = SIDEBAR_WIDTH;
      chatPanel.position.width = chatWidth;
      chatPanel.position.height = chatHeight;
      // Update chatLog to match panel (minus 2 for resize handles)
      chatLog.position.width = chatWidth - 2;
      chatLog.position.height = chatHeight - 2;
      typingBar.position.left = SIDEBAR_WIDTH;
      typingBar.position.width = chatWidth;
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

  // ========== CREATE DIALOG HELPERS ==========
  const {
    showHelpDialog,
    showSettingsOverlay,
    showNewMessagePrompt,
    showRoomMenu,
    showUserList,
    showDMPrompt
  } = createDialogHelpers(
    showHelp,
    showModal,
    showPromptDialog,
    showMessageDialog,
    settingsOverlay,
    inputBox,
    screen,
    socket,
    state,
    onlineUsers,
    addSystemMessage,
    addChatMessage,
    replaceEmojis,
    PRESENCE_INDICATORS
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
  chatLog.on('click', (data: any) => {
    chatLog.focus();

    // Don't show context menu if clicking near the edges (resize handle area)
    // Resize handles are 3 cols wide and 2 rows tall at each corner
    const x = data?.x || 0;
    const y = data?.y || 0;
    const width = (chatLog as any).width || 80;
    const height = (chatLog as any).height || 24;

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

  // User list click to focus and show user context menu
  userList.on('click', (data: any) => {
    console.log('[USER LIST CLICK] Event fired, data:', data);
    userList.focus();
    const selected = (userList as any).selected;
    const items = (userList as any).items || [];
    console.log('[USER LIST CLICK] Selected:', selected, 'Items:', items);
    if (selected !== undefined && items[selected]) {
      const text = typeof items[selected] === 'string' ? items[selected] : (items[selected] as any)?.content || '';
      console.log('[USER LIST CLICK] Text:', JSON.stringify(text));
      const match = text.match(/^.\s+(\S+)/);
      console.log('[USER LIST CLICK] Match:', match);
      if (match && match[1]) {
        // Use mouse coordinates from click event, fallback to 0,0
        const x = data?.x || 0;
        const y = data?.y || 0;
        console.log('[USER LIST CLICK] Showing context menu for user:', match[1], 'at', x, y);
        showContextMenu(x, y, 'user', match[1]);
      } else {
        console.log('[USER LIST CLICK] No match found for text:', text);
      }
    } else {
      console.log('[USER LIST CLICK] No item selected or items empty');
    }
    screen.render();
  });

  // Channel list click to focus and show channel context menu
  channelList.on('click', (data: any) => {
    channelList.focus();
    const selected = (channelList as any).selected;
    if (selected !== undefined && channelItems[selected]) {
      // Use mouse coordinates from click event, fallback to 0,0
      const x = data?.x || 0;
      const y = data?.y || 0;
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

  function addChatMessage(line: string, applyMarkdown = true) {
    console.log('[addChatMessage] Called with line:', line.substring(0, 100));
    console.log('[addChatMessage] applyMarkdown:', applyMarkdown);
    const parsed = applyMarkdown ? parseContent(line) : line;
    console.log('[addChatMessage] After parsing:', parsed.substring(0, 100));
    const highlighted = highlightMentions(parsed, username);
    console.log('[addChatMessage] After highlighting:', highlighted.substring(0, 100));
    console.log('[addChatMessage] Calling chatLog.log()...');
    chatLog.log(highlighted);
    console.log('[addChatMessage] Calling screen.render()...');
    screen.render();
    console.log('[addChatMessage] Done');
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
  let typingPreviewLineCount = 0;

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
        const line = `{gray-fg}${buf.username}: ${buf.buffer}█{/gray-fg}`;

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

    // Display current typing previews in the chat log (inline after last message)
    if (hasChanges) {
      // Save current scroll position
      const currentScroll = chatLog.getScrollPerc();
      const wasAtBottom = currentScroll >= 95; // User was at or near bottom

      // Get current log content and remove previous typing preview lines
      const logLines = chatLog.getLines();
      const contentLines = logLines.slice(0, logLines.length - typingPreviewLineCount);

      // Build complete content with typing previews
      const lines = Array.from(typingPreviewLines.values());
      const fullContent = [...contentLines, ...lines].join('\n');

      // Update content in one operation to minimize jumping
      chatLog.setContent(fullContent);
      typingPreviewLineCount = lines.length;

      // Restore scroll position
      if (wasAtBottom) {
        chatLog.setScrollPerc(100);
      } else {
        chatLog.setScrollPerc(currentScroll);
      }

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

  // ========== REGISTER PIN COMMANDS ==========
  registry.register(pinCmd);
  registry.register(unpinCmd);
  registry.register(pinnedCmd);

  // ========== REGISTER SEARCH COMMAND ==========
  registry.register(searchCmd);

  // ========== REGISTER MODERATION COMMANDS ==========
  registry.register(kickCmd);
  registry.register(banCmd);
  registry.register(unbanCmd);
  registry.register(muteCmd);
  registry.register(unmuteCmd);

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

  loader.update(70, 'Connecting to chat server...');

  // ========== ROOM SOCKET HANDLERS ==========
  setupRoomHandlers(socket, state, onlineUsers, userId, username, nodeId, presenceService, updateChannelList, updateUserTable, updateStatusBar, addSystemMessage, addActivity, audio, hideLoading, setChannel, currentRoomLabel, showMessageDialog, inputBox, screen);

  // ========== CHAT SOCKET HANDLERS ==========
  setupChatHandlers(socket, state, userId, username, onlineUsers, presenceService, chatLog, updateUserTable, addSystemMessage, addChatMessage, addActivity, updateEventsFeed, audio, mentionsUser, getUserColor, formatMessage, processKeystroke, updateTypingPreview, screen, shouldShowEvent, getEventMessage, eventBus, addMessage, messageHandler, formatTime);

  loader.update(85, 'Initializing event handlers...');

  // ========== BBS EVENT HANDLERS ==========
  // Listen to BBS system events (login, logout, upload, download, door activity)
  const bbsEventHandler = new BBSEventHandler(socket);
  bbsEventHandler.onEvent((event) => {
    const formattedEvent = bbsEventHandler.formatEvent(event);
    addBBSEvent(chatLog, formattedEvent);
    screen.render();
  });
  bbsEventHandler.listen();

  // ========== THREAD HANDLERS ==========
  let currentThreadView: any = null;
  setupThreadListeners(
    socket,
    (data) => {
      // Thread created
      addSystemMessage(`Thread created: ${data.title}`);
    },
    (data) => {
      // Thread reply received
      addSystemMessage(`New reply in thread`);
      if (currentThreadView) {
        currentThreadView.destroy();
        getThreadMessages(socket, data.threadId);
      }
    },
    (data) => {
      // Thread messages received - show thread view
      if (currentThreadView) currentThreadView.destroy();
      currentThreadView = createThreadView(screen, data);
    }
  );

  // ========== PIN HANDLERS ==========
  let currentPinnedPanel: any = null;
  let pinnedMessages: any[] = [];

  setupPinListeners(
    socket,
    (data) => {
      // Pin updated - store and refresh if panel open
      pinnedMessages = data.pinnedMessages;
      addSystemMessage(`Pinned messages updated (${pinnedMessages.length} total)`);
      if (currentPinnedPanel) {
        currentPinnedPanel.destroy();
        currentPinnedPanel = createPinnedPanel(screen, pinnedMessages);
      }
    },
    (data) => {
      // Pin list received - show panel
      pinnedMessages = data.pinnedMessages;
      if (currentPinnedPanel) currentPinnedPanel.destroy();
      currentPinnedPanel = createPinnedPanel(screen, pinnedMessages);
    }
  );

  // ========== SEARCH HANDLERS ==========
  const currentSearchOverlayRef = { current: null as any };

  setupSearchListeners(socket, (data) => {
    // Search results received
    if (currentSearchOverlayRef.current) {
      currentSearchOverlayRef.current.updateResults(data.results);
      addSystemMessage(`Found ${data.count} results for "${data.query}"`);
    }
  });

  // ========== MODERATION EVENT LISTENERS ==========
  socket.on('chat:kicked', (data: any) => {
    addSystemMessage(`{red-fg}You have been kicked${data.reason ? ': ' + data.reason : ''}{/red-fg}`);
    addSystemMessage(`{yellow-fg}Disconnecting...{/yellow-fg}`);
    setTimeout(() => cleanup(), 2000);
  });

  socket.on('chat:banned', (data: any) => {
    addSystemMessage(`{red-fg}You have been banned${data.duration ? ' for ' + data.duration + 's' : ''}${data.reason ? ': ' + data.reason : ''}{/red-fg}`);
    addSystemMessage(`{yellow-fg}Disconnecting...{/yellow-fg}`);
    setTimeout(() => cleanup(), 2000);
  });

  socket.on('chat:muted', (data: any) => {
    addSystemMessage(`{yellow-fg}You have been muted${data.duration ? ' for ' + data.duration + 's' : ''}{/yellow-fg}`);
  });

  // ========== CONNECTION ERROR HANDLING ==========

  let disconnectDialog: any = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;

  function showConnectionErrorDialog(errorMessage: string) {
    // Don't show multiple dialogs
    if (disconnectDialog) return;

    disconnectDialog = new Question({
      parent: screen,
      title: ' Connection Error ',
      text: `{red-fg}Lost connection to server{/red-fg}\n\n${errorMessage}\n\nAttempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`,
      width: 50,
      height: 12,
      overlay: true,
      overlayOpacity: 0.7,
      style: {
        bg: 'black',
        fg: 'white',
      },
    });

    disconnectDialog.ask('Try to reconnect?', (answer: boolean) => {
      disconnectDialog.destroy();
      disconnectDialog = null;

      if (answer) {
        // User chose "Yes" - attempt reconnect
        reconnectAttempts++;
        if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
          addSystemMessage('{yellow-fg}Attempting to reconnect...{/yellow-fg}');
          // The socket will automatically try to reconnect via socket.io
          setTimeout(() => {
            if (!socket.connected) {
              showConnectionErrorDialog('Reconnection failed');
            }
          }, 3000);
        } else {
          addSystemMessage('{red-fg}Maximum reconnection attempts reached. Please restart LiveChat.{/red-fg}');
          setTimeout(() => cleanup(), 2000);
        }
      } else {
        // User chose "No" or "Cancel" - exit gracefully
        addSystemMessage('{yellow-fg}Disconnected by user. Exiting...{/yellow-fg}');
        setTimeout(() => cleanup(), 1000);
      }
    });
  }

  socket.on('disconnect', (reason: string) => {
    console.log('[LiveChat] Socket disconnected:', reason);
    if (reason !== 'io client disconnect') {
      // Server initiated disconnect or connection lost
      showConnectionErrorDialog(`Disconnected: ${reason}`);
    }
  });

  socket.on('connect_error', (error: any) => {
    console.error('[LiveChat] Connection error:', error.message);
    showConnectionErrorDialog(`Connection error: ${error.message}`);
  });

  socket.on('connect', () => {
    console.log('[LiveChat] Socket reconnected');
    reconnectAttempts = 0;
    if (disconnectDialog) {
      disconnectDialog.destroy();
      disconnectDialog = null;
    }
    addSystemMessage('{green-fg}Reconnected to server!{/green-fg}');
  });

  // ========== INPUT HANDLING ==========

  // Wrapper for handleCommandActions to match submit handler signature
  const commandActionHandler = (r: any) => handleCommandActions(
    r,
    socket,
    state,
    onlineUsers,
    currentSearchOverlayRef,
    createSearchOverlay,
    searchMessages,
    addSystemMessage,
    replyToThread,
    pinMessage,
    unpinMessage,
    getPinnedMessages,
    screen,
    inputBox,
    cleanup
  );

  inputBox.on('submit', createSubmitHandler(
    socket,
    state,
    registry,
    cmdCtx,
    userId,
    username,
    onlineUsers,
    presenceService,
    socketEmitter,
    inputHistory,
    inputBox,
    screen,
    chatLog,
    currentSearchOverlayRef,
    drawingChannels,
    currentRoomLabel,
    hideCommandSuggestions,
    commandActionHandler,
    showLoading,
    showUserList,
    addChatMessage,
    addSystemMessage,
    replyToThread,
    pinMessage,
    unpinMessage,
    getPinnedMessages,
    createSearchOverlay,
    searchMessages,
    cleanup,
    showSettingsOverlay,
    showHelpDialog,
    showDrawMenu,
    enterDrawingMode,
    updateStatusBar,
    updateUserTable,
    showFileSharing,
    updateTypingPreview
  ));

  // Live typing indicator and command autocomplete
  inputBox.on('keypress', (ch: string, key: any) => {
    // Handle Enter key - submit message instead of inserting newline
    if (key.name === 'enter' || key.name === 'return') {
      if (commandSuggestionsVisible) {
        // If ghost completion exists, accept it; otherwise select from dropdown
        if (currentGhostCompletion) {
          inputBox.setValue(`/${currentGhostCompletion} `);
          inputBox.focus();
          hideCommandSuggestions();
          screen.render();
        } else {
          selectCommandSuggestion();
        }
        return;
      } else {
        // Regular message - submit it
        // Prevent the default newline insertion by calling submit directly
        const value = inputBox.getValue();
        inputBox.emit('submit', value);
        return;
      }
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
      } else if (key.name === 'down') {
        commandSuggestions.down(1);
        screen.render();
        return;
      } else if (key.name === 'up') {
        commandSuggestions.up(1);
        screen.render();
        return;
      } else if (key.name === 'escape') {
        hideCommandSuggestions();
        return;
      }
    }

    // Keystroke transmission for typing indicators + local echo
    if (key.name === 'backspace') {
      socketEmitter.keystroke(state.currentChannel, userId, 'BACKSPACE');
      // Local echo: update own typing preview
      processKeystroke(state.typingBuffers, userId, username, 'BACKSPACE', getUserColor(username));
      updateTypingPreview();
    } else if (ch && !key.ctrl && !key.meta && key.name !== 'enter') {
      socketEmitter.keystroke(state.currentChannel, userId, ch);
      // Local echo: update own typing preview
      processKeystroke(state.typingBuffers, userId, username, ch, getUserColor(username));
      updateTypingPreview();
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
  const { updateChatLayout } = setupKeyboardShortcuts(screen, chatPanel, drawingCanvas, inputBox, sidebarTab, channelList, userList, sidebarTabs, emojiPicker, showHelp, switchSidebarTabWrapper, addSystemMessage, showFileSharing, showSettingsOverlay, showConfirm, cleanup, SIDEBAR_WIDTH, chatLog, typingBar);

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

    // Stop listening to BBS events to prevent memory leak
    bbsEventHandler.unlisten();

    // Stop listening to thread events
    cleanupThreadListeners(socket);

    // Stop listening to pin events
    cleanupPinListeners(socket);

    // Stop listening to search events
    cleanupSearchListeners(socket);

    // Remove moderation event listeners
    socket.removeAllListeners('chat:kicked');
    socket.removeAllListeners('chat:banned');
    socket.removeAllListeners('chat:muted');

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

    // Restore fixed terminal mode for BBS screens
    bbs.disableWideMode?.();

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

      loader.update(95, 'Finalizing...');
      await loader.delay(100);
      loader.update(100, 'Ready!');
      await loader.delay(500);
      loader.hide();
      loader.destroy();  // Completely remove loader and overlay from screen

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
      await new Promise<void>((resolve) => {
        screen.on('destroy', resolve);
      });
    }
  };
}
