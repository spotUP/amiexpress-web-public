import type { Message, DisplayMessage } from '../types';
import { formatTime } from '../utils/format';

/** Message display handler */
export class MessageHandler {
  private messages: DisplayMessage[] = [];
  private maxMessages = 100;

  /** Add a message to display */
  addMessage(msg: Message): DisplayMessage {
    const display: DisplayMessage = {
      time: formatTime(msg.createdAt),
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
  addSystem(content: string): DisplayMessage {
    const display: DisplayMessage = {
      time: formatTime(new Date()),
      username: 'SYSTEM',
      content,
      color: 'gray',
      isSystem: true
    };
    this.messages.push(display);
    return display;
  }

  /** Get all messages */
  getMessages(): DisplayMessage[] {
    return this.messages;
  }

  /** Get color for username */
  private getUserColor(username: string): string {
    const colors = ['cyan', 'green', 'yellow', 'magenta', 'blue'];
    const hash = username.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }
}
