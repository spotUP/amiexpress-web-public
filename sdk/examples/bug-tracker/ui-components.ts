/**
 * UI Components - Reusable Visual Elements
 *
 * Features:
 * - Toast notifications
 * - Loading spinners
 * - Progress bars
 * - Breadcrumb navigation
 * - Status badges
 * - Modal dialogs
 * - Confirmation prompts
 */

import { Door, AnsiColor, BBSUser, KeyEvent } from '@amiexpress/bbs-door-sdk';
import { visibleLength, padEndVisible, getCenterX } from '@amiexpress/bbs-door-sdk';

export enum ToastType {
  SUCCESS = 'success',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info'
}

export class UIComponents {
  private door: Door;
  private userId: number;
  private toastQueue: Array<{ message: string; type: ToastType; timestamp: number }> = [];
  private spinnerInterval?: NodeJS.Timeout;

  constructor(door: Door, userId: number) {
    this.door = door;
    this.userId = userId;
  }

  /**
   * Show toast notification
   */
  showToast(message: string, type: ToastType = ToastType.INFO, duration: number = 3000): void {
    const toast = { message, type, timestamp: Date.now() };
    this.toastQueue.push(toast);

    this.renderToast(toast);

    setTimeout(() => {
      const index = this.toastQueue.indexOf(toast);
      if (index !== -1) {
        this.toastQueue.splice(index, 1);
        this.clearToast();
      }
    }, duration);
  }

  private renderToast(toast: { message: string; type: ToastType }): void {
    let icon = 'ℹ';
    let color = '\x1b[36m'; // Cyan

    switch (toast.type) {
      case ToastType.SUCCESS:
        icon = '✓';
        color = '\x1b[32m'; // Green
        break;
      case ToastType.ERROR:
        icon = '✗';
        color = '\x1b[31m'; // Red
        break;
      case ToastType.WARNING:
        icon = '⚠';
        color = '\x1b[33m'; // Yellow
        break;
    }

    // Account for ANSI codes when calculating width
    const messageVisibleWidth = visibleLength(toast.message);
    const width = Math.min(messageVisibleWidth + 6, 76);
    const x = Math.floor((80 - width) / 2);
    const y = 22;

    let output = '';
    output += `\x1b[${y};${x}H`;
    output += `${color}╔${'═'.repeat(width - 2)}╗\x1b[0m`;
    output += `\x1b[${y + 1};${x}H`;
    // Use padEndVisible to account for ANSI codes in message
    output += `${color}║\x1b[0m ${icon} ${padEndVisible(toast.message, width - 6)} ${color}║\x1b[0m`;
    output += `\x1b[${y + 2};${x}H`;
    output += `${color}╚${'═'.repeat(width - 2)}╝\x1b[0m`;

    this.door.sendAnsi(output, this.userId);
  }

  private clearToast(): void {
    let output = '';
    for (let i = 0; i < 3; i++) {
      output += `\x1b[${22 + i};1H\x1b[2K`;
    }
    this.door.sendAnsi(output, this.userId);
  }

  /**
   * Show loading spinner
   */
  startSpinner(message: string, x: number = 30, y: number = 12): void {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;

    this.spinnerInterval = setInterval(() => {
      let output = `\x1b[${y};${x}H`;
      output += `\x1b[36m${frames[frameIndex]}\x1b[0m ${message}`;
      this.door.sendAnsi(output, this.userId);

      frameIndex = (frameIndex + 1) % frames.length;
    }, 80);
  }

