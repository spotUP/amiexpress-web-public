/**
 * env-paths.ts - the two halves of the AmigaOS environment, in one place.
 *
 * AmigaOS splits the environment in two and doors rely on the split:
 *
 *   ENV:    RAM:Env               volatile. Dies with the machine.
 *   ENVARC: SYS:Prefs/Env-Archive on disk. Survives a reboot.
 *
 * The Startup-Sequence runs `Copy ENVARC: ENV: ALL` at boot, so at runtime a
 * door sees one merged environment in ENV:. A door that wants a setting to
 * PERSIST writes it to both and reads ENV: back - that is what `SetEnv` +
 * `Copy ENV:x ENVARC:` does from the shell, and it is exactly what GWall's
 * saveSettings() does (`Documentation/7-Reference Sources/AmiXDoors-master/
 * Global Wall/gwall.e:1697`).
 *
 * We supplied only the volatile half. ENVARC: was not an assign at all, so
 * `Open('ENVARC:GWall.cfg', NEWFILE)` fell through PathManager's
 * unknown-volume fallback into the BBS root, and ENV: lives under /tmp, which
 * on the live board is the container's writable layer - gone on every
 * restart. Result: GWall's saved BBS acronym was thrown away at every deploy
 * and the door re-ran its "Enter the 3 digit code to use for your bbs" setup.
 *
 * Both paths belong together because the seeding step has to agree with the
 * assign; keep them here rather than re-deriving either at a call site.
 */
import * as path from 'path';

/**
 * ENV: - the volatile half, under the RAM: disk the emulator already fakes at
 * /tmp/ram. Intentionally NOT persistent: node status files (STATS@<n>,
 * MODULE@<n>, JC_PWFAIL.<n>) live here and must not survive a crash, or every
 * node comes back reading as still occupied.
 */
export const AMIGA_ENV_DIR = '/tmp/ram/ENV';

/**
 * ENVARC: - the archive half, on disk under the BBS root so it rides the
 * persistent data volume (`BBS_DATA_DIR=/app/data/bbs` on the live board).
 * The location mirrors AmigaOS: SYS: is `<bbsRoot>/System`, so the archive is
 * `<bbsRoot>/System/Prefs/Env-Archive`.
 */
export function amigaEnvArchiveDir(bbsRoot: string): string {
  return path.join(bbsRoot, 'System', 'Prefs', 'Env-Archive');
}
