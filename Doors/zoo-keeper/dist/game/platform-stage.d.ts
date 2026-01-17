/**
 * Zoo Keeper - Platform Stage Logic
 * Jump up moving platforms to rescue Zelda while dodging coconuts
 */
import { ZooKeeperData, Direction } from './types';
type RenderCallback = (content: string) => void;
/**
 * Platform Stage Game Engine
 */
export declare class PlatformStageGame {
    private data;
    private renderCallback;
    private coconutTimer;
    constructor(data: ZooKeeperData, renderCallback: RenderCallback);
    /**
     * Initialize platform stage
     */
    init(): void;
    /**
     * Main update loop
     */
    update(): void;
    /**
     * Update platform positions
     */
    private updatePlatforms;
    /**
     * Update coconut positions
     */
    private updateCoconuts;
    /**
     * Throw a coconut
     */
    private throwCoconut;
    /**
     * Check coconut collisions with Zeke
     */
    private checkCoconutCollisions;
    /**
     * Zeke hit by coconut
     */
    private hitByCoconut;
    /**
     * Handle direction input
     */
    handleDirection(dir: Direction): void;
    /**
     * Handle jump input
     */
    handleJump(): void;
    /**
     * Update jump animation
     */
    private updateJump;
    /**
     * Rescue complete
     */
    private rescueComplete;
    /**
     * Render the platform stage
     */
    render(): void;
}
export {};
//# sourceMappingURL=platform-stage.d.ts.map