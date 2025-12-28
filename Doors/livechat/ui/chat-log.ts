/**
 * Chat log component
 * Main chat message display area
 */
import { Screen, Log, DockablePanel } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createLog } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { MENU_HEIGHT } from './menu-bar';
import { STATUS_HEIGHT } from './status-bar';
import { INPUT_HEIGHT } from './input-box';
import { TYPING_HEIGHT } from './typing-preview';

// Re-export TYPING_HEIGHT for backward compatibility
export { TYPING_HEIGHT };

export function createChatLog(
  screen: Screen,
  sidebarWidth: number
): { panel: DockablePanel; log: Log } {
  // Create dockable panel for chat
  // Calculate dimensions based on screen size
  const screenWidth = (screen as any).width || 80;
  const screenHeight = (screen as any).height || 24;

  const chatPanel = new DockablePanel({
    parent: screen,
    title: ' Chat ',
    top: MENU_HEIGHT,
    left: sidebarWidth,
    width: screenWidth - sidebarWidth,
    height: screenHeight - MENU_HEIGHT - STATUS_HEIGHT - INPUT_HEIGHT - TYPING_HEIGHT,
    dockPosition: 'float',
    showMinimizeButton: true,
    resizable: true,
    draggable: true,
    minWidth: 40,
    minHeight: 10,
    zIndex: 1,  // Lower z-index so it doesn't overlap fixed UI (input, status, typing)
    border: { type: 'line', fg: 'green' },
    style: { border: { fg: 'green' } },
  });

  // Create log inside the panel
  // Calculate dimensions to fill panel interior (avoiding borders and title bar)
  const panelWidth = screenWidth - sidebarWidth;
  const panelHeight = screenHeight - MENU_HEIGHT - STATUS_HEIGHT - INPUT_HEIGHT - TYPING_HEIGHT;

  // Log dimensions: panel size minus borders (2 cols/rows for left+right, top+bottom)
  const logWidth = panelWidth - 2;  // -2 for left and right borders
  const logHeight = panelHeight - 2;  // -2 for title bar and bottom border

  const chatLog = createLog({
    parent: chatPanel,
    top: 1,      // Below title bar
    left: 1,     // Right of left border
    width: logWidth,
    height: logHeight,
    label: '',
    border: { type: 'none' },
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    scrollOnInput: true,
    scrollbar: {
      ch: '█'
    },
    scrollback: 500,
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
) {
  chatLog.setLabel(` ${channelName} `);
}

/**
 * Add a BBS event announcement to the chat log
 * Events are displayed in a distinct format from regular chat messages
 */
export function addBBSEvent(
  chatLog: Log,
  formattedEvent: string
) {
  chatLog.add(formattedEvent);
}
