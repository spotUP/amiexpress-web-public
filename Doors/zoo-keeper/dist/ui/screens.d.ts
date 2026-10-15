/**
 * Zoo Keeper - UI Screens
 * Neo-blessed screen definitions for menus, overlays, and game chrome
 */
import blessed from "@amiexpress/bbs-door-sdk/engines/ui/blessed";
import { HighScore } from "../game/types";
type Screen = ReturnType<typeof blessed.screen>;
type Box = ReturnType<typeof blessed.box>;
/**
 * Screen Manager - handles all UI screens
 */
export declare class ScreenManager {
    private screen;
    private parent;
    private activeOverlay;
    constructor(screen: Screen, parent: Box);
    /**
     * Clear any active overlay
     */
    clearOverlay(): void;
    /**
     * Create title screen with ASCII art logo
     */
    createTitleScreen(menuSelection: number): void;
    /**
     * Create high scores screen
     */
    createHighscoresScreen(highscores: HighScore[]): void;
    /**
     * Create help screen
     */
    createHelpScreen(): void;
    /**
     * Create pause screen overlay
     */
    createPauseScreen(): void;
    /**
     * Create game over screen
     */
    createGameOverScreen(score: number, level: number): void;
    /**
     * Create name entry screen for high scores
     */
    createNameEntryScreen(score: number, currentName: string): void;
    /**
     * Create stage transition screen
     */
    createTransitionScreen(message: string): void;
    /**
     * Create level complete screen
     */
    createLevelCompleteScreen(level: number, score: number, timeBonus: number): void;
    /**
     * Create animal legend (shown during gameplay)
     */
    createAnimalLegend(): string;
    /**
     * Create bonus item legend
     */
    createBonusLegend(): string;
    /**
     * Format HUD content
     */
    formatHUD(score: number, level: number, lives: number, hasNet?: boolean): string;
    /**
     * Format footer content based on game state
     */
    formatFooter(state: string): string;
}
/**
 * ASCII Art assets
 */
export declare const ASCII_ART: {
    logo: string;
    zeke: {
        right: string;
        left: string;
        up: string;
        down: string;
        jump: string;
    };
    animals: {
        elephant: string;
        snake: string;
        camel: string;
        rhino: string;
        moose: string;
        lion: string;
    };
    tree: string;
    zelda: string;
    monkey: string;
    wall: {
        broken: string;
        weak: string;
        medium: string;
        strong: string;
    };
};
export {};
//# sourceMappingURL=screens.d.ts.map