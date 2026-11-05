"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketService = void 0;
const events_1 = require("./events");
/** WebSocket communication service */
class SocketService {
    constructor(url) {
        this.ws = null;
        this.url = url;
    }
    /** Connect to chat server */
    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.url);
            this.ws.onopen = () => resolve();
            this.ws.onerror = () => reject(new Error('Connection failed'));
            this.ws.onmessage = (e) => this.handleMessage(e.data);
            this.ws.onclose = () => events_1.events.emit('disconnect');
        });
    }
    /** Handle incoming message */
    handleMessage(data) {
        const msg = JSON.parse(data);
        events_1.events.emit(msg.type, msg.payload);
    }
    /** Send message to server */
    send(type, payload) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, payload }));
        }
    }
    /** Disconnect from server */
    disconnect() {
        this.ws?.close();
        this.ws = null;
    }
}
exports.SocketService = SocketService;
