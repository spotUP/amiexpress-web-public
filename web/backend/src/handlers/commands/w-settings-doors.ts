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
 *   SETTINGS_SECTION=Appearance      which group of rows (optional)
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
  /** Which group of W rows the door sits in: SETTINGS_SECTION, else Board settings. */
  section: string;
  /** The door's DESCRIPTION, trimmed; empty when it has none. */
  description: string;
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
 * A tooltype the .info sets to YES. Exported because the admin's Doors dialog
 * (config-app, alias @bbs/settings-doors) ticks its box from THIS function:
 * one parse, so a hand-written `SETTINGS=` is live on the board AND ticked.
 *
 * A BOOLEAN TOOLTYPE CANNOT DEFAULT TO TRUE on this board - a key that is
 * absent means "not declared", and every existing .info is absent - so this
 * reads the positive only: a door is in the W menu when it says it is.
 */
export function declaresSettings(door: SettingsDoorShape): boolean {
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

export const DEFAULT_SETTINGS_SECTION = 'Board settings';

/** Which section of W the door's row sits in: its own word, or Board settings. */
export function settingsSectionFor(door: SettingsDoorShape): string {
  const section = (toolType(door, 'SETTINGS_SECTION') ?? '').trim();
  return section === '' ? DEFAULT_SETTINGS_SECTION : section;
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
      section: settingsSectionFor(door),
      description: String(door.description ?? '').trim(),
      door,
    }))
    .filter((entry) => entry.command !== '')
    .sort((a, b) => a.label.localeCompare(b.label) || a.command.localeCompare(b.command));
}

/**
 * THE AUDIT, 2026-09-07 ("audit what other doors should have user settings
 * registered in W and register them").
 *
 * Every command on the board was read. Three qualified then, and the test is the
 * same for each: does it change what the BOARD does for this caller, and does
 * the change outlive the door?
 *
 *   SCREENTHEME  which set of the board's art he is shown
 *   THEME        the colours the doors are drawn with
 *   ACHIEVE      the account this board reports his achievements to, and
 *                whether his profile is public
 *
 * Everything else is a game, a chat, a viewer, a sysop tool, or one of the
 * batch-registered DayDream imports: none of them remembers anything about
 * the caller. One near miss, recorded so the question is not re-asked:
 *
 *   PROMPTCOMPLETE  a board-wide feature a door PROVIDES, not a per-caller
 *                   setting (sysop, 2026-10-14: still not one). FRIENDSONLY is
 *                   the same ruling. If either ever gains a per-caller on/off,
 *                   it belongs here.
 *
 * THEMEC - listed beside THEME since 2026-10-14: the sysop ruled that all
 * three theme pickers declare themselves. NOTIFY and COSYSOP joined with the
 * sections (Appearance, Communication, Board features).
 *
 * The board's own settings - font, transfer protocol, PETSCII palette, the
 * express.e fields - are built-in W rows and need no door.
 */
