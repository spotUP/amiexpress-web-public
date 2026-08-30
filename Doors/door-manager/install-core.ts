/**
 * The install core: turning an archive into an installed door.
 *
 * Extracted from app.ts, which had grown past the repo's 2000-line ceiling.
 * Nothing here touches the UI - it is the part of installing that both owner
 * mode and consumer mode share, and the part worth testing directly.
 */

import * as fs from 'fs';
import * as path from 'path';

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
  recordInstall: () => void;
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

export async function extractAndRegisterDoor(
  archivePath: string,
  installDir: string,
  infoPath: string,
  doorType: string,
  binaryName: string | null,
  finalCmd: string,
  deps: InstallDeps
): Promise<InstallOutcome> {
  const steps: InstallStep[] = [];

  const result = await deps.extractArchiveTo(archivePath, installDir);
  if (!result.ok) {
    steps.push({ kind: 'fail', text: `extract ${path.basename(archivePath)}: ${result.error ?? 'unknown error'}` });
    return { ok: false, step: 'extract', detail: result.error ?? 'unknown error', steps };
  }
  steps.push({ kind: 'ok', text: `extracted ${result.fileCount} files to ${installDir}` });

  const resolvedDoorType = doorType || 'XIM';
  const binaryRel = deps.findExtractedBinary(installDir, binaryName) ?? (binaryName ?? finalCmd);
  steps.push({ kind: 'ok', text: `binary ${binaryRel}, type ${resolvedDoorType}` });

  try {
    deps.writeInfoFile(infoPath, buildDoorInfoContent(resolvedDoorType, finalCmd, binaryRel));
    steps.push({ kind: 'ok', text: `wrote ${infoPath}` });
  } catch (err: any) {
    steps.push({ kind: 'fail', text: `write ${infoPath}: ${err?.message ?? err}` });
    return { ok: false, step: 'write-info', detail: `${infoPath}: ${err?.message ?? err}`, steps };
  }

  try {
    deps.recordInstall();
    steps.push({ kind: 'ok', text: `recorded the install as ${finalCmd}` });
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
