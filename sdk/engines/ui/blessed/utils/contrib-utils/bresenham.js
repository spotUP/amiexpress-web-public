"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bresenham = bresenham;
function bresenham(x0, y0, x1, y1, fn) {
    const points = [];
    x0 = Math.floor(x0);
    y0 = Math.floor(y0);
    x1 = Math.floor(x1);
    y1 = Math.floor(y1);
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;
    while (true) {
        points.push({ x, y });
        if (fn) {
            fn(x, y);
        }
        if (x === x1 && y === y1) {
            break;
        }
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x += sx;
        }
        if (e2 < dx) {
            err += dx;
            y += sy;
        }
    }
    return points;
}
