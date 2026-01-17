/**
 * TetriNET Target Selector
 *
 * Allows players to select targets for special attacks.
 * - Displays list of opponents (up to 5)
 * - Highlights current target
 * - Shows opponent status (alive/dead, immunity)
 * - Keyboard navigation (tab/number keys)
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
/**
 * Opponent info for targeting
 */
export interface TargetInfo {
    id: string;
    name: string;
    alive: boolean;
    hasImmunity: boolean;
    level: number;
}
/**
 * Target Selector options
 */
export interface TargetSelectorOptions {
    parent: Screen;
    top: number | string;
    left: number | string;
    width?: number;
    height?: number;
}
/**
 * Target Selector component
 */
export declare class TargetSelector {
    private box;
    private opponents;
    private selectedIndex;
    private onTargetChangeCallbacks;
    constructor(options: TargetSelectorOptions);
    /**
     * Set opponents list
     */
    setOpponents(opponents: TargetInfo[]): void;
    /**
     * Update a single opponent's status
     */
    updateOpponent(id: string, updates: Partial<TargetInfo>): void;
    /**
     * Add opponent
     */
    addOpponent(opponent: TargetInfo): void;
    /**
     * Remove opponent
     */
    removeOpponent(id: string): void;
    /**
     * Select next target
     */
    selectNext(): void;
    /**
     * Select previous target
     */
    selectPrevious(): void;
    /**
     * Select target by number (1-5)
     */
    selectByNumber(num: number): void;
    /**
     * Get currently selected target
     */
    getSelectedTarget(): TargetInfo | null;
    /**
     * Register callback for target changes
     */
    onTargetChange(callback: (target: TargetInfo | null) => void): () => void;
    /**
     * Notify target change callbacks
     */
    private notifyTargetChange;
    /**
     * Render the target list
     */
    private render;
    /**
     * Show attack animation on target
     */
    showAttackAnimation(targetId: string): void;
    /**
     * Show immunity blocked animation
     */
    showBlockedAnimation(targetId: string): void;
    /**
     * Get the blessed box element
     */
    getElement(): any;
    /**
     * Destroy the panel
     */
    destroy(): void;
}
//# sourceMappingURL=target-selector.d.ts.map