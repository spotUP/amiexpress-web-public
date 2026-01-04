/**
 * Log Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/log.js
 * Scrollable log viewer with buffer management
 */
import { Element } from '../core/element';
import type { ElementOptions } from '../core/types';
export interface LogOptions extends ElementOptions {
    bufferLength?: number;
}
/**
 * Log Widget
 * Displays scrolling log messages with automatic buffer management
 * Unlike List, Log doesn't add selection markers to preserve text width
 */
export declare class Log extends Element {
    options: LogOptions;
    logLines: string[];
    constructor(options?: LogOptions);
    log(str: string): void;
    private _updateContent;
    setItems(items: string[]): void;
    scrollTo(line: number): void;
    get type(): string;
}
/**
 * Factory function
 */
export declare function log(options?: LogOptions): Log;
