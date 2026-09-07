/**
 * Doors that register themselves as USER SETTINGS, and so appear under `W`.
 *
 * "settings like this should live under W - can we make it possible for doors
 * to register under W?" (sysop, 2026-09-07). `W` is where a caller changes
 * what the board does for him; a door that exists to change one of those
 * things belongs in that list rather than hidden behind a command he has to
 * know the name of.
 *
 * A door registers by saying so in its own `Commands/BBSCmd/<CMD>.info`:
 *
 *   SETTINGS=YES                     put me in the W menu
 *   SETTINGS_LABEL=Screen artwork    what the row says (optional)
 *
 * with no label, the row is the door's DESCRIPTION, and failing that its
 * command name. Nothing here knows any door by name: the board reads the
 * .info files it already reads, and a door that stops declaring it simply
 * stops appearing.
 */

/** The shape this module needs of a registered door. Deliberately loose. */
export interface SettingsDoorShape {
  command?: string;
  name?: string;
  description?: string;
  accessLevel?: number;
  enabled?: boolean;
  toolTypes?: Record<string, string> | null;
}

export interface SettingsDoorEntry {
  /** The command the board would run. */
  command: string;
  /** What the W row says, in full English words. */
  label: string;
  /** The door itself, for the dispatcher. */
  door: SettingsDoorShape;
}

/** A tooltype's value, however the .info spelled the key. */
function toolType(door: SettingsDoorShape, key: string): string | undefined {
  const types = door.toolTypes;
  if (!types) return undefined;
  const found = Object.keys(types).find((k) => k.toUpperCase() === key);
  return found === undefined ? undefined : String(types[found] ?? '');
}

/**
 * A tooltype the .info sets to YES.
 *
 * A BOOLEAN TOOLTYPE CANNOT DEFAULT TO TRUE on this board - a key that is
 * absent means "not declared", and every existing .info is absent - so this
 * reads the positive only: a door is in the W menu when it says it is.
 */
function declaresSettings(door: SettingsDoorShape): boolean {
  const raw = toolType(door, 'SETTINGS');
  if (raw === undefined) return false;
  const value = raw.trim().toUpperCase();
  return value === '' || value === 'YES' || value === 'TRUE' || value === '1';
}

/** What the row says: the door's own label, its description, or its command. */
export function settingsLabelFor(door: SettingsDoorShape): string {
  const label = toolType(door, 'SETTINGS_LABEL');
  const chosen = (label ?? door.description ?? door.name ?? '').trim();
  // The command name is the last resort, and it is a COMMAND: upper case, as
  // the caller types it.
  return chosen === '' ? String(door.command ?? '').toUpperCase() : chosen;
}

/**
 * The settings doors this caller may open, in the order the menu lists them.
 *
 * Ordered by LABEL, so the list a caller reads is alphabetical and stays put
 * when a door is installed under a different command name. Access is the
 * door's own: a door he cannot open is not offered, rather than offered and
 * refused.
 */
export function settingsDoorsFor(
  doors: ReadonlyArray<SettingsDoorShape> | null | undefined,
  session: { user?: { secLevel?: number } | null } | null | undefined,
): SettingsDoorEntry[] {
  const level = session?.user?.secLevel ?? 0;
  return (doors ?? [])
    .filter((door) => door && door.enabled !== false && declaresSettings(door))
    .filter((door) => (door.accessLevel ?? 0) <= level)
    .map((door) => ({
      command: String(door.command ?? '').toUpperCase(),
      label: settingsLabelFor(door),
      door,
    }))
    .filter((entry) => entry.command !== '')
    .sort((a, b) => a.label.localeCompare(b.label) || a.command.localeCompare(b.command));
}
