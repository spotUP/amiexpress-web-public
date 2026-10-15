"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fitWidth = fitWidth;
/** Never narrower than this, whatever the screen says. */
const FLOOR = 20;
function fitWidth(screen, preferred) {
    const columns = Number(screen?.width) || 80;
    return Math.min(preferred, Math.max(FLOOR, columns - 2));
}
