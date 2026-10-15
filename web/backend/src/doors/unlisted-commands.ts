/**
 * Registered commands that are the board's own machinery, not something a
 * caller picks from a list.
 *
 * MENU is the main menu door and MENUSETTINGS is its settings screen: both
 * are real BBSCmd registrations (so typing them runs them), but a caller
 * browsing DOORS or the menu catalogue has no use for them. The DOORS list and
 * the menu catalogue used to carry separate rules - the catalogue hid them,
 * the DOORS list did not. This is the one rule both read.
 *
 * Hiding is a LISTING rule only. The registry (getDoors / commandCache) still
 * holds these commands, so typed dispatch is untouched.
 */
export const MENU_SHELL_COMMANDS: ReadonlySet<string> = new Set(['MENU', 'MENUSETTINGS']);

/** True when a caller-facing list may show this registration. */
export function isListedDoor(door: { command?: string; id?: string } | string): boolean {
  const name = typeof door === 'string' ? door : (door.command ?? door.id ?? '');
  return !MENU_SHELL_COMMANDS.has(name.toUpperCase());
}
