/**
 * LCD Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/lcd.js
 * LCD sixteen-segment display for alphanumeric characters
 * Thanks to https://github.com/Enderer/sixteensegment for the original implementation
 *
 * Responsive features:
 * - Recalculates segment dimensions on resize
 */
import { ContribCanvas as Canvas } from './contrib-canvas';
/**
 * LCD Widget
 * Displays alphanumeric characters using sixteen-segment display
 */
export class LCD extends Canvas {
    constructor(options = {}) {
        // Set default options before calling super
        options.segmentWidth = options.segmentWidth || 0.06;
        options.segmentInterval = options.segmentInterval || 0.11;
        options.strokeWidth = options.strokeWidth || 0.11;
        options.elements = options.elements || 3;
        options.display = options.display || 321;
        options.elementSpacing = options.elementSpacing || 4;
        options.elementPadding = options.elementPadding || 2;
        options.color = options.color || 'white';
        super(options);
        this.segment16 = null;
        this._pendingDisplay = null;
        // Initialize segment16 and apply display
        const applyData = () => {
            if (!this.segment16 && this.ctx) {
                this.segment16 = new SixteenSegment(this.options.elements, this.ctx, this.canvasSize.width, this.canvasSize.height, 0, 0, this.options);
            }
            // Apply pending display or default
            const display = this._pendingDisplay ?? this.options.display ?? 1234;
            this._pendingDisplay = null;
            this._renderDisplay(display);
        };
        // If already attached (parent was specified in options), apply data now
        if (this.screen && this.ctx) {
            applyData();
        }
        // Also listen for future attach events
        this.on('attach', applyData);
    }
    calcSize() {
        // LCD segments use fractional dimensions (segmentWidth = 0.06 * elementWidth).
        // We need a large canvas so segments are at least several pixels wide.
        // Multiply by larger factors to ensure segment visibility.
        const widgetWidth = Math.max(10, this.width);
        const widgetHeight = Math.max(6, this.height);
        // Use 4x horizontal and 6x vertical scaling for proper segment rendering
        // This ensures segment widths are at least 2-3 pixels
        let width = widgetWidth * 4;
        let height = widgetHeight * 6;
        // Ensure minimum canvas size for readable LCD
        width = Math.max(80, width);
        height = Math.max(24, height);
        // Round to required multiples (width: 2, height: 4) for braille mapping
        width = Math.floor(width / 2) * 2;
        height = Math.floor(height / 4) * 4;
        this.canvasSize = { width, height };
    }
    get type() {
        return 'lcd';
    }
    increaseWidth() {
        if (this.segment16) {
            this.segment16.SegmentWidth += 0.01;
        }
    }
    decreaseWidth() {
        if (this.segment16) {
            this.segment16.SegmentWidth -= 0.01;
        }
    }
    increaseInterval() {
        if (this.segment16) {
            this.segment16.SegmentInterval += 0.01;
        }
    }
    decreaseInterval() {
        if (this.segment16) {
            this.segment16.SegmentInterval -= 0.01;
        }
    }
    increaseStroke() {
        if (this.segment16) {
            this.segment16.StrokeWidth += 0.05;
        }
    }
    decreaseStroke() {
        if (this.segment16) {
            this.segment16.StrokeWidth -= 0.05;
        }
    }
    setOptions(options) {
        if (this.segment16) {
            this.segment16.setOptions(options);
        }
    }
    setData(data) {
        this.setDisplay(data.toString());
    }
    setDisplay(display) {
        if (!this.ctx) {
            this._pendingDisplay = display;
            return;
        }
        this._renderDisplay(display);
    }
    _renderDisplay(display) {
        if (!this.ctx)
            return;
        this.ctx.clearRect(0, 0, this.canvasSize.width, this.canvasSize.height);
        this.segment16.DisplayText(display);
        // Sync canvas content to element
        this.syncContent();
    }
    getOptionsPrototype() {
        return {
            label: 'LCD Test',
            segmentWidth: 0.06,
            segmentInterval: 0.11,
            strokeWidth: 0.1,
            elements: 5,
            display: 3210,
            elementSpacing: 4,
            elementPadding: 2
        };
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
        // Reinitialize segment display with new dimensions
        if (this.ctx && this.canvasSize) {
            this.segment16 = new SixteenSegment(this.options.elements, this.ctx, this.canvasSize.width, this.canvasSize.height, 0, 0, this.options);
            // Re-render current display
            const display = this._pendingDisplay ?? this.options.display ?? 1234;
            this._renderDisplay(display);
        }
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
}
/**
 * ElementArray Class
 * Manages the array of segment values for each display element
 */
class ElementArray {
    constructor(count) {
        this.NullMask = 0x10;
        this.Elements = [];
        this.SetCount(count || 0);
    }
    SetCount(count) {
        const c = parseInt(count.toString(), 10);
        if (isNaN(c)) {
            throw new Error('Invalid element count: ' + count);
        }
        this.Elements = new Array(c);
        for (let i = 0; i < c; i++) {
            this.Elements[i] = 0;
        }
    }
    SetText(value, charMaps) {
        // Get the string of the value passed in
        if (value === null) {
            value = '';
        }
        value = value.toString();
        // Clear the elements
        for (let i = 0; i < this.Elements.length; i++) {
            this.SetElementValue(i, 0);
        }
        if (value.length === 0) {
            return;
        }
        // Set the bitmask to display the proper character for each element
        for (let e = 0; e < this.Elements.length && e < value.length; e++) {
            const c = value[e];
            let mask = charMaps[c];
            // Use blank if there is no bitmask for this character
            if (mask === null || mask === undefined) {
                mask = this.NullMask;
            }
            this.SetElementValue(e, mask);
        }
    }
    SetElementValue(i, value) {
        if (i >= 0 && i < this.Elements.length) {
            this.Elements[i] = parseInt(value.toString(), 10);
        }
    }
}
/**
 * SixteenSegment Class
 * Renders sixteen-segment LCD display characters
 */
class SixteenSegment {
    constructor(count, canvas, width, height, x, y, options) {
        this.BevelWidth = 0.01;
        this.SideBevelEnabled = true;
        this.FillLight = 'red';
        this.FillDark = 'cyan';
        this.StrokeDark = 'black';
        this.X = 0;
        this.Y = 0;
        this.Points = [];
        this.ElementArray = new ElementArray(count);
        this.SegmentWidth = options.segmentWidth;
        this.SegmentInterval = options.segmentInterval;
        this.StrokeLight = options.color;
        this.StrokeWidth = options.strokeWidth;
        this.Padding = options.elementPadding;
        this.Spacing = options.elementSpacing;
        this.ElementWidth = (width - this.Spacing * count) / count;
        this.ElementHeight = height - this.Padding * 2;
        this.ElementCount = count;
        this.Width = width || canvas.canvas.width;
        this.Height = height || canvas.canvas.height;
        this.Canvas = canvas;
        this.CalcPoints();
        this.ElementArray.SetCount(count);
    }
    setOptions(options) {
        if (options.elements) {
            this.ElementArray.SetCount(options.elements);
        }
        this.SegmentWidth = options.segmentWidth || this.SegmentWidth;
        this.SegmentInterval = options.segmentInterval || this.SegmentInterval;
        this.BevelWidth = 0.01;
        this.SideBevelEnabled = true;
        this.StrokeLight = options.color || this.StrokeLight;
        this.StrokeWidth = options.strokeWidth || this.StrokeWidth;
        this.Padding = options.elementPadding || this.Padding;
        this.Spacing = options.elementSpacing || this.Spacing;
        this.ElementWidth =
            (this.Width - this.Spacing * this.ElementCount) / this.ElementCount;
        this.ElementHeight = this.Height - this.Padding * 2;
    }
    DisplayText(value) {
        // Set the display patterns and draw the canvas
        this.ElementArray.SetText(value, CharacterMasks);
        this.CalcPoints();
        this.Draw(this.Canvas, this.ElementArray.Elements);
    }
    CalcElementDimensions() {
        const n = this.ElementCount;
        let h = this.ElementHeight;
        h -= this.Padding * 2;
        let w = this.Width;
        w -= this.Spacing * (n - 1);
        w -= this.Padding * 2;
        w /= n;
        return { Width: w, Height: h };
    }
    FlipVertical(points, height) {
        const flipped = [];
        for (let i = 0; i < points.length; i++) {
            flipped[i] = {
                x: points[i].x,
                y: height - points[i].y
            };
        }
        return flipped;
    }
    FlipHorizontal(points, width) {
        const flipped = [];
        for (let i = 0; i < points.length; i++) {
            flipped[i] = {
                x: width - points[i].x,
                y: points[i].y
            };
        }
        return flipped;
    }
    Draw(context, elements) {
        // Get the context and clear the area
        context.clearRect(this.X, this.Y, this.Width, this.Height);
        context.save();
        // Calculate the width and spacing of each element
        const elementWidth = this.CalcElementDimensions().Width;
        // Offset to adjust for starting point and padding
        context.translate(this.X, this.Y);
        context.translate(this.Padding, this.Padding);
        // Draw each segment of each element
        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            for (let s = 0; s < this.Points.length; s++) {
                // Pick the on or off color based on the bitmask
                const color = element & (1 << s) ? this.FillLight : this.FillDark;
                const stroke = element & (1 << s) ? this.StrokeLight : this.StrokeDark;
                if (stroke == this.StrokeDark)
                    continue;
                context.lineWidth = this.StrokeWidth;
                context.strokeStyle = stroke;
                context.fillStyle = color;
                context.moveTo(0, 0);
                context.beginPath();
                context.moveTo(this.Points[s][0].x, this.Points[s][0].y);
                // Create the segment path
                let maxX = 0;
                for (let p = 1; p < this.Points[s].length; p++) {
                    if (this.Points[s][p].x > maxX) {
                        maxX = this.Points[s][p].x;
                    }
                    context.lineTo(Math.round(this.Points[s][p].x), Math.round(this.Points[s][p].y));
                }
                context.closePath();
                context.fill();
                context.stroke();
                if (this.StrokeWidth > 0) {
                    context.stroke();
                }
            }
            context.translate(elementWidth + this.Spacing, 0);
        }
        context.restore();
    }
    CalcPoints() {
        const w = this.ElementWidth;
        const h = this.ElementHeight;
        const sw = this.SegmentWidth * w;
        const si = this.SegmentInterval * w;
        const bw = this.BevelWidth * sw;
        const ib = this.SideBevelEnabled ? 1 : 0;
        const sf = sw * 0.8;
        const slope = h / w;
        const sqrt2 = Math.SQRT2;
        const sqrt3 = Math.sqrt(3);
        // Base position of points w/out bevel and interval
        const w0 = w / 2 - sw / 2;
        const h0 = 0;
        const w1 = w / 2;
        const h1 = sw / 2;
        const w2 = w / 2 + sw / 2;
        const h2 = sw;
        const w3 = w - sw;
        const h3 = h / 2 - sw / 2;
        const w4 = w - sw / 2;
        const h4 = h / 2;
        const w5 = w;
        const h5 = h / 2 + sw / 2;
        // Order of segments stored in Points[][]
        const A1 = 0, A2 = 1, B = 2, C = 3, D1 = 4, D2 = 5, E = 6, F = 7, G1 = 8, G2 = 9, H = 10, I = 11, J = 12, K = 13, L = 14, M = 15;
        // Create the points array for all segments
        const points = [];
        points[A1] = [
            { x: bw * 2 + si / sqrt2, y: h0 },
            { x: w1 - si / 2 - (sw / 2) * ib, y: h0 },
            { x: w1 - si / 2, y: h1 },
            { x: w0 - si / 2, y: h2 },
            { x: sw + si / sqrt2, y: h2 },
            { x: bw + si / sqrt2, y: h0 + bw }
        ];
        points[G2] = [
            { x: w2 + si / sqrt2, y: h3 },
            { x: w3 - (si / 2) * sqrt3, y: h3 },
            { x: w4 - (si / 2) * sqrt3, y: h4 },
            { x: w3 - (si / 2) * sqrt3, y: h5 },
            { x: w2 + si / sqrt2, y: h5 },
            { x: w1 + si / sqrt2, y: h4 }
        ];
        points[B] = [
            { x: w5, y: h0 + bw * 2 + si / sqrt2 },
            { x: w5, y: h4 - si / 2 - (sw / 2) * ib },
            { x: w4, y: h4 - si / 2 },
            { x: w3, y: h3 - si / 2 },
            { x: w3, y: h2 + si / sqrt2 },
            { x: w5 - bw, y: h0 + bw + si / sqrt2 }
        ];
        points[I] = [
            { x: w2, y: h2 + (si / 2) * sqrt3 },
            { x: w2, y: h3 - si / sqrt2 },
            { x: w1, y: h4 - si / sqrt2 },
            { x: w0, y: h3 - si / sqrt2 },
            { x: w0, y: h2 + (si / 2) * sqrt3 },
            { x: w1, y: h1 + (si / 2) * sqrt3 }
        ];
        points[H] = [
            { x: (sw + sf) / slope + si, y: h2 + si },
            { x: w0 - si, y: w0 * slope - sf - si },
            { x: w0 - si, y: h3 - si },
            { x: (h3 - sf) / slope - si, y: h3 - si },
            { x: sw + si, y: h2 * slope + sf + si },
            { x: sw + si, y: h2 + si }
        ];
        points[A2] = this.FlipHorizontal(points[A1], w);
        points[C] = this.FlipVertical(points[2], h);
        points[D1] = this.FlipVertical(points[0], h);
        points[D2] = this.FlipHorizontal(points[4], w);
        points[E] = this.FlipHorizontal(points[3], w);
        points[F] = this.FlipHorizontal(points[2], w);
        points[G1] = this.FlipHorizontal(points[9], w);
        points[J] = this.FlipHorizontal(points[10], w);
        points[K] = this.FlipVertical(points[12], h);
        points[L] = this.FlipVertical(points[11], h);
        points[M] = this.FlipVertical(points[10], h);
        this.Points = points;
    }
}
/**
 * Character Masks
 * Maps characters to sixteen-segment bitmasks
 */
