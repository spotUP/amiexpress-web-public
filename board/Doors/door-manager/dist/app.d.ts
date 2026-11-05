/**
 * DOORMAN v2 — SysOp Door Management Tool
 * Rewritten around a ViewManager / view stack so each screen owns its
 * own key bindings and ESC always pops cleanly.
 */
export { buildDoorInfoContent, extractAndRegisterDoor, extractArchiveTo, findExtractedBinary, commandClaimedByOtherArchive, installConsumerDoor, } from './install-core';
export type { InstallDeps, InstallOutcome, DoorInstallEntry, ConsumerInstallDeps, ConsumerInstallOutcome, } from './install-core';
interface DoorSession {
    socket: any;
    user: any;
    bbsSession: any;
    bbs: any;
    params: string[];
}
export declare function resolveArchivePath(archivePath: string | null | undefined): string | null;
/** True when repo-curation actions (Strip on a repo copy, catalog-row
 * edits, archive delete) are permitted. Owner mode and disabled mode both
 * mean "local catalog only, full local control" (see repoDataSource.ts's
 * module doc grouping them under "local") -- consumer mode is the only mode
 * that does not own the catalog it's browsing. */
/**
 * Where the selection should land after a list is rebuilt.
 *
 * Actions that change the list used to send the cursor back to the top,
 * which loses the reader's place: delete row 400 of 3301 and you are back at
 * row 1 with no idea where you were. Keeping the INDEX (rather than the
 * entry) is what a user means by "stay where I am" here - after a delete the
 * row that moved up into that slot is the one under the cursor, which is
 * also the next thing they are likely to act on.
 *
 * Clamped because the list can shrink underneath the index: deleting the
 * last row leaves the old index one past the end.
 */
/**
 * Repo-view presentation helpers live in repo-view-helpers.ts (app.ts hit the
 * 2000-line ceiling). Re-exported so importers and tests do not care where
 * they moved to.
 */
export { wrapText, clampSelection, repoViewCurationAllowed, repoViewFooterParts, registerRepoViewActionKeys, entryHasDoc, renderFileLines, formatSuggestedTooltypes, type RepoViewHotkeyHandlers, } from './repo-view-helpers';
export declare function createApp(session: DoorSession): Promise<void>;
//# sourceMappingURL=app.d.ts.map