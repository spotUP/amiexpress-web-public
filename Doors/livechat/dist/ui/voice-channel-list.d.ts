/**
 * Voice Channel List Integration
 *
 * Integrates voice channels into the main channel list (Discord-style)
 * - Shows voice channels with [V] prefix
 * - Displays participant count
 * - Click to join/leave
 */
export interface VoiceChannelInfo {
    id: string;
    name: string;
    participantCount: number;
    participants: Array<{
        userId: number | string;
        username: string;
        isSpeaking: boolean;
    }>;
}
export interface ChannelListItem {
    id: string;
    name: string;
    type: 'text' | 'voice';
    participantCount?: number;
    isActive?: boolean;
}
/**
 * Format channel list items to include voice channels
 */
export declare function formatChannelListWithVoice(textChannels: Array<{
    id: string;
    name: string;
    isActive?: boolean;
}>, voiceChannels: VoiceChannelInfo[]): ChannelListItem[];
/**
 * Render channel item with appropriate prefix and formatting
 */
export declare function renderChannelItem(item: ChannelListItem, currentVoiceChannel?: string): string;
/**
 * Check if channel list item is a voice channel
 */
export declare function isVoiceChannel(itemText: string): boolean;
/**
 * Extract channel ID from formatted channel item
 */
export declare function extractChannelId(items: ChannelListItem[], selectedIndex: number): {
    id: string;
    type: 'text' | 'voice';
} | null;
/**
 * Update channel list with voice channel information
 */
export declare function updateChannelListDisplay(channelList: any, textChannels: Array<{
    id: string;
    name: string;
    isActive?: boolean;
}>, voiceChannels: VoiceChannelInfo[], currentVoiceChannel?: string): ChannelListItem[];
/**
 * Get voice channel participant tooltip
 */
export declare function getVoiceChannelTooltip(voiceChannel: VoiceChannelInfo): string;
/**
 * Create voice channel section header
 */
export declare function createVoiceChannelHeader(): string;
/**
 * Create text channel section header
 */
export declare function createTextChannelHeader(): string;
/**
 * Format full channel list with section headers (Discord-style)
 */
export declare function formatChannelListWithHeaders(textChannels: Array<{
    id: string;
    name: string;
    isActive?: boolean;
}>, voiceChannels: VoiceChannelInfo[], currentVoiceChannel?: string): {
    displayItems: string[];
    itemMapping: ChannelListItem[];
};
