/**
 * Prompt - Text input dialog box
 */

import { Box } from './box';
import { Textbox } from './textbox';
import { Button } from './button';
import type { ElementOptions } from '../core/types';

export interface PromptOptions extends ElementOptions {
  text?: string;
  title?: string;
  value?: string;
}

export class Prompt extends Box {
  private messageText: Box;
  private inputField: Textbox;
  private okButton: Button;
  private cancelButton: Button;

  constructor(options: PromptOptions = {}) {
    super({
      ...options,
      border: options.border || { type: 'line' },
      label: options.title || options.label || ' Prompt ',
      width: options.width || '50%',
      height: options.height || 'shrink',
      top: options.top || 'center',
      left: options.left || 'center',
      padding: options.padding || 1,
      hidden: true,
      focusable: true,
      shadow: options.shadow !== false,
    });

    // Prompt text
    this.messageText = new Box({
      parent: this,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: options.text || '',
      tags: true,
    });

    // Input field
    this.inputField = new Textbox({
      parent: this,
      top: 2,
      left: 0,
      width: '100%',
      height: 1,
      border: { type: 'line' },
      value: options.value || '',
      style: {
        fg: 'white',
        bg: 'black',
      },
    });

    // OK button
    this.okButton = new Button({
      parent: this,
      bottom: 0,
      left: 2,
      width: 'shrink',
      height: 1,
      content: ' OK ',
      padding: { left: 1, right: 1 },
      style: {
        fg: 'white',
        bg: 'green',
        focus: {
          bg: 'lightgreen',
        },
      },
    });

    // Cancel button
    this.cancelButton = new Button({
      parent: this,
      bottom: 0,
      left: 10,
      width: 'shrink',
      height: 1,
      content: ' Cancel ',
      padding: { left: 1, right: 1 },
      style: {
        fg: 'white',
        bg: 'red',
        focus: {
          bg: 'lightred',
        },
      },
    });

    this.okButton.on('press', () => {
      const value = this.inputField.getValue();
      this.hide();
      this.emit('submit', value);
      this.emit('hide');
    });

    this.cancelButton.on('press', () => {
      this.hide();
      this.emit('cancel');
      this.emit('hide');
    });

    // Submit on enter in input field
    this.inputField.key(['enter'], () => {
      const value = this.inputField.getValue();
      this.hide();
      this.emit('submit', value);
      this.emit('hide');
    });

    // Cancel on escape
    this.key(['escape'], () => {
      this.hide();
      this.emit('cancel');
      this.emit('hide');
    });
  }

  /**
   * Display the prompt
   */
  showInput(text?: string, value?: string, callback?: (err: Error | null, value?: string) => void): void {
    if (text) {
      this.setText(text);
    }

    if (value !== undefined) {
      this.setValue(value);
    }

    this.show();
    this.setFront();
    this.inputField.focus();
    this.screen?.render();

    if (callback) {
      this.once('submit', (value: string) => {
        callback(null, value);
      });
      this.once('cancel', () => {
        callback(new Error('cancelled'));
      });
    }
  }

  /**
   * Set prompt text
   */
  setText(text: string): void {
    this.messageText.setContent(text);
  }

  /**
   * Get prompt text
   */
  getText(): string {
    return this.messageText.getContent();
  }

  /**
   * Set input value
   */
  setValue(value: string): void {
    this.inputField.setValue(value);
  }

  /**
   * Get input value
   */
  getValue(): string {
    return this.inputField.getValue();
  }
}
