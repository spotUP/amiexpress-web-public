import { activePlayerId } from './game';
import { WormsNet } from './net';
export interface DoorSession {
    socket: {
        emit(event: string, data: string): void;
    };
    bbsSession: Record<string, unknown>;
    user?: {
        id?: number | string;
        username?: string;
    };
    close(): void;
    achievement?(type: string, opts?: {
        value?: number;
        key?: string;
    }): boolean;
}
export declare class WormsApp {
    private readonly session;
    private readonly settings;
    private readonly screen;
    private readonly keys;
    private readonly net;
    private readonly seed;
    private view;
    private role;
    private match;
    /** What a guest was last sent. A guest never owns a match. */
    private mirror;
    private message;
    private menuAt;
    private lobbies;
    private closed;
    /**
     * @param seed Fixes the landscape and the wind rolls. A match is worth
     *   being able to replay, and a test that fires two hundred shots at a
     *   randomly generated landscape is a test that fails on the days the
     *   landscape happens to be kind.
     */
    constructor(session: DoorSession, net?: WormsNet | null, seed?: number);
    start(): void;
    stop(): void;
    handleInput(data: string): void;
    private menuItems;
    private paintMenu;
    private chooseMenu;
    private startHotseat;
    private startHost;
    private onOpponentReady;
    private showLobbies;
    private joinMatch;
    private broadcast;
    private onGuestInput;
    private onHostState;
    private sendAim;
    private myTurn;
    private onArrow;
    private handleKey;
    private changeAim;
    private requestFire;
    private fire;
    private paintMatch;
    private paintMirror;
    private hudFor;
    private aimBar;
    private onEscape;
    private quit;
}
export { activePlayerId };
