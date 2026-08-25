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
    private noticeBox;
    private noticeTimer;
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
    /**
     * Announce an incoming hit.
     *
     * This used to build a 30x5 black box in the CENTRE of the screen - wider
     * than the 26-column board - for one second. That was survivable when
     * nothing called it; once specials and garbage were actually routed it
     * fired on every hit, and against three bots it sat across the middle of
     * the playfield almost permanently: reported as "a black band, as if a
     * line was cleared".
     *
     * Notices now go to a one-line readout beside the board when the screen
     * gives us one, and are dropped otherwise. A real TetriNET client logs
     * incoming specials; it does not cover your field with them.
     */
    showIncomingWarning(attackType: string): void;
    /** Where notices are printed. Set by the screen; without it they vanish. */
    setNoticeBox(box: unknown): void;
    private showNotice;
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