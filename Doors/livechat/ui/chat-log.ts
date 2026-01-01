/**
 * Chat log component
 * Main chat message display area
 */
import { Screen, Log, DockablePanel } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
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
  const screenWidth = (screen as any).width || 80;
  const screenHeight = (screen as any).height || 24;

  const chatPanel = new DockablePanel({
    parent: screen,
    title: ' Chat ',
    top: MENU_HEIGHT,
    left: sidebarWidth,
    width: screenWidth - sidebarWidth,
    height: screenHeight - MENU_HEIGHT - STATUS_HEIGHT - INPUT_HEIGHT,
    dockPosition: 'float',
    showMinimizeButton: true,
    resizable: true,
    draggable: true,
    minWidth: 40,
    minHeight: 10,
    zIndex: 1,
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

  // Explicitly set position after creation
  (chatPanel as any).position.left = sidebarWidth;
  (chatPanel as any).position.top = MENU_HEIGHT;

  const panelWidth = screenWidth - sidebarWidth;
  const panelHeight = screenHeight - MENU_HEIGHT - STATUS_HEIGHT - INPUT_HEIGHT;

  const logWidth = panelWidth - 2;
  const logHeight = panelHeight - 2;

  const chatLog = blessed.log({
    parent: chatPanel,
    top: 0,
    left: 0,
    width: logWidth,
    height: logHeight,
    label: '',
    border: { type: 'none' },
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    wrap: true,
    scrollbar: {
      ch: '█',
      style: { fg: 'cyan' }
    },
    scrollback: 1000,
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
 */
export function addBBSEvent(
  chatLog: Log,
  formattedEvent: string
) {
  chatLog.add(formattedEvent);
}
