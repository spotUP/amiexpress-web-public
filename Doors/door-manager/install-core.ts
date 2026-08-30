/**
 * The install core: turning an archive into an installed door.
 *
 * Extracted from app.ts, which had grown past the repo's 2000-line ceiling.
 * Nothing here touches the UI - it is the part of installing that both owner
 * mode and consumer mode share, and the part worth testing directly.
 *
 * installConsumerDoor and the command-collision guard moved here from app.ts
 * the second time it crossed that ceiling: consumer mode's orchestrator
 * belongs beside the extract/register core it delegates to, not in the file
 * that draws the panels. app.ts re-exports all of it, so its importers and
 * tests are unaffected.
 */

import * as fs from 'fs';
import * as path from 'path';
import { findArchiveCommand, isUsableCommand } from './archive-command';
import type { RepoClientConfig, FetchManifestResult, RepoDoorDetail } from './repo-client';
import type { DoorRepoManifest } from './repo-types.generated';
import type { LocalCatalogLookup } from './repoDataSource';

/**
 * The backend's shared archive extractor, if it is loaded in this process.
 *
 * DOORMAN cannot import web/backend source paths, so it reaches the
 * already-loaded module through require.cache - the same discovery the
 * catalog service and the stripper use.
 */
function getExtractorFactory(): any {
  for (const k of Object.keys(require.cache))
    if (k.includes('archive-extractor')) return require.cache[k]?.exports ?? null;
  return null;
}

/** Content of the .info-style command config written on install. Pure and
 * exported for testing: door_type must flow through as TYPE= (a FIM door
 * force-typed XIM at install time simply won't run under the FIM engine). */
export function buildDoorInfoContent(doorType: string, cmd: string, binaryRel: string): string {
  return `TYPE=${doorType}\nLOCATION=Doors:${cmd}/${binaryRel}\nSTACK=65536\nACCESS=0\n`;
}

/**
 * Extract every file in an archive into destDir, preserving the archive's
 * internal directory structure. Portable — uses the backend's shared
 * extractor factory (pure-JS LHA, WASM LZX, etc.) instead of the native
 * `lha` CLI, so it works the same on macOS dev machines and the Linux
 * container on the live server.
 */
export async function extractArchiveTo(
  archivePath: string, destDir: string
): Promise<{ ok: boolean; fileCount: number; error?: string }> {
  const factory = getExtractorFactory();
  if (!factory?.getExtractorForFile) {
    return { ok: false, fileCount: 0, error: 'Extractor unavailable in this process' };
  }
  let extractor: any;
  try {
    extractor = await factory.getExtractorForFile(archivePath);
  } catch (err: any) {
    return { ok: false, fileCount: 0, error: `Extractor init failed: ${err.message}` };
  }
  if (!extractor) return { ok: false, fileCount: 0, error: 'Unsupported archive format' };

  let entries: Array<{ name: string; size: number }>;
  try {
    entries = await extractor.getEntries(archivePath);
  } catch (err: any) {
    return { ok: false, fileCount: 0, error: `Could not read archive: ${err.message}` };
  }
  if (!entries.length) return { ok: false, fileCount: 0, error: 'Archive is empty or unreadable' };

  const destRoot = path.normalize(destDir + path.sep);
  let written = 0;
  for (const entry of entries) {
    if (!entry.name) continue;
    // The pure-JS LHA reader emits Amiga-style directory-separated names
    // with '\' (its "directory" extended header joins path segments with
    // 0xFF, which the parser renders as a literal backslash) — normalize
    // to '/' so path.join/dirname treat it as real subdirectories on every
    // OS instead of writing one file with a literal backslash in its name.
    const entryPath = entry.name.replace(/\\/g, '/');
    if (entryPath.endsWith('/')) continue; // directory marker, nothing to write
    let data: Buffer | null = null;
    try {
      data = await extractor.extractFile(archivePath, entry.name);
    } catch { /* skip unreadable member, keep going */ }
    if (!data) continue;
    const outPath = path.normalize(path.join(destDir, entryPath));
    if (!outPath.startsWith(destRoot)) continue; // zip-slip guard
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, data);
    written++;
  }
  return written > 0
    ? { ok: true, fileCount: written }
    : { ok: false, fileCount: 0, error: 'No files could be extracted' };
}

