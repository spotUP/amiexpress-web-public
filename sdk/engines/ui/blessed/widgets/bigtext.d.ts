/**
 * BigText - Large ASCII text widget using figlet-style fonts
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface BigTextOptions extends ElementOptions {
    text?: string;
    font?: 'standard' | 'banner' | 'block' | 'simple';
    fch?: string;
}
export declare class BigText extends Box {
    private text;
    private font;
    private fch;
    constructor(options?: BigTextOptions);
    /**
     * Generate big text from input string
     */
    private generateBigText;
    /**
     * Generate standard 5-line ASCII art
     */
    private generateStandard;
    /**
     * Generate banner style (3-line)
     */
    private generateBanner;
    /**
     * Generate block style (filled rectangles)
     */
    private generateBlock;
    /**
     * Generate simple double-height text
     */
    private generateSimple;
    /**
     * Update content with generated big text
     */
    private updateContent;
    /**
     * Set text content
     */
    setText(text: string): void;
    /**
     * Get text content
     */
    getText(): string;
    /**
     * Set font style
     */
    setFont(font: 'standard' | 'banner' | 'block' | 'simple'): void;
    /**
     * Set fill character
     */
    setFillChar(ch: string): void;
}
//# sourceMappingURL=bigtext.d.ts.map