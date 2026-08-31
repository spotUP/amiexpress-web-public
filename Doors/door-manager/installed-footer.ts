/**
 * The installed-doors footer.
 *
 * Presentation only, and out of app.ts because that file is at the project's
 * 2000-line ceiling and a key list is the least view-dependent thing in it.
 * Pure, so the key list can be asserted without a terminal.
 */

/**
 * @param enabled whether the SELECTED door is enabled; the E key offers the
 *                opposite of the current state, and reads wrong otherwise.
 */
export function installedFooter(enabled: boolean): string {
  const en = enabled ? 'Dis' : 'En';
  return (
    `{center}{yellow-fg}ENTER{/yellow-fg}=Run {yellow-fg}U{/yellow-fg}pload ` +
    `{yellow-fg}I{/yellow-fg}nfo {yellow-fg}F{/yellow-fg}iles ` +
    `{yellow-fg}D{/yellow-fg}el {yellow-fg}V{/yellow-fg}iew doc {yellow-fg}E{/yellow-fg}=${en} ` +
    `{yellow-fg}S{/yellow-fg}trip {yellow-fg}Tab{/yellow-fg}=Repo {yellow-fg}Q{/yellow-fg}uit{/center}`
  );
}