/**
 * Archives (especially FAME door packs) often nest the actual door binary
 * several directories deep (e.g. "add_2_fame/doors/5d/5d!sysop/5d!sysop").
 * The catalog only stores the binary's basename, so after extraction we
 * search the extracted tree for a case-insensitive match rather than
 * assuming it landed at the archive root. Returns a path relative to
 * destDir (posix-style, for use in an AmigaDOS LOCATION= line).
 */
export function findExtractedBinary(destDir: string, binaryName: string | null | undefined): string | null {
  if (!binaryName) return null;
  const target = binaryName.toLowerCase();
  const stack: string[] = [destDir];
  while (stack.length) {
    const dir = stack.pop() as string;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      if (e.name.toLowerCase() === target) {
        return path.relative(destDir, full).split(path.sep).join('/');
      }
    }
  }
  return null;
}

/**
 * Shared install core: extract an already-on-disk archive, write the .info
 * command config, register the install locally, and refresh the boot-time
 * door registry. Both owner mode (local archive already resolved via
 * resolveArchivePath) and consumer mode (archive downloaded from the
 * central repo into tmp-door-repo/, see installConsumerDoor below) funnel
 * through this exact function once they have a real archivePath — this is
 * the ONE place extractArchiveTo/findExtractedBinary/buildDoorInfoContent
 * get called from, so both modes stay byte-identical past this point. Pure
 * except for the injected deps (all real I/O), so it is directly testable
 * without a blessed Screen.
 */
export interface InstallDeps {
  extractArchiveTo: (archivePath: string, destDir: string) => Promise<{ ok: boolean; fileCount: number; error?: string }>;
  findExtractedBinary: (destDir: string, binaryName: string | null | undefined) => string | null;
  writeInfoFile: (infoPath: string, content: string) => void;
  /** Caller-supplied: encapsulates whatever "persist the install locally"
   * means for this mode -- both owner and consumer now record a row in
   * door_installs (Task 5); door_catalog no longer carries install state.
   * Errors are caught and logged here, exactly like the pre-Task-5 inline
   * behavior: a bookkeeping failure never rolls back a working on-disk
   * install. */
  /**
   * Persist the install.
   *
   * Takes the command and directory that were ACTUALLY used, which are not
   * always the ones the caller asked for: when the archive names its own
   * command the door is moved to it. A record written from the caller's
   * original guess would point at a directory that no longer exists - and an
   * install_dir that does not match reality is how an uninstall came to
   * delete the wrong thing.
   *
   * `archiveName` is the catalog key the caller resolved this install from
   * (the archive on disk in owner mode, the manifest row's archive in
   * consumer mode) -- passed through so the recorder can write the install
   * as a link to that archive rather than reconstructing a guess.
   */
  recordInstall: (command: string, installDirRelative: string, archiveName: string) => void;
  refreshDoorRegistry: () => Promise<boolean>;
}

/**
 * What the install did, step by step, for the panel the sysop watches.
 *
 * An install reported one line when it finished and nothing while it ran,
 * which is the other half of "show me a log in the right panel" - asked for
 * after an uninstall removed more than it should have.
 */
export interface InstallStep {
  kind: 'ok' | 'skip' | 'fail';
  text: string;
}

export type InstallOutcome =
  | { ok: true; doorType: string; fileCount: number; binaryRel: string; steps: InstallStep[] }
  | { ok: false; step: string; detail: string; steps: InstallStep[] };

/**
 * Move a freshly extracted door to the command the archive names.
 *
 * Returns the new directory, or null when the target already exists - an
 * existing install is never overwritten by a rename.
 */
function renameInstallDir(installDir: string, command: string): string | null {
  if (!isUsableCommand(command)) return null;
  const target = path.join(path.dirname(installDir), command);
  if (target === installDir) return installDir;
  if (fs.existsSync(target)) return null;
  try {
    fs.renameSync(installDir, target);
    return target;
  } catch {
    return null;
  }
}

