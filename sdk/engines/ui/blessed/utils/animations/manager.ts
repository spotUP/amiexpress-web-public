/**
 * Animation Manager
 * Coordinates animation updates for Log widgets
 */

import type { AnimationSegment, ParsedLine } from './parser';
import { parseAnimationTags, hasAnimationTags } from './parser';
import { renderSegments } from './renderers';

interface AnimatedLine {
  lineIndex: number;
  originalContent: string;
  segments: AnimationSegment[];
  lastRendered: string;
}

export interface AnimationManagerOptions {
  fps?: number;              // Frames per second (default: 10)
  maxLines?: number;         // Max animated lines to track (default: 100)
}

export class AnimationManager {
  private animatedLines: Map<number, AnimatedLine> = new Map();
  private frameCounter: number = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private fps: number;
  private maxLines: number;

  // Callbacks for widget integration
  private getLineContent: ((lineIndex: number) => string | undefined) | null = null;
  private setLineContent: ((lineIndex: number, content: string) => void) | null = null;
  private render: (() => void) | null = null;
  private getVisibleRange: (() => { start: number; end: number }) | null = null;

  constructor(options: AnimationManagerOptions = {}) {
    this.fps = options.fps || 10;
    this.maxLines = options.maxLines || 100;
  }

  /**
   * Connect the animation manager to a Log widget
   */
  connect(callbacks: {
    getLineContent: (lineIndex: number) => string | undefined;
    setLineContent: (lineIndex: number, content: string) => void;
    render: () => void;
    getVisibleRange: () => { start: number; end: number };
  }): void {
    this.getLineContent = callbacks.getLineContent;
    this.setLineContent = callbacks.setLineContent;
    this.render = callbacks.render;
    this.getVisibleRange = callbacks.getVisibleRange;
  }

  /**
   * Register a line for animation tracking
   * Call this when adding content to a Log widget
   */
  registerLine(lineIndex: number, content: string): boolean {
    if (!hasAnimationTags(content)) {
      return false;
    }

    // Parse animation tags
    const segments = parseAnimationTags(content);
    const hasAnimations = segments.some(s => s.type === 'animated');

    if (!hasAnimations) {
      return false;
    }

    // Limit number of tracked lines
    if (this.animatedLines.size >= this.maxLines) {
      // Remove oldest line
      const oldestKey = this.animatedLines.keys().next().value;
      if (oldestKey !== undefined) {
        this.animatedLines.delete(oldestKey);
      }
    }

    // Pre-render the first frame so getRendered() returns a usable value
    // before the first tick fires. Without this, callers that rebuild log
    // content between ticks (e.g. livechat's rebuildChatContent on every
    // typing keystroke) would see an empty string for newly-registered
    // animated lines and the raw `~pulse~..~/pulse~` markup would leak.
    const initialRender = renderSegments(segments, this.frameCounter);

    this.animatedLines.set(lineIndex, {
      lineIndex,
      originalContent: content,
      segments,
      lastRendered: initialRender,
    });

    return true;
  }

  /**
   * Get the most-recently rendered version of an animated line.
   * Returns null if the line isn't being tracked.
   *
   * Useful when a caller rebuilds the entire log content (e.g. on every
   * keystroke for typing-preview redraws) and wants to keep animated
   * lines showing their current animation frame instead of reverting
   * to the raw `~tag~..~/tag~` markup that the line was registered with.
   */
  getRendered(lineIndex: number): string | null {
    const animLine = this.animatedLines.get(lineIndex);
    return animLine ? animLine.lastRendered : null;
  }

  /**
   * Unregister a line (e.g., when scrolled out of scrollback)
   */
  unregisterLine(lineIndex: number): void {
    this.animatedLines.delete(lineIndex);
  }

  /**
   * Shift line indices when new lines are added to the log
   * Call this when prepending lines to adjust tracked indices
   */
  shiftLineIndices(delta: number): void {
    const newMap = new Map<number, AnimatedLine>();
    for (const [idx, line] of this.animatedLines) {
      const newIdx = idx + delta;
      if (newIdx >= 0) {
        line.lineIndex = newIdx;
        newMap.set(newIdx, line);
      }
    }
    this.animatedLines = newMap;
  }

  /**
   * Start the animation loop
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const intervalMs = Math.floor(1000 / this.fps);
    this.intervalId = setInterval(() => this.tick(), intervalMs);
  }

  /**
   * Stop the animation loop
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Single animation frame update
   */
  private tick(): void {
    if (!this.setLineContent || !this.render || this.animatedLines.size === 0) {
      return;
    }

    this.frameCounter++;
    let changed = false;

    // Get visible range for optimization
    let visibleStart = 0;
    let visibleEnd = Infinity;
    if (this.getVisibleRange) {
      const range = this.getVisibleRange();
      visibleStart = range.start;
      visibleEnd = range.end;
    }

    // Update each animated line
    for (const [lineIdx, animLine] of this.animatedLines) {
      // Skip if not visible (optimization)
      if (lineIdx < visibleStart || lineIdx > visibleEnd) {
        continue;
      }

      // Render with current frame
      const rendered = renderSegments(animLine.segments, this.frameCounter);

      // Only update if changed
      if (rendered !== animLine.lastRendered) {
        animLine.lastRendered = rendered;
        this.setLineContent(lineIdx, rendered);
        changed = true;
      }
    }

    // Render screen if any lines changed
    if (changed) {
      this.render();
    }
  }

  /**
   * Get count of animated lines
   */
  getAnimatedLineCount(): number {
    return this.animatedLines.size;
  }

  /**
   * Check if manager is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Clear all tracked lines
   */
  clear(): void {
    this.animatedLines.clear();
    this.frameCounter = 0;
  }

  /**
   * Cleanup - stop animations and clear state
   */
  destroy(): void {
    this.stop();
    this.clear();
    this.getLineContent = null;
    this.setLineContent = null;
    this.render = null;
    this.getVisibleRange = null;
  }
}

/**
 * Create an animation manager instance
 */
export function createAnimationManager(options?: AnimationManagerOptions): AnimationManager {
  return new AnimationManager(options);
}
