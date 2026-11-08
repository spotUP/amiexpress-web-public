import { T } from '../door-theme';
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
 * IGNORE AND BLOCK ARE ENFORCED AT THE SERVER (isServerEnforced): /ignore,
 * /unignore and the menu send chat:ignore / chat:unignore when a user moves
 * into or out of those levels, and the server stops delivering that user's
 * room lines and DMs. The list here is loaded from chat:ignore-list on open.
 * Mute alone stays local: it hides lines here but the server still delivers.
 *
 * Pure and separate from the socket handlers, so the filtering rules can be
 * tested without a chat running.
 */

export type MuteLevel = 'mute' | 'ignore' | 'block';

/** Who is muted, and how thoroughly. Keyed by lower-cased username. */
export type MuteList = Map<string, MuteLevel>;

export function createMuteList(): MuteList {
  return new Map();
}

/** Names are compared case-insensitively - "Bob" and "bob" are one person. */
function key(username: string): string {
  // A payload can arrive without a sender name - the live log caught
  // `chat:dm` throwing "Cannot read properties of undefined (reading
  // 'trim')" here, which aborted the handler and lost the message. A
  // nameless sender matches no entry; it must not take the handler down.
  return typeof username === 'string' ? username.trim().toLowerCase() : '';
}

/**
 * Set someone's level, or clear it by passing the level they already have.
 *
 * Toggling on the same level is how the menu unmutes: choosing Mute on
 * someone already muted is the only obvious way back.
 */
export function toggleMute(list: MuteList, username: string, level: MuteLevel): MuteLevel | null {
  const k = canonicalName(list, username);
  if (!k) return null;

  if (list.get(k) === level) {
    list.delete(k);
    return null;
  }
  list.set(k, level);
  return level;
}

/**
 * Federated names are `handle@BOARD`; a user types the bare handle. Return
 * the list's own spelling of the person: the exact key, else the one entry
 * whose bare handle matches (either side may carry the `@BOARD` suffix),
 * else the key as typed.
 */
export function canonicalName(list: MuteList, username: string): string {
  const k = key(username);
  if (!k || list.has(k)) return k;
  const bare = k.split('@')[0];
  for (const name of list.keys()) if (name.split('@')[0] === bare && (name.includes('@') !== k.includes('@') || name === k)) return name;
  return k;
}

export function muteLevel(list: MuteList, username: string): MuteLevel | null {
  return list.get(canonicalName(list, username)) ?? null;
}

/** Everyone held at exactly this level, sorted - what a bare /ignore lists. */
export function namesAtLevel(list: MuteList, level: MuteLevel): string[] {
  return [...list].filter(([, l]) => l === level).map(([name]) => name).sort();
}

/** Should a room message from this user be hidden? Every level hides those. */
export function hidesRoomMessages(list: MuteList, username: string): boolean {
  return muteLevel(list, username) !== null;
}

/**
 * Does the server stop this level's lines and DMs? Ignore and block do, so
 * crossing this line is what sends chat:ignore / chat:unignore. Block was
 * left out once and was weaker at the server than ignore.
 */
export function isServerEnforced(level: MuteLevel | null): boolean {
  return level === 'ignore' || level === 'block';
}

/** Should a direct message from this user be refused? Mute alone does not. */
export function hidesDirectMessages(list: MuteList, username: string): boolean {
  const level = muteLevel(list, username);
  return level === 'ignore' || level === 'block';
}

/**
 * Make the 'ignore' level equal the server's ignore list (the DB is the truth:
 * the backend enforces it). Mute and block entries are local and stay.
 */
export function applyServerIgnores(list: MuteList, names: unknown): void {
  for (const [name, level] of [...list]) if (level === 'ignore') list.delete(name);
  if (!Array.isArray(names)) return;
  for (const n of names) {
    const k = typeof n === 'string' ? key(n) : '';
    if (k) list.set(k, 'ignore');
  }
}

/** The list as something that can be written to prefs and read back. */
export function serializeMuteList(list: MuteList): Record<string, MuteLevel> {
  return Object.fromEntries(list);
}

export function deserializeMuteList(saved: unknown): MuteList {
  const list = createMuteList();
  if (!saved || typeof saved !== 'object') return list;

  for (const [name, level] of Object.entries(saved as Record<string, unknown>)) {
    if (level === 'mute' || level === 'ignore' || level === 'block') {
      list.set(key(name), level);
    }
  }
  return list;
}

/** What to tell the user, without overstating what actually happened. */
export function muteMessage(username: string, level: MuteLevel | null): string {
  if (level === null) return `{${T.accent}-fg}${username} is no longer hidden.{/${T.accent}-fg}`;
  if (level === 'mute') return `{${T.accent}-fg}Muted ${username} - their room messages are hidden.{/${T.accent}-fg}`;
  if (level === 'ignore') return `{${T.accent}-fg}Ignoring ${username} - their messages and DMs are hidden.{/${T.accent}-fg}`;
  // Deliberately not "they cannot contact you": nothing stops them sending.
  return `{${T.alert}-fg}Blocked ${username} for you - they are hidden everywhere, but the server does not yet stop them sending.{/${T.alert}-fg}`;
}

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
export function muteMenuLabels(list: MuteList, username: string): string[] {
  const level = muteLevel(list, username);

  return [
    level === 'mute' ? 'Unmute User' : 'Mute User',
    level === 'ignore' ? 'Unignore' : 'Ignore',
    level === 'block' ? 'Unblock' : 'Block',
  ];
}

/** Which mute level a menu label refers to, whether or not it inverts. */
export function muteLevelForLabel(label: string): MuteLevel | null {
  switch (label) {
    case 'Mute User':
    case 'Unmute User':
      return 'mute';
    case 'Ignore':
    case 'Unignore':
      return 'ignore';
    case 'Block':
    case 'Unblock':
      return 'block';
    default:
      return null;
  }
}
