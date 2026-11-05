import type { Screen, List } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { ChannelMember, PresenceStatus } from '../types';
/** Create user list component */
export declare function createUserList(screen: Screen): List;
/** Format user for list */
export declare function formatUserItem(member: ChannelMember, status: PresenceStatus, isTyping: boolean): string;
/** Build user list items */
export declare function buildUserListItems(members: ChannelMember[], presenceMap: Map<string, PresenceStatus>, typingSet: Set<string>): string[];
