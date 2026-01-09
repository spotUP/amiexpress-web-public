/**
 * StatusBar - Footer status bar widget
 *
 * A horizontal bar at the bottom of the screen with configurable sections.
 * Features:
 * - Multiple sections with separators
 * - Individual section updates
 * - Customizable colors and separator
 * - Automatic layout based on content
 */
import { Box } from './box';
export class StatusBar extends Box {
    constructor(options = {}) {
        const fg = options.fg || 'white';
        const bg = options.bg || 'blue';
        const position = options.position || 'bottom';
        super({
            ...options,
            top: position === 'top' ? 0 : undefined,
            bottom: position === 'bottom' ? 0 : undefined,
            left: 0,
            width: '100%',
            height: 1,
            tags: true,
            ch: ' ',
            style: {
                fg,
                bg,
                ...options.style,
            },
        });
        this._sections = new Map();
        this._separator = options.separator || ' | ';
        this._baseFg = fg;
        // Initialize sections
        if (options.sections) {
            for (const section of options.sections) {
                this._sections.set(section.id, { ...section });
            }
        }
        this._render();
    }
    /**
     * Set content for a section
     */
    setSection(id, content) {
        const section = this._sections.get(id);
        if (section) {
            section.content = content;
            this._render();
        }
    }
    /**
     * Add a new section
     */
    addSection(section) {
        this._sections.set(section.id, { ...section });
        this._render();
    }
    /**
     * Remove a section
     */
    removeSection(id) {
        this._sections.delete(id);
        this._render();
    }
    /**
     * Get section content
     */
    getSection(id) {
        return this._sections.get(id)?.content;
    }
    /**
     * Set all sections at once
     */
    setSections(sections) {
        this._sections.clear();
        for (const section of sections) {
            this._sections.set(section.id, { ...section });
        }
        this._render();
    }
    /**
     * Render the status bar content
     */
    _render() {
        const parts = [];
        for (const section of this._sections.values()) {
            let content = section.content;
            // Apply section color if different from base
            if (section.fg && section.fg !== this._baseFg) {
                content = `{${section.fg}-fg}${content}{/${section.fg}-fg}`;
            }
            parts.push(content);
        }
        this.setContent(' ' + parts.join(this._separator) + ' ');
        this.screen?.render();
    }
    /**
     * Set full content directly (bypasses sections)
     */
    setFullContent(content) {
        this.setContent(content);
        this.screen?.render();
    }
}
/**
 * Factory function
 */
export function statusBar(options) {
    return new StatusBar(options);
}
