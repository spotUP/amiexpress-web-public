/**
 * Picture Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/picture.js
 * Displays images as ASCII art
 *
 * Note: Original depends on 'picture-tuber' npm package for image rendering.
 * This implementation provides the API but displays placeholder text.
 */
import { Box } from '../../widgets/box';
import type { ElementOptions } from '../../core/types';
export interface PictureOptions extends ElementOptions {
    file?: string;
    base64?: string;
    cols?: number;
    onReady?: () => void;
}
/**
 * Picture Widget
 * Displays images as ASCII art in the terminal
 */
export declare class Picture extends Box {
    options: PictureOptions;
    private imageContent;
    constructor(options?: PictureOptions);
    setImage(options: PictureOptions): void;
    render(): any;
    getOptionsPrototype(): PictureOptions;
    get type(): string;
}
/**
 * Factory function
 */
export declare function picture(options?: PictureOptions): Picture;
