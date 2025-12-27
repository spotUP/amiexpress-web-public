/**
 * Chat log component
 * Main chat message display area
 */
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { log as createLog, Log } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib';
import { MENU_HEIGHT } from './menu-bar';
import { STATUS_HEIGHT } from './status-bar';
import { INPUT_HEIGHT } from './input-box';

export function createChatLog(
  screen: Screen,
  sidebarWidth: number
): Log {
  return createLog({
    parent: screen,
    top: MENU_HEIGHT,
    left: sidebarWidth,
    right: 0,
    bottom: STATUS_HEIGHT + INPUT_HEIGHT,
    label: ' Chat ',
    border: { type: 'line' },
    mouse: true,
    scrollable: true,
    tags: true,
    scrollbar: {
      ch: '|',
      style: { fg: 'green', bg: 'black' },
    },
    bufferLength: 500,
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'green' },
    },
  }) as Log;
}

export function updateChatHeader(
  chatLog: Log,
  channelName: string
) {
  chatLog.setLabel(` ${channelName} `);
}
