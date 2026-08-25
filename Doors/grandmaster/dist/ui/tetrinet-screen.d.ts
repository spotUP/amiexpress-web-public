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
    /**
     * Team per participant id, from the lobby. TetriNET treats teams as
     * metadata - the reference server does not filter attacks by team - but
     * the winlist is keyed by player AND team, so it has to reach the match.
     */
    teams?: Record<string, string>;
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
    private teams;
    private boardBox;
    private previewBox;
    private holdBox;
    private statsBox;
    private suddenDeathBox;
    private inventoryPanel;
    private targetSelector;
    private opponentBoards;
    private effectOverlay;
    private running;
    private unsubscribers;
    private lastRender;
    /** Background repaint rate, matching the versus screen. */
    private static readonly RENDER_INTERVAL;
    /** Participants on other BBS nodes, keyed by the id their packets carry. */
    private remotes;
    /** Whether any remote participant has ever been seen (victory needs this). */
    private sawRemote;
    /** Hard-drop motion blur, drawn by the same code as the main modes. */
    private hardDropTrails;
    /**
     * Who has died, in order. The reference server hands out winlist points
     * by finishing place - 3 to the winner, 2 to whoever died last before
     * them, 1 to the one before that - so the order matters, not just the
     * survivor.
     */
    private deathOrder;
    private knownAlive;
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
    /** Team of a participant, or '' when teams are not in use. */
    private participantTeam;
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
    /**
     * TetriNET's "average levels" option: everyone at the table climbs
     * together at the average of all levels, rather than at their own pace.
     */
    private shareAverageLevel;
    /** Note anyone who has just died, keeping the order they died in. */
    private trackDeaths;
    /**
     * Finishing order for the winlist: the survivor first, then the others
     * from the last death backwards. Empty when the match ended without a
     * single survivor - the reference server records nothing then either.
     */
    getFinishOrder(): Array<{
        name: string;
        team?: string;
    }>;
    /** Publish this node's fields: the human, plus any bots it owns. */
    private publishFields;
    /**
     * Setup UI layout - 80x24, the same budget the versus screen fits into.
     *
     * Col  0-25 : playfield        (26w, 24h, top 0) - 12x22 field, 2 chars a
     *                               cell, plus its border. A TetriNET field is
     *                               two rows TALLER than a TGM one, so it uses
     *                               the full height and the readouts that sit
     *                               under the board in versus live to the
     *                               right of it here.
     * Col 26-51 : Next (rows 0-5), Inventory (6-8), Target (9-16),
     *             Stats (17-20), Sudden Death (21-23)
     * Col 52-79 : Opponents        (28w, 24h, top 0)
     *   26 + 26 + 28 = 80, and nothing is painted below row 23.
     *
     * The previous layout put the board at top 1 with height 24 (so its bottom
     * border fell on row 25, off a 24-row terminal) and the stats bar at row
     * 25, off-screen entirely - which is why the field looked bottomless and
     * score/level/lines were nowhere to be seen.
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
    /** Repaint now - used by input handlers so the throttle is invisible. */
    private renderNow;
    /** Ids of everyone still playing, this node's human excluded. */
    private livingTargets;
    /**
     * Use the first special on the player shown at that slot number. The
     * panel numbers opponents from 1, which is what the key refers to.
     */
    private useSpecialOnSlot;
    /** Use the first special in the inventory on one participant. */
    private fireSpecial;
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
     * Remember the streak a hard drop is about to leave. Must run BEFORE the
     * drop, while the piece is still at the top of its fall.
     */
    private recordHardDropTrail;
    /**
     * Render the held piece, greyed out until it can be swapped again.
     */
    private renderHold;
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
    /** Colour name for a piece type - also what the motion blur fades out. */
    private getPieceColor;
    /**
     * Get colored block character for special type
     */
    private getSpecialBlockChar;
    /**
     * Toggle pause
     */
    /**
     * Pause is MATCH-wide in TetriNET (`pause <on|off> <slot>` in the
     * protocol): one player pausing stops the game for everybody, and any
     * player can resume it. It used to pause this node's engine only, so in a
     * networked match the other players kept playing against a frozen board.
     */
    private togglePause;
    /** Apply a pause state locally - to this node's bots as well. */
    private applyPause;
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