  /**
   * Stop loading spinner
   */
  stopSpinner(y: number = 12): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = undefined;
    }

    // Clear the line
    let output = `\x1b[${y};1H\x1b[2K`;
    this.door.sendAnsi(output, this.userId);
  }

  /**
   * Draw breadcrumb navigation
   */
  drawBreadcrumbs(path: string[], y: number = 1): void {
    const breadcrumb = path.join(' › ');
    let output = `\x1b[${y};2H\x1b[2K`;
    output += `\x1b[90m${breadcrumb}\x1b[0m`;
    this.door.sendAnsi(output, this.userId);
  }

  /**
   * Draw status badge
   */
  drawBadge(text: string, type: 'success' | 'error' | 'warning' | 'info', x: number, y: number): void {
    let color = '\x1b[36m'; // Cyan for info
    let bgColor = '\x1b[46m'; // Cyan background

    switch (type) {
      case 'success':
        color = '\x1b[32m';
        bgColor = '\x1b[42m';
        break;
      case 'error':
        color = '\x1b[31m';
        bgColor = '\x1b[41m';
        break;
      case 'warning':
        color = '\x1b[33m';
        bgColor = '\x1b[43m';
        break;
    }

    let output = `\x1b[${y};${x}H`;
    output += `${bgColor}\x1b[30m ${text} \x1b[0m`;
    this.door.sendAnsi(output, this.userId);
  }

  /**
   * Show confirmation dialog
   */
  async confirm(message: string, defaultYes: boolean = false): Promise<boolean> {
    const x = 15;
    const y = 10;
    const width = 50;

    // Draw modal
    let output = '\x1b[2J\x1b[H'; // Clear screen

    // Semi-transparent background
    for (let i = 0; i < 24; i++) {
      output += `\x1b[${i + 1};1H\x1b[44m${' '.repeat(80)}\x1b[0m`;
    }

    // Dialog box
    output += `\x1b[${y};${x}H\x1b[37m╔${'═'.repeat(width - 2)}╗\x1b[0m`;
    output += `\x1b[${y + 1};${x}H\x1b[37m║\x1b[0m ${' '.repeat(width - 4)} \x1b[37m║\x1b[0m`;
    // Use padEndVisible to account for ANSI codes in message
    output += `\x1b[${y + 2};${x}H\x1b[37m║\x1b[0m  ${padEndVisible(message, width - 6)} \x1b[37m║\x1b[0m`;
    output += `\x1b[${y + 3};${x}H\x1b[37m║\x1b[0m ${' '.repeat(width - 4)} \x1b[37m║\x1b[0m`;
    output += `\x1b[${y + 4};${x}H\x1b[37m╠${'═'.repeat(width - 2)}╣\x1b[0m`;
    output += `\x1b[${y + 5};${x}H\x1b[37m║\x1b[0m ${' '.repeat(width - 4)} \x1b[37m║\x1b[0m`;

    const yesHighlight = defaultYes ? '\x1b[43m\x1b[30m' : '\x1b[37m';
    const noHighlight = !defaultYes ? '\x1b[43m\x1b[30m' : '\x1b[37m';

    output += `\x1b[${y + 6};${x + 10}H${yesHighlight} Yes \x1b[0m  ${noHighlight} No \x1b[0m`;
    output += `\x1b[${y + 7};${x}H\x1b[37m║\x1b[0m ${' '.repeat(width - 4)} \x1b[37m║\x1b[0m`;
    output += `\x1b[${y + 8};${x}H\x1b[37m╚${'═'.repeat(width - 2)}╝\x1b[0m`;
    output += `\x1b[${y + 10};${x}H\x1b[90m[←→] Select  [Enter] Confirm  [ESC] Cancel\x1b[0m`;

    this.door.sendAnsi(output, this.userId);

    return new Promise((resolve) => {
      let selected = defaultYes;

      const handler = (user: BBSUser, keyEvent: KeyEvent) => {
        const key = keyEvent.key;
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
          selected = !selected;

          // Update highlights
          const yesH = selected ? '\x1b[43m\x1b[30m' : '\x1b[37m';
          const noH = !selected ? '\x1b[43m\x1b[30m' : '\x1b[37m';

          let update = `\x1b[${y + 6};${x + 10}H${yesH} Yes \x1b[0m  ${noH} No \x1b[0m`;
          this.door.sendAnsi(update, this.userId);
        } else if (key === 'Enter' || key === '\r') {
          this.door.off('input', handler);
          resolve(selected);
        } else if (key === 'Escape' || key === '\x1b') {
          this.door.off('input', handler);
          resolve(false);
        }
      };

      this.door.onInput(handler);
    });
  }

  /**
   * Show modal dialog
   */
  showModal(title: string, content: string[], width: number = 60, height: number = 15): void {
    const x = Math.floor((80 - width) / 2);
    const y = Math.floor((24 - height) / 2);

    let output = '';

    // Box
    output += `\x1b[${y};${x}H\x1b[36m╔${'═'.repeat(width - 2)}╗\x1b[0m`;
    // Use padEndVisible to account for ANSI codes in title
    output += `\x1b[${y + 1};${x}H\x1b[36m║\x1b[0m ${padEndVisible(title, width - 4)} \x1b[36m║\x1b[0m`;
    output += `\x1b[${y + 2};${x}H\x1b[36m╠${'═'.repeat(width - 2)}╣\x1b[0m`;

    // Content
    for (let i = 0; i < height - 4; i++) {
      output += `\x1b[${y + 3 + i};${x}H\x1b[36m║\x1b[0m `;
      if (i < content.length) {
        // Truncate based on visible length and pad accounting for ANSI codes
        const line = content[i];
        const visLen = visibleLength(line);
        const truncated = visLen > width - 4 ? line.substring(0, width - 4) : line;
        output += padEndVisible(truncated, width - 4);
      } else {
        output += ' '.repeat(width - 4);
      }
      output += ` \x1b[36m║\x1b[0m`;
    }

    output += `\x1b[${y + height - 1};${x}H\x1b[36m╚${'═'.repeat(width - 2)}╝\x1b[0m`;

    this.door.sendAnsi(output, this.userId);
  }

  /**
   * Draw horizontal separator
   */
  drawSeparator(y: number, char: string = '─', color: string = '\x1b[36m'): void {
    let output = `\x1b[${y};1H${color}${char.repeat(80)}\x1b[0m`;
    this.door.sendAnsi(output, this.userId);
  }

  /**
   * Draw fancy header
   */
  drawFancyHeader(title: string, subtitle?: string): void {
    let output = '\x1b[2J\x1b[H'; // Clear screen

    // Top border
    output += '\x1b[1;1H\x1b[36m╔' + '═'.repeat(78) + '╗\x1b[0m';

    // Title - account for ANSI codes when centering
    const titleX = getCenterX(title, 80);
    output += `\x1b[2;${titleX}H\x1b[35m\x1b[1m${title}\x1b[0m`;

    // Subtitle - account for ANSI codes when centering
    if (subtitle) {
      const subtitleX = getCenterX(subtitle, 80);
      output += `\x1b[3;${subtitleX}H\x1b[90m${subtitle}\x1b[0m`;
    }

    // Bottom border
    output += `\x1b[4;1H\x1b[36m╚` + '═'.repeat(78) + '╝\x1b[0m';

    this.door.sendAnsi(output, this.userId);
  }

  /**
   * Animated loading bar
   */
  async showLoadingBar(message: string, durationMs: number = 2000): Promise<void> {
    const y = 12;
    const x = 20;
    const width = 40;
    const steps = 20;
    const stepDuration = durationMs / steps;

    for (let i = 0; i <= steps; i++) {
      const filled = Math.floor((i / steps) * width);
      const empty = width - filled;
      const percentage = Math.floor((i / steps) * 100);

      let output = `\x1b[${y};${x}H${message}`;
      output += `\x1b[${y + 1};${x}H[\x1b[32m${'█'.repeat(filled)}\x1b[90m${'░'.repeat(empty)}\x1b[0m] ${percentage}%`;

      this.door.sendAnsi(output, this.userId);

      if (i < steps) {
        await new Promise(resolve => setTimeout(resolve, stepDuration));
      }
    }
  }

  /**
   * Show keyboard shortcuts help
   */
  showShortcuts(shortcuts: Array<{ key: string; description: string }>): void {
    const y = 20;
    const x = 2;

    let output = `\x1b[${y};${x}H\x1b[90m`;

    shortcuts.forEach((sc, idx) => {
      if (idx > 0) output += '  │  ';
      output += `\x1b[33m[${sc.key}]\x1b[90m ${sc.description}`;
    });

    output += '\x1b[0m';

    this.door.sendAnsi(output, this.userId);
  }

  /**
   * Draw fancy box with title
   */
  drawBox(title: string, x: number, y: number, width: number, height: number, color: string = '\x1b[36m'): void {
    let output = '';

    // Top with title - account for ANSI codes
    const titlePadded = ` ${title} `;
    const titleVisibleWidth = visibleLength(titlePadded);
    const titleX = x + Math.floor((width - titleVisibleWidth) / 2);
    const leftBorder = Math.floor((width - titleVisibleWidth) / 2) - 1;
    const rightBorder = width - titleVisibleWidth - leftBorder - 2;

    output += `\x1b[${y};${x}H${color}╔${'═'.repeat(leftBorder)}╡\x1b[37m${titlePadded}\x1b[0m${color}╞${'═'.repeat(rightBorder)}╗\x1b[0m`;

    // Sides
    for (let i = 1; i < height - 1; i++) {
      output += `\x1b[${y + i};${x}H${color}║\x1b[0m`;
      output += `\x1b[${y + i};${x + width - 1}H${color}║\x1b[0m`;
    }

    // Bottom
    output += `\x1b[${y + height - 1};${x}H${color}╚${'═'.repeat(width - 2)}╝\x1b[0m`;

    this.door.sendAnsi(output, this.userId);
  }

  /**
   * Show countdown timer
   */
  async countdown(seconds: number, x: number, y: number): Promise<void> {
    for (let i = seconds; i >= 0; i--) {
      let output = `\x1b[${y};${x}H`;
      if (i > 5) {
        output += `\x1b[32m${i}\x1b[0m`;
      } else if (i > 0) {
        output += `\x1b[33m${i}\x1b[0m`;
      } else {
        output += `\x1b[31m${i}\x1b[0m`;
      }
      this.door.sendAnsi(output, this.userId);

      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Show loading spinner (alias for startSpinner)
   */
  showLoadingSpinner(message: string, x: number = 30, y: number = 12): void {
    this.startSpinner(message, x, y);
  }

  /**
   * Handle input events (placeholder for toast management)
   */
  handleInput(key: string): void {
    // This method can be used to handle keyboard shortcuts for toast management
    // Currently just a placeholder
  }
}
