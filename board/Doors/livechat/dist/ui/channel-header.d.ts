import type { Channel } from '../types';
/** Create channel header component */
export declare function createChannelHeader(blessed: any, screen: any): any;
/**
 * The chat panel's title: the channel name and its topic. This title is what
 * the user reads as the channel header, and it showed only "#general" after
 * /topic was set - the topic lived in state but no title ever included it.
 */
export declare function chatPanelTitle(channelName: string, topic: string | undefined, suffix?: string): string;
/** Format channel header content */
export declare function formatChannelHeader(channel: Channel | null, userCount: number): string;
/** Update channel header */
export declare function updateChannelHeader(header: any, channel: Channel | null, userCount: number): void;
/** Format pinned indicator */
export declare function formatPinnedCount(count: number): string;
