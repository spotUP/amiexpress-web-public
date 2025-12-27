/**
 * Settings status radio buttons
 */
import blessed, { Box, RadioSet } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { PresenceStatus } from '../types';
import type { PresenceService, SocketEmitter } from '../services';

export function createStatusRadio(
  p: Box,
  l: number,
  top: number,
  h: number,
  presenceService: PresenceService,
  socketEmitter: SocketEmitter,
  userId: number,
  updateStatusBar: () => void
): RadioSet {
  const radio = blessed.radioset({
    parent: p,
    top,
    left: l,
    width: '100%-6',
    height: h,
    mouse: true,
    items: [
      { text: 'Online', value: 'online' },
      { text: 'Away', value: 'away' },
      { text: 'Busy', value: 'busy' },
      { text: 'Do Not Disturb', value: 'dnd' },
    ],
    selected: 0,
    vertical: true,
    spacing: 1,
    style: { fg: 'white' },
  });

  radio.on('change', (v: string) => {
    presenceService.setStatus(userId, v as PresenceStatus);
    socketEmitter.presenceUpdate(v as PresenceStatus);
    updateStatusBar();
  });

  return radio;
}
