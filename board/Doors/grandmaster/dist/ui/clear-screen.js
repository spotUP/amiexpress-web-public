"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearScreen = clearScreen;
/**
 * Take everything off the screen before drawing the next one.
 *
 * `screen.children.forEach(child => child.destroy())` looks right and clears
 * HALF the screen: destroy() removes the child from the very array forEach is
 * walking, so every second element is skipped. Ten screens in this door opened
 * with that line, which is why a TetriNET panel was still on the glass behind
 * TETRIS ATTACK - at the columns an 80-column layout had put it, so what the
 * player saw was a broken 40-column layout: "tetris attack looks like it's 80
 * columns? layout broken" (2026-09-06).
 *
 * A copy of the list, then destroy. One line, one place, ten screens.
 */
function clearScreen(screen) {
    for (const child of [...screen.children]) {
        child?.destroy?.();
    }
}
//# sourceMappingURL=clear-screen.js.map