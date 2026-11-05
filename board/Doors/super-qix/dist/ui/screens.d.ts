/**
 * Super Qix - UI Screens
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
    clearOverlay(): void;
    createTitleScreen(menuSelection: number): void;
    createHighscoresScreen(highscores: HighScore[]): void;
    createHelpScreen(): void;
    createPauseScreen(): void;
    createGameOverScreen(score: number, level: number, maxPercent: number): void;
    createNameEntryScreen(score: number, level: number, currentName: string): void;
    createLevelCompleteScreen(level: number, score: number, percent: number, bonus: number): void;
    formatHUD(score: number, level: number, lives: number, percent: number, effects: string[]): string;
    formatFooter(state: string, letterDisplay?: string): string;
}
/**
 * ASCII Art assets
 */
export declare const ASCII_ART: {
    logo: string;
    marker: string;
    qix: string;
    sparx: string;
    superSparx: string;
    fuse: string;
    border: string;
    unclaimed: string;
    claimed: string;
    stixFast: string;
    stixSlow: string;
};
export {};
//# sourceMappingURL=screens.d.ts.map