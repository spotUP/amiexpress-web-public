import type { Message, DisplayMessage } from '../types';
/** Message display handler */
export declare class MessageHandler {
    private messages;
    private maxMessages;
    /** Add a message to display */
    addMessage(msg: Message): DisplayMessage;
    /** Add a system message */
    addSystem(content: string): DisplayMessage;
    /**
     * Forget everything.
     *
     * The chat log can be rebuilt from more than one store, so clearing the
     * display alone put the messages straight back on the next repaint.
     */
    clear(): void;
    /** Get all messages */
    getMessages(): DisplayMessage[];
    /** Get color for username */
    private getUserColor;
}
