/**
 * TetriNET Effect Overlay
 *
 * Visual overlays for continuous effects:
 * - Darkness: Hides the piece preview
 * - Confusion: Shows scrambled controls indicator
 * - Immunity: Shows protective shield effect
 * - Mutation: Shows piece randomization warning
 */
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { ContinuousEffectManager } from '../../core/tetrinet/continuous-effects';
/**
 * Effect Overlay options
 */
export interface EffectOverlayOptions {
    parent: Screen;
    boardTop: number;
    boardLeft: number;
    boardWidth: number;
    boardHeight: number;
}
/**
 * Effect Overlay component
 */
export declare class EffectOverlay {
    private parent;
    private darknessOverlay;
    private confusionIndicator;
    private immunityBorder;
    private mutationIndicator;
    private statusBar;
    private boardTop;
    private boardLeft;
    private boardWidth;
    private boardHeight;
    constructor(options: EffectOverlayOptions);
    /**
     * Create all overlay elements
     */
    private createOverlays;
    /**
     * Update overlays based on effect manager state
     */
    update(effects: ContinuousEffectManager): void;
    /**
     * Update status bar with all active effects summary
     */
    private updateStatusBar;
    /**
     * Show incoming attack warning
     */
    showIncomingWarning(attackType: string): void;
    /**
     * Show immunity blocked message
     */
    showImmunityBlocked(): void;
    /**
     * Show sudden death warning
     */
    showSuddenDeathWarning(): void;
    /**
     * Show sudden death line addition
     */
    showSuddenDeathLine(totalLines: number): void;
    /**
     * Hide darkness overlay (for preview)
     */
    hideDarkness(): void;
    /**
     * Show darkness overlay
     */
    showDarkness(): void;
    /**
     * Check if darkness is active
     */
    isDarknessActive(): boolean;
    /**
     * Destroy all overlays
     */
    destroy(): void;
}
//# sourceMappingURL=effect-overlay.d.ts.map