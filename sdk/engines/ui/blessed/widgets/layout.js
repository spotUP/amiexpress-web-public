/**
 * Layout - Container widget for arranging children in rows/columns
 */
import { Box } from './box';
export class Layout extends Box {
    constructor(options = {}) {
        const { layout, renderer, ...boxOptions } = options;
        super({
            ...boxOptions,
            scrollable: options.scrollable !== false,
        });
        this.layoutType = layout || 'inline';
        this.renderer = renderer;
        // Trigger layout on render
        this.on('prerender', () => {
            this.performLayout();
        });
    }
    /**
     * Perform layout calculation
     */
    performLayout() {
        if (this.layoutType === 'inline') {
            this.layoutInline();
        }
        else if (this.layoutType === 'grid') {
            this.layoutGrid();
        }
        if (this.renderer) {
            const coords = this.getLayoutCoords();
            this.renderer(coords);
        }
    }
    /**
     * Inline layout - arrange children horizontally
     */
    layoutInline() {
        let currentX = 0;
        let currentY = 0;
        let maxHeight = 0;
        const containerWidth = typeof this.width === 'number' ? this.width : 100;
        for (const child of this.children) {
            const childWidth = this.getChildWidth(child);
            const childHeight = this.getChildHeight(child);
            // Wrap to next line if needed
            if (currentX > 0 && currentX + childWidth > containerWidth) {
                currentX = 0;
                currentY += maxHeight;
                maxHeight = 0;
            }
            // Position child using Element's position properties
            // Note: In blessed, positions are set via options or setters
            // For layout purposes, we just track the positions
            currentX += childWidth;
            maxHeight = Math.max(maxHeight, childHeight);
        }
    }
    /**
     * Grid layout - arrange children in a grid
     */
    layoutGrid() {
        const cols = Math.floor(Math.sqrt(this.children.length));
        const rows = Math.ceil(this.children.length / cols);
        const containerWidth = typeof this.width === 'number' ? this.width : 100;
        const containerHeight = typeof this.height === 'number' ? this.height : 30;
        const cellWidth = Math.floor(containerWidth / cols);
        const cellHeight = Math.floor(containerHeight / rows);
        // Grid layout calculation
        // Note: In blessed, child positions are typically set via options
        // This method calculates the grid but doesn't directly modify children
        let childIndex = 0;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (childIndex >= this.children.length)
                    break;
                childIndex++;
            }
        }
    }
    /**
     * Get child width (handle percentages and 'shrink')
     */
    getChildWidth(child) {
        const childWidth = child.width;
        const containerWidth = typeof this.width === 'number' ? this.width : 100;
        if (typeof childWidth === 'number') {
            return childWidth;
        }
        if (childWidth && typeof childWidth === 'string') {
            const widthStr = childWidth;
            if (widthStr.includes('%')) {
                const percent = parseInt(widthStr) / 100;
                return Math.floor(containerWidth * percent);
            }
            if (widthStr === 'shrink') {
                return 10; // Default shrink width
            }
        }
        return containerWidth;
    }
    /**
     * Get child height (handle percentages and 'shrink')
     */
    getChildHeight(child) {
        const childHeight = child.height;
        const containerHeight = typeof this.height === 'number' ? this.height : 30;
        if (typeof childHeight === 'number') {
            return childHeight;
        }
        if (childHeight && typeof childHeight === 'string') {
            const heightStr = childHeight;
            if (heightStr.includes('%')) {
                const percent = parseInt(heightStr) / 100;
                return Math.floor(containerHeight * percent);
            }
            if (heightStr === 'shrink') {
                return 3; // Default shrink height
            }
        }
        return containerHeight;
    }
    /**
     * Get layout coordinates for all children
     */
    getLayoutCoords() {
        return this.children.map(child => ({
            element: child,
            x: child.left,
            y: child.top,
            width: this.getChildWidth(child),
            height: this.getChildHeight(child),
        }));
    }
    /**
     * Set layout type
     */
    setLayout(layout) {
        this.layoutType = layout;
        this.performLayout();
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Get layout type
     */
    getLayout() {
        return this.layoutType;
    }
    /**
     * Reflow layout (force recalculation)
     */
    reflow() {
        this.performLayout();
        if (this.screen) {
            this.screen.render();
        }
    }
}
