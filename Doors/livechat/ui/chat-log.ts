/**
 * Chat log component
 * Main chat message display area
 */
import { Screen, Log, DockablePanel } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createLog } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { MENU_HEIGHT } from './menu-bar';
import { STATUS_HEIGHT } from './status-bar';
import { INPUT_HEIGHT } from './input-box';

// Height of the typing indicator bar (shows who is typing in real-time)
export const TYPING_HEIGHT = 1;

export function createChatLog(
  screen: Screen,
  sidebarWidth: number
): { panel: DockablePanel; log: Log } {
  // Create dockable panel for chat
  const chatPanel = new DockablePanel({
    parent: screen,
    title: ' Chat ',
    top: MENU_HEIGHT,
    left: sidebarWidth,
    right: 0,
    bottom: STATUS_HEIGHT + INPUT_HEIGHT + TYPING_HEIGHT,
    dockPosition: 'float',
    showMinimizeButton: true,
    resizable: true,
    draggable: true,
    minWidth: 40,
    minHeight: 10,
    border: { type: 'line', fg: 'green' },
    style: { border: { fg: 'green' } },
  });

  // Create log inside the panel
  const chatLog = createLog({
    parent: chatPanel,
    top: 1,
    left: 1,
    width: '100%-2',
    height: '100%-2',
    label: '',
    border: { type: 'none' },
    mouse: true,
    scrollable: true,
    scrollbar: {
      ch: '|',
      style: { fg: 'green', bg: 'black' },
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
