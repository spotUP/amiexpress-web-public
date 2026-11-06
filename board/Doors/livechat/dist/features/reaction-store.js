"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setReactionCounts = setReactionCounts;
exports.getReactionCounts = getReactionCounts;
exports.seedReactionCounts = seedReactionCounts;
exports.clearReactionCounts = clearReactionCounts;
exports.formatReactionCounts = formatReactionCounts;
/**
 * Reaction counts per message id.
 *
 * The backend stores reactions with the message and broadcasts the full
 * per-emoji counts of a message on every change (`chat:reaction`), and
 * attaches them to every history item of `room:joined`. This module is the
 * door's one copy of those counts; the renderer reads `formatReactionCounts`.
 */
const reaction_types_1 = require("../types/reaction.types");
const counts = new Map();
/** Replace the counts of one message. An empty map clears it. */
function setReactionCounts(messageId, next) {
    const id = String(messageId);
    const clean = {};
    for (const [emoji, n] of Object.entries(next ?? {})) {
        if (Number.isFinite(n) && n > 0)
            clean[emoji] = n;
    }
    if (Object.keys(clean).length === 0)
        counts.delete(id);
    else
        counts.set(id, clean);
}
function getReactionCounts(messageId) {
    return counts.get(String(messageId)) ?? {};
}
/** Seed from a `room:joined` history array: items are `{ id, reactions? }`. */
function seedReactionCounts(history) {
    for (const m of history) {
        if (m?.id !== undefined && m.id !== null)
            setReactionCounts(m.id, m.reactions);
    }
}
function clearReactionCounts() {
    counts.clear();
}
/** ` [<3 2] [[+] 1]` style suffix for a message line; empty when none. */
function formatReactionCounts(messageId) {
    const entries = Object.entries(getReactionCounts(messageId));
    if (entries.length === 0)
        return '';
    return ' ' + entries.map(([emoji, n]) => `[${reaction_types_1.EMOJI_DISPLAY[emoji] ?? emoji} ${n}]`).join(' ');
}
