/**
 * Accordion Widget
 * Manages multiple stacked expandable sections
 *
 * Responsive features:
 * - Touch-friendly header heights on mobile
 */
import { Box } from './box';
import { Button } from './button';
import { MIN_TOUCH_HEIGHT } from '../core/responsive-constants';
export class Accordion extends Box {
    constructor(options) {
        super({
            ...options,
            scrollable: true,
            alwaysScroll: true,
        });
        this.items = [];
        this._isMobileMode = false;
        this._headerHeight = 1;
        this.multiple = options.multiple || false;
        this.headerStyle = options.style?.header || { fg: 'white', bg: 'black' };
        this.expandedStyle = options.style?.expanded || { fg: 'black', bg: 'cyan', bold: true };
        if (options.items) {
            options.items.forEach(item => {
                this.addItem(item.label, item.content, item.expanded);
            });
        }
        this.relayout();
    }
    /**
     * Add a new accordion section
     */
    addItem(label, content, expanded = false) {
        const index = this.items.length;
        // Create header button
        const header = new Button({
            parent: this,
            top: 0, // Positioned by relayout
            left: 0,
            right: 0,
            height: 1,
            // Amiga-safe arrows: use v/> instead of Unicode triangles
            content: ` ${expanded ? 'v' : '>'} ${label} `,
            padding: 0,
            align: 'left',
            style: expanded ? this.expandedStyle : this.headerStyle,
            border: undefined,
        });
        header.on('press', () => {
            this.toggleItem(index);
        });
        // Create or prepare content element
        let contentElement;
        if (typeof content === 'string') {
            contentElement = new Box({
                parent: this,
                top: 1,
                left: 0,
                right: 0,
                height: content.split('\n').length,
                content,
                hidden: !expanded,
            });
        }
        else {
            contentElement = content;
            contentElement.parent = this;
            contentElement.top = 1;
            contentElement.left = 0;
            contentElement.right = 0;
            if (!expanded)
                contentElement.hide();
            this.append(contentElement);
        }
        this.items.push({
            header,
            content: contentElement,
            expanded,
        });
        this.relayout();
    }
    /**
     * Toggle a section's expanded state
     */
    toggleItem(index) {
        const item = this.items[index];
        if (!item)
            return;
        if (item.expanded) {
            this.collapseItem(index);
        }
        else {
            this.expandItem(index);
        }
    }
    /**
     * Expand a section
     */
    expandItem(index) {
        const item = this.items[index];
        if (!item || item.expanded)
            return;
        // If multiple expansion not allowed, collapse others
        if (!this.multiple) {
            this.items.forEach((it, i) => {
                if (i !== index && it.expanded) {
                    this.collapseItem(i, false); // Don't relayout yet
                }
            });
        }
        item.expanded = true;
        item.content.show();
        item.header.setContent(item.header.content.replace('>', 'v'));
        item.header.setStyle(this.expandedStyle);
        this.relayout();
        this.emit('expand', index);
    }
    /**
     * Collapse a section
     */
    collapseItem(index, shouldRelayout = true) {
        const item = this.items[index];
        if (!item || !item.expanded)
            return;
        item.expanded = false;
        item.content.hide();
        item.header.setContent(item.header.content.replace('v', '>'));
        item.header.setStyle(this.headerStyle);
        if (shouldRelayout) {
            this.relayout();
        }
        this.emit('collapse', index);
    }
    /**
     * Recalculate positions of all headers and content blocks
     */
    relayout() {
        let currentTop = 0;
        this.items.forEach(item => {
            item.header.top = currentTop;
            currentTop += 1;
            if (item.expanded) {
                item.content.top = currentTop;
                const height = typeof item.content.height === 'number'
                    ? item.content.height
                    : (item.content.children.length || item.content.getLines().length || 1);
                currentTop += height;
            }
        });
        this.screen?.render();
    }
    get type() {
        return 'accordion';
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
        if (state.isMobile && !this._isMobileMode) {
            this._enterMobileMode();
        }
        else if (!state.isMobile && this._isMobileMode) {
            this._exitMobileMode();
        }
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
    _enterMobileMode() {
        this._isMobileMode = true;
        // Make headers touch-friendly
        this._headerHeight = MIN_TOUCH_HEIGHT;
        this.items.forEach(item => {
            item.header.height = this._headerHeight;
        });
        this.relayout();
    }
    _exitMobileMode() {
        this._isMobileMode = false;
        // Restore compact headers
        this._headerHeight = 1;
        this.items.forEach(item => {
            item.header.height = this._headerHeight;
        });
        this.relayout();
    }
}
/**
 * Factory function
 */
export function accordion(options) {
    return new Accordion(options);
}
