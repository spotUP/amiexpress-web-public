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
import { createMenuBar, MENU_HEIGHT, type MenuBar } from './ui/menu-bar';
import { createStatusBar, updateStatusBar as updateStatusBarFn, STATUS_HEIGHT } from './ui/status-bar';
import { createInputBox, createEmojiButton, INPUT_HEIGHT, EMOJI_BUTTON_WIDTH } from './ui/input-box';
import { createChatLog, updateChatHeader as updateChatHeaderFn, TYPING_HEIGHT } from './ui/chat-log';
import { createDisconnectionModal } from './ui/disconnection-modal';

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
import { createEnhancedVoiceChannel } from './features/voice-channel-ux';

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
import { replyCmd, threadCmd, editCmd } from './commands/msg-thread';
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

// Format picker for text formatting
import { FormatPicker } from './ui/format-picker';

// Animation system
import { createAnimationManager, hasAnimationTags } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/utils/animations';

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

// Helper to invalidate coordinate cache after direct position modification
function invalidateCache(element: any) {
  if (!element) return;
  element._coordsCacheValid = false;
  if (element.children) {
    for (const child of element.children) {
      invalidateCache(child);
    }
  }
}

export async function createApp(session: DoorSession) {
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
    // CRITICAL: Set BOTH flags for input routing (see TYPESCRIPT_DOOR_TROUBLESHOOTING.md)
    session.bbsSession.inDoorManager = true;
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
  const { panel: chatPanel, log: chatLog, preview: chatPreview } = createChatLog(screen, SIDEBAR_WIDTH);

  // Connect animation manager to chat log (done later after animationManager is created)
  // We'll use a deferred connection pattern

  // ========== STATUS BAR (at very bottom) ==========
  const statusBar = createStatusBar(screen);

  // ========== INPUT BOX (above status bar) ==========
  const inputBox = createInputBox(screen);

  // ========== EMOJI BUTTON (next to input box) ==========
  const emojiButton = createEmojiButton(screen);

  // ========== EMOJI PICKER ==========
  const emojiPicker = new EmojiPicker(screen);

  // ========== FORMAT PICKER ==========
  const formatPicker = new FormatPicker(screen);

  // ========== ANIMATION MANAGER ==========
  const animationManager = createAnimationManager({ fps: 10 });

  // Connect animation manager to chat log
  animationManager.connect({
    getLineContent: (idx: number) => chatLog.getLine(idx),
    setLineContent: (idx: number, content: string) => (chatLog as any).setLine?.(idx, content),
    render: () => screen.render(),
    getVisibleRange: () => (chatLog as any).getVisibleRange?.() || { start: 0, end: 100 },
  });

  // Wire up emoji button to show emoji picker
  emojiButton.on('press', () => {
    if (!emojiPicker.isVisible()) {
      emojiPicker.show(
        screen,
        (emoji: any) => {
          const currentText = inputBox.getValue();
          inputBox.setValue(currentText + emoji.code + ' ');
          inputBox.focus();
          screen.render();
        },
        () => {
          inputBox.focus();
          screen.render();
        }
      );
    }
  });

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

  // ========== CHANNEL LIST (Left Sidebar) ==========
  const channelList = createList({
    parent: screen,
    top: MENU_HEIGHT,  // Start right below menu
    left: 0,
    width: SIDEBAR_WIDTH,
    bottom: STATUS_HEIGHT + INPUT_HEIGHT,
    label: ' [Ch] Us ', // Tabs: [active] inactive
    border: { type: 'line' },
    style: {
      fg: 'white',
      border: { fg: 'cyan' },
      // NOTE: Don't use widget-level 'hover' or 'selected' - those apply to WHOLE widget
      // Use 'item.hover' and 'item.selected' for per-item styling
      item: {
        hover: { fg: 'yellow', bg: 'blue' },
        selected: { fg: 'white', bg: 'blue' },
      },
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
  let channelItems: Array<{ id: string; name: string; type: 'text' | 'voice' | 'header' | 'spacer' }> = [];

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

    // Build channel list with text and voice channels
    // CRITICAL: channelItems must be built in SAME order as items for index matching
    channelItems = [];
    const items: string[] = [];

    // Add TEXT CHANNELS header
    items.push('{cyan-fg}{bold}TEXT CHANNELS{/bold}{/cyan-fg}');
    channelItems.push({ id: '', name: '', type: 'header' as const });

    // Add text channels
    channelsToShow.forEach(ch => {
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

      items.push(color + '# ' + ch.name + unread + endColor);
      channelItems.push({ id: ch.id, name: ch.name, type: 'text' as const });
    });

    // Add spacer
    items.push('');
    channelItems.push({ id: '', name: '', type: 'spacer' as const });

    // Add VOICE CHANNELS header
    items.push('{cyan-fg}{bold}VOICE CHANNELS{/bold}{/cyan-fg}');
    channelItems.push({ id: '', name: '', type: 'header' as const });

    // Add voice channels
    const voiceChannels = voiceChannel.getVoiceChannels();
    if (voiceChannels.length === 0) {
      // Add default voice channel if none exist
      const isInVoice = voiceChannel.isInVoiceChannel();
      const icon = isInVoice ? '{green-fg}[V]{/green-fg}' : '{gray-fg}[V]{/gray-fg}';
      items.push(icon + ' General {gray-fg}(0){/gray-fg}');
      channelItems.push({ id: 'voice-general', name: 'General', type: 'voice' as const });
    } else {
      voiceChannels.forEach(vc => {
        const count = vc.participants.length;
        const isInVoice = voiceChannel.getCurrentVoiceChannel() === vc.id;
        const icon = isInVoice ? '{green-fg}[V]{/green-fg}' : count > 0 ? '{cyan-fg}[V]{/cyan-fg}' : '{gray-fg}[V]{/gray-fg}';
        items.push(icon + ' ' + vc.name + ' {gray-fg}(' + count + '){/gray-fg}');
        channelItems.push({ id: 'voice-' + vc.id, name: vc.name, type: 'voice' as const });
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
    const index = (channelList as any).selected || 0;
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
      } else if (!isCurrentChannel(channel.id, channel.name)) {
        // Join text channel
        if (state.currentChannel) socket.emit('room:leave');
        socket.emit('room:join', { roomName: channel.name });
      }
    }
  }

  // Handle channel selection - shared logic for both click and Enter
  function handleChannelSelect(index: number) {
    const channel = channelItems[index];

    // Skip headers and spacers
    if (!channel || channel.type === 'header' || channel.type === 'spacer') {
      return;
    }

    if (channel.type === 'voice') {
      // Join voice channel
      const channelId = channel.id.replace('voice-', '');
      voiceChannel.joinVoiceChannel(channelId);
      addSystemMessage(`Joining voice channel: ${channel.name}`);
    } else if (!isCurrentChannel(channel.id, channel.name)) {
      // Join text channel
      if (state.currentChannel) socket.emit('room:leave');
      socket.emit('room:join', { roomName: channel.name });
    }

    // Return focus to input after selection
    inputBox.focus();
  }

  // Handle channel selection with Enter key (emits 'select item')
  channelList.on('select item', (_item: any, index: number) => {
    handleChannelSelect(index);
  });

  // Handle channel selection with click (emits 'select')
  channelList.on('select', (_item: any, index: number) => {
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

  // ========== USER LIST (Left Sidebar - same position as channels) ==========
  const userList = createList({
    parent: screen,
    top: MENU_HEIGHT,  // Start right below menu
    left: 0,
    width: SIDEBAR_WIDTH,
    bottom: STATUS_HEIGHT + INPUT_HEIGHT,
    label: ' Ch [Us] ', // Tabs: inactive [active]
    border: { type: 'line' },
    mouse: true,
    clickable: true,  // Enable click events
    interactive: true,  // Enable interactive selection
    keys: true,  // Enable arrow key navigation
    vi: true,    // j/k for up/down
    scrollable: true,
    tags: true,
    hidden: true,  // Hidden by default, channels shown first
    style: {
      fg: 'white',
      border: { fg: 'magenta' },
      // NOTE: Don't use widget-level 'hover' or 'selected' - those apply to WHOLE widget
      // Use 'item.hover' and 'item.selected' for per-item styling
      item: {
        hover: { fg: 'yellow', bg: 'magenta' },
        selected: { fg: 'black', bg: 'magenta' },
      },
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
    // Keep tabs in label
    userList.setLabel(` Ch [Us] (${onlineUsers.size}) `);
  }

  // Function to switch sidebar tabs
  function switchSidebarTab(tab: 'channels' | 'users') {
    sidebarTab = tab;
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
    // Validate dimensions are positive numbers to prevent crashes
    if (!width || !height || width <= 0 || height <= 0 || !isFinite(width) || !isFinite(height)) {
      console.error(`[LiveChat] Invalid resize dimensions: ${width}x${height}, ignoring`);
      return;
    }

    const breakpoint = screen.responsiveLayout.getBreakpoint();

    // Update chat panel dimensions based on new screen size
    // Use position properties, not options (options are only read at construction)
    const chatWidth = width - SIDEBAR_WIDTH;
    const chatHeight = height - MENU_HEIGHT - STATUS_HEIGHT - INPUT_HEIGHT;  // Removed TYPING_HEIGHT since typing bar is hidden

    // Update full-width elements (percentage widths need recalculation on resize)
    statusBar.position.width = width;
    inputBox.position.width = width - EMOJI_BUTTON_WIDTH;  // Leave space for emoji button
    emojiButton.position.left = width - EMOJI_BUTTON_WIDTH;  // Position button at right edge
    menuBar.element.position.width = width;
    commandSuggestions.position.width = width;  // Full width for command suggestions

    const PREVIEW_HEIGHT = 1;
    const logWidth = (breakpoint === 'small' ? width : chatWidth) - 2;
    const logHeight = chatHeight - 2 - PREVIEW_HEIGHT;

    if (breakpoint === 'small') {
      // Hide sidebar on small screens (< 80 cols)
      channelList.hide();
      userList.hide();
      chatPanel.position.left = 0;
      chatPanel.position.width = width;
      chatPanel.position.height = chatHeight;
      // Update chatLog to match panel (minus 2 for resize handles)
      chatLog.position.width = logWidth;
      chatLog.position.height = logHeight;
      chatPreview.position.width = logWidth;
      chatPreview.position.left = 0;
      
      typingBar.position.left = 0;
      typingBar.position.width = width;
    } else {
      // Show sidebar on medium/large screens
      if (sidebarTab === 'channels') {
        channelList.show();
      } else {
        userList.show();
      }
      chatPanel.position.left = SIDEBAR_WIDTH;
      chatPanel.position.width = chatWidth;
      chatPanel.position.height = chatHeight;
      // Update chatLog to match panel (minus 2 for resize handles)
      chatLog.position.width = logWidth;
      chatLog.position.height = logHeight;
      chatPreview.position.width = logWidth;
      chatPreview.position.left = 0;

      typingBar.position.left = SIDEBAR_WIDTH;
      typingBar.position.width = chatWidth;
    }

    // Invalidate coordinate cache for all modified elements
    invalidateCache(statusBar);
    invalidateCache(inputBox);
    invalidateCache(emojiButton);
    invalidateCache(menuBar.element);
    invalidateCache(commandSuggestions);
    invalidateCache(chatPanel);
    invalidateCache(chatLog);
    invalidateCache(chatPreview);
    invalidateCache(typingBar);
    invalidateCache(channelList);
    invalidateCache(userList);

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
    // Validate state.channels exists before calling .find()
    if (!state || !state.channels || !Array.isArray(state.channels)) {
      return channelId;
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
      focus: { fg: 'white', bg: 'lightblue' },
      hover: { fg: 'white', bg: 'lightblue' },
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

  // ========== VOICE CHANNEL (Discord-style UX) ==========
  const voiceChannel = createEnhancedVoiceChannel({
    channelList,
    screen,
    socket,
    ctx: session as any, // Pass session as ctx for audio API access
    userId,
    username,
    chatPanel, // Pass chat panel so video grid renders in correct location
    onJoinVoice: (channelId: string) => {
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
  const getSelectionPosition = (selection: any) => {
    // Position relative to input box and selection start
    const inputLeft = (inputBox as any).aleft || 0;
    const inputTop = (inputBox as any).atop || 0;
    return {
      x: inputLeft + 1 + (selection.start || 0),  // +1 for border
      y: inputTop,  // Top of input box, dialog will appear above
    };
  };

  // Auto-show format picker when text is selected (keyboard or mouse)
  inputBox.on('select', (selection: any) => {
    if (selection && selection.text && !formatPicker.isVisible()) {
      formatPicker.show(
        screen,
        (format: any) => {
          // Wrap selected text with format
          const wrappedText = format.wrap(selection.text);
          (inputBox as any).replaceSelection?.(wrappedText);
          inputBox.focus();
          screen.render();
        },
        () => {
          inputBox.focus();
          screen.render();
        },
        getSelectionPosition(selection)
      );
    }
  });

  // Input box right-click to show format picker (when text is selected)
  inputBox.on('rightclick', () => {
    const selection = (inputBox as any).getSelection?.();
    if (selection && selection.text) {
      formatPicker.show(
        screen,
        (format: any) => {
          // Wrap selected text with format
          const wrappedText = format.wrap(selection.text);
          (inputBox as any).replaceSelection?.(wrappedText);
          inputBox.focus();
          screen.render();
        },
        () => {
          inputBox.focus();
          screen.render();
        },
        getSelectionPosition(selection)
      );
    }
  });

  // Chat log left-click to focus
  chatLog.on('click', () => {
    chatLog.focus();
    screen.render();
  });

  // Chat log right-click to show context menu
  chatLog.on('rightclick', (data: any) => {
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

  // User list left-click to focus
  userList.on('click', () => {
    userList.focus();
    screen.render();
  });

  // User list right-click to show context menu
  userList.on('rightclick', (event: any) => {
    userList.focus();
    const selected = (userList as any).selected;
    const items = (userList as any).items || [];
    if (selected !== undefined && items[selected]) {
      const text = typeof items[selected] === 'string' ? items[selected] : (items[selected] as any)?.content || '';
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
  channelList.on('click', (mouse: any) => {
    channelList.focus();

    // Calculate item index from click position
    const listTop = (channelList as any).atop || 0;
    const borderOffset = 1; // Top border
    const scrollOffset = (channelList as any).childBase || 0;
    const clickedRow = (mouse?.y || 0) - listTop - borderOffset + scrollOffset;

    if (clickedRow >= 0 && clickedRow < channelItems.length) {
      channelList.select(clickedRow);
      handleChannelSelect(clickedRow);
    }
    screen.render();
  });

  // Channel list right-click to show context menu
  channelList.on('rightclick', (event: any) => {
    channelList.focus();
    const selected = (channelList as any).selected;
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

  function addChatMessage(line: string, applyMarkdown = true) {
    const parsed = applyMarkdown ? parseContent(line) : line;
    const highlighted = highlightMentions(parsed, username);
    appendLineToLog(highlighted);
    screen.render();
  }

  function addSystemMessage(msg: string) {
    appendLineToLog(`{gray-fg}*** ${msg} ***{/gray-fg}`);
    screen.render();
  }

  function addMessageFromUser(from: string, content: string, timestamp?: Date) {
    const time = formatTime(timestamp || new Date());
    const color = getUserColor(from);
    const parsed = parseContent(content);
    const highlighted = highlightMentions(parsed, username);
    appendLineToLog(`{gray-fg}[${time}]{/gray-fg} <{${color}-fg}${from}{/${color}-fg}> ${highlighted}`);
    screen.render();
  }

  function appendLineToLog(line: string) {
    // Add directly to the log widget (handles newlines correctly)
    chatLog.add(line);

    // Register animated lines with animation manager if needed
    // (Note: animation manager currently uses line indexes which might need adjustment for Log widget)
    // For now, we focus on fixing the concatenation issue.
    
    screen.render();
  }

  function updateTypingPreview() {
    const now = Date.now();
    const previewLines: string[] = [];

    // Update typing preview content for each user
    for (const [userId, buf] of state.typingBuffers) {
      if (now - buf.lastUpdate > 5000) {
        continue;
      }

      if (buf.buffer.length > 0) {
        const color = getUserColor(buf.username);
        const time = formatTime(new Date());
        // Format preview like a real message
        const line = `{gray-fg}[${time}]{/gray-fg} <{${color}-fg}${buf.username}{/${color}-fg}> ${buf.buffer}█`;
        previewLines.push(line);
      }
    }

    // Update the dedicated preview box
    chatPreview.setContent(previewLines.join('  '));
    screen.render();
  }

  // Events and activity now go to chat log (use appendLineToLog for proper tracking)
  function updateEventsFeed(event: string) {
    appendLineToLog(`{gray-fg}[EVENT] ${event}{/gray-fg}`);
    screen.render();
  }

  function addActivity(activity: string) {
    appendLineToLog(`{yellow-fg}[${formatTime(new Date())}] ${activity}{/yellow-fg}`);
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

  // ========== REGISTER THREAD COMMANDS ==========
  registry.register(replyCmd);
  registry.register(threadCmd);
  registry.register(editCmd);

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
  // Setter function for currentRoomLabel to prevent stale references
  const setCurrentRoomLabel = (value: string) => { currentRoomLabel = value; };
  setupRoomHandlers(socket, state, onlineUsers, userId, username, nodeId, presenceService, updateChannelList, updateUserTable, updateStatusBar, addSystemMessage, addActivity, audio, hideLoading, setChannel, setCurrentRoomLabel, showMessageDialog, inputBox, screen);

  // but chatPreview is a separate widget that also needs clearing
  socket.on('room:joined', () => {
    chatPreview.setContent('');
  });

  // ========== CHAT SOCKET HANDLERS ==========
  setupChatHandlers(socket, state, userId, username, onlineUsers, presenceService, chatLog, updateUserTable, addSystemMessage, addChatMessage, addActivity, updateEventsFeed, audio, mentionsUser, getUserColor, formatMessage, processKeystroke, updateTypingPreview, screen, shouldShowEvent, getEventMessage, eventBus, addMessage, messageHandler, formatTime);

  loader.update(85, 'Initializing event handlers...');

  // ========== BBS EVENT HANDLERS ==========
  // Listen to BBS system events (login, logout, upload, download, door activity)
  const bbsEventHandler = new BBSEventHandler(socket);
  bbsEventHandler.onEvent((event) => {
    const formattedEvent = bbsEventHandler.formatEvent(event);
    // Use appendLineToLog instead of chatLog.add() to maintain chatMessages consistency
    appendLineToLog(formattedEvent);
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

  let reconnectAttempts = 0;
  let userCancelled = false;  // Track if user clicked cancel
  const MAX_RECONNECT_ATTEMPTS = 3;

  // Create disconnection modal (will be shown when needed)
  const disconnectionModal = createDisconnectionModal({
    screen,
    onRetry: () => {
      reconnectAttempts++;
      if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
        addSystemMessage('{yellow-fg}Attempting to reconnect...{/yellow-fg}');
        // The socket will automatically try to reconnect via socket.io
        setTimeout(() => {
          if (!socket.connected) {
            disconnectionModal.showError(
              `{red-fg}Lost connection to server{/red-fg}\n\n` +
              `Reconnection failed\n\n` +
              `Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`
            );
          }
        }, 3000);
      } else {
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

  function showConnectionErrorDialog(errorMessage: string) {
    // Don't show multiple dialogs or if user already cancelled
    if (userCancelled) return;

    disconnectionModal.showError(
      `{red-fg}Lost connection to server{/red-fg}\n\n` +
      `${errorMessage}\n\n` +
      `Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`
    );
  }

  socket.on('disconnect', (reason: string) => {
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
    reconnectAttempts = 0;
    disconnectionModal.hide();
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
    cleanup,
    showConfirm  // Pass showConfirm for quit confirmation
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
    updateTypingPreview,
    () => {
      // Clear chat log
      chatLog.setContent('');
      chatPreview.setContent('');
      screen.render();
    }
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
      }
      // For regular messages, let the natural 'submit' event handler process it
      // DON'T manually emit submit here - it causes double submission
      // The blessed input widget will emit 'submit' naturally on enter
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
  // Getter function for current sidebar tab value (prevents stale references)
  const getSidebarTab = () => sidebarTab;
  const { updateChatLayout } = setupKeyboardShortcuts(screen, chatPanel, drawingCanvas, inputBox, getSidebarTab, channelList, userList, emojiPicker, showHelp, switchSidebarTabWrapper, addSystemMessage, showFileSharing, showSettingsOverlay, showConfirm, cleanup, SIDEBAR_WIDTH, chatLog, typingBar);

  // F5 / Ctrl+Shift+F: Format picker (requires text selection)
  const showFormatPicker = () => {
    if (formatPicker.isVisible()) return;
    const selection = (inputBox as any).getSelection?.();
    if (selection && selection.text) {
      formatPicker.show(
        screen,
        (format: any) => {
          const wrappedText = format.wrap(selection.text);
          (inputBox as any).replaceSelection?.(wrappedText);
          inputBox.focus();
          screen.render();
        },
        () => {
          inputBox.focus();
          screen.render();
        },
        getSelectionPosition(selection)
      );
    } else {
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
      } else {
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
        emojiPicker.show(
          screen,
          (emoji: any) => {
            const currentText = inputBox.getValue();
            inputBox.setValue(currentText + emoji.code + ' ');
            inputBox.focus();
            screen.render();
          },
          () => {
            inputBox.focus();
            screen.render();
          }
        );
      }
    },
    onFiles: () => showFileSharing(),
    onPins: () => {
      getPinnedMessages(socket, state.currentChannel);
      screen.render();
    },
    onSearch: () => {
      // Open search overlay (same as Ctrl+F)
      if (currentSearchOverlayRef.current) currentSearchOverlayRef.current.destroy();
      currentSearchOverlayRef.current = createSearchOverlay(
        screen,
        (query: string, filters: any) => {
          if (query && query.length >= 2) {
            searchMessages(socket, query, {
              roomId: state.currentChannel,
              ...filters
            });
          } else {
            addSystemMessage('Search query must be at least 2 characters');
          }
        },
        () => {
          if (currentSearchOverlayRef.current) {
            currentSearchOverlayRef.current.destroy();
            currentSearchOverlayRef.current = null;
          }
          inputBox.focus();
        }
      );
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
    if (currentSearchOverlayRef.current) currentSearchOverlayRef.current.destroy();
    currentSearchOverlayRef.current = createSearchOverlay(
      screen,
      (query: string, filters: any) => {
        if (query && query.length >= 2) {
          searchMessages(socket, query, {
            roomId: state.currentChannel,
            ...filters
          });
        } else {
          addSystemMessage('Search query must be at least 2 characters');
        }
      },
      () => {
        if (currentSearchOverlayRef.current) {
          currentSearchOverlayRef.current.destroy();
          currentSearchOverlayRef.current = null;
        }
        inputBox.focus();
      }
    );
    screen.render();
  });

  // F7: Show pinned messages
  screen.key(['f7'], () => {
    getPinnedMessages(socket, state.currentChannel);
    screen.render();
  });

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

    // Cleanup voice channel
    voiceChannel.destroy();

    // Cleanup animation manager
    animationManager.destroy();

    // Cleanup format picker
    formatPicker.destroy();

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
    socket.removeAllListeners('room:created');
    socket.removeAllListeners('room:user-joined');
    socket.removeAllListeners('room:user-left');
    socket.removeAllListeners('disconnect');
    socket.removeAllListeners('connect');
    socket.removeAllListeners('connect_error');

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
      await new Promise<void>((resolve) => {
        screen.on('destroy', resolve);
      });
    }
  };
}
