/**
 * Overlay - Semi-transparent overlay widget
 *
 * For web connections: Uses actual CSS transparency via socket events
 * For telnet/SSH: Falls back to solid dark background
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface OverlayOptions extends ElementOptions {
    opacity?: number;
}
export declare class Overlay extends Box {
    private _opacity;
    private _overlayId;
    constructor(options?: OverlayOptions);
    /**
     * Emit overlay event for web clients to render actual transparency
     */
    private _emitOverlayEvent;
    /**
     * Get overlay opacity
     */
    get opacity(): number;
    /**
     * Set overlay opacity (0-1)
     */
    setOpacity(opacity: number): void;
    /**
     * Get overlay opacity (legacy method)
     */
    getOpacity(): number;
    /**
     * Show overlay with fade in effect
     */
    fadeIn(duration?: number, callback?: () => void): void;
    /**
     * Hide overlay with fade out effect
     */
    fadeOut(duration?: number, callback?: () => void): void;
}
//# sourceMappingURL=overlay.d.ts.map