/**
 * ANSIImage - ANSI art display widget
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface ANSIImageOptions extends ElementOptions {
    file?: string;
    ansi?: string;
    animate?: boolean;
    animationSpeed?: number;
}
export declare class ANSIImage extends Box {
    private ansi;
    private animate;
    private animationSpeed;
    private animationTimer;
    private animationFrame;
    private frames;
    constructor(options?: ANSIImageOptions);
    /**
     * Set ANSI content
     */
    setANSI(ansi: string): void;
    /**
     * Load ANSI from file (requires file content to be passed)
     */
    loadANSI(content: string): void;
    /**
     * Start animation
     */
    startAnimation(): void;
    /**
     * Stop animation
     */
    stopAnimation(): void;
    /**
     * Set animation speed (ms per frame)
     */
    setAnimationSpeed(speed: number): void;
    /**
     * Clear ANSI content
     */
    clearImage(): void;
    /**
     * Destroy and cleanup
     */
    destroy(): void;
    /**
     * Get ANSI content
     */
    getANSI(): string;
    /**
     * Get current frame (for animated ANSI)
     */
    getCurrentFrame(): number;
    /**
     * Get total frames (for animated ANSI)
     */
    getFrameCount(): number;
    /**
     * Set specific frame
     */
    setFrame(frame: number): void;
}
//# sourceMappingURL=ansiimage.d.ts.map