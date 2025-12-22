/**
 * Image - Browser-compatible image display widget
 * Note: Uses data URLs or external image sources
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface ImageOptions extends ElementOptions {
    src?: string;
    file?: string;
    type?: 'overlay' | 'ansi';
    scale?: number;
    autoPlay?: boolean;
}
export declare class Image extends Box {
    private src;
    private imageType;
    private scale;
    private autoPlay;
    private imageData;
    constructor(options?: ImageOptions);
    /**
     * Set image source (URL or data URL)
     */
    setImage(src: string): void;
    /**
     * Generate ASCII placeholder for image
     */
    private generatePlaceholder;
    /**
     * Load image from data URL
     */
    loadImage(dataUrl: string): void;
    /**
     * Clear image
     */
    clearImage(): void;
    /**
     * Get image source
     */
    getImage(): string;
    /**
     * Set image scale
     */
    setScale(scale: number): void;
    /**
     * Get image scale
     */
    getScale(): number;
    /**
     * Play animation (for animated images)
     */
    play(): void;
    /**
     * Pause animation
     */
    pause(): void;
    /**
     * Check if playing
     */
    isPlaying(): boolean;
    /**
     * Get image dimensions (placeholder)
     */
    getImageSize(): {
        width: number;
        height: number;
    };
}
//# sourceMappingURL=image.d.ts.map