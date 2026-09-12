"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wrapWords = wrapWords;
exports.buildTipFrame = buildTipFrame;
/**
 * Tip frame layout, pure: the rows for any screen width.
 *
 * Geometry comes from the caller (screen.width), never a constant: the
 * frame grows on wide screens and stacks borderless on the 40-column
 * tier. Tested in tests/layout.test.ts and pinned at 80.
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const catalog_1 = require("./catalog");
function wrapWords(text, width, maxLines) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const raw of words) {
        let word = raw;
        const next = line ? `${line} ${word}` : word;
        if (next.length > width) {
            if (line) {
                lines.push(line);
                line = '';
            }
            // A single word wider than the row is cut, never pushed past it:
            // the transducer would hard-wrap it mid-row on a C64.
            while (line.length === 0 && word.length > width) {
                lines.push(word.slice(0, width));
                word = word.slice(width);
            }
            line = word;
        }
        else {
            line = next;
        }
    }
    if (line)
        lines.push(line);
    return lines.slice(0, maxLines);
}
/**
 * Rows for this tip on a screen this wide. Inner text width is frame
 * minus borders and padding; on 40 columns the frame IS the screen
 * (minus padding) and the hint shortens to fit the cursor row.
 */
function buildTipFrame(tip, screenWidth) {
    const w = Math.max(40, screenWidth || 80);
    // Paint boundary: facts and manifests arrive as free text, and only
    // Amiga Latin-1 paints. Sanitize once here rather than in every picker.
    tip = { ...tip, title: (0, catalog_1.amigaSafe)(tip.title), body: (0, catalog_1.amigaSafe)(tip.body) };
    const compact = (0, blessed_1.getCompactProfile)(w);
    const bordered = compact.borders;
    // The SDK's own dialog curve: near-full-width on narrow screens, a
    // percentage on wide ones. Never a literal cap of ours.
    const frameWidth = bordered ? (0, blessed_1.calculateDialogWidth)(w) : w - compact.padding * 2;
    const inner = frameWidth - (bordered ? 2 + 2 * compact.padding : 0);
    const title = `Tip of the day - ${tip.title}`.slice(0, inner);
    const body = wrapWords(tip.body, inner, 3);
    const command = tip.command ? `Run ${tip.command} at the menu. ` : '';
    const longHint = `${command}Any key continues...`;
    const hint = longHint.length <= inner ? longHint : 'Any key...';
    const frameHeight = (bordered ? 2 : 0) + 1 + 1 + body.length + 1 + 1;
    return { frameWidth, frameHeight, bordered, innerWidth: inner, title, body, hint };
}
//# sourceMappingURL=layout.js.map