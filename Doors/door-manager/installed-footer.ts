import { T } from './door-theme';
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
export function installedFooter(enabled: boolean, narrow = false): string {
  const en = enabled ? 'Dis' : 'En';
  // A 40-column footer holds about five hints. These are the five: run it,
  // read it, remove it, switch it off, leave. Upload/Files/doc/Strip/Tab
  // still work - they are just not advertised on a screen with no room.
  if (narrow) {
    return (
      `{center}{${T.warn}-fg}ENTER{/${T.warn}-fg}=Run {${T.warn}-fg}I{/${T.warn}-fg}=Info ` +
      `{${T.warn}-fg}D{/${T.warn}-fg}=Del {${T.warn}-fg}E{/${T.warn}-fg}=${en} ` +
      `{${T.warn}-fg}Q{/${T.warn}-fg}=Quit{/center}`
    );
  }
  return (
    `{center}{${T.warn}-fg}ENTER{/${T.warn}-fg}=Run {${T.warn}-fg}U{/${T.warn}-fg}pload ` +
    `{${T.warn}-fg}I{/${T.warn}-fg}nfo {${T.warn}-fg}F{/${T.warn}-fg}iles ` +
    `{${T.warn}-fg}D{/${T.warn}-fg}el {${T.warn}-fg}V{/${T.warn}-fg}iew doc {${T.warn}-fg}E{/${T.warn}-fg}=${en} ` +
    `{${T.warn}-fg}S{/${T.warn}-fg}trip {${T.warn}-fg}Tab{/${T.warn}-fg}=Repo {${T.warn}-fg}Q{/${T.warn}-fg}uit{/center}`
  );
}
