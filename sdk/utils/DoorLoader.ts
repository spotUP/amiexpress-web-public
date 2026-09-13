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
import { Box } from '../engines/ui/blessed/widgets/box';
import type { Screen } from '../engines/ui/blessed/core/screen';
import { activeTheme } from '../engines/ui/theme/live.js';
import {
  calculateDialogWidth, isCompactWidth,
} from '../engines/ui/blessed/core/responsive-constants';

export interface DoorLoaderOptions {
  /**
   * @deprecated Ignored. The loader paints an opaque backdrop instead, which
   * works on every transport; the old overlay was a browser-side CSS dim
   * that painted no cells, so a telnet caller saw the half-built door
   * straight through it.
   */
  overlay?: boolean;
  /** Overlay opacity 0-1 (default: 0.5) */
  /** @deprecated Ignored - see `overlay`. */
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
  private backdrop: Box;
  private isVisible: boolean = false;

  constructor(screen: Screen, options: DoorLoaderOptions = {}) {
    this.screen = screen;
    // `|| 80` is the one literal the door rules allow: an unknown width.
    const screenWidth = (screen as unknown as { width?: number }).width || 80;
    const compact = isCompactWidth(screenWidth);

    /**
     * AN OPAQUE BACKDROP, because the door behind this is HALF BUILT.
     *
     * Loading's own `overlay` is a CSS dim: it sends an OSC sequence the
     * browser intercepts and shades, and paints no cells at all. So the
     * door's panels - created but not yet filled - showed straight through
     * it as loose coloured bars, and a telnet or SSH caller got no dimming
     * whatsoever. The sysop's screenshot of exactly that, 2026-09-13: "the
     * preloader looks super broken".
     *
     * A box of spaces in the theme's ground colour covers the screen on
     * every transport, and being created before the dialog it sits under
     * it. This is also why the dialog below asks for overlay: false.
     */
    this.backdrop = new Box({
      parent: screen as never,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      hidden: true,
      focusable: false,
      ch: ' ',
      style: { bg: activeTheme().tokens.ground, fg: activeTheme().tokens.ink },
    } as never);

    // Use the Loading widget which handles overlay, centering and spinner animation
    this.loader = new Loading({
      parent: screen,
      overlay: false,
      // No overlayOpacity either: Loading enables the CSS overlay when
      // EITHER key is present, so passing an opacity turned the browser dim
      // straight back on beside the backdrop.
      spinner: options.spinnerFrames,
      interval: options.spinnerInterval,
      // GEOMETRY FROM THE SCREEN, never a constant. 60 columns is wider
      // than a PETSCII caller's whole screen, so the one loader the board
      // has looked broken anywhere but a plain 80-column terminal.
      // calculateDialogWidth is the SDK's own ladder: nearly full width at
      // 40, padded on mobile, a share of the screen above that.
      border: compact ? false : { type: 'line' },
      label: compact ? undefined : ' Loading ',
      width: calculateDialogWidth(screenWidth),
      // Three rows of content (message, spinner, bar) plus the frame. With
      // no frame at 40 the two border rows are not there to pay for.
      height: compact ? 5 : 7,
      style: {
        bg: 'black',
        fg: 'white',
        // The theme's primary colour, like every other frame.
        border: { fg: activeTheme().tokens.accent },
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
      style: {
        fg: options.barColor || activeTheme().tokens.accent,
        bg: activeTheme().tokens.ground,
      },
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
    // Cover first, then draw on top of the cover.
    this.backdrop.show();
    (this.backdrop as unknown as { setBack?: () => void }).setBack?.();
    this.loader.load();
    (this.loader as unknown as { setFront?: () => void }).setFront?.();
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
    this.backdrop.hide();
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
