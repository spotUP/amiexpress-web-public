/**
 * PassBox - Password input widget with character masking
 */
import { Textbox } from './textbox';
export class PassBox extends Textbox {
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
