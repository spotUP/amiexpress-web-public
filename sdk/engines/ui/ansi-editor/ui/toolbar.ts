/**
 * Toolbar component
 * Shows available editor actions
 */

import { box, type Screen, type Box } from '../../blessed';

export interface ToolbarOptions {
  parent: Screen;
  onAction?: (action: ToolbarAction) => void;
}

export type ToolbarAction =
  | 'save'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'find'
  | 'replace'
  | 'color'
  | 'help';

interface ToolbarItem {
  text: string;
  action: ToolbarAction;
  keys?: string[];
}

/**
 * Toolbar component
 */
export class Toolbar {
  private box: Box;
  private items: ToolbarItem[] = [
    { text: 'Save', action: 'save', keys: ['C-s'] },
    { text: 'Undo', action: 'undo', keys: ['C-z'] },
    { text: 'Redo', action: 'redo', keys: ['C-y'] },
    { text: 'Cut', action: 'cut', keys: ['C-x'] },
    { text: 'Copy', action: 'copy', keys: ['C-c'] },
    { text: 'Paste', action: 'paste', keys: ['C-v'] },
    { text: 'Find', action: 'find', keys: ['C-f'] },
    { text: 'Replace', action: 'replace', keys: ['C-h'] },
    { text: 'Color', action: 'color', keys: ['f2'] },
    { text: 'Help', action: 'help', keys: ['f1'] },
  ];
  private options: ToolbarOptions;

  constructor(options: ToolbarOptions) {
    this.options = options;

    // Create toolbar box
    this.box = box({
      parent: options.parent,
      top: 0,
      left: 0,
      right: 0,
      height: 1,
      style: {
        fg: 'black',
        bg: 'cyan',
      },
      tags: true,
    });

    // Build toolbar content
    this.updateContent();
  }

  /**
   * Update toolbar content
   */
  private updateContent(): void {
    const content = this.items.map(item => {
      const keyHint = item.keys && item.keys.length > 0
        ? ` {gray-fg}(${item.keys[0]}){/}`
        : '';
      return `{white-fg}${item.text}{/}${keyHint}`;
    }).join('  ');

    this.box.setContent(` ${content} `);
  }

  /**
   * Update toolbar (if needed for dynamic content)
   */
  update(): void {
    this.updateContent();
  }

  /**
   * Get toolbar height
   */
  getHeight(): number {
    return 1;
  }

  /**
   * Destroy toolbar
   */
  destroy(): void {
    this.box.destroy();
  }
}
