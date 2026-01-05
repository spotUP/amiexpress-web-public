/**
 * Accordion Widget
 * Manages multiple stacked expandable sections
 */

import { Box } from './box';
import { Button } from './button';
import { Element } from '../core/element';
import type { AccordionOptions, Colors } from '../core/types';

export class Accordion extends Box {
  private items: {
    header: Button;
    content: Element;
    expanded: boolean;
  }[] = [];
  private multiple: boolean;
  private headerStyle: Colors;
  private expandedStyle: Colors;

  constructor(options: AccordionOptions) {
    super({
      ...options,
      scrollable: true,
      alwaysScroll: true,
    });

    this.multiple = options.multiple || false;
    this.headerStyle = options.style?.header || { fg: 'white', bg: 'black' };
    this.expandedStyle = options.style?.expanded || { fg: 'black', bg: 'cyan', bold: true };

    if (options.items) {
      options.items.forEach(item => {
        this.addItem(item.label, item.content, item.expanded);
      });
    }

    this.relayout();
  }

  /**
   * Add a new accordion section
   */
  addItem(label: string, content: string | Element, expanded: boolean = false): void {
    const index = this.items.length;

    // Create header button
    const header = new Button({
      parent: this,
      top: 0, // Positioned by relayout
      left: 0,
      right: 0,
      height: 1,
      content: ` ${expanded ? '▼' : '▶'} ${label} `,
      padding: 0,
      align: 'left',
      style: expanded ? this.expandedStyle : this.headerStyle,
      border: undefined,
    });

    header.on('press', () => {
      this.toggleItem(index);
    });

    // Create or prepare content element
    let contentElement: Element;
    if (typeof content === 'string') {
      contentElement = new Box({
        parent: this,
        top: 1,
        left: 0,
        right: 0,
        height: content.split('\n').length,
        content,
        hidden: !expanded,
      });
    } else {
      contentElement = content;
      contentElement.parent = this;
      contentElement.top = 1;
      contentElement.left = 0;
      contentElement.right = 0;
      if (!expanded) contentElement.hide();
      this.append(contentElement);
    }

    this.items.push({
      header,
      content: contentElement,
      expanded,
    });

    this.relayout();
  }

  /**
   * Toggle a section's expanded state
   */
  toggleItem(index: number): void {
    const item = this.items[index];
    if (!item) return;

    if (item.expanded) {
      this.collapseItem(index);
    } else {
      this.expandItem(index);
    }
  }

  /**
   * Expand a section
   */
  expandItem(index: number): void {
    const item = this.items[index];
    if (!item || item.expanded) return;

    // If multiple expansion not allowed, collapse others
    if (!this.multiple) {
      this.items.forEach((it, i) => {
        if (i !== index && it.expanded) {
          this.collapseItem(i, false); // Don't relayout yet
        }
      });
    }

    item.expanded = true;
    item.content.show();
    item.header.setContent(item.header.content.replace('▶', '▼'));
    item.header.setStyle(this.expandedStyle);

    this.relayout();
    this.emit('expand', index);
  }

  /**
   * Collapse a section
   */
  collapseItem(index: number, shouldRelayout: boolean = true): void {
    const item = this.items[index];
    if (!item || !item.expanded) return;

    item.expanded = false;
    item.content.hide();
    item.header.setContent(item.header.content.replace('▼', '▶'));
    item.header.setStyle(this.headerStyle);

    if (shouldRelayout) {
      this.relayout();
    }
    this.emit('collapse', index);
  }

  /**
   * Recalculate positions of all headers and content blocks
   */
  private relayout(): void {
    let currentTop = 0;

    this.items.forEach(item => {
      item.header.top = currentTop;
      currentTop += 1;

      if (item.expanded) {
        item.content.top = currentTop;
        const height = typeof item.content.height === 'number' 
          ? item.content.height 
          : (item.content.children.length || item.content.getLines().length || 1);
        currentTop += height;
      }
    });

    this.screen?.render();
  }

  get type(): string {
    return 'accordion';
  }
}

/**
 * Factory function
 */
export function accordion(options: AccordionOptions): Accordion {
  return new Accordion(options);
}
