/**
 * Markdown Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/markdown.js
 * Renders markdown text with formatting
 *
 * Note: Original depends on 'marked' and 'marked-terminal' npm packages.
 * This implementation provides basic markdown rendering without full library support.
 */

import { Box } from '../../widgets/box';
import type { ElementOptions } from '../../core/types';

export interface MarkdownStyle {
  [key: string]: any;
}

export interface MarkdownOptions extends ElementOptions {
  markdown?: string;
  markdownStyle?: MarkdownStyle;
}

/**
 * Markdown Widget
 * Renders markdown text with basic formatting
 */
export class Markdown extends Box {
  declare options: MarkdownOptions;
  private markdownOptions: { style?: MarkdownStyle } = {};

  constructor(options: MarkdownOptions = {}) {
    super(options);

    this.markdownOptions = {
      style: options.markdownStyle
    };

    this.evalStyles(this.markdownOptions);
    this.setOptions(this.markdownOptions.style);

    if (options.markdown) {
      this.setMarkdown(options.markdown);
    }
  }

  setMarkdown(str: string): void {
    // Basic markdown parsing (simplified version)
    // Full implementation would use marked + marked-terminal
    const parsed = this._parseMarkdown(str);
    this.setContent(parsed);
  }

  private _parseMarkdown(str: string): string {
    // Basic markdown transformations
    let result = str;

    // Headers
    result = result.replace(/^### (.+)$/gm, '{bold}$1{/bold}');
    result = result.replace(/^## (.+)$/gm, '{bold}{underline}$1{/underline}{/bold}');
    result = result.replace(/^# (.+)$/gm, '{bold}{cyan-fg}$1{/cyan-fg}{/bold}');

    // Bold and italic
    result = result.replace(/\*\*(.+?)\*\*/g, '{bold}$1{/bold}');
    result = result.replace(/\*(.+?)\*/g, '{italic}$1{/italic}');
    result = result.replace(/__(.+?)__/g, '{bold}$1{/bold}');
    result = result.replace(/_(.+?)_/g, '{italic}$1{/italic}');

    // Code
    result = result.replace(/`(.+?)`/g, '{cyan-fg}$1{/cyan-fg}');

    // Links
    result = result.replace(/\[(.+?)\]\((.+?)\)/g, '{blue-fg}{underline}$1{/underline}{/blue-fg}');

    // Lists
    result = result.replace(/^\* (.+)$/gm, '  • $1');
    result = result.replace(/^- (.+)$/gm, '  • $1');
    result = result.replace(/^\+ (.+)$/gm, '  • $1');

    // Blockquotes
    result = result.replace(/^> (.+)$/gm, '{gray-fg}│ $1{/gray-fg}');

    // Horizontal rules
    result = result.replace(/^---$/gm, '─'.repeat(40));
    result = result.replace(/^\*\*\*$/gm, '─'.repeat(40));

    return result;
  }

  setOptions(style?: MarkdownStyle): void {
    // Options would be passed to marked-terminal renderer
    // For now, just store them
    if (style) {
      this.markdownOptions.style = style;
    }
  }

  evalStyles(options: { style?: MarkdownStyle }): void {
    if (!options.style) return;

    // Original uses chalk for styling
    // Our implementation uses blessed tags instead
    for (const st in options.style) {
      if (typeof options.style[st] !== 'string') continue;

      // Convert chalk-style strings to blessed tags
      // e.g., 'chalk.blue.bold' -> 'blue-fg bold'
      const tokens = options.style[st].split('.');
      const styles: string[] = [];
      for (let j = 1; j < tokens.length; j++) {
        const token = tokens[j];
        if (token === 'bold' || token === 'underline' || token === 'italic') {
          styles.push(token);
        } else {
          styles.push(token + '-fg');
        }
      }
      options.style[st] = styles.join(' ');
    }
  }

  getOptionsPrototype(): MarkdownOptions {
    return {
      markdown: 'string',
      markdownStyle: {}
    };
  }

  get type(): string {
    return 'markdown';
  }
}

/**
 * Factory function
 */
export function markdown(options: MarkdownOptions = {}): Markdown {
  return new Markdown(options);
}
