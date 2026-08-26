/**
 * Chat log component
 * Main chat message display area
 */
import { Screen, DockablePanel, Log } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createLog } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { MENU_HEIGHT } from './menu-bar';
import { STATUS_HEIGHT } from './status-bar';
import { INPUT_HEIGHT } from './input-box';
import { TYPING_HEIGHT } from './typing-preview';
import { PANEL_BORDER, PANEL_BORDER_FOCUS } from './theme';

// Re-export TYPING_HEIGHT for backward compatibility
export { TYPING_HEIGHT };

export function createChatLog(
  screen: Screen,
  sidebarWidth: number
): { panel: DockablePanel; log: Log } {
  // Create dockable panel for chat
  const screenWidth = (screen as any).width || 80;
  const screenHeight = (screen as any).height || 24;

  // Account for sidebar width - no additional subtraction needed
  // Sidebar is 18 chars (including its border), screen is 80, so chat panel gets 62 chars
  const chatPanelWidth = screenWidth - sidebarWidth;

  const chatPanel = new DockablePanel({
    parent: screen,
    title: ' Chat ',
    label: ' Chat ',
    top: MENU_HEIGHT,
    left: sidebarWidth,
    width: chatPanelWidth,
    height: screenHeight - MENU_HEIGHT - STATUS_HEIGHT - INPUT_HEIGHT,
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
    topConstraint: MENU_HEIGHT,
    bottomConstraint: STATUS_HEIGHT + INPUT_HEIGHT,
    border: {
      type: 'line',
      labelStyle: { fg: 'white', bg: 'blue' }  // Blue background for label
    },
    style: {
      fg: 'white',
      bg: 'black',
      // style.border.fg, NOT border.fg - Element reads the border colour from
      // style.border / border.style / style.fg and ignores a colour sitting
      // on the border object itself. With it in the wrong place this panel
      // drew grey while the source said otherwise.
      border: { fg: PANEL_BORDER },
      focus: { border: { fg: PANEL_BORDER_FOCUS } },
    },
  });

  // Explicitly set position after creation
  (chatPanel as any).position.left = sidebarWidth;
  (chatPanel as any).position.top = MENU_HEIGHT;

  const panelWidth = screenWidth - sidebarWidth;
  const panelHeight = screenHeight - MENU_HEIGHT - STATUS_HEIGHT - INPUT_HEIGHT;

  const logWidth = panelWidth - 2;
  const logHeight = panelHeight - 2;

  // Use Log widget for proper chat functionality with type safety
  const chatLog = createLog({
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

export function updateChatHeader(
  chatLog: Log,
  channelName: string
): void {
  chatLog.setLabel(` ${channelName} `);
}

/**
 * Add a BBS event announcement to the chat log
 */
export function addBBSEvent(
  chatLog: Log,
  formattedEvent: string
): void {
  // Add the event to the log using the Log widget's add method
  chatLog.add(formattedEvent);
}
