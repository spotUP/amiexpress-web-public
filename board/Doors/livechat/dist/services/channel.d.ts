import type { Channel, ChannelMember } from '../types';
/** Channel state manager */
export declare class ChannelService {
    private channels;
    private current;
    /** Set available channels */
    setChannels(list: Channel[]): void;
    /** Get all channels */
    getAll(): Channel[];
    /** Get channel by ID */
    get(id: string): Channel | undefined;
    /** Set current channel */
    setCurrent(id: string): boolean;
    /** Get current channel */
    getCurrent(): Channel | null;
    /** Update member list for channel */
    setMembers(channelId: string, members: ChannelMember[]): void;
}
