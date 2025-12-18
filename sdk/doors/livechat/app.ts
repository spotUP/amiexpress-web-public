/**
 * LiveChat v3.0 - Desktop-Level Multi-User Chat
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
import contrib, { log as createLog } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib';

// Core state and services
import { createInitialState, addMessage, setChannel, AppState } from './core/state';
import { createCommandContext, executeCommand } from './core/command-exec';
import { getUserColor, formatMessage, formatSystemMessage, formatReactions } from './core/formatter';
import { createCommandRegistry } from './commands';

// Services
import { events, formatBBSEvent, getEventMessage, SocketEmitter, PresenceService, ExtendedEventBus } from './services';

// Handlers
import { MessageHandler } from './handlers/message';
import { KeystrokeHandler } from './handlers/keystroke';
import { CommandHandler } from './handlers/command';

// UI components (typing preview)
import { processKeystroke, renderTypingPreview } from './ui/typing-preview';

// Utils
import { formatTime } from './utils/format';
import { AudioService } from './utils/audio';
import { mentionsUser, highlightMentions } from './utils/mentions';
import { parseContent } from './utils/markdown';

// Types
import { PRESENCE_INDICATORS } from './types';
import type { PresenceStatus, BBSEvent, Message } from './types';

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
  const { bbs, user, socket } = session;
  const username = user?.username || 'Guest';
  const userId = parseInt(user?.id, 10) || 0;
  const nodeId = session.bbsSession?.nodeId || 1;
  const secLevel = user?.secLevel || 10;

  // Initialize state
  const state = createInitialState();
  const registry = createCommandRegistry();

  // Services
  const socketEmitter = new SocketEmitter(socket);
  const presenceService = new PresenceService();
  const eventBus = new ExtendedEventBus(socket);
  const audio = new AudioService(null);

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
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: 'LiveChat v3.0',
    output: (data: string) => bbs.write(data),
  });

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
        return;
      }
      screen._handleData(data);
    };
  }

  // Enable mouse support
  screen.enableMouse();

  // Layout constants for 80x24 terminal
  const SIDEBAR_WIDTH = 18;  // Single combined sidebar
  const MENU_HEIGHT = 1;
  const STATUS_HEIGHT = 1;
  const INPUT_HEIGHT = 3;

  // Track which tab is active in the sidebar
  let sidebarTab: 'channels' | 'users' = 'channels';

  // ========== MENU BAR (at top) ==========
  const menuBar = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: MENU_HEIGHT,
    tags: true,
    ch: ' ',  // Fill character for background
    style: {
      fg: 'yellow',
      bg: 'blue',
    },
  });
  menuBar.setContent(' F1:Help  F2:Sidebar  F3:ChTab  F5:Art  F6:Files  Tab:Focus  ^S:Set  ^Q:Quit ');

  // ========== STATUS BAR (at very bottom) ==========
  const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: STATUS_HEIGHT,
    tags: true,
    ch: ' ',  // Fill character for background
    style: {
      fg: 'white',
      bg: 'blue',
    },
  });

  // ========== INPUT BOX (above status bar) ==========
  const inputBox = blessed.textbox({
    parent: screen,
    bottom: STATUS_HEIGHT,
    left: 0,
    width: '100%',
    height: INPUT_HEIGHT,
    label: ' Message ',
    border: { type: 'line' },
    inputOnFocus: true,
    mouse: true,
    style: {
      fg: 'white',
      border: { fg: 'yellow' },
    },
  });

  // ========== INPUT HISTORY WITH EDIT SUPPORT ==========
  // History tracks message IDs for editing
  interface HistoryEntry {
    id: string;
    text: string;
  }
  const inputHistory: HistoryEntry[] = [];
  let historyIndex = -1;
  let savedInput = '';  // Save current input when navigating history
  let editingMessageId: string | null = null;  // Track if we're editing a message
  const MAX_HISTORY = 100;

  // Get the message being edited (if any)
  const getEditingEntry = (): HistoryEntry | null => {
    if (historyIndex === -1) return null;
    const idx = inputHistory.length - 1 - historyIndex;
    return inputHistory[idx] || null;
  };

  // Handle up/down arrows for history navigation (screen-level for reliability)
  // Only works when inputBox is focused
  screen.key(['up'], () => {
    const focused = screen.getFocused();
    if (focused !== inputBox) return;  // Let lists handle their own navigation
    if (inputHistory.length === 0) return;

    // Save current input if we're starting to navigate
    if (historyIndex === -1) {
      savedInput = inputBox.getValue() || '';
    }

    // Move up in history (newer to older)
    if (historyIndex < inputHistory.length - 1) {
      historyIndex++;
      const entry = getEditingEntry();
      if (entry) {
        editingMessageId = entry.id;
        inputBox.setValue(entry.text);
        // Show editing indicator
        inputBox.setLabel(` [EDITING] `);
      }
      screen.render();
    }
  });

  screen.key(['down'], () => {
    const focused = screen.getFocused();
    if (focused !== inputBox) return;  // Let lists handle their own navigation
    if (historyIndex === -1) return;

    // Move down in history (older to newer)
    historyIndex--;

    if (historyIndex === -1) {
      // Restore saved input - back to new message mode
      inputBox.setValue(savedInput);
      editingMessageId = null;
      inputBox.setLabel(' Message ');
    } else {
      const entry = getEditingEntry();
      if (entry) {
        editingMessageId = entry.id;
        inputBox.setValue(entry.text);
      }
    }
    screen.render();
  });

  // ========== SIDEBAR TAB BAR ==========
  const sidebarTabs = blessed.box({
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
    const chTab = sidebarTab === 'channels' ? '{inverse}[Ch]{/}' : ' Ch ';
    const usTab = sidebarTab === 'users' ? '{inverse}[Us]{/}' : ' Us ';
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
  const channelList = blessed.list({
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
    } as any,
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

  // Default channels to show when server hasn't responded
  const defaultChannels = [
    { id: 'general', name: 'general', type: 'public' as const },
    { id: 'random', name: 'random', type: 'public' as const },
    { id: 'help', name: 'help', type: 'public' as const },
  ];

  // Track channel data for selection handling
  let channelItems: Array<{ id: string; name: string }> = [];

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
    channelItems = channelsToShow.map(ch => ({ id: ch.id, name: ch.name }));
    const items = channelsToShow.map(ch => {
      const unread = ch.unreadCount ? ` (${ch.unreadCount})` : '';
      return ch.name + unread;
    });

    channelList.setItems(items);

    // Select current channel if in the list
    const currentIdx = channelItems.findIndex(ch => ch.id === state.currentChannel);
    if (currentIdx >= 0) {
      channelList.select(currentIdx);
    }

    screen.render();
  }

  // Handle channel selection
  channelList.on('select', (_item: any, index: number) => {
    const channel = channelItems[index];
    if (channel) {
      if (state.currentChannel) socket.emit('room:leave');
      socket.emit('room:join', { roomName: channel.name });
      // Return focus to input after selecting
      inputBox.focus();
    }
  });

  // Escape from channel list returns to input
  channelList.key(['escape'], () => {
    inputBox.focus();
    screen.render();
  });

  // Direct click handler for channelList - ensures focus on click
  channelList.on('click', () => {
    channelList.focus();
    screen.render();
  });

  // ========== USER LIST (Left Sidebar - same position as channels) ==========
  const userList = blessed.list({
    parent: screen,
    top: MENU_HEIGHT + 1,  // Below tab bar
    left: 0,
    width: SIDEBAR_WIDTH,
    bottom: STATUS_HEIGHT + INPUT_HEIGHT,
    label: ' Users ',
    border: { type: 'line' },
    mouse: true,
    keys: true,  // Enable arrow key navigation
    vi: true,    // j/k for up/down
    scrollable: true,
    tags: true,
    hidden: true,  // Hidden by default, channels shown first
    style: {
      fg: 'white',
      border: { fg: 'magenta' },
      selected: { fg: 'black', bg: 'magenta' },
    },
  });

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

  // Direct click handler for userList - ensures focus on click
  userList.on('click', () => {
    userList.focus();
    screen.render();
  });

  // ========== CHAT LOG (Main Area) ==========
  // Chat log fills from sidebar to right edge
  const chatLog = createLog({
    parent: screen,
    top: MENU_HEIGHT,
    left: SIDEBAR_WIDTH,
    right: 0,  // Extend to right edge (no right sidebar)
    bottom: STATUS_HEIGHT + INPUT_HEIGHT,
    label: ' Chat ',
    border: { type: 'line' },
    mouse: true,
    scrollable: true,
    tags: true,
    scrollbar: {
      ch: ' ',
    },
    bufferLength: 500,
    style: {
      fg: 'white',
      border: { fg: 'green' },
    },
  }) as Log;

  // Typing preview (hidden box for tracking - not displayed)
  const typingBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    hidden: true,
    tags: true,
  });

  function updateStatusBar() {
    const ch = state.currentChannel || 'none';
    const status = state.prefs.muteAllEvents ? 'MUTED' : 'LIVE';
    const presence = presenceService.get(userId);
    const myStatus = presence?.status || 'online';
    statusBar.setContent(
      ` @${username} | Node ${nodeId} | #${ch} | ${PRESENCE_INDICATORS[myStatus]} ${myStatus.toUpperCase()} | [${status}] | F1:Help `
    );
  }

  // ========== FOCUS BORDERS ==========
  // Highlight focused panel with white border
  const panelDefaultBorders = new Map<any, string>();
  panelDefaultBorders.set(inputBox, 'yellow');
  panelDefaultBorders.set(channelList, 'cyan');
  panelDefaultBorders.set(userList, 'magenta');
  panelDefaultBorders.set(chatLog, 'green');

  function setFocusBorder(panel: any, focused: boolean) {
    const defaultColor = panelDefaultBorders.get(panel) || 'white';
    const newColor = focused ? 'white' : defaultColor;
    if (panel.style?.border) {
      panel.style.border.fg = newColor;
    }
    screen.render();
  }

  // Add focus/blur handlers to each panel
  for (const [panel, _defaultColor] of panelDefaultBorders) {
    panel.on('focus', () => setFocusBorder(panel, true));
    panel.on('blur', () => setFocusBorder(panel, false));
  }

  // ========== POPUP DIALOGS ==========
  // Note: Dialog widgets (Message, Prompt, Question) have built-in fixed heights.
  // Don't pass height: 'shrink' as it breaks nested element rendering.

  // Message dialog
  const messageDialog = blessed.message({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    // height uses widget default (9)
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'cyan' },
    },
  });

  // Prompt dialog
  const promptDialog = blessed.prompt({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    // height uses widget default (12)
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'green' },
    },
  });

  // Loading indicator
  const loadingBox = blessed.loading({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 40,
    height: 5,
    border: { type: 'line' },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'blue' },
    },
    hidden: true,
  });

  // Question dialog (Yes/No confirmations)
  const questionDialog = blessed.question({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 45,
    // height uses widget default (9)
    title: ' Confirm ',
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'yellow' },
    },
  });

  // Password dialog for private rooms
  const passwordOverlay = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '50%',
    height: 8,
    label: ' Enter Room Password ',
    border: { type: 'line' },
    shadow: true,
    hidden: true,
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

  const passwordSubmitBtn = blessed.button({
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
    passwordOverlay.hide();
    inputBox.focus();
    screen.render();
  });

  passwordOverlay.key(['escape'], () => {
    passwordInput.clearValue();
    passwordOverlay.hide();
    inputBox.focus();
    screen.render();
  });

  passwordInput.on('submit', () => {
    passwordSubmitBtn.emit('press');
  });

  // ========== HELP SCREEN ==========
  const helpOverlay = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    label: ' LiveChat v3.0 Help ',
    border: { type: 'line' },
    shadow: false,
    hidden: true,
    mouse: true,
    ch: ' ',  // Fill background
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'cyan' },
    },
  });

  // Help header using BigText
  const helpHeader = blessed.bigtext({
    parent: helpOverlay,
    top: 0,
    left: 'center',
    width: 'shrink',
    height: 'shrink',
    content: 'HELP',
    font: 'simple',
    ch: ' ',
    style: { fg: 'cyan', bg: 'black' },
  });

  // Help content using ScrollableText
  const helpContent = blessed.scrollabletext({
    parent: helpOverlay,
    top: 3,
    left: 1,
    width: '100%-4',
    height: '100%-6',
    tags: true,
    mouse: true,
    scrollable: true,
    focusable: true,  // Allow focus for key handling
    ch: ' ',  // Fill background
    scrollbar: {
      ch: ' ',
    },
    style: {
      fg: 'white',
      bg: 'black',
    },
    content: `{bold}{cyan-fg}=== LIVECHAT v3.0 - DESKTOP-LEVEL BBS CHAT ==={/cyan-fg}{/bold}

{yellow-fg}A full-featured multi-user chat system with neo-blessed UI{/yellow-fg}

{bold}{green-fg}--- KEYBOARD SHORTCUTS ---{/green-fg}{/bold}

{cyan-fg}Navigation:{/cyan-fg}
  Tab           Next channel
  Shift+Tab     Previous channel
  PageUp        Scroll chat up
  PageDown      Scroll chat down
  Escape        Close dialogs / Return to input

{cyan-fg}Chat:{/cyan-fg}
  Enter         Send message
  Ctrl+N        New message prompt
  Ctrl+R        Room menu (join room)
  Ctrl+S        Open settings
  F1            Show this help

{cyan-fg}Window Controls:{/cyan-fg}
  F2            Toggle sidebar visibility
  F3            Switch sidebar tab (Channels/Users)
  F5            Create/join drawing channel
  F6            File sharing browser
  Tab           Cycle focus between panels
  Ctrl+C/Q      Quit (with confirmation)

{bold}{green-fg}--- COMMANDS ---{/green-fg}{/bold}

{cyan-fg}Room Commands:{/cyan-fg}
  /join <room>      Join a channel
  /leave            Leave current channel
  /create <name>    Create new channel
  /topic <text>     Set channel topic
  /rooms            List all rooms

{cyan-fg}User Commands:{/cyan-fg}
  /who              List online users
  /whois <user>     User information
  /dm <user> <msg>  Send direct message
  /ignore <user>    Ignore a user
  /unignore <user>  Unignore a user

{cyan-fg}Status Commands:{/cyan-fg}
  /away [msg]       Set away status
  /back             Return from away
  /status <status>  Set status (online/away/busy/dnd)

{cyan-fg}Other Commands:{/cyan-fg}
  /me <action>      Send action message
  /clear            Clear chat window
  /draw <channel>   Open drawing whiteboard
  /files            Open file sharing browser
  /help             Show this help
  /quit             Exit LiveChat

{bold}{green-fg}--- FEATURES ---{/green-fg}{/bold}

{cyan-fg}Menu Bar:{/cyan-fg}
  Click menu items or use keyboard shortcuts.
  Chat | Rooms | Files | Draw | Settings | Help

{cyan-fg}Channel Tree:{/cyan-fg}
  Left panel shows channels and DMs.
  Click to expand/collapse groups.
  Click channel to join.

{cyan-fg}User List:{/cyan-fg}
  Right panel shows online users.
  Click user to view profile.
  Right-click for context menu.

{cyan-fg}Context Menus (Right-Click):{/cyan-fg}
  On users: Profile, DM, Mention, Ignore
  On chat: Copy, Reply, Quote
  On channels: Join, Leave, Info

{cyan-fg}Chat Features:{/cyan-fg}
  - Live typing indicators
  - @mentions (highlighted)
  - **bold** and *italic* markdown
  - Message reactions
  - Scrollable history (500 lines)

{cyan-fg}Settings Panel (Ctrl+S):{/cyan-fg}
  - Mute BBS events
  - Mute sounds
  - Show/hide typing indicators
  - Show/hide timestamps
  - Set presence status

{cyan-fg}Mouse Support:{/cyan-fg}
  - Click anywhere to interact
  - Scroll wheel in all panels
  - Drag to select (where supported)

{bold}{green-fg}--- DRAWING CHANNELS (F5) ---{/green-fg}{/bold}

{cyan-fg}Create Drawing Channels:{/cyan-fg}
  Press F5 or use /art <name> to create
  a collaborative whiteboard channel.
  Drawing channels are prefixed with art:

{cyan-fg}Example:{/cyan-fg}
  /art doodles  - Creates art:doodles

{cyan-fg}Drawing Controls:{/cyan-fg}
  Mouse        Click and drag to draw
  C            Cycle through colors
  X            Clear the canvas
  Escape       Return to chat

{cyan-fg}Colors:{/cyan-fg} White Red Green Blue Yellow Cyan Magenta Gray

{bold}{green-fg}--- FILE SHARING (F6) ---{/green-fg}{/bold}

{cyan-fg}Share Files:{/cyan-fg}
  Browse and share files with chat users.
  Press F6 or use the Files menu.

{cyan-fg}File Browser:{/cyan-fg}
  - Navigate with arrow keys
  - Enter to select directories
  - Press Share to send file link
  - Escape to close

{bold}{green-fg}--- TIPS ---{/green-fg}{/bold}

{yellow-fg}*{/yellow-fg} Use @username to mention someone
{yellow-fg}*{/yellow-fg} Use **text** for bold
{yellow-fg}*{/yellow-fg} Use *text* for italic
{yellow-fg}*{/yellow-fg} Press F2/F3 to maximize chat area
{yellow-fg}*{/yellow-fg} Scroll wheel works everywhere
{yellow-fg}*{/yellow-fg} Right-click for context menus

{bold}{green-fg}--- ABOUT ---{/green-fg}{/bold}

LiveChat v3.0 is built with neo-blessed,
a full-featured terminal UI library.

Features 25+ widget types including:
- Menu bars, trees, tables
- Dialogs, prompts, questions
- Progress bars, loading spinners
- Checkboxes, radio buttons
- Scrollable text areas
- Drawing canvas (whiteboard)
- File manager browser
- Semi-transparent overlays
- Password input boxes

{gray-fg}Press Escape or F1 to close this help{/gray-fg}`,
  });

  // Help footer
  const helpFooter = blessed.box({
    parent: helpOverlay,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: { fg: 'black', bg: 'cyan' },
    content: ' {bold}Scroll: Mouse/PageUp/PageDown | Close: Escape/F1{/bold} ',
  });

  // Help wheel scrolling
  helpContent.on('wheelup', () => {
    helpContent.scroll(-3);
    screen.render();
  });
  helpContent.on('wheeldown', () => {
    helpContent.scroll(3);
    screen.render();
  });

  // Close help on escape or F1 (on helpContent since that's what gets focused)
  helpContent.key(['escape', 'f1'], () => {
    helpOverlay.hide();
    inputBox.focus();
    screen.render();
  });

  function showHelp() {
    helpOverlay.show();
    helpOverlay.setFront();
    helpContent.focus();
    screen.render();
  }

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

  // ========== SETTINGS OVERLAY ==========
  const settingsOverlay = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '70%',
    height: '70%',
    label: ' Settings ',
    border: { type: 'line' },
    shadow: true,
    hidden: true,
    mouse: true,
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'cyan' },
    },
  });

  // Settings checkboxes
  const settingMuteEvents = blessed.checkbox({
    parent: settingsOverlay,
    top: 2,
    left: 2,
    text: 'Mute BBS Events',
    checked: state.prefs.muteAllEvents,
    mouse: true,
    style: {
      fg: 'white',
    },
  });

  const settingMuteSounds = blessed.checkbox({
    parent: settingsOverlay,
    top: 4,
    left: 2,
    text: 'Mute Sounds',
    checked: false,
    mouse: true,
    style: {
      fg: 'white',
    },
  });

  const settingShowTyping = blessed.checkbox({
    parent: settingsOverlay,
    top: 6,
    left: 2,
    text: 'Show Typing Indicators',
    checked: true,
    mouse: true,
    style: {
      fg: 'white',
    },
  });

  const settingTimestamps = blessed.checkbox({
    parent: settingsOverlay,
    top: 8,
    left: 2,
    text: 'Show Timestamps',
    checked: true,
    mouse: true,
    style: {
      fg: 'white',
    },
  });

  // Line separator in settings
  const settingsSeparator = blessed.line({
    parent: settingsOverlay,
    top: 10,
    left: 2,
    width: '100%-6',
    orientation: 'horizontal',
    type: 'line',
    style: { fg: 'gray' },
  });

  // Presence status label
  const statusLabel = blessed.box({
    parent: settingsOverlay,
    top: 11,
    left: 2,
    width: 20,
    height: 1,
    content: 'My Status:',
    style: { fg: 'cyan' },
  });

  // RadioSet for presence status selection
  const statusRadioSet = blessed.radioset({
    parent: settingsOverlay,
    top: 13,
    left: 2,
    width: '100%-6',
    height: 5,
    mouse: true,
    items: [
      { text: 'Online', value: 'online' },
      { text: 'Away', value: 'away' },
      { text: 'Busy', value: 'busy' },
      { text: 'Do Not Disturb', value: 'dnd' },
    ],
    selected: 0, // Default to online
    vertical: true,
    spacing: 1,
    style: { fg: 'white' },
  });

  // Handle status change
  statusRadioSet.on('change', (value: string) => {
    presenceService.setStatus(userId, value as PresenceStatus);
    socketEmitter.presenceUpdate(value as PresenceStatus);
    updateStatusBar();
  });

  // Close settings button
  const closeSettingsBtn = blessed.button({
    parent: settingsOverlay,
    bottom: 1,
    left: 'center',
    width: 12,
    height: 1,
    content: ' Close ',
    mouse: true,
    style: {
      fg: 'white',
      bg: 'blue',
      focus: { bg: 'cyan' },
    },
  });

  closeSettingsBtn.on('press', () => {
    // Apply settings
    state.prefs.muteAllEvents = settingMuteEvents.isChecked();
    settingsOverlay.hide();
    inputBox.focus();
    screen.render();
  });

  settingsOverlay.key(['escape'], () => {
    settingsOverlay.hide();
    inputBox.focus();
    screen.render();
  });

  // ========== USER PROFILE OVERLAY ==========
  const profileOverlay = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    height: 16,
    label: ' User Profile ',
    border: { type: 'line' },
    shadow: true,
    hidden: true,
    mouse: true,
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'magenta' },
    },
  });

  let profileTargetUser = '';

  const profileNameBox = blessed.box({
    parent: profileOverlay,
    top: 1,
    left: 2,
    width: '100%-4',
    height: 1,
    tags: true,
    content: '{bold}Name:{/bold} ',
  });

  const profileNodeBox = blessed.box({
    parent: profileOverlay,
    top: 3,
    left: 2,
    width: '100%-4',
    height: 1,
    tags: true,
    content: '{bold}Node:{/bold} ',
  });

  const profileStatusBox = blessed.box({
    parent: profileOverlay,
    top: 5,
    left: 2,
    width: '100%-4',
    height: 1,
    tags: true,
    content: '{bold}Status:{/bold} ',
  });

  const profileChannelBox = blessed.box({
    parent: profileOverlay,
    top: 7,
    left: 2,
    width: '100%-4',
    height: 1,
    tags: true,
    content: '{bold}In Channel:{/bold} ',
  });

  const profileSendDMBtn = blessed.button({
    parent: profileOverlay,
    bottom: 2,
    left: 5,
    width: 16,
    height: 1,
    content: ' Send DM ',
    mouse: true,
    style: {
      fg: 'white',
      bg: 'green',
      focus: { bg: 'cyan' },
    },
  });

  const profileCloseBtn = blessed.button({
    parent: profileOverlay,
    bottom: 2,
    right: 5,
    width: 12,
    height: 1,
    content: ' Close ',
    mouse: true,
    style: {
      fg: 'white',
      bg: 'blue',
      focus: { bg: 'cyan' },
    },
  });

  function showUserProfile(targetUser: string) {
    // Find user in onlineUsers Map by username
    let foundUser: { username: string; status: string; nodeId?: number; joinedAt?: Date } | null = null;
    for (const [, u] of onlineUsers) {
      if (u.username === targetUser) {
        foundUser = u;
        break;
      }
    }

    if (!foundUser) {
      messageDialog.display(`User ${targetUser} not found.`, () => {
        inputBox.focus();
        screen.render();
      });
      return;
    }

    profileTargetUser = targetUser;
    const color = getUserColor(targetUser);
    const statusIcon = foundUser.status === 'idle' ? '{yellow-fg}[idle]{/yellow-fg}' : '{green-fg}[active]{/green-fg}';

    profileNameBox.setContent(`{bold}Name:{/bold} {${color}-fg}${targetUser}{/${color}-fg}`);
    profileNodeBox.setContent(`{bold}Node:{/bold} ${foundUser.nodeId || 'Unknown'}`);
    profileStatusBox.setContent(`{bold}Status:{/bold} ${statusIcon}`);
    profileChannelBox.setContent(`{bold}In Channel:{/bold} ${state.currentChannel || 'Lobby'}`);

    profileOverlay.setLabel(` ${targetUser}'s Profile `);
    profileOverlay.show();
    profileSendDMBtn.focus();
    screen.render();
  }

  profileSendDMBtn.on('press', () => {
    profileOverlay.hide();
    if (profileTargetUser && profileTargetUser !== username) {
      showDMPrompt(profileTargetUser);
    }
  });

  profileCloseBtn.on('press', () => {
    profileOverlay.hide();
    inputBox.focus();
    screen.render();
  });

  profileOverlay.key(['escape'], () => {
    profileOverlay.hide();
    inputBox.focus();
    screen.render();
  });

  // ========== SEMI-TRANSPARENT MODAL OVERLAY ==========
  const modalOverlay = blessed.overlay({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0.5,
    hidden: true,
    style: { bg: 'black' },
  });

  // Function to show modal with overlay
  function showModal(modalWidget: any) {
    modalOverlay.show();
    modalWidget.show();
    modalWidget.setFront();
    modalWidget.focus();
    screen.render();
  }

  function hideModal(modalWidget: any) {
    modalOverlay.hide();
    modalWidget.hide();
    inputBox.focus();
    screen.render();
  }

  // ========== DRAWING CANVAS (for drawing channels) ==========
  // Drawing channels are special channels that show a collaborative whiteboard
  // They are prefixed with "art:" in the channel tree
  const drawingChannels = new Set<string>();  // Track which channels are drawing channels
  let isDrawingMode = false;
  let currentDrawingChannel: string | null = null;
  let drawColor = 'white';
  let previousChannel: string | null = null;  // Track channel before entering drawing mode
  let lastDrawX = -1;
  let lastDrawY = -1;

  // Helper to check if a channel is a drawing channel
  const isDrawingChannel = (channelName: string): boolean => {
    return drawingChannels.has(channelName) || channelName.startsWith('art:');
  };

  const drawingCanvas = blessed.canvas({
    parent: screen,
    top: MENU_HEIGHT,
    left: SIDEBAR_WIDTH,
    right: 0,
    bottom: STATUS_HEIGHT + INPUT_HEIGHT,
    label: ' Drawing - Click/Drag | C: Colors | X: Clear | ESC: Exit ',
    border: { type: 'line' },
    hidden: true,
    mouse: true,
    fillChar: '\u2588',
    clearChar: ' ',
    ch: ' ',  // Fill character for background (ensures black bg)
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'magenta' },
    },
  });

  // Color palette for drawing
  const drawColors = ['white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'gray'];
  let colorIndex = 0;

  // Color palette is integrated into status bar during drawing mode
  const colorPalette = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    hidden: true,
    tags: true,
  });

  // Handle drawing on canvas
  drawingCanvas.on('mouse', (event: any) => {
    if (!isDrawingMode) return;

    const canvasLeft = (drawingCanvas as any).aleft || 0;
    const canvasTop = (drawingCanvas as any).atop || 0;
    const x = event.x - canvasLeft - 1;  // -1 for border
    const y = event.y - canvasTop - 1;

    // Move cursor to follow mouse in draw mode
    if (event.action === 'mousemove' || event.action === 'mousedown') {
      screen.program.cup(event.y, event.x);
      screen.program.showCursor();
    }

    if (event.action === 'mousedown' || (event.action === 'mousemove' && event.button === 'left')) {
      // Draw at position
      if (lastDrawX >= 0 && lastDrawY >= 0) {
        // Draw line from last position to current
        drawingCanvas.drawLine(lastDrawX, lastDrawY, x, y, '\u2588');
      } else {
        drawingCanvas.setPixel(x, y, '\u2588');
      }
      lastDrawX = x;
      lastDrawY = y;
      drawingCanvas.render();

      // Broadcast drawing to other users
      socket.emit('draw:pixel', {
        channel: currentDrawingChannel,
        x, y,
        color: drawColor,
        lastX: lastDrawX,
        lastY: lastDrawY,
      });
    } else if (event.action === 'mouseup') {
      lastDrawX = -1;
      lastDrawY = -1;
    }
  });

  // Handle draw events from other users
  socket.on('draw:pixel', (data: any) => {
    if (data.channel !== currentDrawingChannel) return;
    if (data.lastX >= 0 && data.lastY >= 0) {
      drawingCanvas.drawLine(data.lastX, data.lastY, data.x, data.y, '\u2588');
    } else {
      drawingCanvas.setPixel(data.x, data.y, '\u2588');
    }
    drawingCanvas.render();
  });

  socket.on('draw:clear', (data: any) => {
    if (data.channel === currentDrawingChannel) {
      drawingCanvas.clearCanvas();
    }
  });

  // Drawing mode keyboard handlers
  drawingCanvas.key(['c'], () => {
    colorIndex = (colorIndex + 1) % drawColors.length;
    drawColor = drawColors[colorIndex];
    addSystemMessage(`Drawing color: ${drawColor}`);
  });

  drawingCanvas.key(['x'], () => {
    drawingCanvas.clearCanvas();
    socket.emit('draw:clear', { channel: currentDrawingChannel });
    addSystemMessage('Canvas cleared');
  });

  drawingCanvas.key(['escape'], () => {
    exitDrawingMode();
  });

  function enterDrawingMode(channelName: string) {
    // Save current channel so ESC returns to it
    previousChannel = state.currentChannel;
    currentDrawingChannel = channelName;
    isDrawingMode = true;
    chatLog.hide();
    typingBox.hide();
    drawingCanvas.show();
    colorPalette.show();
    drawingCanvas.setLabel(` Drawing: #${channelName} - C: Colors | X: Clear | ESC: Exit `);

    // Force black background by explicitly filling the canvas area with ANSI codes
    // Get canvas position (after border)
    const canvasPos = (drawingCanvas as any)._getCoords?.();
    if (canvasPos) {
      const startY = canvasPos.yi + 1;  // +1 for border
      const startX = canvasPos.xi + 1;
      const endY = canvasPos.yl - 1;
      const endX = canvasPos.xl - 1;
      // Fill with black background using direct ANSI codes
      const blackBg = '\x1b[40m';  // ANSI black background
      const whiteFg = '\x1b[37m';  // ANSI white foreground
      for (let y = startY; y < endY; y++) {
        bbs.write(`\x1b[${y + 1};${startX + 1}H${blackBg}${whiteFg}${' '.repeat(endX - startX)}`);
      }
      bbs.write('\x1b[0m');  // Reset colors
    }

    drawingCanvas.clearCanvas();
    drawingCanvas.focus();
    screen.render();
    addSystemMessage(`Entered drawing mode for #${channelName}`);
  }

  function exitDrawingMode() {
    isDrawingMode = false;
    currentDrawingChannel = null;
    drawingCanvas.hide();
    colorPalette.hide();
    chatLog.show();
    typingBox.show();
    // Hide the drawing cursor we showed during draw mode
    screen.program.hideCursor();
    inputBox.focus();

    // Return to previous channel if it was set and is not a drawing channel
    if (previousChannel && !isDrawingChannel(previousChannel)) {
      // Join the previous channel
      socket.emit('room:join', { roomName: previousChannel });
      state.currentChannel = previousChannel;
      updateChannelList();
      addSystemMessage(`Returned to #${previousChannel}`);
    }
    previousChannel = null;

    screen.render();
  }

  // ========== FILE SHARING ==========
  const fileSharingOverlay = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '70%',
    height: '70%',
    label: ' Share Files ',
    border: { type: 'line' },
    shadow: true,
    hidden: true,
    mouse: true,
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'green' },
    },
  });

  const fileManager = blessed.filemanager({
    parent: fileSharingOverlay,
    top: 1,
    left: 1,
    width: '100%-4',
    height: '100%-6',
    cwd: '/uploads',
    files: [],
    directories: [],
    mouse: true,
    style: {
      fg: 'white',
    },
  });

  const fileShareBtn = blessed.button({
    parent: fileSharingOverlay,
    bottom: 1,
    left: 'center',
    width: 14,
    height: 1,
    content: ' Share File ',
    mouse: true,
    style: {
      fg: 'white',
      bg: 'green',
      focus: { bg: 'cyan' },
    },
  });

  const fileCloseBtn = blessed.button({
    parent: fileSharingOverlay,
    bottom: 1,
    right: 2,
    width: 10,
    height: 1,
    content: ' Close ',
    mouse: true,
    style: {
      fg: 'white',
      bg: 'blue',
      focus: { bg: 'cyan' },
    },
  });

  let selectedFile: string | null = null;

  fileManager.on('file', (file: string, fullPath: string) => {
    selectedFile = fullPath;
    addSystemMessage(`Selected: ${file}`);
  });

  fileShareBtn.on('press', () => {
    if (selectedFile) {
      socket.emit('file:share', {
        channel: state.currentChannel,
        path: selectedFile,
        username,
      });
      addChatMessage(`{green-fg}[File shared: ${selectedFile}]{/green-fg}`);
      fileSharingOverlay.hide();
      inputBox.focus();
      screen.render();
    } else {
      addSystemMessage('Select a file first');
    }
  });

  fileCloseBtn.on('press', () => {
    fileSharingOverlay.hide();
    inputBox.focus();
    screen.render();
  });

  fileSharingOverlay.key(['escape'], () => {
    fileSharingOverlay.hide();
    inputBox.focus();
    screen.render();
  });

  // Handle file refresh request
  fileManager.on('refresh', (cwd: string) => {
    socket.emit('file:list', { path: cwd });
  });

  // Handle file list response
  socket.on('file:list', (data: any) => {
    if (data.files && data.directories) {
      fileManager.setListing(data.files, data.directories);
    }
  });

  // Handle file share notification
  socket.on('file:shared', (data: any) => {
    addChatMessage(`{green-fg}[${data.username} shared a file: ${data.filename}]{/green-fg}`);
    addActivity(`File: ${data.filename}`);
    audio.onNotification();
  });

  function showFileSharing() {
    socket.emit('file:list', { path: '/uploads' });
    fileSharingOverlay.show();
    fileManager.focus();
    screen.render();
  }

  // ========== CONTEXT MENUS ==========

  // Context menu container
  const contextMenu = blessed.list({
    parent: screen,
    top: 0,
    left: 0,
    width: 20,
    height: 6,
    border: { type: 'line' },
    shadow: true,
    hidden: true,
    mouse: true,
    vi: true,
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'gray' },
      selected: { fg: 'black', bg: 'white' },
    },
  });

  let contextMenuTarget = '';
  let contextMenuType: 'user' | 'chat' | 'channel' = 'chat';

  function showContextMenu(x: number, y: number, type: 'user' | 'chat' | 'channel', target?: string) {
    contextMenuType = type;
    contextMenuTarget = target || '';

    // Clear and set items based on type
    const items: string[] = [];
    if (type === 'user' && target) {
      items.push('View Profile', 'Send DM', 'Mention', 'Ignore');
    } else if (type === 'chat') {
      items.push('Copy', 'Reply', 'Quote');
    } else if (type === 'channel' && target) {
      items.push('Join', 'Leave', 'Info');
    }

    contextMenu.setItems(items);
    (contextMenu as any).height = items.length + 2;

    // Position near click, but keep on screen
    const maxX = (screen.width as number) - 22;
    const maxY = (screen.height as number) - (items.length + 4);
    (contextMenu as any).top = Math.min(y, maxY);
    (contextMenu as any).left = Math.min(x, maxX);

    contextMenu.show();
    contextMenu.focus();
    screen.render();
  }

  function hideContextMenu() {
    contextMenu.hide();
    inputBox.focus();
    screen.render();
  }

  // Handle context menu selection
  contextMenu.on('select', (item: any, index: number) => {
    const selectedItem = typeof item === 'string' ? item : (item as any).content || '';
    hideContextMenu();

    if (contextMenuType === 'user' && contextMenuTarget) {
      switch (selectedItem) {
        case 'View Profile':
          showUserProfile(contextMenuTarget);
          break;
        case 'Send DM':
          showDMPrompt(contextMenuTarget);
          break;
        case 'Mention':
          inputBox.setValue(`@${contextMenuTarget} ` + (inputBox.getValue() || ''));
          inputBox.focus();
          screen.render();
          break;
        case 'Ignore':
          addSystemMessage(`Ignoring ${contextMenuTarget} (not implemented)`);
          break;
      }
    } else if (contextMenuType === 'chat') {
      switch (selectedItem) {
        case 'Copy':
          addSystemMessage('Copy to clipboard (not available in terminal)');
          break;
        case 'Reply':
          inputBox.setValue('> ');
          inputBox.focus();
          screen.render();
          break;
        case 'Quote':
          inputBox.setValue('> [quote] ');
          inputBox.focus();
          screen.render();
          break;
      }
    } else if (contextMenuType === 'channel' && contextMenuTarget) {
      switch (selectedItem) {
        case 'Join':
          socket.emit('room:join', { roomName: contextMenuTarget });
          break;
        case 'Leave':
          socket.emit('room:leave');
          break;
        case 'Info':
          addSystemMessage(`Channel: ${contextMenuTarget}`);
          break;
      }
    }
  });

  contextMenu.key(['escape'], hideContextMenu);

  // ========== SCREEN-LEVEL MOUSE HANDLING ==========
  // Handle all mouse events at the screen level for reliable click detection
  screen.on('mouse', (event: any) => {
    if (event.action !== 'mousedown') return;

    const x = event.x;
    const y = event.y;

    // Helper to check if point is in element bounds
    const isInBounds = (el: any): boolean => {
      const pos = el._getCoords?.() || el.position;
      if (!pos) return false;
      return x >= pos.xi && x < pos.xl && y >= pos.yi && y < pos.yl;
    };

    // Check for context menu first (it should be on top)
    if (!contextMenu.hidden && isInBounds(contextMenu)) {
      return; // Let context menu handle its own clicks
    }

    // Hide context menu on any click outside it
    if (!contextMenu.hidden) {
      hideContextMenu();
    }

    // Check sidebar tabs area (switch between channels/users)
    if (isInBounds(sidebarTabs)) {
      if (event.button === 'left') {
        // Determine which tab was clicked based on x position
        // Format: " [Ch]  Us " or "  Ch  [Us]"
        // Ch tab is roughly at x=1-5, Us tab is roughly at x=6-10 relative to sidebarTabs
        const tabsPos = sidebarTabs._getCoords?.();
        if (tabsPos) {
          const relativeX = x - tabsPos.xi;
          if (relativeX < 7) {
            // Clicked on Channels tab
            switchSidebarTab('channels');
          } else {
            // Clicked on Users tab
            switchSidebarTab('users');
          }
        }
      }
      return;
    }

    // Check input box area
    if (isInBounds(inputBox)) {
      if (event.button === 'left') {
        inputBox.focus();
        screen.render();
      }
      return;
    }

    // Check chat log area
    if (isInBounds(chatLog)) {
      if (event.button === 'left') {
        chatLog.focus();
        screen.render();
      } else if (event.button === 'right') {
        showContextMenu(x, y, 'chat');
      }
      return;
    }

    // Check sidebar area (user list or channel tree depending on which is visible)
    if (!userList.hidden && isInBounds(userList)) {
      if (event.button === 'left') {
        userList.focus();
        screen.render();
      } else if (event.button === 'right') {
        const selected = (userList as any).selected;
        const items = (userList as any).items || [];
        if (selected !== undefined && items[selected]) {
          const text = typeof items[selected] === 'string' ? items[selected] : (items[selected] as any)?.content || '';
          const match = text.match(/^.\s+(\S+)/);
          if (match) {
            const targetUser = match[1];
            if (targetUser && targetUser !== username) {
              showContextMenu(x, y, 'user', targetUser);
            }
          }
        }
      }
      return;
    }

    if (!channelList.hidden && isInBounds(channelList)) {
      if (event.button === 'left') {
        channelList.focus();
        screen.render();
      } else if (event.button === 'right') {
        const selected = (channelList as any).selected;
        if (selected !== undefined && channelItems[selected]) {
          showContextMenu(x, y, 'channel', channelItems[selected].name);
        }
      }
      return;
    }
  });

  // ========== SCROLL WHEEL SUPPORT (faster scrolling) ==========

  // Chat log scroll - 3 lines per wheel tick
  chatLog.on('wheelup', () => {
    chatLog.scroll(-3);
    screen.render();
  });
  chatLog.on('wheeldown', () => {
    chatLog.scroll(3);
    screen.render();
  });

  // User list scroll - 2 lines per wheel tick
  userList.on('wheelup', () => {
    userList.scroll(-2);
    screen.render();
  });
  userList.on('wheeldown', () => {
    userList.scroll(2);
    screen.render();
  });

  // Channel list scroll - 2 lines per wheel tick
  channelList.on('wheelup', () => {
    channelList.up(2);
    screen.render();
  });
  channelList.on('wheeldown', () => {
    channelList.down(2);
    screen.render();
  });

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

  function updateTypingPreview() {
    const preview = renderTypingPreview(state.typingBuffers);
    typingBox.setContent(preview || '{gray-fg}No one is typing...{/gray-fg}');
    screen.render();
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

  // ========== DIALOG FUNCTIONS ==========

  function showHelpDialog() {
    // Show the comprehensive help overlay
    helpOverlay.show();
    helpOverlay.setFront();
    helpContent.focus();
    screen.render();
  }

  function showSettingsOverlay() {
    settingsOverlay.show();
    settingsOverlay.focus();
    screen.render();
  }

  function showNewMessagePrompt() {
    inputBox.focus();
    screen.render();
  }

  function showRoomMenu() {
    promptDialog.showInput('Enter room name to join:', '', (err, value) => {
      if (!err && value) {
        const roomName = value.replace(/^#/, '');
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
    messageDialog.display(
      '{bold}Users Online{/bold}\n\n' + users,
      () => { inputBox.focus(); }
    );
  }

  function showDMPrompt(targetUser: string) {
    promptDialog.showInput(`Message to @${targetUser}:`, '', (err, value) => {
      if (!err && value) {
        socket.emit('chat:dm', { to: targetUser, message: value });
        addChatMessage(`{magenta-fg}[DM to ${targetUser}]: ${value}{/magenta-fg}`);
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
    questionDialog.ask(text, (answer: boolean) => {
      inputBox.focus();
      screen.render();
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
    promptDialog.showInput('Create/join drawing channel (name without art: prefix):', 'whiteboard', (err, value) => {
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
    passwordOverlay.show();
    passwordInput.focus();
    screen.render();
  }

  // ========== SOCKET EVENT HANDLERS ==========

  // Room list response
  socket.on('room:list', (data: any) => {
    const rooms = Array.isArray(data?.rooms) ? data.rooms : [];

    if (rooms.length > 0) {
      state.channels = rooms.map((r: any) => ({
        id: r.room_id || r.roomId || r.room_name || r.roomName,
        name: r.room_name || r.roomName,
        displayName: '#' + (r.room_name || r.roomName),
        topic: r.topic || '',
        type: r.is_public !== false ? 'public' : 'private',
        createdBy: r.created_by_username || 'system',
        createdAt: new Date(r.created_at || Date.now()),
        memberCount: r.member_count || 0,
        unreadCount: 0,
      }));
      updateChannelList();
      addSystemMessage(`Found ${rooms.length} room${rooms.length === 1 ? '' : 's'}`);

      // Auto-join default room if not already in one
      if (!state.currentChannel) {
        // Prefer 'general' if it exists and is public, otherwise first public room
        const defaultRoom = state.channels.find(c => c.name === 'general' && c.type === 'public')
          || state.channels.find(c => c.type === 'public')
          || state.channels[0];
        if (defaultRoom) {
          socket.emit('room:join', { roomName: defaultRoom.name });
          addSystemMessage(`Auto-joining #${defaultRoom.name}...`);
        }
      }
    } else if (!state.currentChannel) {
      // No rooms exist, create and join a default "general" room
      addSystemMessage('No rooms found - creating #general...');
      socket.emit('room:create', { roomName: 'general', topic: 'General chat', isPublic: true });
    }

    hideLoading();
  });

  // Room joined
  socket.on('room:joined', (data: any) => {
    // Use setChannel to properly clear messages and typing when switching
    setChannel(state, data.roomId || data.roomName);

    if (data.members && Array.isArray(data.members)) {
      onlineUsers.clear();
      onlineUsers.set(String(userId), { username, status: 'online', nodeId, joinedAt: new Date() });
      for (const m of data.members) {
        if (String(m.user_id || m.userId) !== String(userId)) {
          onlineUsers.set(String(m.user_id || m.userId), {
            username: m.username,
            status: m.is_muted ? 'dnd' : 'online',
            joinedAt: new Date(),
          });
        }
      }
    }

    chatLog.setLabel(` ${data.roomName} `);
    updateChannelList();
    updateUserTable();
    updateStatusBar();
    addSystemMessage(`Joined #${data.roomName} (${data.memberCount || onlineUsers.size} users)`);
    addActivity(`Joined #${data.roomName}`);
    audio.onNotification();
  });

  // Room left
  socket.on('room:left', (data: any) => {
    setChannel(state, '');
    chatLog.setLabel(' Chat ');
    updateChannelList();
    updateStatusBar();
    addSystemMessage(`Left ${data.roomName}`);
  });

  // Room created
  socket.on('room:created', (data: any) => {
    state.channels.push({
      id: data.roomId,
      name: data.roomName,
      displayName: '#' + data.roomName,
      topic: data.topic || '',
      type: data.isPublic ? 'public' : 'private',
      createdBy: username,
      createdAt: new Date(),
      memberCount: 1,
      unreadCount: 0,
    });
    updateChannelList();
    addSystemMessage(`Room "#${data.roomName}" created!`);
    addActivity(`Created #${data.roomName}`);

    // Auto-join the room we just created if we're not in any room
    if (!state.currentChannel) {
      socket.emit('room:join', { roomName: data.roomName });
      addSystemMessage(`Auto-joining #${data.roomName}...`);
    }
  });

  // User joined room
  socket.on('room:user-joined', (data: any) => {
    if (String(data.userId) !== String(userId)) {
      onlineUsers.set(String(data.userId), {
        username: data.username,
        status: 'online',
        joinedAt: new Date(),
      });
      presenceService.setStatus(data.userId, 'online');
      updateUserTable();
      addSystemMessage(`${data.username} joined the room`);
      addActivity(`${data.username} joined`);
      audio.onJoin();
    }
  });

  // User left room
  socket.on('room:user-left', (data: any) => {
    if (String(data.userId) !== String(userId)) {
      onlineUsers.delete(String(data.userId));
      updateUserTable();
      addSystemMessage(`${data.username} left the room`);
      addActivity(`${data.username} left`);
      audio.onLeave();
    }
  });

  // Kicked from room
  socket.on('room:kicked', (data: any) => {
    messageDialog.display(
      `{red-fg}You were kicked from ${data.roomName}{/red-fg}\n\nReason: ${data.reason || 'No reason given'}\nBy: ${data.kickedBy}`,
      () => { inputBox.focus(); }
    );
    state.currentChannel = '';
    updateStatusBar();
    audio.onError();
  });

  // Chat message from backend
  socket.on('ansi-output', (data: string) => {
    const clean = data.replace(/\x1b\[[0-9;]*[mK]/g, '').replace(/\r\n/g, '').trim();
    if (clean.length > 0) {
      if (clean.match(/^\[\d{2}:\d{2}\]/)) {
        chatLog.log(data.replace(/\r\n/g, ''));
        if (mentionsUser(clean, username)) {
          audio.onMessage(true);
          addActivity(`{yellow-fg}@mention{/yellow-fg}`);
        }
      }
    }
  });

  // Live keystroke from other users
  socket.on('chat:keystroke', (data: any) => {
    if (data.channelId !== state.currentChannel) return;
    if (data.userId === userId) return;
    processKeystroke(state.typingBuffers, data.userId, data.username, data.char, getUserColor(data.username));
    updateTypingPreview();
  });

  // User submitted their message (stopped typing)
  socket.on('chat:keystroke-submit', (data: any) => {
    if (data.channelId !== state.currentChannel) return;
    if (data.userId === userId) return;
    processKeystroke(state.typingBuffers, data.userId, data.username, 'SUBMIT', '');
    updateTypingPreview();
  });

  // User cleared their input
  socket.on('chat:keystroke-clear', (data: any) => {
    if (data.channelId !== state.currentChannel) return;
    if (data.userId === userId) return;
    processKeystroke(state.typingBuffers, data.userId, data.username, 'CLEAR', '');
    updateTypingPreview();
  });

  // User presence update
  socket.on('chat:presence', (data: any) => {
    const u = onlineUsers.get(String(data.userId));
    if (u) {
      u.status = data.status;
      presenceService.setStatus(data.userId, data.status, data.custom);
      updateUserTable();

      if (data.userId !== userId) {
        if (data.status === 'away') {
          addActivity(`${u.username} is away`);
        } else if (data.status === 'online') {
          addActivity(`${u.username} is back`);
        }
      }
    }
  });

  // Reactions
  socket.on('chat:reaction', (data: any) => {
    addChatMessage(`{cyan-fg}[${data.username} reacted ${data.emoji}]{/cyan-fg}`);
    addActivity(`${data.username}: ${data.emoji}`);
    audio.onReaction();
  });

  // BBS system events
  socket.on('bbs:event', (event: BBSEvent) => {
    if (state.prefs.muteAllEvents) return;
    const { msg, c } = getEventMessage(event);
    updateEventsFeed(`{${c}-fg}${msg}{/${c}-fg}`);

    if (event.type === 'user_login' || event.type === 'user_logout') {
      addSystemMessage(msg);
    }

    eventBus.emit(event);
    audio.onNotification();
  });

  // DM notification
  socket.on('chat:dm', (data: any) => {
    addChatMessage(`{magenta-fg}[DM from ${data.from}]: ${data.preview || data.message}{/magenta-fg}`);
    addActivity(`{magenta-fg}DM from ${data.from}{/magenta-fg}`);
    audio.onDM();
  });

  // Chat message from other users
  socket.on('chat:message', (msg: Message) => {
    if (msg.channelId !== state.currentChannel) return;
    if (msg.userId === String(userId)) return; // Skip own messages (already displayed locally)

    // Track message in state and handler
    addMessage(state, msg);
    messageHandler.addMessage(msg);

    // Format and display using formatMessage for consistency
    const isMention = mentionsUser(msg.content, username);
    const formatted = formatMessage(msg, username, state.prefs.compactMode);
    addChatMessage(formatted, false); // Already formatted, don't re-process

    if (isMention) {
      addActivity(`{yellow-fg}@${msg.username} mentioned you{/yellow-fg}`);
      audio.onMessage(true);
    } else {
      audio.onMessage(false);
    }

    screen.render();
  });

  // Handle message edits from other users (and confirmation of own edits)
  socket.on('chat:edited', (data: { messageId: string; newText: string; username: string; timestamp: string }) => {
    const time = formatTime(new Date(data.timestamp));
    const color = getUserColor(data.username);
    // Show edited message in chat
    addChatMessage(`{gray-fg}[${time}]{/gray-fg} <{${color}-fg}${data.username}{/${color}-fg}> ${data.newText} {gray-fg}(edited){/gray-fg}`);
    screen.render();
  });

  // ========== INPUT HANDLING ==========

  inputBox.on('submit', async (value: string) => {
    const msg = value.trim();
    if (!msg) {
      inputBox.clearValue();
      inputBox.focus();
      screen.render();
      return;
    }

    // Check if we're editing an existing message
    const isEditing = editingMessageId !== null;
    const editId = editingMessageId;
    const editEntry = getEditingEntry();

    // Reset editing state
    historyIndex = -1;
    savedInput = '';
    editingMessageId = null;
    inputBox.setLabel(' Message ');

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
        socket.emit('chat:dm', { to: r.data.target, message: r.data.message });
        addChatMessage(`{magenta-fg}[DM to ${r.data.target}]: ${r.data.message}{/magenta-fg}`);
      }

      if (cmdName === 'me' && r.message?.startsWith('ACTION:')) {
        socket.emit('room:message', { message: r.message });
        const action = r.message.replace('ACTION: ', '');
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

      if (isEditing && editId && editEntry) {
        // Editing an existing message
        socket.emit('chat:edit', { messageId: editId, newText: msg });
        // Update local history entry
        editEntry.text = msg;
        // Update chat log - find and replace the message
        const oldFormatted = `<{${color}-fg}${username}{/${color}-fg}> ${editEntry.text}`;
        addSystemMessage(`(edited) ${msg}`);
      } else {
        // New message - generate ID and add to history
        const messageId = `${userId}-${Date.now()}`;
        socket.emit('room:message', { message: msg, messageId });
        addChatMessage(`{gray-fg}[${time}]{/gray-fg} <{${color}-fg}${username}{/${color}-fg}> ${msg}`);

        // Add to history with ID
        const lastEntry = inputHistory[inputHistory.length - 1];
        if (!lastEntry || lastEntry.text !== msg) {
          inputHistory.push({ id: messageId, text: msg });
          if (inputHistory.length > MAX_HISTORY) {
            inputHistory.shift();
          }
        }
      }
    }

    screen.render();
  });

  // Live typing indicator
  inputBox.on('keypress', (ch: string, key: any) => {
    if (key.name === 'backspace') {
      socketEmitter.keystroke(state.currentChannel, userId, 'BACKSPACE');
    } else if (ch && !key.ctrl && !key.meta && key.name !== 'enter') {
      socketEmitter.keystroke(state.currentChannel, userId, ch);
    }
  });

  // ========== GLOBAL KEYBOARD SHORTCUTS ==========

  screen.key(['pageup'], () => {
    chatLog.scroll(-10);
    screen.render();
  });

  screen.key(['pagedown'], () => {
    chatLog.scroll(10);
    screen.render();
  });

  // Sidebar visibility state
  let sidebarVisible = true;

  function updateChatLayout() {
    // Adjust chat log position based on sidebar visibility
    const leftOffset = sidebarVisible ? SIDEBAR_WIDTH : 0;

    // Update options.left to affect _getCoords calculation
    (chatLog as any).options.left = leftOffset;
    (drawingCanvas as any).options.left = leftOffset;

    // Show/hide sidebar elements
    if (sidebarVisible) {
      sidebarTabs.show();
      if (sidebarTab === 'channels') {
        channelList.show();
        userList.hide();
      } else {
        channelList.hide();
        userList.show();
      }
    } else {
      sidebarTabs.hide();
      channelList.hide();
      userList.hide();
    }

    screen.render();
  }

  // F1 - Help
  screen.key(['f1'], () => {
    showHelp();
  });

  // F2 - Toggle sidebar visibility
  screen.key(['f2'], () => {
    sidebarVisible = !sidebarVisible;
    updateChatLayout();
    addSystemMessage(sidebarVisible ? 'Sidebar shown' : 'Sidebar hidden (F2 to show)');
  });

  // F3 - Switch sidebar tab (channels/users)
  screen.key(['f3'], () => {
    switchSidebarTab(sidebarTab === 'channels' ? 'users' : 'channels');
    addSystemMessage(`Switched to ${sidebarTab} view`);
  });

  // Note: F4 was removed - Tab key cycles focus between panels which includes sidebar

  // Tab key cycles focus between panels: input -> sidebar -> chat -> input
  const focusablePanels = () => {
    const panels: any[] = [inputBox];
    if (sidebarVisible) {
      panels.push(sidebarTab === 'channels' ? channelList : userList);
    }
    panels.push(chatLog);
    return panels;
  };

  // Helper to find panel index accounting for Tree's internal rows
  const findPanelIndex = (panels: any[], focused: any): number => {
    return panels.findIndex(p => {
      if (p === focused) return true;
      // For Tree widgets, check if focused is the internal rows
      if ((p as any).rows && (p as any).rows === focused) return true;
      return false;
    });
  };

  screen.key(['tab'], () => {
    const panels = focusablePanels();
    const currentFocused = screen.getFocused();
    let currentIndex = findPanelIndex(panels, currentFocused);
    if (currentIndex === -1) currentIndex = 0;
    const nextIndex = (currentIndex + 1) % panels.length;
    panels[nextIndex].focus();
    screen.render();
  });

  screen.key(['S-tab'], () => {
    const panels = focusablePanels();
    const currentFocused = screen.getFocused();
    let currentIndex = findPanelIndex(panels, currentFocused);
    if (currentIndex === -1) currentIndex = 0;
    const prevIndex = (currentIndex - 1 + panels.length) % panels.length;
    panels[prevIndex].focus();
    screen.render();
  });

  // F5 - Create/join drawing channel
  screen.key(['f5'], () => {
    if (isDrawingMode) {
      exitDrawingMode();
    } else {
      showDrawMenu();
    }
  });

  // F6 - File sharing
  screen.key(['f6'], () => {
    showFileSharing();
  });

  // Ctrl+S - Settings
  screen.key(['C-s'], () => {
    showSettingsOverlay();
  });

  // Screen-level drawing mode key handlers (element handlers may not receive events)
  screen.key(['c'], () => {
    if (isDrawingMode) {
      colorIndex = (colorIndex + 1) % drawColors.length;
      drawColor = drawColors[colorIndex];
      addSystemMessage(`Drawing color: ${drawColor}`);
    }
  });

  screen.key(['x'], () => {
    if (isDrawingMode) {
      drawingCanvas.clearCanvas();
      socket.emit('draw:clear', { channel: currentDrawingChannel });
      addSystemMessage('Canvas cleared');
    }
  });

  screen.key(['escape'], () => {
    // Drawing mode: exit and return to previous channel
    if (isDrawingMode) {
      exitDrawingMode();
      return;
    }
    // Close any open dialogs
    if (!settingsOverlay.hidden) {
      settingsOverlay.hide();
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

    // Disable mouse and clean up input handler
    screen.disableMouse();
    if (session.bbsSession) {
      delete session.bbsSession.doorInputHandler;
    }

    screen.destroy();
    bbs.write('\x1b[2J\x1b[H');
    bbs.writeLine('\x1b[33mThanks for using LiveChat v3.0! Goodbye.\x1b[0m');
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
      screen.render();

      // Focus input
      inputBox.focus();

      // Welcome messages
      addSystemMessage('Welcome to LiveChat v3.0!');
      addChatMessage('{cyan-fg}Hotkeys:{/cyan-fg}', false);
      addChatMessage('  {white-fg}F1{/}=Help  {white-fg}F2{/}=Sidebar  {white-fg}F3{/}=Switch Tab', false);
      addChatMessage('  {white-fg}F5{/}=Art Channel  {white-fg}F6{/}=Files  {white-fg}Tab{/}=Focus Cycle', false);
      addChatMessage('  {white-fg}^S{/}=Settings  {white-fg}^C/^Q{/}=Quit  {white-fg}Esc{/}=Close/Return', false);
      addChatMessage('{yellow-fg}Commands:{/yellow-fg} /help /join /leave /msg /me /who /away /back /clear', false);
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
