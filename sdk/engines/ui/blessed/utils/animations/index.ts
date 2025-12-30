/**
 * Text Animations for Neo-Blessed
 *
 * Usage:
 * ```typescript
 * import { createAnimationManager, parseAnimationTags } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/utils/animations';
 *
 * // Create manager
 * const animManager = createAnimationManager({ fps: 10 });
 *
 * // Connect to log widget
 * animManager.connect({
 *   getLineContent: (idx) => log.getLine(idx),
 *   setLineContent: (idx, content) => log.setLine(idx, content),
 *   render: () => screen.render(),
 *   getVisibleRange: () => ({ start: log.childBase, end: log.childBase + log.height }),
 * });
 *
 * // Register animated lines
 * animManager.registerLine(lineIndex, '~rainbow~Hello World!~/rainbow~');
 *
 * // Start animation loop
 * animManager.start();
 *
 * // Cleanup
 * animManager.destroy();
 * ```
 *
 * Supported animation tags:
 * - ~rainbow~text~/rainbow~ - Cycle through rainbow colors
 * - ~pulse~text~/pulse~ - Fade color intensity
 * - ~pulse color=red~text~/pulse~ - Pulse with specific color
 * - ~sparkle~text~/sparkle~ - Random sparkle characters
 * - ~shake~text~/shake~ - Subtle position jitter
 * - ~wave~text~/wave~ - Wave color effect
 * - ~gradient from=red to=blue~text~/gradient~ - Color gradient
 */

export * from './parser';
export * from './renderers';
export * from './manager';
