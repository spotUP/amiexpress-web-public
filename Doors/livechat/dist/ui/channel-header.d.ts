import type { Channel } from '../types';
/** Create channel header component */
export declare function createChannelHeader(blessed: any, screen: any): any;
/** Format channel header content */
export declare function formatChannelHeader(channel: Channel | null, userCount: number): string;
/** Update channel header */
export declare function updateChannelHeader(header: any, channel: Channel | null, userCount: number): void;
/** Format pinned indicator */
export declare function formatPinnedCount(count: number): string;
