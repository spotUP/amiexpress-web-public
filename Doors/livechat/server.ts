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

import blessed, {
  screen,
  box,
  list,
  textbox,
  form,
  button,
  ScrollableBox,
  ScrollableText,
  Loading,
  Message,
  Question,
  Prompt,
  Log,
  Grid,
  grid,
  Carousel,
  carousel,
  DockablePanel,
  MobileCarousel,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList, createButton, createText, createLog, createDialogs, createModalManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { colorize, Tags } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/door-input-manager';
// Local helper to strip blessed tags from text
function stripTags(text: string): string {
  return text.replace(/{[^}]+}/g, '');
}
import { DoorLoader } from '@amiexpress/bbs-door-sdk/utils/DoorLoader';

// Core state and services
import { addMessage, setChannel, setDmContext, clearDmContext, AppState } from './core/state';
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
import { PANEL_BORDER, PANEL_FOCUS_STYLE } from './ui/theme';
import { messageIndexAtRow } from './ui/chat-row-map';
import { solveLayout } from './ui/layout-solver';
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
import { setupDmSidebarHandlers } from './handlers/dm-sidebar-handlers';
import { buildSidebarItems } from './handlers/sidebar-items-builder';
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
import type { PresenceStatus, BBSEvent, Message as ChatMessage } from './types';
import type { SlashCommand } from './commands/types';

