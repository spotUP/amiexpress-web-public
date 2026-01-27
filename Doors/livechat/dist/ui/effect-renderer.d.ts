/**
 * Effect Renderer - Converts effect codes to visual representations for live preview
 *
 * Maps animation effect codes to static blessed tags for real-time display
 */
/**
 * Convert effect codes to blessed tags for live preview in input field
 *
 * Effect mappings:
 * - ~rainbow~text~/rainbow~ → Rainbow gradient (uses magenta as primary)
 * - ~pulse~text~/pulse~ → Pulsing bright text (uses bright cyan + bold)
 * - ~sparkle~text~/sparkle~ → Sparkling text (uses bright yellow)
 * - ~shake~text~/shake~ → Shaking text (uses red for attention)
 * - ~wave~text~/wave~ → Wave effect (uses bright blue)
 * - ~gradient~text~/gradient~ → Gradient (uses first color if specified)
 */
export declare function renderEffectsForInput(text: string): string;
/**
 * Enable live effect rendering for a textarea
 * Hooks into the change event to update display with rendered effects
 */
export declare function enableLiveEffectRendering(textarea: any): void;
