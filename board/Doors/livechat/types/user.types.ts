/** User status */
export type UserStatus = 'online' | 'away' | 'dnd' | 'invisible' | 'offline';

/** Chat user */
export interface ChatUser {
  id: string;
  username: string;
  status: UserStatus;
  customStatus?: string;
  lastSeen: Date;
  nodeId?: number;
}

/** User list item for sidebar */
export interface UserListItem {
  id: string;
  username: string;
  status: UserStatus;
  isTyping: boolean;
  nodeId?: number;
}

/** Event preferences */
export interface EventPrefs {
  showLogins: boolean;
  showFileActivity: boolean;
  showDoorActivity: boolean;
  showMessages: boolean;
  showSystemAnnouncements: boolean;
  muteAllEvents: boolean;
  compactMode: boolean;
  showTimestamps: boolean;
  notificationSound: boolean;
  mentionSound: boolean;
}
