"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reactionGlyph = reactionGlyph;
exports.reactionPickerLabel = reactionPickerLabel;
exports.reactionRowTexts = reactionRowTexts;
exports.textIndent = textIndent;
exports.withReactionRows = withReactionRows;
exports.formatReactionCounts = formatReactionCounts;
/**
 * Reaction glyphs, the picker labels and the rows that sit under a message.
 *
 * Same layout as LIVECHAT68 (livechat_ui.c lc_react_rows), spec
 * thoughts/shared/plans/2026-11-08-livechat-reactions-spec.md:
 * `glyph count` items two spaces apart, wrapping at the log width, indented to
 * the message text, capped at half the width, no row when nothing has a count.
 *
 * Every glyph is a text face for every caller: the sysop wants text smileys,
 * never graphical emoji ("the smileys in the chat got graphical, they should
 * be text smileys", 2026-11-08).
 */
const reaction_types_1 = require("../types/reaction.types");
const reaction_store_1 = require("./reaction-store");
/** The glyph for a reaction name; an unknown name shows as itself. */
function reactionGlyph(name) {
    return reaction_types_1.EMOJI_DISPLAY[name] ?? name;
}
/** Picker line: glyph padded to 3, a space, the word (`:)  Thumbs Up`). */
function reactionPickerLabel(i) {
    const name = reaction_types_1.REACTION_EMOJIS[i];
    const g = reactionGlyph(name);
    return g + ' '.repeat(Math.max(0, 3 - g.length)) + ' ' + reaction_types_1.REACTION_WORDS[i];
}
/**
 * The rows for one message: [] when no reaction has a count, else one string
 * per row, each already indented. Rows are plain text (no colour tags).
 */
function reactionRowTexts(counts, indent, width) {
    const pad = Math.max(0, Math.min(indent, Math.floor(width / 2)));
    const rows = [];
    let row = '';
    let col = 0;
    for (const [name, n] of Object.entries(counts)) {
        if (!(n > 0))
            continue;
        const glyph = reactionGlyph(name);
        const item = `${glyph} ${n}`;
        const len = glyph.length + 1 + String(n).length;
        if (row !== '' && col + 2 + len <= width) {
            row += '  ' + item;
            col += 2 + len;
        }
        else {
            if (row !== '')
                rows.push(row);
            row = ' '.repeat(pad) + item;
            col = pad + len;
        }
    }
    if (row !== '')
        rows.push(row);
    return rows;
}
/** Columns before the message text: `[time] <nick> ` read off the first painted row. */
function textIndent(firstRow) {
    const visible = firstRow.replace(/\{[^}]*\}/g, '');
    const m = /^(\[[^\]]*\] )?(<[^>]*> )?/.exec(visible);
    return m ? m[0].length : 0;
}
/**
 * The log as painted: every message row, with its reaction rows after the
 * message's last row. Reaction rows carry the message id, so a click on one
 * names its message, and every consumer that counts rows (scroll, the message
 * picker, right-click) reads this one list.
 */
function withReactionRows(raw, rendered, ids, width, accent) {
    const out = { raw: [], rendered: [], ids: [], at: [] };
    let first = 0;
    for (let i = 0; i < raw.length; i++) {
        out.at.push(out.raw.length);
        out.raw.push(raw[i]);
        out.rendered.push(rendered[i]);
        out.ids.push(ids[i]);
        const id = ids[i];
        if (id == null) {
            first = i + 1;
            continue;
        }
        if (ids[i + 1] === id)
            continue;
        for (const r of reactionRowTexts((0, reaction_store_1.getReactionCounts)(id), textIndent(raw[first]), width)) {
            const tagged = `{${accent}-fg}${r}{/${accent}-fg}`;
            out.raw.push(tagged);
            out.rendered.push(tagged);
            out.ids.push(id);
        }
        first = i + 1;
    }
    return out;
}
/** ` [<3 2] [:) 1]` one-line form for the /reactions answer; empty when none. */
function formatReactionCounts(messageId) {
    const entries = Object.entries((0, reaction_store_1.getReactionCounts)(messageId));
    if (entries.length === 0)
        return '';
    return ' ' + entries.map(([emoji, n]) => `[${reactionGlyph(emoji)} ${n}]`).join(' ');
}
