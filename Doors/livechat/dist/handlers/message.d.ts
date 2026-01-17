import type { Message, DisplayMessage } from '../types';
/** Message display handler */
export declare class MessageHandler {
    private messages;
    private maxMessages;
    /** Add a message to display */
    addMessage(msg: Message): DisplayMessage;
    /** Add a system message */
    addSystem(content: string): DisplayMessage;
    /** Get all messages */
    getMessages(): DisplayMessage[];
    /** Get color for username */
    private getUserColor;
}
