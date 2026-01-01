/**
 * Chat log component
 * Main chat message display area
 */
import { Screen, Log, DockablePanel } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { MENU_HEIGHT } from './menu-bar';
import { STATUS_HEIGHT } from './status-bar';
import { INPUT_HEIGHT } from './input-box';
import { TYPING_HEIGHT } from './typing-preview';

// Re-export TYPING_HEIGHT for backward compatibility
export { TYPING_HEIGHT };

export function createChatLog(
  screen: Screen,
  sidebarWidth: number
): { panel: DockablePanel; log: any } {
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
    height: screenHeight - MENU_HEIGHT - STATUS_HEIGHT - INPUT_HEIGHT,  // Removed TYPING_HEIGHT since typing bar is hidden
    dockPosition: 'float',
    showMinimizeButton: true,
    resizable: true,
    draggable: true,
    minWidth: 40,
    minHeight: 10,
    zIndex: 1,  // Lower z-index so it doesn't overlap fixed UI (input, status, typing)
    border: { type: 'line', fg: 'green' },
    style: {
      fg: 'white',
      bg: 'black',
      focus: {
        fg: 'white',
        bg: 'black'
      }
    },
  });

  // Explicitly set position after creation (DockablePanel may override initial values)
  (chatPanel as any).position.left = sidebarWidth;
  (chatPanel as any).position.top = MENU_HEIGHT;

  // Create log inside the panel
  // Calculate dimensions to fill panel interior (avoiding borders and title bar)
  const panelWidth = screenWidth - sidebarWidth;
  const panelHeight = screenHeight - MENU_HEIGHT - STATUS_HEIGHT - INPUT_HEIGHT;  // Removed TYPING_HEIGHT since typing bar is hidden

  // Log dimensions: fill panel content area completely
  // Account for: title bar (1 line) + top border (1 line) + bottom border (1 line) + minimize button row (0, in title)
  const logWidth = panelWidth - 2;  // -2 for left and right borders
  const logHeight = panelHeight - 2;  // -2 for title bar + bottom border

  const chatLog = createBox({
    parent: chatPanel,
    top: 0,      // Align to top of content area (title bar is outside)
    left: 0,     // Align to left of content area (border is outside)
    width: logWidth,
    height: logHeight,
    label: '',
    border: { type: 'none' },  // No border - panel has the border
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
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
  chatLog: any,
  channelName: string
) {
  chatLog.setLabel(` ${channelName} `);
}

/**
 * Add a BBS event announcement to the chat log
 * Events are displayed in a distinct format from regular chat messages
 */
export function addBBSEvent(
  chatLog: any,
  formattedEvent: string
) {
  chatLog.add(formattedEvent);
}
