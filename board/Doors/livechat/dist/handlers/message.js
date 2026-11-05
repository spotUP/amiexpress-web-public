"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageHandler = void 0;
const format_1 = require("../utils/format");
/** Message display handler */
class MessageHandler {
    constructor() {
        this.messages = [];
        this.maxMessages = 100;
    }
    /** Add a message to display */
    addMessage(msg) {
        const display = {
            time: (0, format_1.formatTime)(msg.createdAt),
            username: msg.username,
            content: msg.content,
            color: this.getUserColor(msg.username),
            isSystem: msg.type !== 'message'
        };
        this.messages.push(display);
        if (this.messages.length > this.maxMessages) {
            this.messages.shift();
        }
        return display;
    }
    /** Add a system message */
    addSystem(content) {
        const display = {
            time: (0, format_1.formatTime)(new Date()),
            username: 'SYSTEM',
            content,
            color: 'gray',
            isSystem: true
        };
        this.messages.push(display);
        return display;
    }
    /**
     * Forget everything.
     *
     * The chat log can be rebuilt from more than one store, so clearing the
     * display alone put the messages straight back on the next repaint.
     */
    clear() {
        this.messages = [];
    }
    /** Get all messages */
    getMessages() {
        return this.messages;
    }
    /** Get color for username */
    getUserColor(username) {
        const colors = ['cyan', 'green', 'yellow', 'magenta', 'blue'];
        const hash = username.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        return colors[hash % colors.length];
    }
}
exports.MessageHandler = MessageHandler;
