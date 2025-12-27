"use strict";
/**
 * Picture Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/picture.js
 * Displays images as ASCII art
 *
 * Note: Original depends on 'picture-tuber' npm package for image rendering.
 * This implementation provides the API but displays placeholder text.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Picture = void 0;
exports.picture = picture;
const box_1 = require("../../widgets/box");
/**
 * Picture Widget
 * Displays images as ASCII art in the terminal
 */
class Picture extends box_1.Box {
    constructor(options = {}) {
        options.cols = options.cols || 50;
        super(options);
        this.imageContent = '';
        if (options.file || options.base64) {
            this.setImage(options);
        }
    }
    setImage(options) {
        // Note: picture-tuber integration would go here
        // For now, create a placeholder
        const cols = options.cols || 50;
        const rows = 10;
        const placeholder = [];
        placeholder.push('┌' + '─'.repeat(cols - 2) + '┐');
        for (let i = 0; i < rows - 2; i++) {
            if (i === Math.floor(rows / 2) - 1) {
                const text = '[Picture Widget - Image Rendering]';
                const padding = Math.floor((cols - text.length - 2) / 2);
                placeholder.push('│' + ' '.repeat(padding) + text + ' '.repeat(cols - text.length - padding - 2) + '│');
            }
            else if (i === Math.floor(rows / 2)) {
                const text = options.file ? `File: ${options.file}` : 'Base64 Image';
                const padding = Math.floor((cols - text.length - 2) / 2);
                placeholder.push('│' + ' '.repeat(padding) + text + ' '.repeat(cols - text.length - padding - 2) + '│');
            }
            else {
                placeholder.push('│' + ' '.repeat(cols - 2) + '│');
            }
        }
        placeholder.push('└' + '─'.repeat(cols - 2) + '┘');
        this.imageContent = placeholder.join('\n');
        // Call onReady callback
        if (options.onReady) {
            setTimeout(options.onReady, 0);
        }
    }
    render() {
        this.setContent(this.imageContent);
        return super.render();
    }
    getOptionsPrototype() {
        return {
            base64: 'AAAA',
            cols: 1
        };
    }
    get type() {
        return 'picture';
    }
}
exports.Picture = Picture;
/**
 * Factory function
 */
function picture(options = {}) {
    return new Picture(options);
}
