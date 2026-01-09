/**
 * ColorPicker Widget
 * Visual grid for selecting ANSI colors
 */
import { Box } from './box';
import { Button } from './button';
export class ColorPicker extends Box {
    constructor(options = {}) {
        super({
            width: 20,
            height: 6,
            border: 'line',
            label: ' Color ',
            ...options,
        });
        this.selectedColor = 'white';
        this.colorButtons = [];
        this.selectedColor = options.color || 'white';
        this.setupGrid();
    }
    setupGrid() {
        const cols = 8;
        const itemWidth = 2;
        const itemHeight = 1;
        ColorPicker.ANSI_COLORS.forEach((color, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            const btn = new Button({
                parent: this,
                top: row * itemHeight,
                left: col * itemWidth,
                width: itemWidth,
                height: itemHeight,
                content: '  ',
                style: {
                    bg: color,
                    focus: {
                        bg: 'white',
                        fg: 'black'
                    }
                },
                border: undefined,
            });
            btn.on('press', () => {
                this.selectColor(color);
            });
            this.colorButtons.push(btn);
        });
    }
    /**
     * Select a color programmatically
     */
    selectColor(color) {
        this.selectedColor = color;
        this.emit('select', color);
        this.screen?.render();
    }
    /**
     * Get the currently selected color
     */
    getSelectedColor() {
        return this.selectedColor;
    }
    get type() {
        return 'colorpicker';
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
        // Color grid is fixed layout, just trigger re-render
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
}
ColorPicker.ANSI_COLORS = [
    'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
    'light-black', 'light-red', 'light-green', 'light-yellow', 'light-blue', 'light-magenta', 'light-cyan', 'light-white'
];
/**
 * Factory function
 */
export function colorpicker(options) {
    return new ColorPicker(options);
}
