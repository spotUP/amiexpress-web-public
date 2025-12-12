/**
 * Question - Yes/No dialog box
 */

import { Box } from './box';
import { Button } from './button';
import type { ElementOptions } from '../core/types';

export interface QuestionOptions extends ElementOptions {
  text?: string;
  title?: string;
}

export class Question extends Box {
  private messageText: Box;
  private yesButton: Button;
  private noButton: Button;

  constructor(options: QuestionOptions = {}) {
    super({
      ...options,
      border: options.border || { type: 'line' },
      label: options.title || options.label || ' Question ',
      width: options.width || '50%',
      height: options.height || 'shrink',
      top: options.top || 'center',
      left: options.left || 'center',
      padding: options.padding || 1,
      hidden: true,
      focusable: true,
      shadow: options.shadow !== false,
    });

    // Question text
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

    // Yes button
    this.yesButton = new Button({
      parent: this,
      bottom: 0,
      left: 'center',
      width: 'shrink',
      height: 1,
      content: ' Yes ',
      padding: { left: 1, right: 1 },
      style: {
        fg: 'white',
        bg: 'green',
        focus: {
          bg: 'lightgreen',
        },
      },
    });

    // No button
    this.noButton = new Button({
      parent: this,
      bottom: 0,
      left: this.yesButton as any,
      width: 'shrink',
      height: 1,
      content: ' No ',
      padding: { left: 1, right: 1 },
      style: {
        fg: 'white',
        bg: 'red',
        focus: {
          bg: 'lightred',
        },
      },
    });

    this.yesButton.on('press', () => {
      this.hide();
      this.emit('yes');
      this.emit('answer', true);
      this.emit('hide');
    });

    this.noButton.on('press', () => {
      this.hide();
      this.emit('no');
      this.emit('answer', false);
      this.emit('hide');
    });

    // Close on escape (same as No)
    this.key(['escape'], () => {
      this.hide();
      this.emit('no');
      this.emit('answer', false);
      this.emit('hide');
    });

    // Yes on enter/y
    this.key(['enter', 'y'], () => {
      this.hide();
      this.emit('yes');
      this.emit('answer', true);
      this.emit('hide');
    });

    // No on n
    this.key(['n'], () => {
      this.hide();
      this.emit('no');
      this.emit('answer', false);
      this.emit('hide');
    });

    // Tab between buttons
    this.key(['tab'], () => {
      if (this.yesButton.focused) {
        this.noButton.focus();
      } else {
        this.yesButton.focus();
      }
      this.screen?.render();
    });
  }

  /**
   * Display the question
   */
  ask(text?: string, callback?: (answer: boolean) => void): void {
    if (text) {
      this.setText(text);
    }

    this.show();
    this.setFront();
    this.yesButton.focus();
    this.screen?.render();

    if (callback) {
      this.once('answer', callback);
    }
  }

  /**
   * Set question text
   */
  setText(text: string): void {
    this.messageText.setContent(text);
  }

  /**
   * Get question text
   */
  getText(): string {
    return this.messageText.getContent();
  }
}
