/**
 * Send one line to the current room and echo it locally. The one path for a
 * typed line and for /reply, so both emit the same event and paint the same row.
 */
import type { Socket } from 'socket.io-client';
import { type ReplyParent } from '../core/reply-quote';
export interface SendRoomLineDeps {
    socket: Socket;
    userId: number;
    username: string;
    addChatMessage: (msg: string, applyMarkdown?: boolean, messageId?: string) => void;
    inputHistory: {
        add: (id: string, text: string) => void;
    };
    updateTypingPreview: () => void;
    /** Remember what a line said, so a later reply can quote it. */
    rememberMessage: (id: string, username: string, content: string) => void;
    /** The author and text of a message already on screen, by id. */
    lookupMessage: (id: string) => ReplyParent | undefined;
}
export declare function sendRoomLine(deps: SendRoomLineDeps, msg: string, replyTo?: string): void;
