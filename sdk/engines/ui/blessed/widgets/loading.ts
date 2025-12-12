/**
 * Loading - Loading indicator / spinner widget
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';

export interface LoadingOptions extends ElementOptions {
  text?: string;
  spinner?: string[];
  interval?: number;
}

export class Loading extends Box {
  private messageText: Box;
  private spinnerText: Box;
  private spinner: string[];
  private spinnerIndex: number = 0;
  private interval: number;
  private timer: any = null;

  constructor(options: LoadingOptions = {}) {
    super({
      ...options,
      border: options.border || { type: 'line' },
      label: options.label || ' Loading ',
      width: options.width || '50%',
      height: options.height || 5,
      top: options.top || 'center',
      left: options.left || 'center',
      padding: options.padding || 1,
      hidden: true,
      focusable: false,
      shadow: options.shadow !== false,
    });

    this.spinner = options.spinner || ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.interval = options.interval || 80;

    // Loading message
    this.messageText = new Box({
      parent: this,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: options.text || 'Please wait...',
      tags: true,
      align: 'center',
    });

    // Spinner
    this.spinnerText = new Box({
      parent: this,
      top: 1,
      left: 'center',
      width: 3,
      height: 1,
      content: this.spinner[0],
      align: 'center',
      style: {
        fg: 'blue',
        bold: true,
      },
    });
  }

  /**
   * Start the loading animation
   */
  load(text?: string): void {
    if (text) {
      this.setText(text);
    }

    this.show();
    this.setFront();

    // Start spinner animation
    this.startSpinner();
  }

  /**
   * Stop the loading animation and hide
   */
  stop(): void {
    this.stopSpinner();
    this.hide();
    this.screen?.render();
  }

  /**
   * Start spinner animation
   */
  private startSpinner(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.spinnerIndex = (this.spinnerIndex + 1) % this.spinner.length;
      this.spinnerText.setContent(this.spinner[this.spinnerIndex]);
      if (this.screen) {
        this.screen.render();
      }
    }, this.interval);
  }

  /**
   * Stop spinner animation
   */
  private stopSpinner(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Set loading text
   */
  setText(text: string): void {
    this.messageText.setContent(text);
  }

  /**
   * Get loading text
   */
  getText(): string {
    return this.messageText.getContent();
  }

  /**
   * Set custom spinner frames
   */
  setSpinner(frames: string[]): void {
    this.spinner = frames;
    this.spinnerIndex = 0;
  }

  /**
   * Destroy and clean up
   */
  destroy(): void {
    this.stopSpinner();
    super.destroy();
  }
}
