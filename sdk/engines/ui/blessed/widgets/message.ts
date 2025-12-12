/**
 * Message - Simple message dialog box
 */

import { Box } from './box';
import { Button } from './button';
import type { ElementOptions } from '../core/types';

export interface MessageOptions extends ElementOptions {
  text?: string;
  title?: string;
}

export class Message extends Box {
  private messageText: Box;
  private okButton: Button;

  constructor(options: MessageOptions = {}) {
    super({
      ...options,
      border: options.border || { type: 'line' },
      label: options.title || options.label || ' Message ',
      width: options.width || '50%',
      height: options.height || 'shrink',
      top: options.top || 'center',
      left: options.left || 'center',
      padding: options.padding || 1,
      hidden: true,
      focusable: true,
      shadow: options.shadow !== false,
    });

    // Message text
    this.messageText = new Box({
      parent: this,
      top: 0,
      left: 0,
      width: '100%',
      height: 'shrink',
      content: options.text || '',
      tags: true,
      align: 'center',
    });

    // OK button
    this.okButton = new Button({
      parent: this,
      bottom: 0,
      left: 'center',
      width: 'shrink',
      height: 1,
      content: ' OK ',
      padding: { left: 1, right: 1 },
      style: {
        fg: 'white',
        bg: 'blue',
        focus: {
          bg: 'lightblue',
        },
      },
    });

    this.okButton.on('press', () => {
      this.hide();
      this.emit('ok');
      this.emit('hide');
    });

    // Close on escape
    this.key(['escape'], () => {
      this.hide();
      this.emit('hide');
    });

    // Close on enter
    this.key(['enter'], () => {
      this.hide();
      this.emit('ok');
      this.emit('hide');
    });
  }

  /**
   * Display the message
   */
  display(text?: string, callback?: () => void): void {
    if (text) {
      this.setText(text);
    }

    this.show();
    this.setFront();
    this.focus();
    this.screen?.render();

    if (callback) {
      this.once('hide', callback);
    }
  }

  /**
   * Set message text
   */
  setText(text: string): void {
    this.messageText.setContent(text);
  }

  /**
   * Get message text
   */
  getText(): string {
    return this.messageText.getContent();
  }
}
