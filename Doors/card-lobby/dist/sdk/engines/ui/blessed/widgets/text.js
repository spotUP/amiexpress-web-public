"use strict";
/**
 * Text widget - Simple text display (no border by default)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Text = void 0;
const element_1 = require("../core/element");
class Text extends element_1.Element {
    constructor(options = {}) {
        super({
            ...options,
            border: options.border !== undefined ? options.border : undefined,
        });
    }
}
exports.Text = Text;
