import type { Screen, List } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Channel } from '../types';
/** Create channel list component */
export declare function createChannelList(screen: Screen): List;
/** Format channel item for list */
export declare function formatChannelItem(ch: Channel, unread: number): string;
/** Group channels by category */
export declare function groupChannels(channels: Channel[]): Map<string, Channel[]>;
/** Build list items with categories */
export declare function buildChannelListItems(channels: Channel[]): string[];