export async function extractAndRegisterDoor(
  archivePath: string,
  installDir: string,
  infoPath: string,
  doorType: string,
  binaryName: string | null,
  finalCmd: string,
  deps: InstallDeps,
  archiveName: string
): Promise<InstallOutcome> {
  const steps: InstallStep[] = [];
  let command = finalCmd;
  let targetDir = installDir;
  let targetInfoPath = infoPath;

  const result = await deps.extractArchiveTo(archivePath, installDir);
  if (!result.ok) {
    steps.push({ kind: 'fail', text: `extract ${path.basename(archivePath)}: ${result.error ?? 'unknown error'}` });
    return { ok: false, step: 'extract', detail: result.error ?? 'unknown error', steps };
  }
  steps.push({ kind: 'ok', text: `extracted ${result.fileCount} files to ${installDir}` });

  // The archive names its own command. An AmiExpress door ships
  // Commands/BBSCmd/<COMMAND>.info, and that file carries the tooltypes the
  // door was built with - TYPE, LOCATION, STACK, PRIORITY, NAME. Asking the
  // sysop to type a command instead is how a door ends up installed under a
  // name it does not answer to, and writing a fresh four-line .info is how
  // STACK and PRIORITY get lost.
  const fromArchive = findArchiveCommand(installDir);
  if (fromArchive.chosen && fromArchive.chosen.command.toUpperCase() !== finalCmd.toUpperCase()) {
    const renamed = renameInstallDir(installDir, fromArchive.chosen.command);
    if (renamed) {
      steps.push({
        kind: 'ok',
        text: `the archive installs as ${fromArchive.chosen.command}, not ${finalCmd}`,
      });
      command = fromArchive.chosen.command;
      targetDir = renamed;
      targetInfoPath = path.join(path.dirname(infoPath), `${command}.info`);
    } else {
      steps.push({
        kind: 'skip',
        text: `archive names ${fromArchive.chosen.command}; kept ${finalCmd} (that directory already exists)`,
      });
    }
  }
  for (const other of fromArchive.others) {
    steps.push({ kind: 'skip', text: `archive also carries the command ${other}` });
  }

  const resolvedDoorType = doorType || 'XIM';
  const binaryRel = deps.findExtractedBinary(targetDir, binaryName) ?? (binaryName ?? command);
  steps.push({ kind: 'ok', text: `binary ${binaryRel}, type ${resolvedDoorType}` });

  try {
    // Prefer the archive's own icon: it is the door author's configuration,
    // tooltypes and all. Only fall back to a synthesised one when the
    // archive has none.
    const archiveInfo = fromArchive.chosen
      ? findArchiveCommand(targetDir).chosen ?? fromArchive.chosen
      : null;
    if (archiveInfo && fs.existsSync(archiveInfo.infoPath)) {
      fs.copyFileSync(archiveInfo.infoPath, targetInfoPath);
      steps.push({ kind: 'ok', text: `installed the archive's own ${command}.info` });
    } else {
      deps.writeInfoFile(targetInfoPath, buildDoorInfoContent(resolvedDoorType, command, binaryRel));
      steps.push({ kind: 'ok', text: `wrote ${targetInfoPath}` });
    }
  } catch (err: any) {
    steps.push({ kind: 'fail', text: `write ${targetInfoPath}: ${err?.message ?? err}` });
    return { ok: false, step: 'write-info', detail: `${targetInfoPath}: ${err?.message ?? err}`, steps };
  }

  try {
    deps.recordInstall(command, `Doors/${command}`, archiveName);
    steps.push({ kind: 'ok', text: `recorded the install as ${command}` });
  } catch (err: any) {
    steps.push({ kind: 'skip', text: `install record not written: ${err?.message ?? err}` });
    // The door is on disk and the .info is written — it will run. The
    // install just won't show as installed locally. Surface it but don't
    // roll back a working install over a bookkeeping error.
    console.log(`[DOORMAN] install failed: record-install: ${err?.message ?? err}`);
  }

  const refreshed = await deps.refreshDoorRegistry();
  if (refreshed) {
    steps.push({ kind: 'ok', text: 'door registry reloaded' });
  } else {
    steps.push({ kind: 'skip', text: 'registry refresh unavailable - the door is hidden until the BBS restarts' });
console.log('[DOORMAN] warning: door registry refresh unavailable — new door hidden until BBS restart');
  }

  return { ok: true, doorType: resolvedDoorType, fileCount: result.fileCount, binaryRel, steps };
}

