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
//# sourceMappingURL=doorman-services.d.ts.map