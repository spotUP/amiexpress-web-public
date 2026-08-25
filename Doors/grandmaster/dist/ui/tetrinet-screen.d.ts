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
import type { TetriNetTransport } from '../network/tetrinet-transport';
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
    /**
     * Field/special transport. Two implementations: the external TetriNET
     * server adapter (fields only - the server routes specials itself) and
     * the in-process broker transport used for BBS-internal multiplayer.
     */
    network?: TetriNetTransport;
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
    /** Participants on other BBS nodes, keyed by the id their packets carry. */
    private remotes;
    /** Whether any remote participant has ever been seen (victory needs this). */
    private sawRemote;
    constructor(options: TetriNetScreenOptions);
    /**
     * The special/garbage ROUTER - the layer TetriNET never had.
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
     * The router treats every participant the same, whether it is this node's
     * human, a bot this node owns, or a player on another BBS node: resolve
     * the id, then either apply the hit locally or put it on the wire.
     *
     * Games on an EXTERNAL TetriNET server are not routed here - that server
     * fans specials out itself, so doing it again locally would double every
     * hit.
     */
    private setupAttackRouting;
    /** Id this node's human player answers to. */
    private localId;
    /** True when the transport carries specials and garbage itself. */
    private routesOverNetwork;
    private aiOpponents;
    /**
     * Engine for a participant this node OWNS, or null - which also means
     * "not ours": a remote player's id resolves to null here and the hit goes
     * on the wire instead.
     */
    private participantEngine;
    private participantName;
    /** Every id currently in the match, local and remote. */
    private participantIds;
    /**
     * Deliver one special to its target, wherever that target lives.
     *
     * Self-only and self-applied continuous specials (Clear Line, Immunity)
     * are handled inside the sending engine, so they are not routed anywhere.
     *
     * NOTE: useSpecial() POPS the inventory before firing the callback, so the
     * special MUST be read from the callback argument - the inventory no
     * longer holds it by the time we get here.
     */
    private routeSpecial;
    /** Apply a special to an engine on this node and give the human feedback. */
    private applyLocalSpecial;
    /**
     * Classic-rules garbage goes to EVERY other living player (the cs1/cs2/cs4
     * broadcast of the original protocol), not just the selected target.
     */
    private routeGarbage;
    /** A special from another node, addressed to somebody this node owns. */
    private receiveSpecial;
    /** Garbage from another node. `to: null` is the classic broadcast. */
    private receiveGarbage;
    /**
     * Victory: outliving every other participant ends the match.
     * TetriNetAI.allDead() had zero callers, so a local TetriNET game could
     * only ever be LOST - the last player standing just kept stacking alone.
     */
    private checkVictory;
    /**
     * Repaint the opponent strip and target list from BOTH sources - the bots
     * this node owns and the players on other nodes.
     */
    private refreshOpponents;
    /** Publish this node's fields: the human, plus any bots it owns. */
    private publishFields;
    /**
     * Setup UI layout
     */
    private setupUI;
    /**
     * Setup engine event callbacks
     */
    private setupEngineCallbacks;
    /**
     * Track the participants living on other BBS nodes.
     *
     * The old version wrote straight into one opponent board with
     * `name: update.playerId  // Use ID as name for now`, `hasImmunity: false
     * // TODO` and a hardcoded opponent index of 0, so every remote player
     * overwrote the same slot and none of them had a name. Updates now land
     * in a keyed map and the whole strip is repainted from it alongside the
     * local bots.
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