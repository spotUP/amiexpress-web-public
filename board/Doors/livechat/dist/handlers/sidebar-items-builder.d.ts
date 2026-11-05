/**
 * Pure builder for the LiveChat sidebar item list (channelList).
 *
 * Extracted from server.ts so the file stays under the 2000-line limit.
 * Builds the parallel `items` (rendered strings) and `channelItems`
 * (logical rows) arrays from app state. No blessed/UI side effects.
 */
export type ChannelItem = {
    id: string;
    name: string;
    type: 'header' | 'spacer';
} | {
    id: string;
    name: string;
    type: 'text';
} | {
    id: string;
    name: string;
    type: 'voice';
} | {
    id: string;
    name: string;
    type: 'user';
    username: string;
} | {
    id: string;
    name: string;
    type: 'dm';
    isGroup: boolean;
};
export interface BuilderInput {
    channelsToShow: any[];
    state: any;
    onlineUsers: Map<string, any>;
    presenceService: any;
    presenceIndicators: Record<string, string>;
    isCurrentChannel: (id?: string, name?: string) => boolean;
    expandedChannels: Set<string>;
    collapsedChannels: Set<string>;
    voiceChannelService: any;
}
export interface BuilderOutput {
    items: string[];
    channelItems: ChannelItem[];
}
export declare function buildSidebarItems(input: BuilderInput): BuilderOutput;
