/**
 * The backend services DOORMAN borrows at runtime.
 *
 * A door cannot import web/backend source paths, so these reach into
 * `require.cache` for modules the host process has already loaded. Every one
 * of them answers null when the module is absent, because a door that cannot
 * find the catalogue must degrade rather than fail.
 *
 * Extracted from app.ts, which was at the 2000-line ceiling that
 * handoff.md flagged.
 */
import * as path from 'path';

import { resolveBbsRoot } from './ViewManager';
import type { DoorInstallEntry } from './install-core';

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
