/**
 * Text widget - Simple text display (no border by default)
 */
import { Element } from '../core/element';
export class Text extends Element {
    constructor(options = {}) {
        super({
            ...options,
            border: options.border !== undefined ? options.border : undefined,
        });
    }
}
