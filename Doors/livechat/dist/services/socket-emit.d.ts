import type { Message, Channel } from '../types';
/** Socket event emitter */
export declare class SocketEmitter {
    private s;
    constructor(socket: any);
    keystroke(chId: string, uid: number, char: string): void;
    keystrokeClear(chId: string, uid: number): void;
    keystrokeSubmit(chId: string, uid: number): void;
    message(msg: Message): void;
    messageEdit(msg: Message): void;
    messageDelete(msgId: string, chId: string): void;
    threadReply(msg: Message): void;
    channelCreated(ch: Channel): void;
    channelDeleted(chId: string): void;
    channelUpdated(ch: Channel): void;
    userJoined(chId: string, uid: number, name: string): void;
    userLeft(chId: string, uid: number, name: string): void;
    presenceUpdate(status: string): void;
}
