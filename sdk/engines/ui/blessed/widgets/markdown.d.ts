/**
 * Markdown Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/markdown.js
 * Renders markdown text with formatting
 *
 * Note: Original depends on 'marked' and 'marked-terminal' npm packages.
 * This implementation provides basic markdown rendering without full library support.
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
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
export declare class Markdown extends Box {
    options: MarkdownOptions;
    private markdownOptions;
    constructor(options?: MarkdownOptions);
    setMarkdown(str: string): void;
    private _parseMarkdown;
    setOptions(style?: MarkdownStyle): void;
    evalStyles(options: {
        style?: MarkdownStyle;
    }): void;
    getOptionsPrototype(): MarkdownOptions;
    get type(): string;
}
/**
 * Factory function
 */
export declare function markdown(options?: MarkdownOptions): Markdown;
