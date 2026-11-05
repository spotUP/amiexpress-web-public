import type { DoorInstallEntry } from './install-core';
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
//# sourceMappingURL=backend-services.d.ts.map