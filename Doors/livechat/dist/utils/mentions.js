"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMentions = extractMentions;
exports.mentionsUser = mentionsUser;
exports.hasBroadcastMention = hasBroadcastMention;
exports.highlightMentions = highlightMentions;
exports.getMentionedUsers = getMentionedUsers;
/** Extract mentions from text */
function extractMentions(text) {
    const mentions = [];
    const regex = /@(\w+)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const name = match[1].toLowerCase();
        let type = 'user';
        if (name === 'everyone')
            type = 'everyone';
        else if (name === 'here')
            type = 'here';
        mentions.push({
            type,
            username: type === 'user' ? match[1] : undefined,
            start: match.index,
            end: match.index + match[0].length
        });
    }
    return mentions;
}
/** Check if text mentions a specific user */
function mentionsUser(text, username) {
    const lower = text.toLowerCase();
    return lower.includes(`@${username.toLowerCase()}`);
}
/** Check if text has @everyone or @here */
function hasBroadcastMention(text) {
    const lower = text.toLowerCase();
    return lower.includes('@everyone') || lower.includes('@here');
}
/** Highlight mentions for display */
function highlightMentions(text, currentUser) {
    return text.replace(/@(\w+)/g, (match, name) => {
        const lower = name.toLowerCase();
        if (lower === currentUser.toLowerCase()) {
            // Use specific closing tags to avoid resetting ALL attributes
            return `{yellow-bg}{black-fg}@${name}{/black-fg}{/yellow-bg}`;
        }
        if (lower === 'everyone' || lower === 'here') {
            return `{red-fg}@${name}{/red-fg}`;
        }
        return `{cyan-fg}@${name}{/cyan-fg}`;
    });
}
/** Get list of mentioned usernames */
function getMentionedUsers(text) {
    const mentions = extractMentions(text);
    return mentions
        .filter(m => m.type === 'user' && m.username)
        .map(m => m.username);
}
