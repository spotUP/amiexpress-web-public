import { type MuteList } from '../core/mute-list';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { type ReplyParent } from '../core/reply-quote';
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
    /** Pinned channels sort first in the channel list (kept in the user's prefs). */
    isChannelPinned?: (name: string) => boolean;
    onTogglePinChannel?: (name: string) => boolean;
    /** Gives the channel an unread count again; false when the channel is unknown. */
    onMarkChannelUnread?: (name: string) => boolean;
    /** The text of a message by id, for Copy Text. */
    messageText?: (id: string) => string | undefined;
    /** Author and content of a message by id, for Quote (the same lookup /reply uses). */
    lookupMessage?: (id: string) => ReplyParent | undefined;
}
/**
 * OSC 52 "set clipboard": ESC ] 52 ; c ; <base64 of UTF-8> BEL. The web
 * terminal (BBSTerminal) turns it into navigator.clipboard.writeText; the
 * door has no other way to reach the user's clipboard.
 */
export declare function osc52Copy(text: string): string;
/** Blessed tags ({bold}, {red-fg}, {/}) are markup, not message text. */
export declare function stripBlessedTags(text: string): string;
export declare function createContextMenus(s: Screen, ib: any, sup: (u: string) => void, sdp: (u: string) => void, asm: (m: string) => void, sock: any, extras?: ContextMenuExtras): {
    contextMenu: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").List;
    reactionPicker: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").List;
    showContextMenu: (x: number, y: number, t: "user" | "chat" | "channel" | "video", tgt?: string) => void;
    hideContextMenu: () => void;
};
