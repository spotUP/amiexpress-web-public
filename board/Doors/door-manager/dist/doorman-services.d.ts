/**
 * The backend services DOORMAN borrows from the process that hosts it.
 *
 * A door cannot import web/backend source paths, so each getter finds the
 * module in require.cache by name and answers null when this process does
 * not have it loaded. Split out of app.ts at the 2000-line ceiling; imports
 * nothing from app.ts, so any view can use it.
 */
import type { DoorInstallEntry } from './install-core';
import type { LocalCatalogLookup } from './repoDataSource';
export declare function getCatalogSvc(): any;
export declare function getInstallsRepo(): any;
/** The backend's install recorder, if this process has it loaded. Same
 *  require.cache discovery as getInstallsRepo(): DOORMAN cannot import
 *  web/backend source paths. recordDoorInstall writes BOTH halves of an
 *  install -- the door_installs link (what getInstallsRepo().recordInstall
 *  used to write alone) and door_installed_files (the on-disk file list a
 *  delete needs) -- so both install call sites route through this instead
 *  of getInstallsRepo() directly. */
export declare function getInstallRecorder(): any;
export declare function clearInstalledFilesViaRecorder(command: string | null | undefined): void;
export declare function recordInstallViaRecorder(entry: DoorInstallEntry): void;
export declare function getStripLib(): any;
/**
 * The local catalog as a lookup by archive name, read ONCE.
 *
 * A consumer browse resolves every manifest row (5,690 on the live board)
 * against this. The service's per-archive getter opens a database connection
 * for each call - 13 ms, so over a minute of a frozen process before the list
 * ever drew. The whole index comes from one query into a Map; a service
 * without that query (an older backend) falls back to the per-archive getter,
 * and a missing service or a thrown read folds into "nothing known locally",
 * never a failed browse. Keys are lower-cased: archive names are NOCASE.
 */
export declare function buildLocalCatalogLookup(svc?: any): LocalCatalogLookup;
/**
 * An installed door's repo text - its description and FILE_ID.DIZ - found the
 * way the board records installs today.
 *
 * The installed view asked the catalog for a row whose `installed_as` was the
 * command, but installs are recorded in `door_installs` now (Task 5), not on
 * the catalog row, so a door installed since - SENT, from MST-FD11.LHA - found
 * nothing and showed no FILE_ID. The install record names the archive; the
 * catalog row for THAT archive has the text. The old `installed_as` match
 * stays as the fallback for installs made before the move. Nothing found is
 * nulls, never a throw: the panel is a view.
 */
export declare function repoTextFor(command: string, installs?: any, catalog?: any): {
    description: string | null;
    fileIdDiz: string | null;
};
//# sourceMappingURL=doorman-services.d.ts.map