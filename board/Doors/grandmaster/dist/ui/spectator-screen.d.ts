/**
 * Spectator screen
 *
 * Watch a match you are not playing in. Deliberately mode-agnostic: it
 * subscribes to BOTH game channels and renders whatever arrives, so it
 * works for the TGM modes (versus, CPU battle - `game:update`) and for
 * TetriNET (`game:tnet_field`) without knowing which is running. The two
 * carry different board sizes (10x24 against 12x22); the mini-board
 * renderer scales by area, so neither is a special case.
 *
 * Spectators are ordinary lobby members that take no seat, so every game
 * event broadcast to the lobby already reaches them - see the broker's
 * handleJoinLobby.
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { GrandmasterNetworkManager } from '../network/network-manager';
import type { SoundEngine } from '../audio/sounds';
export interface SpectatorScreenOptions {
    screen: Screen;
    network: GrandmasterNetworkManager;
    sounds: SoundEngine;
    /** Shown in the header - the lobby's name or mode. */
    title: string;
}
export declare class SpectatorScreen {
    private screen;
    private network;
    private sounds;
    private title;
    private headerBox;
    private chatBox;
    private boards;
    private players;
    private chatLines;
    private unsubscribers;
    private running;
    constructor(options: SpectatorScreenOptions);
    /**
     * 80x24: header, a grid of up to six fields, and the last few chat lines.
     */
    private setupUI;
    private setupListeners;
    private record;
    /** Watch until the viewer presses escape or Q. */
    run(): Promise<void>;
    private render;
    /** How many players this spectator has seen so far. */
    getWatchedCount(): number;
    cleanup(): void;
}
//# sourceMappingURL=spectator-screen.d.ts.map