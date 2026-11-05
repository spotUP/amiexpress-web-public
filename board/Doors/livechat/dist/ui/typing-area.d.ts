import type { TypingUser } from '../types';
/** Create input box config */
export declare function inputBoxConfig(): {
    label: string;
    border: {
        type: "line";
    };
    inputOnFocus: boolean;
    tags: boolean;
    style: {
        border: {
            fg: string;
        };
        focus: {
            border: {
                fg: string;
            };
        };
    };
};
/** Format typing indicator */
export declare function formatTyping(users: TypingUser[]): string;
/** Create status line config */
export declare function statusLineConfig(): {
    height: number;
    tags: boolean;
    style: {
        fg: string;
    };
};
