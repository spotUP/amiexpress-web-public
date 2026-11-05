"use strict";
/**
 * Who is in a voice channel, and who is talking.
 *
 * Voice looked broken for as long as the door has had it: you joined, the
 * sidebar kept saying `Voice (0)`, and nothing ever moved. The protocol was
 * fine - the roster behind the count simply was never filled in. The join
 * reply's participant list was thrown away, `voice:joined` looked up a
 * channel that had never been created, `voice:left` arrived without naming
 * a channel, and speaking status was ignored outright.
 *
 * Keeping the roster here, as plain data with plain functions, means the
 * arithmetic can be tested without a socket, a screen or a microphone -
 * and there is exactly one place where membership is decided.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.channelDisplayName = channelDisplayName;
exports.seedRoster = seedRoster;
exports.addParticipant = addParticipant;
exports.removeParticipant = removeParticipant;
exports.setSpeaking = setSpeaking;
/** Ids arrive as numbers from the database and strings over the wire. */
function sameUser(a, b) {
    return String(a) === String(b);
}
/** Display name for a channel id, matching what the sidebar shows. */
function channelDisplayName(channelId) {
    return channelId === 'default-voice' ? 'Voice' : channelId;
}
/**
 * Build a roster from the server's join reply.
 *
 * The reply lists everybody who was ALREADY there, so we are missing from
 * it - and a channel you are in that does not include you reads as empty
 * the moment you are the only one in it.
 */
function seedRoster(channelId, participants, self) {
    // Deduplicated: a repeated id in the server's list would otherwise show
    // up as a second copy of somebody, which is what an inflated count and a
    // spare empty video tile look like.
    const entries = [];
    for (const p of participants || []) {
        if (entries.some(e => sameUser(e.userId, p.userId)))
            continue;
        entries.push({
            userId: String(p.userId),
            username: p.username ?? String(p.userId),
            isSpeaking: false,
        });
    }
    if (!entries.some(p => sameUser(p.userId, self.userId))) {
        entries.push({ userId: String(self.userId), username: self.username, isSpeaking: false });
    }
    return { id: channelId, name: channelDisplayName(channelId), participants: entries };
}
/** Add somebody, ignoring a repeat announcement of a user already listed. */
function addParticipant(roster, user) {
    if (roster.participants.some(p => sameUser(p.userId, user.userId)))
        return false;
    roster.participants.push({
        userId: String(user.userId),
        username: user.username ?? String(user.userId),
        isSpeaking: false,
    });
    return true;
}
/** Remove somebody. Returns whether anything actually changed. */
function removeParticipant(roster, userId) {
    const before = roster.participants.length;
    roster.participants = roster.participants.filter(p => !sameUser(p.userId, userId));
    return roster.participants.length !== before;
}
/**
 * Mark a user speaking or silent across every channel we know about.
 *
 * Returns whether anything changed, so a status arriving twenty times a
 * second only redraws the sidebar when the state actually flips.
 */
function setSpeaking(rosters, userId, isSpeaking) {
    let changed = false;
    for (const roster of rosters) {
        for (const participant of roster.participants) {
            if (sameUser(participant.userId, userId) && participant.isSpeaking !== isSpeaking) {
                participant.isSpeaking = isSpeaking;
                changed = true;
            }
        }
    }
    return changed;
}
