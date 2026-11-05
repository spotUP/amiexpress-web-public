/** Channel type for chat */
export type ChannelType = 'public' | 'private' | 'dm' | 'system';

/** Channel role */
export type ChannelRole = 'member' | 'moderator' | 'admin' | 'owner';

/** Channel data */
export interface Channel {
  id: string;
  name: string;
  displayName: string;
  topic: string;
  type: ChannelType;
  category?: string;
  createdBy: string;
  createdAt: Date;
  memberCount: number;
  unreadCount?: number;
  members?: ChannelMember[];
}

/** Channel member */
export interface ChannelMember {
  userId: string;
  username: string;
  role: ChannelRole;
  joinedAt: Date;
  lastReadAt?: Date;
  muted: boolean;
  banned?: boolean;
  isTyping?: boolean;
  isOperator?: boolean;
}

/** Channel list item for sidebar */
export interface ChannelListItem {
  id: string;
  name: string;
  type: ChannelType;
  unread: number;
  hasActivity: boolean;
}
