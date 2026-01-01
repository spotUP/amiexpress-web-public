/**
 * DoorLoader - Loading screen with ANSI progress bar for SDK doors
 *
 * Displays a centered loading dialog with:
 * - Animated progress bar using neo-blessed Gauge widget
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

import { Box } from '../engines/ui/blessed/widgets/box';
import { Gauge } from '../engines/ui/blessed/contrib/widgets/gauge';
import { Overlay } from '../engines/ui/blessed/widgets/overlay';
import type { Screen } from '../engines/ui/blessed/core/screen';

export interface DoorLoaderOptions {
  /** Show semi-transparent overlay behind loader (default: true) */
  overlay?: boolean;
  /** Overlay opacity 0-1 (default: 0.5) */
  overlayOpacity?: number;
  /** Progress bar color (default: 'cyan') */
  barColor?: string;
  /** Show spinner for indeterminate loading (default: false) */
  spinner?: boolean;
  /** Spinner frames (default: ['|', '/', '-', '\\']) */
  spinnerFrames?: string[];
  /** Spinner interval in ms (default: 80) */
  spinnerInterval?: number;
}

export class DoorLoader {
  private screen: Screen;
  private dialog: Box;
  private messageText: Box;
  private gauge: Gauge;
  private percentText: Box;
  private spinnerText?: Box;
  private overlay?: Overlay;
  private spinner?: string[];
  private spinnerIndex: number = 0;
  private spinnerTimer?: NodeJS.Timeout;
  private spinnerInterval: number;
  private isVisible: boolean = false;

  constructor(screen: Screen, options: DoorLoaderOptions = {}) {
    this.screen = screen;
    this.spinner = options.spinner ? (options.spinnerFrames || ['|', '/', '-', '\\']) : undefined;
    this.spinnerInterval = options.spinnerInterval || 80;

    // Create overlay if enabled
    if (options.overlay !== false) {
      this.overlay = new Overlay({
        parent: screen,
        opacity: options.overlayOpacity ?? 0.5,
        hidden: true,
        zIndex: 1000,
        style: { bg: 'transparent' },
      });
    }

    // Create loading dialog box
    this.dialog = new Box({
      parent: this.overlay || screen,
      border: { type: 'line' },
      label: ' Loading ',
      width: 60,
      height: 8,
      top: 'center',
      left: 'center',
      padding: 1,
      hidden: true,
      tags: true,
      zIndex: 1001,
      style: {
        bg: 'black',
        fg: 'white',
        border: { fg: 'cyan' },
      },
    });

    // Loading message at top
    this.messageText = new Box({
      parent: this.dialog,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: 'Please wait...',
      tags: true,
      align: 'center',
      style: {
        fg: 'white',
        bg: 'black',
      },
    });

    // Progress bar in middle using Gauge
    this.gauge = new Gauge({
      parent: this.dialog,
      top: 2,
      left: 0,
      width: '100%',
      height: 3,
      stroke: options.barColor || 'cyan',
      fill: 'white',
      showLabel: false,  // We'll show percent separately
    });

    // Percentage text below gauge
    this.percentText = new Box({
      parent: this.dialog,
      top: 5,
      left: 0,
      width: '100%',
      height: 1,
      content: '0%',
      tags: true,
      align: 'center',
      style: {
        fg: 'green',
        bg: 'black',
      },
    });

    // Optional spinner for indeterminate loading
    if (this.spinner) {
      this.spinnerText = new Box({
        parent: this.dialog,
        top: 5,
        left: 'center',
        width: 3,
        height: 1,
        content: this.spinner[0],
        align: 'center',
        style: {
          fg: 'cyan',
          bg: 'black',
        },
      });
    }
  }

  /**
   * Show the loader with optional message
   */
  show(message?: string): void {
    if (this.isVisible) return;

    if (message) {
      this.messageText.setContent(message);
    }

    // Show overlay first if present (without trapFocus to avoid errors)
    if (this.overlay) {
      this.overlay.show();
      this.overlay.setFront();
    }

    this.dialog.show();
    this.dialog.setFront();

    // Start spinner if enabled
    if (this.spinner && this.spinnerText) {
      this.startSpinner();
      this.percentText.hide();  // Hide percent when using spinner
      this.spinnerText.show();
    } else {
      this.gauge.setPercent(0);
    }

    this.isVisible = true;
    this.screen.render();
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
    }

    // Stop spinner if we're showing determinate progress
    if (this.spinnerTimer && percent > 0) {
      this.stopSpinner();
      if (this.spinnerText) this.spinnerText.hide();
      this.percentText.show();
    }

    // Update message if provided
    if (message) {
      this.messageText.setContent(message);
    }

    // Update progress bar and percentage
    const clamped = Math.max(0, Math.min(100, percent));
    this.gauge.setPercent(clamped);
    this.percentText.setContent(`${Math.round(clamped)}%`);

    this.screen.render();
  }

  /**
   * Hide the loader
   */
  hide(): void {
    if (!this.isVisible) return;

    this.stopSpinner();
    this.dialog.hide();

    if (this.overlay) {
      this.overlay.hide();
    }

    this.isVisible = false;
    this.screen.render();
  }

  /**
   * Set loading message without changing progress
   */
  setMessage(message: string): void {
    this.messageText.setContent(message);
    if (this.isVisible) {
      this.screen.render();
    }
  }

  /**
   * Helper to add a delay (useful for showing "Ready!" briefly)
   */
  async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up and destroy
   */
  destroy(): void {
    this.stopSpinner();
    this.dialog.destroy();
    if (this.overlay) {
      this.overlay.destroy();
    }
  }

  /**
   * Start spinner animation
   */
  private startSpinner(): void {
    if (this.spinnerTimer || !this.spinner || !this.spinnerText) return;

    this.spinnerTimer = setInterval(() => {
      this.spinnerIndex = (this.spinnerIndex + 1) % this.spinner!.length;
      this.spinnerText!.setContent(this.spinner![this.spinnerIndex]);
      this.screen.render();
    }, this.spinnerInterval);
  }

  /**
   * Stop spinner animation
   */
  private stopSpinner(): void {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = undefined;
    }
  }
}
