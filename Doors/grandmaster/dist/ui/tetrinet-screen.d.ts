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