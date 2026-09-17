export declare const STATE_EVENT = "game:worms_state";
export declare const INPUT_EVENT = "game:worms_input";
export declare const HELLO_EVENT = "game:worms_hello";
export interface LobbySummary {
    id: string;
    name: string;
    players: number;
    maxPlayers: number;
}
export interface NetSession {
    user?: {
        id?: number | string;
        username?: string;
    };
    bbsSession?: {
        nodeId?: number;
        nodeNumber?: number;
    };
    nodeId?: number;
}
export declare class WormsNet {
    private readonly network;
    readonly playerId: string;
    readonly playerName: string;
    private lobbyId;
    private readonly unsubscribers;
    constructor(session: NetSession);
    /** Matches waiting for an opponent. */
    open(): Promise<LobbySummary[]>;
    host(): Promise<string>;
    join(lobbyId: string): Promise<void>;
    /** Send a packet to everyone else in the lobby. */
    send(event: string, payload: unknown): void;
    /** Listen for a packet. Returns the unsubscribe. */
    on(event: string, handler: (payload: unknown) => void): () => void;
    /** Someone joined or left the lobby this player is in. */
    onLobbyChange(handler: () => void): () => void;
    dispose(): void;
    get lobby(): string | null;
}