// Import widget types (Log already imported above)

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
  const screen = createScreen(bbs);
  // Note: Optimized rendering is now enabled by default in the SDK

  const ctx = initializeLiveChat(session, screen);
  const { username, userId, nodeId, secLevel, state, registry, socketEmitter, presenceService,
    eventBus, audio, messageHandler, commandHandler, onlineUsers, cmdCtx } = ctx;
  let { currentRoomLabel } = ctx;

  // Room state
  const initialRoomId = session.bbsSession?.currentRoomId as string | undefined;
  const initialRoomName = session.bbsSession?.currentRoomName as string | undefined;

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
  const inputManager = new DoorInputManager(session, screen, {
    enableGameMode: false,  // Blessed UI mode, not ncurses game mode
    enableGrabKeys: false,  // Blessed focus system handles keys
    enableMouse: true,      // See WEB_ note above — required for clicks
    debug: false,
    debugName: 'LiveChat'
  });

  let showHelpFn: (() => void) | null = null;

  // Enable door input FIRST (this calls setupInputHandler which installs its
  // own doorInputHandler, so we have to wrap AFTER) — if we wrapped before,
  // our SGR-mouse filter was getting silently overwritten and the browser's
  // sticky xterm mouse-reporting leaked '[<btn;col;row;M' into the status
  // bar as literal text (2026-04-24 repro).
  inputManager.enable();

  // Diagnostic: confirm mouse events are reaching blessed's screen.
  screen.on('mousedown', (event: any) => {
    const els = (screen as any).getElementsAt?.(event.x, event.y) || [];
    const elNames = els.map((e: any) => e.options?.label || e.type || e.constructor?.name || 'unknown').slice(0, 5);
    console.log('[livechat DIAG] mousedown at', event.x, event.y, '→ elements:', JSON.stringify(elNames));
  });

  // Now wrap the handler that setupInputHandler just installed, ONLY to
  // intercept F1 (Help). Do NOT filter any other escape sequences here —
  // `\x1b[<...M/m` is the SGR mouse protocol and blessed's parser
  // (enabled above) needs to see those to route clicks.
  if (session.bbsSession) {
    const innerHandler = session.bbsSession.doorInputHandler;
    session.bbsSession.doorInputHandler = (data: string) => {
      if (data === '\x1bOP' || data === '\x1b[11~') {
        if (showHelpFn) showHelpFn();
        return true;
      }
      return innerHandler ? innerHandler(data) : true;
    };
  }

  // ========== LOADING SCREEN ==========
  // Layout constants for 80x24 terminal
  const SIDEBAR_WIDTH = 15;  // Minimum sidebar width (will auto-expand via fitContent to fit content)

  // Track which tab is active in the sidebar
  let sidebarTab: 'channels' | 'users' = 'channels';

  // ========== MENU BAR (at top) ==========
  const menuBar = createMenuBar(screen);

  // ========== CHAT LOG (Main Area) - CREATE FIRST so it renders behind fixed UI ==========
  // Chat log fills from sidebar to right edge
  const { panel: chatPanel, log: chatLog } = createChatLog(screen, SIDEBAR_WIDTH);

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

  // ========== CURSOR BLINK STATE ==========
  // Typing cursors blink like xterm (530ms interval)
  let cursorBlinkOn = true;
  let cursorBlinkInterval: ReturnType<typeof setInterval> | null = null;

  function startCursorBlink() {
    if (cursorBlinkInterval) return;
    cursorBlinkInterval = setInterval(() => {
      cursorBlinkOn = !cursorBlinkOn;
      // Only rebuild if there are typing buffers to show
      if (state.typingBuffers.size > 0) {
        rebuildChatContent();
        screen.render();
      }
    }, 530);  // 530ms is standard xterm blink rate
  }

  function stopCursorBlink() {
    if (cursorBlinkInterval) {
      clearInterval(cursorBlinkInterval);
      cursorBlinkInterval = null;
    }
  }

  // Connect animation manager to chat log
  animationManager.connect({
    getLineContent: (idx: number) => chatLog.getLine(idx),
    setLineContent: (idx: number, content: string) => (chatLog as any).setLine?.(idx, content),
    render: () => screen.render(),
    getVisibleRange: () => (chatLog as any).getVisibleRange?.() || { start: 0, end: 100 },
  });

  // Wire up emoji button to show emoji picker
  emojiButton.on('press', () => {
    audio.playSound('click');
    if (!emojiPicker.isVisible()) {
      emojiPicker.show(
        screen,
        (emoji: any) => {
          const currentText = inputBox.getValue();
          inputBox.setValue(currentText + (emoji.display || emoji.code) + ' ');
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

  emojiButton.on('mouseenter', () => {
    audio.playSound('hover');
  });

  const inputHistory = createInputHistory(screen, inputBox);

  // ========== CHANNEL LIST (Left Sidebar) ==========
  // ========== COMMAND AUTOCOMPLETE ==========
  const commandSuggestions = createList({
    parent: screen,
    bottom: STATUS_HEIGHT + INPUT_HEIGHT,  // Position above input box
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
      border: { fg: PANEL_BORDER },
    },
    scrollbar: {
      ch: ' ',
    },
    // @ts-ignore - zIndex exists but not in types
    zIndex: 10000,
  });

  // Ghost text overlay for inline completion preview
  const ghostText = createBox({
    parent: screen, // Parent to screen to avoid panel clipping
    bottom: STATUS_HEIGHT + 1,  // Align with input field content
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
    zIndex: 6000,  // Above input box (5000) but below command suggestions (10000)
  });
  ghostText.hide();

  // Set high z-index to appear above other elements
  commandSuggestions.setIndex(1000);
  ghostText.setIndex(600);

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
      // Release navigation key suppression
      (inputBox as any).suppressNavigationKeys = false;
      screen.render();
      return;
    }

    // Format command items with name, usage, and description
    const chatWidth = (screen as any).width || 80;
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
    (commandSuggestions as any).setItems(items);
    (commandSuggestions as any).select(0);

    // Invalidate caches to ensure clean render
    invalidateCache(inputBox);
    invalidateCache(commandSuggestions);

    commandSuggestions.show();
    commandSuggestions.setFront();
    commandSuggestionsVisible = true;
    // Suppress navigation keys in input so arrow keys navigate the list
    (inputBox as any).suppressNavigationKeys = true;
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
      // Release navigation key suppression
      (inputBox as any).suppressNavigationKeys = false;

      // Invalidate caches to force clean redraw and prevent border artifacts
      invalidateCache(commandSuggestions);
      invalidateCache(inputBox);
      invalidateCache(ghostText);

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
    (commandSuggestions as any).up(1);
    screen.render();
  });

  commandSuggestions.key(['down', 'j'], () => {
    (commandSuggestions as any).down(1);
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
  const sidebarPanel = new DockablePanel({
    parent: screen,
    title: ' Sidebar ',
    label: ' Sidebar ',
    top: MENU_HEIGHT,
    left: 0,
    width: SIDEBAR_WIDTH,
    minWidth: 12,  // Minimum usable width for "# general"
    maxWidth: 35,  // Max 35 chars to leave room for chat (80 - 35 = 45 chars for chat)
    bottom: STATUS_HEIGHT + INPUT_HEIGHT,
    dockPosition: 'left',
    resizable: chatOnly ? true : false,
    draggable: chatOnly ? true : false,
    zIndex: 1,
    topConstraint: MENU_HEIGHT,
    bottomConstraint: STATUS_HEIGHT + INPUT_HEIGHT,
    border: { type: 'line' },
    fitContent: { width: true, height: false },  // Auto-expand width to fit content dynamically
    style: {
      fg: 'white',
      bg: 'black',
      // style.border.fg, NOT border.fg. Element reads the border colour from
      // style.border / border.style / style.fg and ignores a colour sitting
      // on the border object itself - so `border: { type: 'line', fg: blue }`
      // looked right in the source and drew grey, which is why the sidebar
      // and the chat panel stayed grey while the input box (which sets
      // style.border) was the only blue one.
      border: { fg: PANEL_BORDER },
      ...PANEL_FOCUS_STYLE,
    },
  });

  // ========== CHANNEL LIST (Inside Sidebar) ==========
  const channelList = createList({
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

  channelList.on('mouseenter', () => {
    audio.playSound('hover');
  });

  // Default channels to show when server hasn't responded
  const defaultChannels = [
    { id: 'general', name: 'general', type: 'public' as const },
    { id: 'random', name: 'random', type: 'public' as const },
    { id: 'help', name: 'help', type: 'public' as const },
  ];

  // Track channel data for selection handling
  let channelItems: Array<{ id: string; name: string; type: 'text' | 'voice' | 'header' | 'spacer' | 'user' | 'dm'; username?: string; isGroup?: boolean }> = [];

  // Per-channel expand state.
  //   - `expandedChannels`: user explicitly expanded this channel (even
  //     when it's not the active one)
  //   - `collapsedChannels`: user explicitly collapsed this channel —
  //     needed so the active channel (which auto-expands) can still be
  //     forced closed by a second double-click.
  const expandedChannels: Set<string> = new Set();
  const collapsedChannels: Set<string> = new Set();

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

    // Build sidebar rows via the pure builder. Keeps server.ts under
    // the 2000-line limit and lets the row layout be unit-tested.
    const built = buildSidebarItems({
      channelsToShow,
      state,
      onlineUsers,
      presenceService,
      presenceIndicators: PRESENCE_INDICATORS as Record<string, string>,
      isCurrentChannel,
      expandedChannels,
      collapsedChannels,
      voiceChannelService: voiceChannel,
    });
    channelItems = built.channelItems as typeof channelItems;

    // Debug: show what items we're setting and calculate expected width
    channelList.setItems(built.items);

    // CRITICAL: Force screen render before fitToContent so blessed populates internal state
    if (screen) {
      screen.render();
    }

    sidebarPanel.fitToContent();

    // CRITICAL: Force list to update its width based on parent panel
    // When panel expands, child list doesn't auto-recalculate '100%-2' width
    const newListWidth = (sidebarPanel.width as number) - 2; // Panel width minus borders

    channelList.width = newListWidth;
    (channelList as any).position.width = newListWidth;

    // Invalidate blessed's internal cache to force re-layout
    if ((channelList as any)._clines) {
      delete (channelList as any)._clines;
    }
    if ((channelList as any)._pclines) {
      delete (channelList as any)._pclines;
    }

    // CRITICAL: Force coordinate recalculation
    if (typeof (channelList as any)._invalidateCoords === 'function') {
      (channelList as any)._invalidateCoords();
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
        voiceChannel.showGrid();
      } else if (!isCurrentChannel(channel.id, channel.name)) {
        // Join text channel
        if (state.currentChannel) socket.emit('room:leave');
        socket.emit('room:join', { roomName: channel.name });
        voiceChannel.hideGrid();
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
      if (state.currentChannel) socket.emit('room:leave');
      setDmContext(state, channel.id);
      // Wipe what's on screen so the previous channel's chat doesn't leak.
      try { (chatLog as any).setContent(''); } catch { /* ignore */ }
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
    } else if (!isCurrentChannel(channel.id, channel.name)) {
      // Join text channel — joining auto-expands the user list underneath.
      if (state.currentDmThread) clearDmContext(state);
      if (state.currentChannel) socket.emit('room:leave');
      socket.emit('room:join', { roomName: channel.name });
      voiceChannel.hideGrid(); // Hide video grid when viewing text
    } else {
      // Click on the channel we're already in. Two meaningful actions:
      //   1. If the video grid is covering the chat (we're in voice),
      //      hide it to return the user to the text-chat view. This is
      //      the "click general to go back to chat" reflex.
      //   2. Otherwise, toggle the expand/collapse state of this
      //      channel's member list.
      if (voiceChannel?.isGridVisible?.()) {
        voiceChannel.hideGrid();
      } else {
        const id = channel.id;
        const currentlyExpanded = collapsedChannels.has(id) ? false : true;
        if (currentlyExpanded) {
          expandedChannels.delete(id);
          collapsedChannels.add(id);
        } else {
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

  // ========== USER LIST (Inside Sidebar - same position as channels) ==========
  const userList = createList({
    parent: sidebarPanel,
    top: 0,
    left: 0,
    width: '100%-2',
    height: '100%-2',
    label: ' Ch [Us] ', // Tabs: inactive [active]
    border: { type: 'none' },
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

    // Also refresh the channel list — expanded channels render their
    // members inline, so a user joining/leaving must redraw both views.
    if (typeof updateChannelList === 'function') updateChannelList();
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
    focusable: false,
    mouse: false,
    clickable: false,
    style: {
      fg: 'cyan',
      bg: 'black',
    },
    content: '',
    hidden: true,  // Hide since typing previews are now in chat log
  });

  // ========== RESPONSIVE LAYOUT ==========
  // Dynamic layout engine that handles screen resize, sidebar drag/resize, and docking
  /**
   * True when the sidebar was hidden because the window got too narrow, not
   * because the user hid it - so it can come back when there is room again.
   */
  let sidebarSqueezedOut = false;

  function updateLayout() {
    const width = (screen as any).width;
    const height = (screen as any).height;

    // Validate dimensions
    if (!width || !height || width <= 0 || height <= 0 || !isFinite(width) || !isFinite(height)) {
      return;
    }

    // The geometry is SOLVED, not computed - see ui/layout-solver.ts. Plain
    // subtraction breaks at awkward window shapes, and a panel handed a
    // negative height draws over its neighbours instead of shrinking, which
    // is how the input box ended up hidden under the chat panel.
    const solved = solveLayout(
      {
        width,
        height,
        // A sidebar hidden only because the window got narrow still counts
        // as wanted - otherwise it could never come back when there is room.
        sidebarVisible: !sidebarPanel.hidden || sidebarSqueezedOut,
        sidebarWidth: sidebarPanel.width as number,
        sidebarDock: sidebarPanel.getDockPosition(),
      },
      {
        menuHeight: MENU_HEIGHT,
        statusHeight: STATUS_HEIGHT,
        inputHeight: INPUT_HEIGHT,
        emojiButtonWidth: EMOJI_BUTTON_WIDTH,
      }
    );

    // 1. Sidebar Panel Layout
    // Only docked panels are placed; floating ones manage themselves. A
    // sidebar the window has no room for is hidden rather than squeezed.
    if (solved.sidebar) {
      sidebarPanel.position.left = solved.sidebar.left;
      sidebarPanel.position.top = solved.sidebar.top;
      sidebarPanel.position.height = solved.sidebar.height;
      if (sidebarSqueezedOut) {
        // There is room again.
        sidebarSqueezedOut = false;
        sidebarPanel.show();
      }
    } else if (!sidebarPanel.hidden) {
      sidebarSqueezedOut = true;
      sidebarPanel.hide();
    }

    // 2. Chat Panel Layout
    chatPanel.position.left = solved.chat.left;
    chatPanel.position.top = solved.chat.top;
    chatPanel.position.width = solved.chat.width;
    chatPanel.position.height = solved.chat.height;

    // 3. Inner Chat Log Layout
    chatLog.position.width = solved.chatLog.width;
    chatLog.position.height = solved.chatLog.height;

    // 4. Footer & Overlays
    statusBar.position.width = solved.statusBar.width;
    inputBox.position.width = solved.input.width;

    // On a really short window the footer SHRINKS rather than overlapping the
    // content: the input loses its border rows first, then the status line
    // goes, then the menu bar. Applying what the solver decided.
    inputBox.position.height = solved.input.height;
    inputBox.position.bottom = solved.statusHeight;
    if (solved.statusHeight > 0) statusBar.show();
    else statusBar.hide();
    if (solved.menuHeight > 0) menuBar.element.show();
    else menuBar.element.hide();
    emojiButton.position.left = solved.emojiButton.left;
    if (solved.emojiButton.visible) emojiButton.show();
    else emojiButton.hide();
    menuBar.element.position.width = width;

    // Command suggestions
    (commandSuggestions as any).width = width;
    commandSuggestions.position.width = width;
    ghostText.position.width = width;

    if (commandSuggestionsVisible) {
      commandSuggestions.setFront();
      ghostText.setFront();
    }

    // The footer sits ON TOP of the chat panel, so a content area that has
    // been squeezed can never hide the input box.
    inputBox.setFront();
    emojiButton.setFront();
    statusBar.setFront();

    // Typing bar (hidden but updated)
    typingBar.position.left = solved.chat.left;
    typingBar.position.width = solved.chat.width;


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

  // And again whenever the terminal changes size.
  //
  // Laying out once fixed a door that opened on top of itself, but it left
  // the panels frozen at the size the door started with: resizing the browser
  // window resized the screen underneath them and nothing moved (reported
  // 2026-08-26 against /chat). The one-shot call above and this binding
  // answer two different questions - "what size am I now" and "what size did
  // I just become" - and the door needs both.
  screen.on('resize', updateLayout);

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
  const mobileCarousel = new MobileCarousel({
    parent: screen,
    top: MENU_HEIGHT,
    left: 0,
    width: '100%',
    height: (screen as any).height - MENU_HEIGHT - STATUS_HEIGHT - INPUT_HEIGHT,
    tabLabels: ['Sidebar', 'Chat'],  // Tab labels for navigation bar
    showTabBar: true,      // Show clickable tab bar at top
    showIndicators: true,  // Show page dots at bottom
    swipeable: true,
    controlKeys: true,
    swipeThreshold: 3,     // Low threshold for easy swiping
    hidden: true,  // Start hidden, only show on mobile breakpoint
    style: {
      fg: 'white',
      bg: 'black',
    },
    onPageChange: (page, _panel) => {
      audio.playSound('click');
    },
  });

  // Track saved panel states for restoring after mobile mode
  let savedSidebarParent: any = null;
  let savedChatParent: any = null;
  let savedSidebarPosition: any = null;
  let savedChatPosition: any = null;

  function enterMobileMode() {
    if (mobileMode) return;
    console.log(`[LiveChat/layout] enterMobileMode at ${(screen as any).width}x${(screen as any).height}`);
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
    mobileCarousel.showPage(1);  // Start on Chat tab

    // Update carousel height
    const contentHeight = (screen as any).height - MENU_HEIGHT - STATUS_HEIGHT - INPUT_HEIGHT;
    mobileCarousel.position.height = contentHeight;

    screen.render();
  }

  function exitMobileMode() {
    if (!mobileMode) return;
    console.log(`[LiveChat/layout] exitMobileMode at ${(screen as any).width}x${(screen as any).height}`);
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
      const contentHeight = height - MENU_HEIGHT - STATUS_HEIGHT - INPUT_HEIGHT;
      mobileCarousel.position.height = contentHeight;
      screen.render();
    } else {
      // Exit mobile mode if we were in it
      if (mobileMode) {
        exitMobileMode();
      } else {
        updateLayout();
      }
    }
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

  // Track the current video render mode so we can include it in the chat
  // header. Seeded to 'halfblock' (default); updated by onRenderModeChange.
  let currentRenderMode: 'ascii' | 'color' | 'halfblock' | 'braille' = 'halfblock';

  function updateChatHeader() {
    const channelName = getChannelDisplayName(state.currentChannel) || 'Lobby';
    const inVoice = !!(voiceChannel && (voiceChannel as any).isInVoiceChannel?.());
    const modeSuffix = inVoice ? ` [${currentRenderMode.toUpperCase()}]` : '';
    const fullLabel = ` ${channelName}${modeSuffix} `;
    // Inner Log label (chatLog is borderless, label rarely visible).
    updateChatHeaderFn(chatLog, channelName + modeSuffix);
    // Outer DockablePanel label — this is what the user actually sees
    // across the top of the chat panel border.
    if (chatPanel && (chatPanel as any).setLabel) {
      (chatPanel as any).setLabel(fullLabel);
      (chatPanel as any).screen?.render?.();
    }
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

  // Leaving the menu bar is handled by the focus cycle in
  // handlers/keyboard-shortcuts.ts, which knows which DIRECTION the player
  // was moving. Escape emits the same event with no direction and lands on
  // the message box, because that is the next stop after the bar.

  // ========== FOCUS BORDERS ==========
  // NOTE: Active panel borders (white on focus) are now handled automatically by SDK!
  // No need for manual focus handlers - the SDK's screen.setFocused() method
  // automatically changes border colors: white for focused, original color for blurred.
  // This applies to all panels: inputBox, channelList, userList, and chatLog.

  // ========== POPUP DIALOGS ==========
  // Note: Dialog widgets (Message, Prompt, Question) have built-in fixed heights.
  // Don't pass height: 'shrink' as it breaks nested element rendering.
  const { modalOverlay, showModal, hideModal: originalHideModal, messageDialog, promptDialog, questionDialog, showMessageDialog, showPromptDialog, showConfirmDialog } = createDialogs(screen, inputBox);

  // Wrap hideModal to restore commandSuggestions z-order after hiding modals
  const hideModal = (widget: any) => {
    originalHideModal(widget);
    // If commandSuggestions is visible, restore it to front
    // This ensures it stays above modals that called setFront()
    if (!commandSuggestions.hidden && commandSuggestionsVisible) {
      commandSuggestions.setFront();
      ghostText.setFront();
    }
  };

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
      border: { fg: PANEL_BORDER },
    },
    trapFocus: true,
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
      border: { fg: PANEL_BORDER },
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
      border: { fg: PANEL_BORDER },
    },
    hidden: true,
  });

  // Loading spinner (using SDK DoorLoader)
  const loader = new DoorLoader(screen, {
    overlay: true,
    overlayOpacity: 0.5,
    spinner: true,
    barColor: 'cyan',
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
  // secLevel >= 255 is the AmiExpress sysop tier; any door admin item
  // (kick/ban/archive/etc) is gated on this.
  const isSysop = (session?.user?.secLevel ?? 0) >= 255;
  const hiddenTiles = new Set<string>();
  const { contextMenu, showContextMenu, hideContextMenu } = createContextMenus(
    screen,
    inputBox,
    showUserProfile,
    showDMPrompt,
    addSystemMessage,
    socket,
    {
      isSysop,
      muteList: state.muteList,
      onFocusTile: (uid) => {
        const vg = (voiceChannel as any).videoGrid;
        if (!vg) return;
        if (vg.getViewMode() !== 'speaker') vg.toggleViewMode();
        vg.setActiveSpeaker(uid);
        addSystemMessage(`{cyan-fg}Focused stream: user ${uid}{/cyan-fg}`);
      },
      onHideTile: (uid) => {
        hiddenTiles.add(uid);
        const vg = (voiceChannel as any).videoGrid;
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
        if (!ch) return;
        const id = ch.id;
        const currentlyExpanded = collapsedChannels.has(id) ? false : true;
        if (currentlyExpanded) {
          expandedChannels.delete(id);
          collapsedChannels.add(id);
        } else {
          collapsedChannels.delete(id);
          expandedChannels.add(id);
        }
        updateChannelList();
      },
    }
  );

  // ========== VOICE CHANNEL (Discord-style UX) ==========
  const voiceChannel = createEnhancedVoiceChannel({
    parent: sidebarPanel,  // Parent to sidebar so controls appear at bottom of sidebar (Discord-style)
    channelList,
    screen,
    socket,
    ctx: session as any, // Pass session as ctx for audio API access
    userId,
    username,
    chatPanel, // Pass chat panel so video grid renders in correct location
    onJoinVoice: (channelId: string) => {
      addSystemMessage(`Joined voice channel`);
      updateChatHeader();  // add [MODE] tag to chat panel label
    },
    onLeaveVoice: () => {
      addSystemMessage(`Left voice channel`);
      updateChatHeader();  // strip [MODE] tag
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

  // Be ready to SHOW video from the start, without joining voice first.
  //
  // The video grid used to be built only on joining a voice channel, and the
  // frame handler with it - so a user who never touched voice received every
  // frame and dropped it, which the door's log reported as
  // "video:frame received, has handler: false". Video does not depend on
  // voice: the backend falls back to the chat room, so people in a text
  // channel can see each other perfectly well. The grid stays hidden until
  // somebody actually has a camera on.
  (voiceChannel as any).ensureVideoGrid?.();

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
    // Use absolute screen coordinates (aleft/atop)
    const inputLeft = (inputBox as any).aleft || 0;
    const inputTop = (inputBox as any).atop || 0;
    
    // Account for 1-cell border
    return {
      x: inputLeft + 1 + (selection.start || 0),
      y: inputTop + 1,
    };
  };

  // Auto-show format picker when text is selected (keyboard or mouse)
  inputBox.on('select', (selection: any) => {
    if (selection && selection.text && !formatPicker.isVisible()) {
      formatPicker.show(
        screen,
        (format: any) => {
          // Wrap selected text with format tags
          const wrappedText = format.wrap(selection.text);
          (inputBox as any).replaceSelection?.(wrappedText);
          
          // Update content immediately for live preview
          if ((inputBox as any).options.tags) {
            inputBox.setContent(inputBox.getValue());
          }
          
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
          // Wrap selected text with format tags
          const wrappedText = format.wrap(selection.text);
          (inputBox as any).replaceSelection?.(wrappedText);
          
          // Update content immediately for live preview
          if ((inputBox as any).options.tags) {
            inputBox.setContent(inputBox.getValue());
          }
          
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
      // Name the message under the pointer. This used to pass nothing at
      // all, which is why Pin, Delete and React could only print
      // "requires message ID" - the menu knew a click had happened and
      // nothing about what was under it.
      const logWidth = Math.max(1, Number((chatLog as any).width) || 80);
      const scrollRow = Number((chatLog as any).childBase) || 0;
      // y is relative to the panel; the log sits one row inside its border.
      const index = messageIndexAtRow(chatMessages, logWidth, scrollRow, y - 1);
      const messageId = index === null ? undefined : (chatMessageIds[index] ?? undefined);

      showContextMenu(x, y, 'chat', messageId);
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
  function rowAtClick(list: any, event: any): number | undefined {
    const pos = list._getCoords?.();
    if (!pos) return undefined;
    const hasDrawnBorder = !!(list.options?.border && list.options.border.type && list.options.border.type !== 'none');
    const border = hasDrawnBorder ? 1 : 0;
    const pad = list.options?.padding;
    const padTop = typeof pad === 'number' ? pad : (pad?.top ?? 0);
    const relY = (event?.y ?? 0) - pos.yi - border - padTop;
    if (relY < 0) return undefined;
    const scroll = list.getScroll?.() ?? 0;
    return relY + scroll;
  }

  userList.on('rightclick', (event: any) => {
    userList.focus();
    const items = (userList as any).items || [];
    const row = rowAtClick(userList, event);
    console.log('[livechat DIAG] userList rightclick x=%d y=%d row=%s items.len=%d', event?.x, event?.y, row, items.length);
    if (row !== undefined && row >= 0 && row < items.length) {
      const text = typeof items[row] === 'string' ? items[row] : (items[row] as any)?.content || '';
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
  function toggleChannelExpand(id: string) {
    const currentlyExpanded = collapsedChannels.has(id) ? false : true;
    if (currentlyExpanded) {
      expandedChannels.delete(id);
      collapsedChannels.add(id);
    } else {
      collapsedChannels.delete(id);
      expandedChannels.add(id);
    }
    updateChannelList();
    screen.render();
  }
  channelList.key(['space'], () => {
    const sel = (channelList as any).selected;
    const item = sel !== undefined ? channelItems[sel] : undefined;
    if (item && item.type === 'text') toggleChannelExpand(item.id);
  });
  // Right arrow = force-expand, Left arrow = force-collapse on the
  // highlighted channel — matches file-browser / tree-widget UX.
  channelList.key(['right'], () => {
    const sel = (channelList as any).selected;
    const item = sel !== undefined ? channelItems[sel] : undefined;
    if (!item || item.type !== 'text') return;
    if (collapsedChannels.has(item.id) || !expandedChannels.has(item.id)) {
      collapsedChannels.delete(item.id);
      expandedChannels.add(item.id);
      updateChannelList();
      screen.render();
    }
  });
  channelList.key(['left'], () => {
    const sel = (channelList as any).selected;
    const item = sel !== undefined ? channelItems[sel] : undefined;
    if (!item || item.type !== 'text') return;
    expandedChannels.delete(item.id);
    collapsedChannels.add(item.id);
    updateChannelList();
    screen.render();
  });

  // Channel list right-click to show context menu. Uses the row under
  // the cursor (via rowAtClick), not `.selected` — right-click shouldn't
  // require a prior left-click to select.
  channelList.on('rightclick', (event: any) => {
    channelList.focus();
    const row = rowAtClick(channelList, event);
    const item = row !== undefined ? channelItems[row] : undefined;
    console.log('[livechat DIAG] channelList rightclick x=%d y=%d row=%s item=%s', event?.x, event?.y, row, item ? `${item.type}:${item.username || item.name}` : 'none');
    if (item) {
      const x = event.x || 0;
      const y = event.y || 0;
      if (item.type === 'user' && item.username) {
        showContextMenu(x, y, 'user', item.username);
      } else if (item.type === 'text' || item.type === 'voice') {
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

  function addChatMessage(line: string, applyMarkdown = true, messageId?: string) {
    const parsed = applyMarkdown ? parseContent(line) : line;
    const highlighted = highlightMentions(parsed, username);
    appendLineToLog(highlighted, messageId);
    screen.render();
  }

  /**
   * Empty the chat log, and everything it can be rebuilt from.
   *
   * There are three stores of the same messages - the rendered lines, the
   * app state and the MessageHandler - and clearing one of them left the
   * others to put the messages back. Reported as "/clear didn't clear the
   * messages from the other user".
   */
  function clearChat() {
    chatMessages.length = 0;
    chatMessageIds.length = 0;
    state.messages.length = 0;
    messageHandler.clear();
    animationManager.clear?.();
    chatLog.setContent('');
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

  // Track logical chat messages separately
  const chatMessages: string[] = [];
  /**
   * The message id behind each rendered line, where there is one.
   *
   * Kept alongside chatMessages rather than inside it, so the rendering path
   * is untouched. This is what lets a right-click on the log name the
   * message under the pointer - without it, Pin, Delete and React had
   * nothing to act on and said so.
   */
  const chatMessageIds: (string | null)[] = [];

  // Helper function to rebuild chat content from logical messages + previews
  function rebuildChatContent() {
    const previewLines = Array.from(state.typingBuffers.values()).map(buf => {
      const color = getUserColor(buf.username);
      const time = formatTime(new Date());
      // Blinking cursor with user's chat color
      const cursor = cursorBlinkOn ? `{${color}-fg}{inverse} {/inverse}{/${color}-fg}` : ' ';
      return `{gray-fg}[${time}]{/gray-fg} <{${color}-fg}${buf.username}{/${color}-fg}> ${buf.buffer}${cursor}`;
    });

    // Start/stop cursor blink interval based on whether there are typing previews
    if (previewLines.length > 0) {
      startCursorBlink();
    } else {
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
      const animFrame = (animationManager as any).getRendered?.(idx);
      return animFrame != null && animFrame !== '' ? animFrame : line;
    });

    // CRITICAL: Use CRLF for separation to force margin return
    const fullContent = [...renderedMessages, ...previewLines].join('\r\n');

    chatLog.setContent(fullContent);
    chatLog.setScrollPerc(100);
  }

  function appendLineToLog(line: string, messageId?: string) {
    chatMessages.push(line);
    chatMessageIds.push(messageId ?? null);
    
    // Register animated lines
    const lineIndex = chatMessages.length - 1;
    if (hasAnimationTags(line)) {
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
  let _typingPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  let _typingPreviewLastRun = 0;
  let _lastTypingFingerprint = '';
  let _lastChatMessageCount = -1;
  const _TYPING_PREVIEW_MIN_MS = 33;

  function _typingFingerprint(): string {
    // Cheap hash of all active typing buffers + message count + animation
    // count. Anything that would change the rendered chat panel touches one
    // of these. Stringifying is fine -- typingBuffers is small (1 entry per
    // typing user, capped at 3 displayed).
    const parts: string[] = [];
    for (const [uid, buf] of state.typingBuffers) {
      parts.push(`${uid}:${buf.username}:${buf.buffer}`);
    }
    parts.push(`m=${chatMessages.length}`);
    parts.push(`a=${animationManager?.getAnimatedLineCount?.() ?? 0}`);
    return parts.join('|');
  }

  function _doRebuild(): void {
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
    if (_typingPreviewTimer) return;
    _typingPreviewTimer = setTimeout(() => {
      _typingPreviewTimer = null;
      _typingPreviewLastRun = Date.now();
      _doRebuild();
    }, _TYPING_PREVIEW_MIN_MS - since);
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
    loader.show(text);
  }

  function hideLoading() {
    loader.hide();
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
  // Setter function for currentRoomLabel to prevent stale references
  const setCurrentRoomLabel = (value: string) => { currentRoomLabel = value; };
  setupRoomHandlers(socket, state, onlineUsers, userId, username, nodeId, presenceService, updateChannelList, updateUserTable, updateStatusBar, addSystemMessage, addActivity, audio, hideLoading, setChannel, setCurrentRoomLabel, showMessageDialog, inputBox, screen);

  // Clear typing preview lines when switching channels
  // setupRoomHandlers already clears state.typingBuffers via setChannel,
  // but typingPreviewLines is a separate Map that also needs clearing
  socket.on('room:joined', () => {
    // New room joined
  });

  // ========== CHAT SOCKET HANDLERS ==========
  setupChatHandlers(socket, state, userId, username, onlineUsers, presenceService, chatLog, updateUserTable, addSystemMessage, addChatMessage, addActivity, updateEventsFeed, audio, mentionsUser, getUserColor, formatMessage, processKeystroke, updateTypingPreview, screen, shouldShowEvent, getEventMessage, eventBus, addMessage, messageHandler, formatTime);

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

  // ========== DM SIDEBAR / CONTEXT EVENT LISTENERS ==========
  setupDmSidebarHandlers({ socket, state, userId, screen, updateChannelList, addChatMessage });

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
    console.log('[LIVECHAT DEBUG] Socket disconnected, reason:', reason);
    if (reason !== 'io client disconnect') {
      // Server initiated disconnect or connection lost
      showConnectionErrorDialog(`Disconnected: ${reason}`);
    }
    // CRITICAL: Always call cleanup on disconnect to restore BBS input
    console.log('[LIVECHAT DEBUG] Calling cleanup() from disconnect handler');
    cleanup();
  });

  socket.on('connect_error', (error: any) => {
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

  // Wrap async handler to satisfy blessed's sync event handler type requirement
  const asyncSubmitHandler = createSubmitHandler(
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
    clearChat,
    // tryJoinVoiceChannel - check if channel name matches a voice channel
    (channelName: string): boolean => {
      const match = channelItems.find(
        c => c.type === 'voice' && c.name.toLowerCase() === channelName.toLowerCase()
      );
      if (match) {
        const channelId = match.id.replace('voice-', '');
        voiceChannel.joinVoiceChannel(channelId);
        voiceChannel.showGrid();
        addSystemMessage(`Joining voice channel: ${match.name}`);
        return true;
      }
      return false;
    }
  );
  inputBox.on('submit', (value: string) => { asyncSubmitHandler(value); });

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
        return true;
      } else if (key.name === 'down' && !key.shift) {
        (commandSuggestions as any).down(1);
        screen.render();
        // `true` means HANDLED. Returning undefined let the key fall through
        // to Screen's default arrow-key focus navigation, which moved focus
        // to the sidebar - so the next arrow scrolled the sidebar instead of
        // the suggestions.
        return true;
      } else if (key.name === 'up' && !key.shift) {
        (commandSuggestions as any).up(1);
        screen.render();
        return true;
      } else if (key.name === 'escape') {
        hideCommandSuggestions();
        return true;
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

      // NOTE: Do NOT call setContent() here - it overrides the textbox's internal
      // _updateContent() which handles effect conversion and selection markers.
      // The textbox automatically updates its own content when needed.

      if (currentValue.startsWith('/') && currentValue.length > 0) {
        // Show command suggestions
        showCommandSuggestions(currentValue);
      } else {
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
  const switchSidebarTabWrapper = (t: string) => {
    if (t === 'channels' || t === 'users') {
      switchSidebarTab(t);
    }
  };
  // Getter function for current sidebar tab value (prevents stale references)
  const getSidebarTab = () => sidebarTab;
  const { updateChatLayout, toggleSidebar } = setupKeyboardShortcuts(screen, chatPanel, drawingCanvas, inputBox, getSidebarTab, channelList, userList, emojiPicker, showHelp, switchSidebarTabWrapper, addSystemMessage, showFileSharing, showSettingsOverlay, showConfirm, cleanup, SIDEBAR_WIDTH, chatLog, typingBar, menuBar.element, updateLayout);

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
          
          // Update content immediately for live preview
          if ((inputBox as any).options.tags) {
            inputBox.setContent(inputBox.getValue());
          }
          
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

  // Press `r` (outside the input box) to cycle the outgoing webcam render
  // mode. Only fires when we're in a voice channel so it doesn't collide
  // with people typing the letter 'r' elsewhere in the UI.
  screen.key(['r'], () => {
    if ((screen as any).focused === inputBox) return;
    if (!voiceChannel.isInVoiceChannel()) return;
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
            inputBox.setValue(currentText + (emoji.display || emoji.code) + ' ');
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
    onJoinChannel: () => {
      // Use the existing channel-list tab so it's consistent with F2.
      sidebarTab !== 'channels' && switchSidebarTab('channels');
      if (channelList.hidden) channelList.toggle();
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
      voiceChannel.cycleRenderMode().catch(() => {});
    },
    onToggleView: () => {
      // Fullscreen (speaker mode) <-> grid split-view
      const vg = (voiceChannel as any).videoGrid;
      if (!vg) {
        addSystemMessage('{yellow-fg}Video grid not active — join a voice channel and enable video.{/yellow-fg}');
        return;
      }
      vg.toggleViewMode();
      addSystemMessage(`View: ${vg.getViewMode() === 'speaker' ? 'Fullscreen (focus)' : 'Grid (split)'}`);
    },
    onToggleSidebar: () => {
      // The same toggle F2 uses - it hides the PANEL and relayouts, rather
      // than emptying the sidebar and leaving its frame behind.
      const shown = toggleSidebar();
      addSystemMessage(shown ? 'Sidebar shown' : 'Sidebar hidden (F2 to show)');
    },
    // The same clear /clear uses. This one used to blank the display only,
    // leaving every store full, so the messages came back on the next
    // repaint.
    onClearChat: clearChat,
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
    console.log('[LIVECHAT CLEANUP] Starting cleanup...');
    state.running = false;

    // Stop cursor blink interval
    stopCursorBlink();

    // Send leave room only if we are in a room
    if (state.currentChannel) {
      socket.emit('room:leave');
    }

    events.clear();

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
        bbs.write('\x1b[2J\x1b[H');  // Clear screen and home cursor

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
        await new Promise<void>((resolve) => {
          screen.on('destroy', resolve);
        });
      } finally {
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
