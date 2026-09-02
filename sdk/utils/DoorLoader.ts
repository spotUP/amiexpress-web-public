/**
 * DoorLoader - Loading screen with ANSI progress bar for SDK doors
 *
 * Displays a centered loading dialog with:
 * - Animated progress bar drawn in cells, not glyphs
 * - Status message that can be updated
 * - Percentage display
 * - Optional spinner for indeterminate loading
 *
 * Usage:
 * ```typescript
 * import { DoorLoader } from '@amiexpress/bbs-door-sdk/utils/DoorLoader';
 *
 * const loader = new DoorLoader(screen);
 *
 * // Show loader with message
 * loader.show('Loading game assets...');
 *
 * // Update progress
 * loader.update(25, 'Loading sprites...');
 * loader.update(50, 'Loading sounds...');
 * loader.update(75, 'Loading levels...');
 *
 * // Hide when done
 * loader.update(100, 'Ready!');
 * await loader.delay(500);  // Show "Ready!" briefly
 * loader.hide();
 * ```
 */

import { Loading } from '../engines/ui/blessed/widgets/loading';
import { ProgressBar } from '../engines/ui/blessed/widgets/progressbar';
import type { Screen } from '../engines/ui/blessed/core/screen';

export interface DoorLoaderOptions {
  /** Show semi-transparent overlay behind loader (default: true) */
  overlay?: boolean;
  /** Overlay opacity 0-1 (default: 0.5) */
  overlayOpacity?: number;
  /** Progress bar color (default: 'cyan') */
  barColor?: string;
  /** Show spinner for indeterminate loading (default: true) */
  spinner?: boolean;
  /** Spinner frames (default: ['|', '/', '-', '\\']) */
  spinnerFrames?: string[];
  /** Spinner interval in ms (default: 80) */
  spinnerInterval?: number;
}

export class DoorLoader {
  private screen: Screen;
  private loader: Loading;
  private bar: ProgressBar;
  private isVisible: boolean = false;

  constructor(screen: Screen, options: DoorLoaderOptions = {}) {
    this.screen = screen;

    // Use the Loading widget which handles overlay, centering and spinner animation
    this.loader = new Loading({
      parent: screen,
      overlay: options.overlay !== false,
      overlayOpacity: options.overlayOpacity ?? 0.5,
      spinner: options.spinnerFrames,
      interval: options.spinnerInterval,
      border: { type: 'line' },
      label: ' Loading ',
      width: 60,
      height: 7, // room for the message, the spinner and the bar
      style: {
        bg: 'black',
        fg: 'white',
        border: { fg: 'cyan' },
      },
    });

    // The bar is CELLS, not glyphs.
    //
    // This used to be a `Gauge`, which draws on a drawille canvas - braille
    // (U+2800+) painted as FOREGROUND colour. A real Amiga terminal has no
    // braille, so the one door with a working progress bar was drawing it in
    // characters the board cannot render. `ProgressBar` fills with spaces and
    // an ANSI background colour instead: nothing but a space ever reaches the
    // wire, and the colour IS the bar (asked for by the sysop, 2026-09-02).
    this.bar = new ProgressBar({
      parent: this.loader,
      top: 3, // Below message (0) and spinner (1)
      left: 1,
      right: 1,
      height: 1,
      border: undefined,   // one row: a frame would leave it no interior
      // ProgressBar paints `style.fg` as the BACKGROUND of the filled run,
      // over `style.bg` for the rest of the track.
      style: { fg: options.barColor || 'cyan', bg: 'black' },
    });

    // Hidden initially (spinner mode by default)
    this.bar.hide();
  }

  /**
   * Show the loader with optional message
   */
  show(message?: string): void {
    if (message) {
      this.loader.setText(message);
    }
    
    this.bar.hide(); // Indeterminate mode shows the spinner alone
    this.loader.load();
    this.isVisible = true;
  }

  /**
   * Update progress and message
   *
   * @param percent - Progress from 0-100
   * @param message - Optional status message
   */
  update(percent: number, message?: string): void {
    if (!this.isVisible) {
      this.show(message);
    } else if (message) {
      this.loader.setText(message);
    }

    // Show the bar and update it
    this.bar.show();
    this.bar.setProgress(Math.max(0, Math.min(100, percent)));
    
    // In progress mode, we might want to hide spinner or keep it?
    // Loading widget always shows spinner. We'll keep it.
    
    this.screen.render();
  }

  /**
   * Hide the loader
   */
  hide(): void {
    this.loader.stop();
    this.isVisible = false;
  }

  /**
   * Set loading message without changing progress
   */
  setMessage(message: string): void {
    this.loader.setText(message);
    if (this.isVisible) {
      this.screen.render();
    }
  }

  /**
   * Helper to add a delay
   */
  async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up and destroy
   */
  destroy(): void {
    this.loader.destroy(); // Handles overlay destruction too
  }
}