const CharacterMasks = (function () {
    // Segment Bitmasks for individual segments.
    // Binary Or them together to create bitmasks
    // a1|a2|b|c|d1|d2|e|f|g1|g2|h|i|j|k|l|m
    const a1 = 1 << 0, a2 = 1 << 1, b = 1 << 2, c = 1 << 3, d1 = 1 << 4, d2 = 1 << 5, e = 1 << 6, f = 1 << 7, g1 = 1 << 8, g2 = 1 << 9, h = 1 << 10, i = 1 << 11, j = 1 << 12, k = 1 << 13, l = 1 << 14, m = 1 << 15;
    // Character map associates characters with a bit pattern
    return {
        ' ': 0,
        '': 0,
        '0': a1 | a2 | b | c | d1 | d2 | e | f | j | m,
        '1': b | c | j,
        '2': a1 | a2 | b | d1 | d2 | e | g1 | g2,
        '3': a1 | a2 | b | c | d1 | d2 | g2,
        '4': b | c | f | g1 | g2,
        '5': a1 | a2 | c | d1 | d2 | f | g1 | g2,
        '6': a1 | a2 | c | d1 | d2 | e | f | g1 | g2,
        '7': a1 | a2 | b | c,
        '8': a1 | a2 | b | c | d1 | d2 | e | f | g1 | g2,
        '9': a1 | a2 | b | c | f | g1 | g2,
        A: e | f | a1 | a2 | b | c | g1 | g2,
        B: a1 | a2 | b | c | d1 | d2 | g2 | i | l,
        C: a1 | a2 | f | e | d1 | d2,
        D: a1 | a2 | b | c | d1 | d2 | i | l,
        E: a1 | a2 | f | e | d1 | d2 | g1 | g2,
        F: a1 | a2 | e | f | g1,
        G: a1 | a2 | c | d1 | d2 | e | f | g2,
        H: b | c | e | f | g1 | g2,
        I: a1 | a2 | d1 | d2 | i | l,
        J: b | c | d1 | d2 | e,
        K: e | f | g1 | j | k,
        L: d1 | d2 | e | f,
        M: b | c | e | f | h | j,
        N: b | c | e | f | h | k,
        O: a1 | a2 | b | c | d1 | d2 | e | f,
        P: a1 | a2 | b | e | f | g1 | g2,
        Q: a1 | a2 | b | c | d1 | d2 | e | f | k,
        R: a1 | a2 | b | e | f | g1 | g2 | k,
        S: a1 | a2 | c | d1 | d2 | f | g1 | g2,
        T: a1 | a2 | i | l,
        U: b | c | d1 | d2 | e | f,
        V: e | f | j | m,
        W: b | c | e | f | k | m,
        X: h | j | k | m,
        Y: b | f | g1 | g2 | l,
        Z: a1 | a2 | d1 | d2 | j | m,
        '-': g1 | g2,
        '?': a1 | a2 | b | g2 | l,
        '+': g1 | g2 | i | l,
        '*': g1 | g2 | h | i | j | k | l | m
    };
})();
/**
 * Factory function
 */
export function lcd(options = {}) {
    return new LCD(options);
}
