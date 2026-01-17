import type { Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { ChannelMember, Channel } from '../types';
/** Create sidebar box config */
export declare function sidebarConfig(): {
    label: string;
    border: {
        type: "line";
    };
    tags: boolean;
    scrollable: boolean;
    style: {
        fg: string;
        border: {
            fg: string;
        };
    };
};
/** Format user for sidebar */
export declare function formatUser(member: ChannelMember): string;
/** Render user list */
export declare function renderUsers(box: Box, members: ChannelMember[]): void;
/** Format channel for list */
export declare function formatChannel(ch: Channel, isCurrent: boolean): string;
/** Render channel list */
export declare function renderChannels(box: Box, channels: Channel[], currentId: string | null): void;
