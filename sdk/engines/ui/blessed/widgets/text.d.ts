/**
 * Text widget - Simple text display (no border by default)
 */
import { Element } from '../core/element';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
export declare class Text extends Element {
    constructor(options?: ElementOptions);
    protected _handleBreakpointChange(breakpoint: BreakpointName, previousBreakpoint: BreakpointName, state: ResponsiveState): void;
}
