"use strict";
/**
 * ScrollableText - Text widget with built-in scrolling support
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScrollableText = void 0;
const text_1 = require("./text");
class ScrollableText extends text_1.Text {
    constructor(options = {}) {
        super({
            ...options,
            scrollable: true,
            alwaysScroll: options.alwaysScroll !== false,
            scrollbar: options.scrollbar === undefined || options.scrollbar ? {
                ch: '█',
                track: {
                    ch: '│',
                },
                style: (options.scrollbar && typeof options.scrollbar === 'object' ? options.scrollbar.style : undefined) || options.style,
            } : undefined,
        });
        // Enable mouse wheel scrolling
        this.enableMouse();
        // Set up key bindings for scrolling (scroll() auto-renders)
        this.key(['up', 'k'], () => this.scroll(-1));
        this.key(['down', 'j'], () => this.scroll(1));
        this.key(['pageup', 'C-b'], () => this.scroll(-this.iheight));
        this.key(['pagedown', 'C-f', 'space'], () => this.scroll(this.iheight));
        this.key(['home', 'g'], () => this.scrollTo(0));
        this.key(['end', 'G'], () => this.scrollTo(this.getScrollHeight()));
        // Note: Mouse wheel scrolling is handled by Element.onMouse()
        // which calls scroll() automatically for wheelup/wheeldown events
    }
    /**
     * Get the current scroll percentage
     */
    getScrollPercent() {
        return this.getScrollPerc();
    }
    /**
     * Set scroll by percentage (0-100)
     */
    setScrollPercent(percent) {
        this.setScrollPerc(percent);
    }
}
exports.ScrollableText = ScrollableText;
