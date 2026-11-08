/** User presence status */
export type PresenceStatus = 'online' | 'away' | 'busy' | 'dnd' | 'invisible' | 'offline';

/** User presence info */
export interface UserPresence {
  userId: number;
  status: PresenceStatus;
  customStatus?: string;
  activity?: string;
  lastActive: Date;
}

/** Presence indicator display */
export const PRESENCE_INDICATORS: Record<PresenceStatus, string> = {
  online: '[*]',
  away: '[~]',
  busy: '[!]',
  dnd: '[-]',
  invisible: '[ ]',
  offline: '[x]'
};

/** Presence colors */
export const PRESENCE_COLORS: Record<PresenceStatus, string> = {
  online: 'green',
  away: 'yellow',
  busy: 'magenta',
  dnd: 'red',
  invisible: 'gray',
  offline: 'gray'
};
