/**
 * Status bar component - uses SDK StatusBar widget
 */
import { Screen, StatusBar } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { PRESENCE_INDICATORS } from '../types';
import type { AppState } from '../core/state';
import type { PresenceService } from '../services';

export const STATUS_HEIGHT = 1;

export function createStatusBar(screen: Screen): Box {
  const bar = new StatusBar({
    parent: screen,
    position: 'bottom',
    fg: 'white',
    bg: 'blue',
    separator: ' | ',
  });

  return bar as unknown as Box;
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

  // Use setFullContent for the custom LiveChat format
  // Keep it short to fit in 80 columns without wrapping
  const statusIcon = PRESENCE_INDICATORS[myStatus];
  (statusBar as any).setFullContent(
    `@${username} | Node ${nodeId} | #${ch} | [${status.charAt(0)}] ${statusIcon} | F1:Help F4:Emoji`
  );

  updateChatHeader();
}
