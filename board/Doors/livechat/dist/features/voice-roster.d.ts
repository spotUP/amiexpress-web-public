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
export interface VoiceParticipantEntry {
    userId: number | string;
    username: string;
    isSpeaking: boolean;
}
export interface VoiceChannelRoster {
    id: string;
    name: string;
    participants: VoiceParticipantEntry[];
}
/** Display name for a channel id, matching what the sidebar shows. */
export declare function channelDisplayName(channelId: string): string;
/**
 * Build a roster from the server's join reply.
 *
 * The reply lists everybody who was ALREADY there, so we are missing from
 * it - and a channel you are in that does not include you reads as empty
 * the moment you are the only one in it.
 */
export declare function seedRoster(channelId: string, participants: Array<{
    userId: number | string;
    username?: string;
}> | undefined, self: {
    userId: number | string;
    username: string;
}): VoiceChannelRoster;
/** Add somebody, ignoring a repeat announcement of a user already listed. */
export declare function addParticipant(roster: VoiceChannelRoster, user: {
    userId: number | string;
    username?: string;
}): boolean;
/** Remove somebody. Returns whether anything actually changed. */
export declare function removeParticipant(roster: VoiceChannelRoster, userId: number | string): boolean;
/**
 * Mark a user speaking or silent across every channel we know about.
 *
 * Returns whether anything changed, so a status arriving twenty times a
 * second only redraws the sidebar when the state actually flips.
 */
export declare function setSpeaking(rosters: Iterable<VoiceChannelRoster>, userId: number | string, isSpeaking: boolean): boolean;
