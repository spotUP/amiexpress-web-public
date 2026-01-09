import type { PresenceStatus } from '../types';

/** Status indicator symbols */
const STATUS_SYMBOLS: Record<PresenceStatus, string> = {
  online: '[*]',
  away: '[~]',
  dnd: '[-]',
  invisible: '[.]',
  offline: '[ ]'
};

/** Create user status summary component */
export function createUserStatus(blessed: any, screen: any) {
  return blessed.box({
    parent: screen,
    bottom: 2,
    left: 0,
    width: 16,
    height: 1,
    style: { fg: 'green' },
    content: ''
  });
}

/** Format user status summary */
export function formatUserStatus(counts: Record<PresenceStatus, number>): string {
  const online = counts.online || 0;
  const away = counts.away || 0;
  const dnd = counts.dnd || 0;
  return ` {green-fg}*${online}{/green-fg} {yellow-fg}~${away}{/yellow-fg} {red-fg}-${dnd}{/red-fg}`;
}

/** Update user status display */
export function updateUserStatus(
  status: any,
  counts: Record<PresenceStatus, number>
): void {
  status.setContent(formatUserStatus(counts));
}

/** Get status symbol for display */
export function getStatusSymbol(status: PresenceStatus): string {
  return STATUS_SYMBOLS[status] || '[?]';
}
