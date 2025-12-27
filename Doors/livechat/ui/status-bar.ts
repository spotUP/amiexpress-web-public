/**
 * Status bar component
 * Shows user info, channel, and status at the bottom
 */
import blessed, { Screen, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { PRESENCE_INDICATORS } from '../types';
import type { AppState } from '../core/state';
import type { PresenceService } from '../services';

export const STATUS_HEIGHT = 1;

export function createStatusBar(screen: Screen): Box {
  return blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: STATUS_HEIGHT,
    tags: true,
    ch: ' ',
    style: {
      fg: 'white',
      bg: 'blue',
    },
  });
}

export function updateStatusBar(
  statusBar: Box,
  state: AppState,
  presenceService: PresenceService,
  username: string,
  userId: number,
  nodeId: number,
  getChannelDisplayName: (id: string) => string,
  updateChatHeader: () => void
) {
  const ch = getChannelDisplayName(state.currentChannel) || 'none';
  const status = state.prefs.muteAllEvents ? 'MUTED' : 'LIVE';
  const presence = presenceService.get(userId);
  const myStatus = presence?.status || 'online';
  
  statusBar.setContent(
    ` @${username} | Node ${nodeId} | #${ch} | ${PRESENCE_INDICATORS[myStatus]} ${myStatus.toUpperCase()} | [${status}] | F1:Help F4:Emoji `
  );
  
  updateChatHeader();
}
