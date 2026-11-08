"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setReactionCounts = setReactionCounts;
exports.getReactionCounts = getReactionCounts;
exports.seedReactionCounts = seedReactionCounts;
exports.clearReactionCounts = clearReactionCounts;
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
