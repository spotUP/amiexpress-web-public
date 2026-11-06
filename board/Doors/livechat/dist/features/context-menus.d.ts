import { type MuteList } from '../core/mute-list';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Message } from '../types';
export interface ContextMenuExtras {
    isSysop?: boolean;
    onFocusTile?: (userId: string) => void;
    onHideTile?: (userId: string) => void;
    onMuteRemote?: (userId: string) => void;
    onToggleChannelExpand?: (channelName: string) => void;
    /** The user's mute list, so Mute/Ignore/Block actually do something. */
    muteList?: MuteList;
    /** BBSApi - `addUserNote` persists a sysop note to the account-editor store. */
    bbs?: {
        addUserNote?: (username: string, text: string) => Promise<boolean>;
    };
    /** The door's prompt dialog, for entering a note's text. */
    showPromptDialog?: (prompt: string, def: string, cb: (err: any, val?: string) => void) => void;
    /** This user's actual chat messages, for View History. */
    messagesOf?: (username: string) => Message[];
    /** The room a pin is written into. */
    currentRoom?: () => string;
}
export declare function createContextMenus(s: Screen, ib: any, sup: (u: string) => void, sdp: (u: string) => void, asm: (m: string) => void, sock: any, extras?: ContextMenuExtras): {
    contextMenu: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").List;
    showContextMenu: (x: number, y: number, t: "user" | "chat" | "channel" | "video", tgt?: string) => void;
    hideContextMenu: () => void;
};
