/**
 * Where an uninstall is allowed to delete.
 *
 * On 2026-08-30 a sysop uninstalled doors on the live board and the WHOLE
 * Doors directory went, DOORMAN itself included. The uninstall did this:
 *
 *   const abs = path.join(PROJECT_ROOT, e.install_dir);
 *   if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
 *
 * with nothing checking what `install_dir` held. It is written as
 * `Doors/${command}`, so a row whose command was empty gives `Doors/`, and a
 * recursive force-delete of `<root>/Doors/` removes every door on the board.
 * A legacy row holding `Doors`, `.`, `..` or an absolute path does the same
 * or worse.
 *
 * This module is the only thing allowed to turn a stored `install_dir` into a
 * path a delete may touch. It answers with a path only when that path is a
 * real subdirectory of `<root>/Doors/` - never the Doors directory itself,
 * never above it, never outside the project.
 */
export interface ResolvedInstallDir {
    /** The absolute directory that may be removed. */
    path: string;
}
export interface RejectedInstallDir {
    /** Why the delete must not go ahead, in words a sysop can act on. */
    reason: string;
}
export type InstallDirDecision = ResolvedInstallDir | RejectedInstallDir;
export declare function isSafeToDelete(decision: InstallDirDecision): decision is ResolvedInstallDir;
/**
 * Resolve a stored `install_dir` to the directory an uninstall may delete.
 *
 * @param projectRoot absolute path to the BBS root
 * @param installDir  the value stored on the install record
 */
export declare function resolveDoorInstallDir(projectRoot: string, installDir: string | null | undefined): InstallDirDecision;
//# sourceMappingURL=safe-install-dir.d.ts.map