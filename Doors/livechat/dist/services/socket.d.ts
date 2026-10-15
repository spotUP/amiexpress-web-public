/** WebSocket communication service */
export declare class SocketService {
    private ws;
    private url;
    constructor(url: string);
    /** Connect to chat server */
    connect(): Promise<void>;
    /** Handle incoming message */
    private handleMessage;
    /** Send message to server */
    send(type: string, payload: any): void;
    /** Disconnect from server */
    disconnect(): void;
}
