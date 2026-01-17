"use strict";
/**
 * PassBox - Password input widget with character masking
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PassBox = void 0;
const textbox_1 = require("./textbox");
class PassBox extends textbox_1.Textbox {
    constructor(options = {}) {
        const { mask, ...textboxOptions } = options;
        super({
            ...textboxOptions,
            censor: true, // Enable censoring by default
        });
        this.mask = mask || '*';
    }
    /**
     * Set mask character
     */
    setMask(mask) {
        this.mask = mask;
    }
    /**
     * Get mask character
     */
    getMask() {
        return this.mask;
    }
}
exports.PassBox = PassBox;
