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
 * RAM: - the volatile disk the emulator fakes on the host filesystem.
 *
 * `RAM_DIR` is the project's existing name for it (`src/utils/path-util.ts`
 * and `src/utils/bbs-paths.util.ts` have read it for as long as they have
 * existed); the emulator hard-coded `/tmp/ram` instead, which made RAM: - and
 * therefore ENV: - one directory shared by every process on the machine. That
 * is a real collision now that each jest worker gets its own board: a suite
 * booting the emulator copies ITS board's ENVARC: into the one global ENV:,
 * where the next door to start reads it as its own. Honouring the variable
 * the rest of the codebase already honours lets a test give itself both
 * halves of the environment. Unset - which is every production board - it is
 * the same `/tmp/ram` as before.
 */
export function amigaRamDir(): string {
  return process.env.RAM_DIR || '/tmp/ram';
}

/**
 * ENV: - the volatile half, under RAM:. Intentionally NOT persistent: node
 * status files (STATS@<n>, MODULE@<n>, JC_PWFAIL.<n>) live here and must not
 * survive a crash, or every node comes back reading as still occupied.
 */
export function amigaEnvDir(): string {
  return path.join(amigaRamDir(), 'ENV');
}

/**
 * ENVARC: - the archive half, on disk under the BBS root so it rides the
 * persistent data volume (`BBS_DATA_DIR=/app/data/bbs` on the live board).
 * The location mirrors AmigaOS: SYS: is `<bbsRoot>/System`, so the archive is
 * `<bbsRoot>/System/Prefs/Env-Archive`.
 */
export function amigaEnvArchiveDir(bbsRoot: string): string {
  return path.join(bbsRoot, 'System', 'Prefs', 'Env-Archive');
}
