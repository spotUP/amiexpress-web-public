/**
 * Who the user has muted or ignored.
 *
 * The context menu offered Mute, Ignore and Block, and all three printed a
 * confirmation and did nothing at all - "Muted bob: their messages will be
 * hidden" while bob's messages kept arriving. A moderation control that
 * claims to work and does not is worse than one that says it is missing,
 * because the user stops watching for the thing they asked to be rid of.
 *
 * Three levels, because they are genuinely different things:
 *
 *   mute    their room messages are hidden; DMs still arrive
 *   ignore  their DMs are refused too
 *   block   both, and the server is told (see the note below)
 *
 * BLOCK IS NOT ENFORCED AT THE SERVER YET. There is no block API to call, so
 * this hides them from you but does not stop them sending. The menu says so
 * rather than promising protection this cannot deliver.
 *
 * Pure and separate from the socket handlers, so the filtering rules can be
 * tested without a chat running.
 */
export type MuteLevel = 'mute' | 'ignore' | 'block';
/** Who is muted, and how thoroughly. Keyed by lower-cased username. */
export type MuteList = Map<string, MuteLevel>;
export declare function createMuteList(): MuteList;
/**
 * Set someone's level, or clear it by passing the level they already have.
 *
 * Toggling on the same level is how the menu unmutes: choosing Mute on
 * someone already muted is the only obvious way back.
 */
export declare function toggleMute(list: MuteList, username: string, level: MuteLevel): MuteLevel | null;
export declare function muteLevel(list: MuteList, username: string): MuteLevel | null;
/** Should a room message from this user be hidden? Every level hides those. */
export declare function hidesRoomMessages(list: MuteList, username: string): boolean;
/** Should a direct message from this user be refused? Mute alone does not. */
export declare function hidesDirectMessages(list: MuteList, username: string): boolean;
/** The list as something that can be written to prefs and read back. */
export declare function serializeMuteList(list: MuteList): Record<string, MuteLevel>;
export declare function deserializeMuteList(saved: unknown): MuteList;
/** What to tell the user, without overstating what actually happened. */
export declare function muteMessage(username: string, level: MuteLevel | null): string;
/**
 * The labels the user context menu should show for one person.
 *
 * The menu used to list "Mute User", "Ignore" and "Block" from a fixed
 * array that never consulted this list. Muting worked - choosing the same
 * level again lifts it - but nothing on screen said so, so there was no way
 * to tell who was muted and the way back looked exactly like the way in.
 *
 * Only the level actually in force inverts: somebody who is ignored is not
 * also muted, so offering "Unmute" for them would be a lie.
 */
export declare function muteMenuLabels(list: MuteList, username: string): string[];
/** Which mute level a menu label refers to, whether or not it inverts. */
export declare function muteLevelForLabel(label: string): MuteLevel | null;
