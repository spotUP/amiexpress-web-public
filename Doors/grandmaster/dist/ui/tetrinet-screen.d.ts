/**
 * TetriNET Game Screen
 *
 * Main game screen for TetriNET mode combining:
 * - Main board (left side)
 * - Piece preview and hold
 * - Special inventory panel
 * - Target selector
 * - Opponent mini-boards
 * - Effect overlays
 * - Sudden death timer
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { TetriNetEngine } from '../core/tetrinet/tetrinet-engine';
import type { InputHandler } from '../input/handler';
import type { SoundEngine } from '../audio/sounds';
import type { AppState } from '../core/types';
import type { GrandmasterNetworkManager } from '../network/network-manager';
import { type OpponentBoardData } from './tetrinet/opponent-boards';
/**
 * TetriNET Screen options
 */
export interface TetriNetScreenOptions {
    screen: Screen;
    engine: TetriNetEngine;
    inputHandler: InputHandler;
    sounds: SoundEngine;
    state: AppState;
    network?: GrandmasterNetworkManager;
    playerName: string;
    aiController?: any;
}
/**
 * TetriNET Game Screen
 */
export declare class TetriNetScreen {
    private screen;
    private engine;
    private inputHandler;
    private sounds;
    private state;
    private network;
    private playerName;
    private aiController;
    private boardBox;
    private previewBox;
    private statsBox;
    private suddenDeathBox;
    private inventoryPanel;
    private targetSelector;
    private opponentBoards;
    private effectOverlay;
    private running;
    private unsubscribers;
    constructor(options: TetriNetScreenOptions);
    /**
     * The special/garbage ROUTER - the layer local TetriNET never had.
     *
     * Both halves of the exchange were already written and correct: engines
     * SEND via onSpecialUsed/onLinesAdded and RECEIVE via
     * applyIncomingSpecial/addGarbage. Nothing connected them. Both receive
     * methods had exactly one caller repo-wide - the EXTERNAL TetriNET server
     * path in app.ts - so against local AI a special was popped off the
     * inventory, played a sound and vanished, and a classic-rules line clear
     * sent garbage to a `if (this.network)` branch whose body was the comment
     * "TODO: Send garbage to target via network". Local TetriNET was four
     * players practising alone in the same room.
     *
     * Networked games are NOT routed here: the server owns fan-out and
     * app.ts applies what comes back, so routing locally too would double
     * every hit.
     */
    private setupAttackRouting;
    private aiOpponents;
    /** Engine for a participant id, or null if that player is out of the game. */
    private participantEngine;
    private participantName;
    /**
     * Deliver one special to its target.
     *
     * Self-only and self-applied continuous specials (Clear Line, Immunity)
     * are handled inside the sending engine, so they are not routed anywhere.
     *
     * NOTE: useSpecial() POPS the inventory before firing the callback, so the
     * special MUST be read from the callback argument - the inventory no
     * longer holds it by the time we get here.
     */
    private routeSpecial;
    /**
     * Victory: outliving every bot ends the match. TetriNetAI.allDead() had
     * zero callers, so a local TetriNET game could only ever be LOST - the
     * last player standing just kept stacking alone until they topped out.
     */
    private checkVictory;
    /**
     * Classic-rules garbage goes to EVERY other living player (the cs1/cs2/cs4
     * broadcast of the original protocol), not just the selected target.
     */
    private routeGarbage;
    /**
     * Setup UI layout
     */
    private setupUI;
    /**
     * Setup engine event callbacks
     */
    private setupEngineCallbacks;
    /**
     * Setup network event listeners
     * NOTE: Full network integration will be implemented in Phase 5
     */
    private setupNetworkListeners;
    /**
     * Run game loop
     */
    run(): Promise<void>;
    /**
     * Setup input handlers
     */
    private setupInput;
    /**
     * Show countdown
     */
    private showCountdown;
    /**
     * Render game state
     */
    private render;
    /**
     * Render the game board
     */
    private renderBoard;
    /**
     * Render piece preview
     */
    private renderPreview;
    /**
     * Update opponent list (external server adapter).
     */
    updateOpponents(opponents: OpponentBoardData[]): void;
    /**
     * Get colored block character for piece type
     */
    private getBlockChar;
    /**
     * Get colored block character for special type
     */
    private getSpecialBlockChar;
    /**
     * Toggle pause
     */
    private togglePause;
    /**
     * Stop the game
     */
    stop(): void;
    /**
     * Cleanup
     */
    cleanup(): void;
}
//# sourceMappingURL=tetrinet-screen.d.ts.map