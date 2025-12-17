import { events } from './events';
import type { Message, TypingUser, Channel } from '../types';

/** WebSocket communication service */
export class SocketService {
  private ws: WebSocket | null = null;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  /** Connect to chat server */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('Connection failed'));
      this.ws.onmessage = (e) => this.handleMessage(e.data);
      this.ws.onclose = () => events.emit('disconnect');
    });
  }

  /** Handle incoming message */
  private handleMessage(data: string): void {
    const msg = JSON.parse(data);
    events.emit(msg.type, msg.payload);
  }

  /** Send message to server */
  send(type: string, payload: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  /** Disconnect from server */
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
