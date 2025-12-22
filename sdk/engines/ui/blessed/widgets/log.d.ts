/**
 * Log widget - Scrolling log viewer
 */
import { Element } from '../core/element';
import type { LogOptions } from '../core/types';
export declare class Log extends Element {
    private scrollback;
    private scrollOnInput;
    constructor(options?: LogOptions);
    log(text: string): void;
    add(text: string): void;
    clear(): void;
}
//# sourceMappingURL=log.d.ts.map