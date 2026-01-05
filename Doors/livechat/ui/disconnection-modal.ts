/**
 * Disconnection Modal for ChatOnly Mode
 * Shows connection errors and allows retry/cancel
 */
import blessed, { Screen, Box, Button } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createButton } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export interface DisconnectionModalOptions {
  screen: Screen;
  onRetry: () => void;
  onCancel: () => void;
}

export class DisconnectionModal {
  private modalBackground: Box;
  private modalBox: Box;
  private messageBox: Box;
  private retryButton: Button;
  private cancelButton: Button;
  private screen: Screen;
  private onRetry: () => void;
  private onCancel: () => void;

  constructor(options: DisconnectionModalOptions) {
    this.screen = options.screen;
    this.onRetry = options.onRetry;
    this.onCancel = options.onCancel;

    // Modal background - full screen overlay
    this.modalBackground = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      style: {
        bg: 'black',
        transparent: true,
      },
      // @ts-ignore - zIndex exists but not in types
      zIndex: 998,
    });

    // Modal box - centered
    this.modalBox = createBox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 12,
      label: ' Connection Error ',
      border: { type: 'line', fg: 'red' },
      shadow: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'red' },
      },
      trapFocus: true,
      // @ts-ignore - zIndex exists but not in types
      zIndex: 999,
    });

    // Message box
    this.messageBox = createBox({
      parent: this.modalBox,
      top: 1,
      left: 2,
      width: '100%-4',
      height: '100%-5',
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      scrollbar: {
        ch: '█',
        style: { fg: 'red' }
      },
      style: {
        fg: 'white',
        bg: 'black',
      },
    });

    // Retry button
    this.retryButton = createButton({
      parent: this.modalBox,
      bottom: 1,
      left: 10,
      width: 12,
      height: 3,
      content: ' Retry ',
      align: 'center',
      mouse: true,
      keys: true,
      style: {
        fg: 'white',
        bg: 'green',
        focus: { fg: 'white', bg: 'lightblue' },
        hover: { fg: 'white', bg: 'lightblue' },
      },
    });

    // Cancel button
    this.cancelButton = createButton({
      parent: this.modalBox,
      bottom: 1,
      right: 10,
      width: 12,
      height: 3,
      content: ' Cancel ',
      align: 'center',
      mouse: true,
      keys: true,
      style: {
        fg: 'white',
        bg: 'red',
        focus: { fg: 'white', bg: 'lightblue' },
        hover: { fg: 'white', bg: 'lightblue' },
      },
    });

    this.setupEventHandlers();

    // Hide modal by default - only show when there's an error
    this.hide();
  }

  private setupEventHandlers() {
    // Retry button click
    this.retryButton.on('press', () => {
      this.hide();
      this.onRetry();
    });

    // Cancel button click
    this.cancelButton.on('press', () => {
      this.hide();
      this.onCancel();
    });

    // Enter key on retry button
    this.retryButton.key(['enter'], () => {
      this.hide();
      this.onRetry();
    });

    // Enter key on cancel button
    this.cancelButton.key(['enter'], () => {
      this.hide();
      this.onCancel();
    });

    // Tab to switch between buttons
    this.retryButton.key(['tab'], () => {
      this.cancelButton.focus();
      this.screen.render();
    });

    this.cancelButton.key(['tab'], () => {
      this.retryButton.focus();
      this.screen.render();
    });

    // ESC key to cancel
    this.modalBox.key(['escape'], () => {
      this.hide();
      this.onCancel();
    });
  }

  public showError(message: string) {
    this.messageBox.setContent(message);
    this.show();
  }

  public show() {
    this.modalBackground.show();
    this.modalBox.show();
    this.retryButton.focus();
    this.screen.render();
  }

  public hide() {
    this.modalBackground.hide();
    this.modalBox.hide();
    this.screen.render();
  }

  public destroy() {
    this.modalBackground.destroy();
    this.modalBox.destroy();
  }
}

export function createDisconnectionModal(options: DisconnectionModalOptions): DisconnectionModal {
  return new DisconnectionModal(options);
}
