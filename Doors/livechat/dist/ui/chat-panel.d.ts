import type { Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { DisplayMessage } from '../types';
/** Create chat panel box config */
export declare function chatPanelConfig(): {
    label: string;
    border: {
        type: "line";
    };
    scrollable: boolean;
    alwaysScroll: boolean;
    scrollbar: {
        ch: string;
        track: {
            ch: string;
            style: {
                fg: string;
            };
        };
        style: {
            fg: string;
        };
    };
    tags: boolean;
    style: {
        fg: string;
        border: {
            fg: string;
        };
    };
};
/** Format message for display */
export declare function formatMessage(msg: DisplayMessage): string;
/** Render messages to box */
export declare function renderMessages(box: Box, messages: DisplayMessage[]): void;
