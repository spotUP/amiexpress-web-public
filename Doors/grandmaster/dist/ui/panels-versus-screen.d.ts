/**
 * TETRIS ATTACK with an opponent: Vs CPU and Challenge Mode.
 *
 * The same loop as the solo screen - a fixed-timestep 60Hz engine, throttled
 * repaint, one input character per frame - with a second board beside it and a
 * PanelMatch moving garbage between them.
 *
 * ONE SCREEN SERVES BOTH MODES because the two opponents differ only in what
 * they are, not in how they are driven:
 *
 *   VS CPU     a real Stack, played by PanelAi through the input path. Its
 *              board is drawn, because it has one.
 *   CHALLENGE  a SimulatedStack: an attack script and a health model with no
 *              board at all. Its slot draws a danger bar, which is what
 *              panel-attack draws too.
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { Stack } from '../core/panels/stack';
import { SimulatedStack } from '../core/panels/simulated-stack';
import { PanelAi } from '../ai/panel-ai';
import { BoardVariant } from './panels/board-view';
import type { HeldInput } from './panels-screen';
import type { SoundEngine } from '../audio/sounds';
export interface PanelsVersusOptions {
    screen: Screen;
    /** The board the player is on. */
    player: Stack;
    /** A real board played by the CPU, or a boardless Challenge opponent. */
    opponent: Stack | SimulatedStack;
    /** Present when the opponent is a real board being played by the bot. */
    cpu?: PanelAi;
    sheet: Record<string, Sprite>;
    sounds?: SoundEngine;
    readInput: () => HeldInput;
    variant?: BoardVariant;
}
export interface VersusResult {
    playerWon: boolean;
    score: number;
    frames: number;
}
export declare class PanelsVersusScreen {
    private readonly screen;
    private readonly player;
    private readonly opponent;
    private readonly cpu?;
    private readonly sheet;
    private readonly readInput;
    private readonly variant;
    private readonly match;
    private layout?;
    private playerBox?;
    private centreBox?;
    private opponentBox?;
    private loop?;
    private lastTick;
    private frameAccumulator;
    private lastRender;
    private quitting;
    constructor(options: PanelsVersusOptions);
    /** Does the opponent have a board to draw, or only a health bar? */
    private get opponentHasBoard();
    private setupUI;
    private renderOpponent;
    private repaint;
    /** One engine frame for both boards. */
    private step;
    run(): Promise<VersusResult>;
    quit(): void;
    cleanup(): void;
}
//# sourceMappingURL=panels-versus-screen.d.ts.map