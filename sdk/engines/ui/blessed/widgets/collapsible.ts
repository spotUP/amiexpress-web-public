/**
 * Collapsible Widget
 * A single expandable section
 */

import { Box } from './box';
import { Button } from './button';
import { Element } from '../core/element';
import type { CollapsibleOptions, Colors } from '../core/types';

export class Collapsible extends Box {
  private header: Button;
  private container: Box;
  private isExpanded: boolean;
  private headerStyle: Colors;
  private originalHeight: number | string;

  constructor(options: CollapsibleOptions) {
    super({
      ...options,
    });

    this.isExpanded = options.expanded !== false;
    this.headerStyle = options.style?.header || { fg: 'white', bg: 'black', bold: true };
    this.originalHeight = options.height || 'shrink';

    // Create header
    this.header = new Button({
      parent: this,
      top: 0,
      left: 0,
      right: 0,
      height: 1,
      // Amiga-safe arrows: use v/> instead of Unicode triangles
      content: ` ${this.isExpanded ? 'v' : '>'} ${options.label} `,
      padding: 0,
      align: 'left',
      style: this.headerStyle,
      border: undefined,
    });

    this.header.on('press', () => {
      this.toggle();
    });

    // Create content container
    this.container = new Box({
      parent: this,
      top: 1,
      left: 0,
      right: 0,
      bottom: 0,
      hidden: !this.isExpanded,
    });

    // Move children to container
    if (options.content) {
      this.container.setContent(options.content);
    }

    if (!this.isExpanded) {
      this.height = 1;
    }
  }

  /**
   * Toggle expanded state
   */
  toggle(): void {
    if (this.isExpanded) {
      this.collapse();
    } else {
      this.expand();
    }
  }

  /**
   * Expand section
   */
  expand(): void {
    if (this.isExpanded) return;
    this.isExpanded = true;
    this.container.show();
    this.header.setContent(this.header.content.replace('>', 'v'));
    this.height = this.originalHeight;
    this.emit('expand');
    this.screen?.render();
  }

  /**
   * Collapse section
   */
  collapse(): void {
    if (!this.isExpanded) return;
    this.isExpanded = false;
    this.container.hide();
    this.header.setContent(this.header.content.replace('v', '>'));
    this.height = 1;
    this.emit('collapse');
    this.screen?.render();
  }

  /**
   * Append child to container instead of main box
   */
  append(element: Element): void {
    if (element === this.header || element === this.container) {
      super.append(element);
    } else {
      this.container.append(element);
    }
  }

  get type(): string {
    return 'collapsible';
  }
}

/**
 * Factory function
 */
export function collapsible(options: CollapsibleOptions): Collapsible {
  return new Collapsible(options);
}