// ─── Consumer-mode install (moved from app.ts) ─────────────────────────

// True when `command` is already claimed by a DIFFERENT archive -- guards
// both install call sites against recordInstall's ON CONFLICT(command)
// upsert silently stealing another install's row.
export function commandClaimedByOtherArchive(
  getInstallByCommand: (command: string) => { archive_name: string } | null,
  command: string,
  archiveName: string
): boolean {
  const collision = getInstallByCommand(command);
  if (!collision || collision.archive_name === archiveName) return false;
  console.log(
    `[DOORMAN] install: "${command}" already installed from a different archive ` +
    `(${collision.archive_name}) -- not clobbering it; ${archiveName} installs registry-only.`
  );
  return true;
}

/** Mirrors door_installs' columns (door-installs.repository.ts's
 * DoorInstall, read directly rather than imported -- DOORMAN cannot import
 * web/backend source paths; getInstallsRepo() above reaches the
 * already-loaded module via require.cache instead). `installed_at` is
 * stamped by the repository itself and is intentionally absent. */
export interface DoorInstallEntry {
  id: string; catalog_id: string | null; archive_name: string; command: string;
  install_dir: string; door_type: string | null; name: string | null; md5: string | null;
  description: string | null; category: string | null; version: string | null;
  release_group: string | null; source_url: string | null; source_revision: string | null;
}

/**
 * Consumer-mode install: download + verify the archive from the central
 * door-repo API, then hand off to extractAndRegisterDoor for the identical
 * extract/register flow owner mode already uses. destPath always lives
 * under tmp-door-repo/ and is removed in the finally on every path,
 * including every failure — downloadArchive already deletes it on a
 * network/checksum failure, but a failure further down (extract,
 * write-info) still leaves a successfully-downloaded archive sitting in
 * tmp-door-repo/ unless this cleans it up too.
 *
 * Local registration (Task 5): door_installs, not door_catalog, is the
 * install-state store -- no "invent a local catalog row" step. `lookupLocal`
 * still runs (door_catalog) purely to capture `catalog_id` for provenance
 * when a real local row exists; never required for the install to succeed.
 *
 * door_installs enforces uniqueness on `command` (ON CONFLICT(command)
 * upserts, so reinstalling is naturally idempotent) -- which is also why a
 * collision guard is still needed: installing a NEW archive under a command
 * some OTHER archive already owns would otherwise silently overwrite that
 * install's row. `getInstallByCommand(finalCmd)` checks for that and
 * refuses (registry-only, loudly logged) rather than clobbering -- the
 * backfill has shown this BBS has commands claimed by up to nine archives.
 */
export interface ConsumerInstallDeps {
  fetchManifest: (cfg: RepoClientConfig) => Promise<FetchManifestResult>;
  downloadArchive: (cfg: RepoClientConfig, archiveName: string, destPath: string, expectedSha256: string) => Promise<void>;
  extractArchiveTo: InstallDeps['extractArchiveTo'];
  findExtractedBinary: InstallDeps['findExtractedBinary'];
  writeInfoFile: InstallDeps['writeInfoFile'];
  lookupLocal: LocalCatalogLookup;
  /** Existence check ONLY -- detects a command collision before recording. */
  getInstallByCommand: (command: string) => { archive_name: string } | null;
  recordInstall: (entry: DoorInstallEntry) => void;
  refreshDoorRegistry: () => Promise<boolean>;
  mkdir: (dir: string) => void;
  unlink: (path: string) => void;
  /** Optional: the per-archive detail endpoint, for the one field the
   *  manifest genuinely does not carry (version). A failure here never
   *  fails the install -- the record is simply written without it, exactly
   *  as it was before this call existed. */
  fetchDoorDetail?: (cfg: RepoClientConfig, archiveName: string) => Promise<RepoDoorDetail | null>;
}

