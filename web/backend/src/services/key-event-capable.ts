/**
 * Which connections deliver key-down/key-up events, and which only characters.
 *
 * The browser client sends `key-down`/`key-up` socket events while a door is
 * in GAME MODE (socket-handlers.ts), which is how a door can tell a held key
 * from a tapped one. A telnet or SSH caller has no such channel: it sends
 * bytes, and nothing else, for ever.
 *
 * This is one line, in one place, because the answer decides whether the
 * character path may step aside - and getting it wrong costs a door every
 * keystroke from half its callers.
 */

export type ConnectionKind = 'web' | 'telnet' | 'ssh' | undefined;

/**
 * True when this session's client sends key events, so the character path can
 * safely stand down while a door is in game mode.
 *
 * Anything that is not a browser is treated as characters-only. That is the
 * SAFE default: a browser wrongly treated as characters-only would see input
 * twice at worst, but a telnet caller wrongly treated as key-event capable
 * sees nothing at all.
 */
export function deliversKeyEvents(session: { connectionType?: ConnectionKind }): boolean {
  return (session.connectionType ?? 'web') === 'web';
}
