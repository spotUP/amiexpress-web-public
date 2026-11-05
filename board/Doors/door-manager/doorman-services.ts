/**
 * The backend services DOORMAN borrows from the process that hosts it.
 *
 * A door cannot import web/backend source paths, so each getter finds the
 * module in require.cache by name and answers null when this process does
 * not have it loaded. Split out of app.ts at the 2000-line ceiling; imports
 * nothing from app.ts, so any view can use it.
 */

import * as path from 'path';
import { resolveBbsRoot } from './ViewManager';
import type { DoorInstallEntry } from './install-core';
import type { LocalCatalogLookup, LocalCatalogRow } from './repoDataSource';

const PROJECT_ROOT = resolveBbsRoot(__dirname);

export function getCatalogSvc(): any {
  for (const k of Object.keys(require.cache))
    if (k.includes('door-catalog.service')) return require.cache[k]?.exports ?? null;
  return null;
}
export function getInstallsRepo(): any {
  // Same require.cache discovery as getCatalogSvc -- door_installs is the
  // single source of truth for what THIS node has installed.
  for (const k of Object.keys(require.cache))
    if (k.includes('door-installs.repository')) return require.cache[k]?.exports ?? null;
  return null;
}

/** The backend's install recorder, if this process has it loaded. Same
 *  require.cache discovery as getInstallsRepo(): DOORMAN cannot import
 *  web/backend source paths. recordDoorInstall writes BOTH halves of an
 *  install -- the door_installs link (what getInstallsRepo().recordInstall
 *  used to write alone) and door_installed_files (the on-disk file list a
 *  delete needs) -- so both install call sites route through this instead
 *  of getInstallsRepo() directly. */
export function getInstallRecorder(): any {
  for (const k of Object.keys(require.cache))
    if (k.includes('door-install-record')) return require.cache[k]?.exports ?? null;
  return null;
}

// Shared by both install call sites below: builds the recordDoorInstall
// input from a fully-populated DoorInstallEntry (consumer mode already has
// one; owner mode's inline callback builds an equivalent shape inline).
// No-op + warning, not a throw, when the recorder is unavailable in this
// process.
// Same require.cache discovery, for the counterpart of recordInstallViaRecorder
// below: uninstall must clear door_installed_files alongside door_installs, or
// a stale row survives naming the OLD door's files under a command a later
// install reuses -- a delete could then act on the wrong door's file list.
export function clearInstalledFilesViaRecorder(command: string | null | undefined): void {
  if (!command) return;
  const recorder = getInstallRecorder();
  if (!recorder) {
    console.log('[DOORMAN] warning: install recorder unavailable -- installed-file rows not cleared');
    return;
  }
  recorder.clearInstalledFiles(command);
}

export function recordInstallViaRecorder(entry: DoorInstallEntry): void {
  const recorder = getInstallRecorder();
  if (!recorder) {
    console.log('[DOORMAN] warning: install recorder unavailable -- install not recorded locally');
    return;
  }
  recorder.recordDoorInstall({
    bbsRoot: PROJECT_ROOT,
    command: entry.command,
    archiveName: entry.archive_name,
    installDir: path.join(PROJECT_ROOT, entry.install_dir),
    infoPath: path.join(PROJECT_ROOT, 'Commands', 'BBSCmd', `${entry.command}.info`),
    extraFiles: entry.extra_files,
    metadata: {
      catalogId: entry.catalog_id,
      name: entry.name,
      description: entry.description,
      category: entry.category,
      version: entry.version,
      releaseGroup: entry.release_group,
      md5: entry.md5,
      doorType: entry.door_type,
      sourceUrl: entry.source_url,
      sourceRevision: entry.source_revision,
    },
  });
}

export function getStripLib(): any {
  for (const k of Object.keys(require.cache))
    if (k.includes('ami-stripper.lib')) return require.cache[k]?.exports ?? null;
  return null;
}

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
export function buildLocalCatalogLookup(svc: any = getCatalogSvc()): LocalCatalogLookup {
  const toRow = (row: any): LocalCatalogRow => ({
    id: row.id,
    installed: row.installed,
    installed_as: row.installed_as ?? null,
    install_dir: row.install_dir ?? null,
    binary_name: row.binary_name ?? null,
    archive_path: row.archive_path ?? null,
  });

  let index: Map<string, LocalCatalogRow> | null = null;
  try {
    if (typeof svc?.listCatalogArchiveIndex === 'function') {
      index = new Map(
        (svc.listCatalogArchiveIndex() as any[]).map((row) => [String(row.archive_name).toLowerCase(), toRow(row)])
      );
    }
  } catch {
    index = null;
  }

  return (archiveName: string): LocalCatalogRow | null => {
    if (index) return index.get(archiveName.toLowerCase()) ?? null;
    try {
      const row = svc?.getCatalogEntryByArchive?.(archiveName);
      return row ? toRow(row) : null;
    } catch {
      return null;
    }
  };
}

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
export function repoTextFor(
  command: string,
  installs: any = getInstallsRepo(),
  catalog: any = getCatalogSvc(),
): { description: string | null; fileIdDiz: string | null } {
  let description: string | null = null;
  let fileIdDiz: string | null = null;
  try {
    const install = installs?.getInstallByCommand?.(command);
    if (install?.archive_name) {
      const row = catalog?.getCatalogEntryByArchive?.(install.archive_name);
      description = row?.description ?? install.description ?? null;
      fileIdDiz = row?.file_id_diz ?? null;
    }
    if (!fileIdDiz) {
      const legacy = catalog?.getCatalogEntryByCmd?.(command);
      fileIdDiz = legacy?.file_id_diz ?? null;
      description = description ?? legacy?.description ?? null;
    }
  } catch { /* catalog and install record are optional */ }
  return { description: description || null, fileIdDiz: fileIdDiz || null };
}