export type ConsumerInstallOutcome =
  | { ok: true; doorType: string; fileCount: number; binaryRel: string; steps: InstallStep[]; registeredLocally: boolean }
  | { ok: false; step: string; detail: string };

export async function installConsumerDoor(
  cfg: RepoClientConfig,
  archiveName: string,
  doorType: string,
  binaryName: string | null,
  finalCmd: string,
  installDir: string,
  infoPath: string,
  tmpDir: string,
  deps: ConsumerInstallDeps
): Promise<ConsumerInstallOutcome> {
  const destPath = path.join(tmpDir, archiveName);
  try {
    deps.mkdir(tmpDir);

    let manifest: DoorRepoManifest;
    try {
      ({ manifest } = await deps.fetchManifest(cfg));
    } catch (err: any) {
      // This is a SEPARATE fetch from whatever populated the browse list
      // (loadConsumerManifest, on view enter) -- normally a cheap 304 off
      // repo-client's ETag cache, but if the on-disk cache file is gone or
      // the network is down at this exact moment, an install that would
      // otherwise have succeeded (the sysop already saw this door in the
      // browse list moments ago) fails here instead. Said plainly, not
      // just via repo-client's raw error text.
      return {
        ok: false, step: 'manifest-lookup',
        detail: `could not re-fetch the central manifest to verify this download ` +
          `(browsing and installing re-fetch independently -- this can fail even ` +
          `right after a successful browse if the network or manifest cache ` +
          `dropped out in between): ${err?.message ?? String(err)}`,
      };
    }
    const manifestRow = manifest.doors.find(d => d.archiveName === archiveName);
    if (!manifestRow || !manifestRow.sha256) {
      return { ok: false, step: 'manifest-lookup', detail: `No sha256 for ${archiveName} in the central manifest` };
    }

    try {
      await deps.downloadArchive(cfg, archiveName, destPath, manifestRow.sha256);
    } catch (err: any) {
      return { ok: false, step: 'download', detail: err?.message ?? String(err) };
    }

    let registeredLocally = false;
    const localRow = deps.lookupLocal(archiveName);
    // The manifest has no version; GET /doors/:archiveName does. The
    // archive is already downloaded and verified at this point, so a
    // detail fetch that fails or times out costs the record one field
    // rather than the install.
    let detail: RepoDoorDetail | null = null;
    if (deps.fetchDoorDetail) {
      try {
        detail = await deps.fetchDoorDetail(cfg, archiveName);
      } catch {
        detail = null;
      }
    }
    const outcome = await extractAndRegisterDoor(destPath, installDir, infoPath, doorType, binaryName, finalCmd, {
      extractArchiveTo: deps.extractArchiveTo,
      findExtractedBinary: deps.findExtractedBinary,
      writeInfoFile: deps.writeInfoFile,
      refreshDoorRegistry: deps.refreshDoorRegistry,
      recordInstall: (installedCmd, installedDir, archive) => {
        // installedCmd, not finalCmd: the archive may name its own command,
        // and the record has to describe what is actually on disk.
        if (commandClaimedByOtherArchive(deps.getInstallByCommand, installedCmd, archive)) return;
        deps.recordInstall({
          id: `install-${installedCmd}`,
          catalog_id: localRow?.id ?? null,
          archive_name: archive,
          command: installedCmd,
          install_dir: installedDir,
          door_type: doorType || 'XIM',
          name: manifestRow.name ?? archive,
          md5: manifestRow.md5 ?? null,
          description: manifestRow.description ?? null,
          category: manifestRow.category ?? null,
          version: detail?.version ?? null, // only the detail endpoint carries a version
          release_group: manifestRow.releaseGroup ?? null,
          source_url: cfg.url, // the resolved URL actually used, not the possibly-unset raw env var
          source_revision: manifest.revision ?? null, // the revision this install actually came from
        });
        registeredLocally = true;
      },
    }, archiveName);

    if (!outcome.ok) return outcome;
    return { ok: true, doorType: outcome.doorType, fileCount: outcome.fileCount, binaryRel: outcome.binaryRel, steps: outcome.steps, registeredLocally };
  } finally {
    deps.unlink(destPath);
  }
}
