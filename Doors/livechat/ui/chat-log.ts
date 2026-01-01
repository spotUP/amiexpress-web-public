/**
 * Chat log component
 * Main chat message display area
 */
import { Screen, Log, DockablePanel, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
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
): { panel: DockablePanel; log: any; preview: any } {
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

  // The preview area height (usually 1 or 2 lines for who is typing)
  const PREVIEW_HEIGHT = 1;
  const logWidth = panelWidth - 2;
  const logHeight = panelHeight - 2 - PREVIEW_HEIGHT;

  // 1. Permanent Log
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

  // 2. Live Typing Preview (at bottom of panel)
  const typingPreview = createBox({
    parent: chatPanel,
    bottom: 0,
    left: 0,
    width: logWidth,
    height: PREVIEW_HEIGHT,
    tags: true,
    content: '',
    style: {
      fg: 'gray',
      bg: 'black',
    }
  });

  return { panel: chatPanel, log: chatLog, preview: typingPreview };
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
