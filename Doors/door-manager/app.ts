/**
 * DOORMAN v2 — SysOp Door Management Tool
 * Rewritten around a ViewManager / view stack so each screen owns its
 * own key bindings and ESC always pops cleanly.
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  Screen, Panel, List, ScrollableBox, ConfirmModal, Prompt, Textbox,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { FileExplorerOverlay } from './FileExplorerOverlay';
import { InfoEditorOverlay } from './InfoEditorOverlay';
import { showAmigaGuideViewer } from './AmigaGuideViewer';
import { ViewManager, BaseView, KeyBinder, sanitizeForTags, refreshDoorRegistry, resolveBbsRoot } from './ViewManager';
import { ALL_TYPES, distinctTypes, cycleSystemFilter, filterByDoorType, formatSystemTag } from './systemFilter';
import {
  resolveDoorRepoMode, loadLocalCatalogEntries, loadConsumerCatalog, mapManifestDoorToEntry,
  filterManifestEntries, formatOfflineSuffix, consumerCacheFilePath,
} from './repoDataSource';
import type {
  DoorRepoMode, CatalogEntry as RepoCatalogEntry, LocalCatalogRow, LocalCatalogLookup,
} from './repoDataSource';
import { downloadArchive, fetchManifest } from './repo-client';
import type { RepoClientConfig, FetchManifestResult } from './repo-client';
import type { DoorRepoManifest } from './repo-types.generated';

// ─── Constants ────────────────────────────────────────────────────────────────
// Install/re-extract now goes through the portable extractor factory
// (extractArchiveTo, below) instead of the native `lha` CLI — see
// getExtractorFactory(). That extractor handles both LHA and LZX and works
// identically on macOS dev machines and the Linux container on the live
// server, so no LHA_BIN path probing is needed here anymore.

const PROJECT_ROOT = resolveBbsRoot(__dirname);

// ─── Types ────────────────────────────────────────────────────────────────────

interface DoorSession { socket: any; user: any; bbsSession: any; bbs: any; params: string[] }

interface DoorInfo {
  id: string; command: string; name: string; description: string;
  type: string; size: number; accessLevel: number; location: string;
  resolvedPath?: string; enabled: boolean;
}

// Single source of truth for the row shape RepoView renders: repoDataSource.ts
// (both the local-catalog and central-repo data sources produce this shape).
type CatalogEntry = RepoCatalogEntry;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / 1048576)} MB`;
}

function typeBadge(type: string): string {
  return ({ TS:'TS', typescript:'TS', SDK:'TS', XIM:'68', SIM:'SI', TIM:'TI', FIM:'FI',
            AMI:'68', amiga:'68', RX:'RX', AREXX:'RX', ARexx:'RX', RXD:'RX' } as any)[type] ?? '??';
}

function getCatalogSvc(): any {
  for (const k of Object.keys(require.cache))
    if (k.includes('door-catalog.service')) return require.cache[k]?.exports ?? null;
  return null;
}

function getExtractorFactory(): any {
  // Same require.cache discovery as getCatalogSvc — the backend's shared
  // archive-extractor (WASM unlzx included) when loaded in this process.
  for (const k of Object.keys(require.cache))
    if (k.includes('archive-extractor')) return require.cache[k]?.exports ?? null;
  return null;
}

function getStripLib(): any {
  for (const k of Object.keys(require.cache))
    if (k.includes('ami-stripper.lib')) return require.cache[k]?.exports ?? null;
  return null;
}

/** Adapts the local catalog service's getCatalogEntryByArchive into the
 * LocalCatalogLookup shape repoDataSource's mapManifestDoorToEntry expects
 * (consumer mode: resolving what's installed on THIS BBS is always a local
 * lookup, never something the central manifest knows). Missing service or a
 * thrown lookup error both fold into "nothing known locally" rather than
 * propagating -- a lookup failure must never abort the whole browse. */
function buildLocalCatalogLookup(): LocalCatalogLookup {
  const svc = getCatalogSvc();
  return (archiveName: string): LocalCatalogRow | null => {
    try {
      const row = svc?.getCatalogEntryByArchive?.(archiveName);
      if (!row) return null;
      return {
        id: row.id,
        installed: row.installed,
        installed_as: row.installed_as ?? null,
        install_dir: row.install_dir ?? null,
        binary_name: row.binary_name ?? null,
        archive_path: row.archive_path ?? null,
      };
    } catch {
      return null;
    }
  };
}

async function fetchDoors(bbs: any): Promise<DoorInfo[]> {
  if (!bbs.getDoorList) return [];
  return (await bbs.getDoorList()).map((d: any) => ({
    id: d.id || d.command, command: d.command || d.id,
    name: d.name || d.command || d.id, description: d.description || '',
    type: d.type || 'AMI', size: d.size || 0, accessLevel: d.accessLevel || 0,
    location: d.location || d.path || '', resolvedPath: d.resolvedPath,
    enabled: d.enabled !== false,
  }));
}

function discoverDoorDir(archiveName: string): string | null {
  const base = archiveName.replace(/\.(lha|lzx|lzh)$/i, '');
  const doorsDir = path.join(PROJECT_ROOT, 'Doors');
  if (!fs.existsSync(doorsDir)) return null;
  try {
    const match = fs.readdirSync(doorsDir).find(
      e => e.toLowerCase() === base.toLowerCase() &&
           fs.statSync(path.join(doorsDir, e)).isDirectory()
    );
    return match ? path.join(doorsDir, match) : null;
  } catch { return null; }
}

export function resolveArchivePath(archivePath: string | null | undefined): string | null {
  if (!archivePath) return null;
  const svc = getCatalogSvc();
  try {
    return svc?.resolveArchivePath ? svc.resolveArchivePath(archivePath) : archivePath;
  } catch { return archivePath; }
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
   * means for this mode (owner: always call markInstalled(e.id, ...);
   * consumer: only when a real local catalog row exists -- see
   * installConsumerDoor). Errors are caught and logged here, exactly like
   * the pre-Task-7 inline behavior: a bookkeeping failure never rolls back
   * a working on-disk install. */
  markInstalled: () => void;
  refreshDoorRegistry: () => Promise<boolean>;
}

export type InstallOutcome =
  | { ok: true; doorType: string; fileCount: number; binaryRel: string }
  | { ok: false; step: string; detail: string };

export async function extractAndRegisterDoor(
  archivePath: string,
  installDir: string,
  infoPath: string,
  doorType: string,
  binaryName: string | null,
  finalCmd: string,
  deps: InstallDeps
): Promise<InstallOutcome> {
  const result = await deps.extractArchiveTo(archivePath, installDir);
  if (!result.ok) return { ok: false, step: 'extract', detail: result.error ?? 'unknown error' };

  const resolvedDoorType = doorType || 'XIM';
  const binaryRel = deps.findExtractedBinary(installDir, binaryName) ?? (binaryName ?? finalCmd);
  try {
    deps.writeInfoFile(infoPath, buildDoorInfoContent(resolvedDoorType, finalCmd, binaryRel));
  } catch (err: any) {
    return { ok: false, step: 'write-info', detail: `${infoPath}: ${err?.message ?? err}` };
  }

  try {
    deps.markInstalled();
  } catch (err: any) {
    // The door is on disk and the .info is written — it will run. The
    // catalog just won't show it as installed. Surface it but don't roll
    // back a working install over a bookkeeping error.
    console.log(`[DOORMAN] install failed: mark-installed: ${err?.message ?? err}`);
  }

  const refreshed = await deps.refreshDoorRegistry();
  if (!refreshed) console.log('[DOORMAN] warning: door registry refresh unavailable — new door hidden until BBS restart');

  return { ok: true, doorType: resolvedDoorType, fileCount: result.fileCount, binaryRel };
}

/**
 * Same stable-slug convention dev/scripts/door-corpus/build-door-catalog.ts
 * uses to derive a door_catalog.id from an archive_name (that script's
 * `baseId`, duplicated here rather than imported: it's a standalone tsx
 * script outside both this package's and web/backend's TypeScript program,
 * not an importable module). Reusing the exact formula matters, not just
 * for readability parity with scanned rows (e.g. "!ALSTER.LHA" -> "_alster"
 * in the seed data) -- it means a door that is BOTH consumer-installed here
 * AND later indexed by a local scan resolves to the SAME id instead of two
 * divergent rows colliding on door_catalog.archive_name's UNIQUE
 * constraint. Deterministic in archiveName alone, so install -> uninstall
 * -> reinstall of the same archive always targets the same row (idempotent
 * upsert, never a duplicate).
 */
export function catalogIdForArchive(archiveName: string): string {
  return archiveName.replace(/\.(lha|lzx|lzh)$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '_');
}

/** Mirrors door_catalog's columns (door-catalog.service.ts's upsertCatalogEntry
 * SQL, read directly rather than imported -- see the ConsumerInstallDeps
 * comment below for why). Every column the INSERT statement names must be
 * present here; better-sqlite3's named-parameter binding throws on any
 * referenced column missing from the bound object. */
export interface ConsumerCatalogUpsertRow {
  id: string; archive_name: string; archive_path: string; binary_name: string | null;
  door_type: string; name: string; version: string | null; author: string | null;
  release_group: string | null; description: string | null; file_id_diz: string | null;
  doc_filename: string | null; doc_raw: string | null; suggested_tooltypes: string | null;
  category: string | null; archive_size: number; junk_count: number; installed: number;
  installed_as: string | null; install_dir: string | null; corpus_id: string | null; source: string;
}

/** New door_catalog.source value for this install path. The column's only
 * existing value anywhere in the codebase (schema DEFAULT, every seed row)
 * is 'scan' -- the local archive-corpus scanner's provenance tag. 'door-repo'
 * extends that same informal enum minimally: it marks a row as created by
 * a consumer-mode install from the central door-repo API, never by a local
 * filesystem scan. */
export const CONSUMER_INSTALL_SOURCE = 'door-repo';

/**
 * Consumer-mode install: download + verify the archive from the central
 * door-repo API, then hand off to extractAndRegisterDoor for the identical
 * extract/register flow owner mode already uses. destPath always lives
 * under tmp-door-repo/ and is removed in the finally on every path,
 * including every failure — downloadArchive (Task 5) already deletes it on
 * a network/checksum failure, but a failure further down (extract,
 * write-info) still leaves a successfully-downloaded archive sitting in
 * tmp-door-repo/ unless this cleans it up too.
 *
 * Local registration (fix round 1, overriding the original "never invent a
 * local row" reading of the plan): on a consumer BBS, "no local catalog row
 * yet" is the NORMAL case for a fresh install, not an edge case — a
 * consumer browses the manifest precisely because it has never locally
 * indexed these archives. Leaving `installed` permanently false for every
 * consumer install would break the primary flow. So: `lookupLocal` is
 * re-run here (fresh, never trusting whatever id the browse-time
 * CatalogEntry carried, since that id falls back to archiveName for
 * never-indexed rows and is not a real primary key) --
 *   - a real local row already exists (previously scanned, or previously
 *     installed-then-uninstalled -- markUninstalled keeps the row) ->
 *     markInstalled(localRow.id, ...) runs exactly as before.
 *   - no local row -> UPSERT one first (door-catalog.service.ts's existing,
 *     previously-unused upsertCatalogEntry -- its ON CONFLICT(id) clause
 *     deliberately does not touch installed/installed_as/install_dir, so
 *     it only ever writes metadata, never install state), using
 *     catalogIdForArchive(archiveName) as a deterministic id, populated
 *     ONLY from facts this function actually has (the manifest row's
 *     archive_name/door_type/name/description/archive_size, plus
 *     source='door-repo' recording its provenance) -- never fabricated, and
 *     never claiming the archive is locally stored: archive_path is left
 *     '' (matches repoDataSource.ts's own convention for "no local path
 *     known", and satisfies the column's NOT NULL constraint). Then
 *     markInstalled(newId, ...) runs against that real row exactly like
 *     the "row already exists" branch. `installed` now reads back 1 next
 *     time this archive is resolved locally, satisfying Task 6's
 *     lookupLocal-driven resolution in the repo browse view.
 *   - id collision with a DIFFERENT archive_name already at that slug
 *     (rare -- e.g. two archive names that normalize to the same id) ->
 *     never clobber the unrelated row (same philosophy as the corpus
 *     builder's own collision handling); falls back to registry-only,
 *     logged loudly.
 */
export interface ConsumerInstallDeps {
  fetchManifest: (cfg: RepoClientConfig) => Promise<FetchManifestResult>;
  downloadArchive: (cfg: RepoClientConfig, archiveName: string, destPath: string, expectedSha256: string) => Promise<void>;
  extractArchiveTo: InstallDeps['extractArchiveTo'];
  findExtractedBinary: InstallDeps['findExtractedBinary'];
  writeInfoFile: InstallDeps['writeInfoFile'];
  lookupLocal: LocalCatalogLookup;
  /** Existence check ONLY (archive_name of whatever row currently holds
   * this id, if any) -- used to detect a slug collision before upserting.
   * Not the full row; nothing else here needs more than that. */
  getCatalogEntry: (id: string) => { archive_name: string } | null;
  upsertCatalogEntry: (entry: ConsumerCatalogUpsertRow) => void;
  markInstalled: (id: string, cmd: string, dir: string) => void;
  refreshDoorRegistry: () => Promise<boolean>;
  mkdir: (dir: string) => void;
  unlink: (path: string) => void;
}

export type ConsumerInstallOutcome =
  | { ok: true; doorType: string; fileCount: number; binaryRel: string; registeredLocally: boolean }
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
    const outcome = await extractAndRegisterDoor(destPath, installDir, infoPath, doorType, binaryName, finalCmd, {
      extractArchiveTo: deps.extractArchiveTo,
      findExtractedBinary: deps.findExtractedBinary,
      writeInfoFile: deps.writeInfoFile,
      refreshDoorRegistry: deps.refreshDoorRegistry,
      markInstalled: () => {
        if (localRow) {
          deps.markInstalled(localRow.id, finalCmd, `Doors/${finalCmd}`);
          registeredLocally = true;
          return;
        }
        const newId = catalogIdForArchive(archiveName);
        const collision = deps.getCatalogEntry(newId);
        if (collision && collision.archive_name !== archiveName) {
          console.log(
            `[DOORMAN] consumer install: id "${newId}" already belongs to a different ` +
            `archive (${collision.archive_name}) -- not clobbering it. ${archiveName} ` +
            `installs registry-only (on disk, registered with the BBS; repo browse ` +
            `'installed' flag needs its own local catalog row).`
          );
          return;
        }
        deps.upsertCatalogEntry({
          id: newId,
          archive_name: archiveName,
          archive_path: '', // lives on the central server, not this BBS -- never claim otherwise
          binary_name: null,
          door_type: doorType || 'XIM',
          name: manifestRow.name ?? archiveName,
          version: null,
          author: null,
          release_group: null,
          description: manifestRow.description ?? null,
          file_id_diz: null,
          doc_filename: null,
          doc_raw: null,
          suggested_tooltypes: null,
          category: null,
          archive_size: manifestRow.archiveSize ?? 0,
          junk_count: 0,
          installed: 0, // markInstalled (below) owns installed/installed_as/install_dir
          installed_as: null,
          install_dir: null,
          corpus_id: null,
          source: CONSUMER_INSTALL_SOURCE,
        });
        deps.markInstalled(newId, finalCmd, `Doors/${finalCmd}`);
        registeredLocally = true;
      },
    });

    if (!outcome.ok) return outcome;
    return { ok: true, doorType: outcome.doorType, fileCount: outcome.fileCount, binaryRel: outcome.binaryRel, registeredLocally };
  } finally {
    deps.unlink(destPath);
  }
}

// ─── Shared Layout ───────────────────────────────────────────────────────────
// A single set of panels that all views update in-place.

class DoormanLayout {
  screen: any;
  header: any; footer: any;
  listPanel: any; doorList: any;
  infoPanel: any; infoBox: any;
  filterPanel: any; filterBox: any;
  readonly width: number;

  constructor(screen: any, nodeId: string | number) {
    this.screen = screen;
    this.width = Math.floor((screen as any).width * 0.35) - 8;

    this.header = new Panel({ parent: screen, top: 0, left: 0, width: '100%', height: 3,
      tags: true, style: { fg:'white', bg:'blue', border:{ fg:'blue' } }, focusable: false } as any);

    this.footer = new Panel({ parent: screen, bottom: 0, left: 0, width: '100%', height: 3,
      tags: true, style: { fg:'white', bg:'blue', border:{ fg:'blue' } }, focusable: false } as any);

    this.filterPanel = new Panel({ parent: screen, top: 3, left: 0, width: '35%', height: 3,
      tags: true, style: { border:{ fg:'grey' } }, focusable: false } as any);
    // keys:false + inputOnFocus:false make this a DISPLAY-ONLY widget — see
    // sdk/engines/ui/blessed/widgets/textbox.ts:58-60 (keys:false skips
    // `this.on('keypress', this._onKeypress)` entirely, so Textbox's own
    // self-editing insertChar()/deleteChar() path is never wired up at
    // all, no matter how the box gets focused — keyboard activation,
    // focusNext()/Tab-cycling, or a mouse click all leave it inert) and
    // :63-68 (inputOnFocus:false skips the readInput() emit on focus).
    // RepoView's filterKeypress (below) is the ONLY thing that ever writes
    // to this box, via setValue() — a single source of truth instead of
    // two editors racing. Round 1-3 patched that race at the manual-path
    // level (activation timing, Tab's handled signal); this is the actual
    // root cause: Textbox is a self-editing widget by default, and nothing
    // before this depended on catching every path that could focus it —
    // keys:false removes the capability structurally instead.
    this.filterBox = new Textbox({ parent: this.filterPanel, top: 0, left: 1, width: '100%-2',
      height: 1, mouse: true, keys: false, inputOnFocus: false,
      style: { fg:'white', focus:{ fg:'yellow' } } } as any);
    (this.filterPanel as any).hide();

    this.listPanel = new Panel({ parent: screen, top: 3, left: 0, width: '35%', height: '100%-6',
      tags: true, style: { border:{ fg:'cyan' } }, focusable: false } as any);

    this.doorList = new List({ parent: this.listPanel, top: 1, left: 1, width: '100%-2',
      height: '100%-2', keys: true, vi: false, mouse: true, scrollable: true,
      alwaysScroll: true, tags: true, wrapItems: false,
      scrollbar: { ch:' ', style:{ bg:'blue' } },
      style: { selected:{ bg:'blue', fg:'white' }, item:{ fg:'white' } } } as any);

    this.infoPanel = new Panel({ parent: screen, top: 3, left: '35%', width: '65%',
      height: '100%-6', tags: true, style: { border:{ fg:'blue' } }, focusable: false } as any);

    this.infoBox = new ScrollableBox({ parent: this.infoPanel, top: 1, left: 1,
      width: '100%-2', height: '100%-2', tags: true, scrollable: true, keys: true,
      style: { fg:'white' } } as any);

    // Disable type-ahead on doorList (re-add keypress without the type-ahead block)
    const _nav = (this.doorList as any)._onKeypress?.bind(this.doorList);
    (this.doorList as any).removeAllListeners('keypress');
    if (_nav) {
      (this.doorList as any).on('keypress', (ch: string, key: any) => {
        if (ch?.length === 1 && /[a-zA-Z0-9/ ]/.test(ch)) return;
        if (key?.name === 'escape' || ch === '\x1b') return;
        return _nav(ch, key);
      });
    }

    this.setHeader(`{center}{cyan-fg}DOORMAN v2{/cyan-fg}  {white-fg}Node ${nodeId}{/white-fg}{/center}`);
  }

  setHeader(content: string): void { (this.header as any).setContent(content); }
  setFooter(content: string): void { (this.footer as any).setContent(content); }
  setListLabel(label: string): void { (this.listPanel as any).setLabel(label); }
  setListItems(items: string[]): void { (this.doorList as any).setItems(items); }
  setListSelect(idx: number): void { (this.doorList as any).select(idx); }
  get listSelected(): number { return (this.doorList as any).selected ?? 0; }
  setInfo(content: string): void { (this.infoBox as any).setContent(content); }
  focusList(): void { (this.doorList as any).focus(); }
  focusFilter(): void { (this.filterBox as any).focus(); }

  showRepoLayout(): void {
    (this.filterPanel as any).show();
    (this.listPanel as any).top = 6;
    (this.listPanel as any).height = '100%-9';
  }
  showInstalledLayout(): void {
    (this.filterPanel as any).hide();
    (this.listPanel as any).top = 3;
    (this.listPanel as any).height = '100%-6';
  }

  render(): void { this.screen.render(); }
}

// ─── Views ────────────────────────────────────────────────────────────────────

// ── Installed Doors ──────────────────────────────────────────────────────────

class InstalledView extends BaseView {
  private layout: DoormanLayout;
  private bbs: any;
  private doors: DoorInfo[] = [];
  private statusTimer: any = null;

  constructor(layout: DoormanLayout, bbs: any, doors: DoorInfo[]) {
    super();
    this.layout = layout;
    this.bbs = bbs;
    this.doors = doors;
  }

  private door(): DoorInfo | null { return this.doors[this.layout.listSelected] ?? null; }

  private setStatus(msg: string, col: 'green'|'red'|'yellow' = 'yellow', ms = 3000): void {
    clearTimeout(this.statusTimer);
    this.layout.setHeader(`{center}{cyan-fg}DOORMAN v2{/cyan-fg}  {${col}-fg}${msg}{/${col}-fg}{/center}`);
    this.layout.render();
    this.statusTimer = setTimeout(() => this.refreshHeader(), ms);
  }

  private refreshHeader(): void {
    const ec = this.doors.filter(d => d.enabled).length;
    this.layout.setHeader(`{center}{cyan-fg}DOORMAN v2{/cyan-fg}  {white-fg}${this.doors.length} doors, ${ec} enabled{/white-fg}{/center}`);
  }

  private refresh(selectIdx = 0): void {
    const w = this.layout.width;
    const items = this.doors.map(d => {
      const badge = `[${typeBadge(d.type)}]`;
      const sz = formatSize(d.size).padStart(6);
      const nameW = Math.max(6, w - 14);
      const name = d.name.length > nameW ? d.name.slice(0, nameW-1)+'…' : d.name.padEnd(nameW);
      const st = d.enabled ? '{green-fg}*{/green-fg}' : '{red-fg}-{/red-fg}';
      return `${badge} ${name} ${st} ${sz}`;
    });
    this.layout.setListLabel(' INSTALLED DOORS ');
    this.layout.setListItems(items);
    this.layout.setListSelect(selectIdx);
    this.updateInfo();
    this.updateFooter();
    this.refreshHeader();
  }

  private updateInfo(): void {
    const d = this.door();
    if (!d) { this.layout.setInfo('No door selected.'); return; }
    const st = d.enabled ? '{green-fg}ENABLED{/green-fg}' : '{red-fg}DISABLED{/red-fg}';
    // FILE_ID.DIZ from the catalog when this door was installed from the
    // repo (matched by installed_as == command); falls back to description.
    // Both are raw archive text — sanitize or blessed parses the art as tags.
    let body = '';
    try {
      const cat = getCatalogSvc()?.getCatalogEntryByCmd?.(d.command);
      if (cat?.file_id_diz) body = '\n' + sanitizeForTags(cat.file_id_diz);
    } catch { /* catalog optional */ }
    if (!body && d.description) body = `\n{white-fg}${sanitizeForTags(d.description)}{/white-fg}`;
    this.layout.setInfo([
      `{yellow-fg}Name:{/yellow-fg}    ${d.name}`,
      `{yellow-fg}Command:{/yellow-fg} ${d.command}`,
      `{yellow-fg}Type:{/yellow-fg}    ${d.type}`,
      `{yellow-fg}Size:{/yellow-fg}    ${formatSize(d.size)}`,
      `{yellow-fg}Status:{/yellow-fg}  ${st}`,
      body,
    ].join('\n'));
  }

  private updateFooter(): void {
    const d = this.door();
    const en = (!d || d.enabled) ? 'Dis' : 'En';
    this.layout.setFooter(
      `{center}{yellow-fg}U{/yellow-fg}pload {yellow-fg}I{/yellow-fg}nfo {yellow-fg}F{/yellow-fg}iles ` +
      `{yellow-fg}D{/yellow-fg}el {yellow-fg}V{/yellow-fg}iew doc {yellow-fg}E{/yellow-fg}=${en} ` +
      `{yellow-fg}S{/yellow-fg}trip {yellow-fg}Tab{/yellow-fg}=Repo {yellow-fg}Q{/yellow-fg}uit{/center}`
    );
  }

  enter(): void {
    this.layout.showInstalledLayout();
    this.refresh(this.layout.listSelected);
    this.layout.focusList();
    this.layout.render();

    (this.layout.doorList as any).on('select item', this._onSelectItem = () => {
      this.updateInfo(); this.updateFooter(); this.layout.render();
    });

    this.keys.key(['tab'], () => {
      this.vm.push(new RepoView(this.layout, this.bbs));
    });
    this.keys.key(['q', 'Q'], () => {
      clearTimeout(this.statusTimer);
      this.vm.destroy();
      (this.layout.screen as any).destroy();
    });
    this.keys.key(['u', 'U'], () => this.doUpload());
    this.keys.key(['i', 'I'], () => this.doInfoEditor());
    this.keys.key(['f', 'F'], () => this.doFileExplorer());
    this.keys.key(['d', 'D'], () => this.doDelete());
    this.keys.key(['v', 'V'], () => this.doViewDoc());
    this.keys.key(['e', 'E'], () => this.doToggleEnabled());
    this.keys.key(['s', 'S'], () => this.doStripAds());
  }

  private _onSelectItem: any;

  exit(): void {
    (this.layout.doorList as any).off('select item', this._onSelectItem);
    this.keys.release();
  }

  onEsc(): void { /* root view — ESC does nothing */ }

  private doUpload(): void {
    this.setStatus('Waiting for file upload...');
    (this.bbs as any).requestArchiveUpload?.().then((r: any) => {
      this.setStatus(`Installing ${r.filename}...`);
      return (this.bbs as any).installDoor?.(r.path);
    }).then((result: any) => {
      if (result?.success) {
        this.setStatus(`Installed: ${result.command}`, 'green');
        fetchDoors(this.bbs).then(doors => { this.doors = doors; this.refresh(0); });
      } else {
        this.setStatus(`Install failed: ${result?.message}`, 'red');
      }
    }).catch((e: any) => this.setStatus(`Error: ${e.message}`, 'red'));
  }

  private doInfoEditor(): void {
    const d = this.door(); if (!d) return;
    this.vm.push(new InfoEditorOverlayView(this.layout, this.bbs, d.command));
  }

  private doFileExplorer(): void {
    const d = this.door(); if (!d) return;
    let doorPath = d.resolvedPath || d.location || `Doors/${d.command}`;
    const m = /^([A-Za-z][A-Za-z0-9]*):(.*)$/.exec(doorPath);
    if (m) {
      const assign = m[1].toUpperCase(), sub = m[2].replace(/^\/+/, '');
      if (assign === 'DOORS') doorPath = `Doors/${sub}`;
      else if (assign === 'BBS' || assign === 'WORK') doorPath = sub;
    }
    this.vm.push(new FileExplorerOverlayView(this.layout, doorPath));
  }

  private doDelete(): void {
    const d = this.door(); if (!d) return;
    const idx = this.layout.listSelected;
    this.vm.push(new ConfirmView(this.layout,
      `Delete {yellow-fg}${d.name}{/yellow-fg}?\n\n{red-fg}This cannot be undone.{/red-fg}`,
      'Delete', 'Cancel',
      async () => {
        this.setStatus(`Deleting ${d.name}...`);
        const isTS = ['TS','typescript','SDK'].includes(d.type);
        const id = isTS ? (d.location?.replace(/^Doors[\\/]/i,'').split(/[\\/]/)[0] || d.command) : d.command;
        try {
          const r = await (this.bbs as any).deleteDoor(id, isTS);
          if (r.success) {
            // Belt and braces: deleteDoor refreshes backend caches itself,
            // but a stale registry here left deleted doors visible with no
            // feedback (2026-08-15). Refresh again from our side, re-fetch,
            // and confirm persistently in the info panel.
            await refreshDoorRegistry();
            this.doors = await fetchDoors(this.bbs);
            this.refresh(Math.max(0, idx - 1));
            this.setStatus(`${d.name} deleted`, 'green', 8000);
            this.layout.setInfo(`{green-fg}Deleted{/green-fg}\n\n${sanitizeForTags(d.name)} removed.`);
            this.layout.render();
          } else {
            this.setStatus(`Failed: ${r.message}`, 'red', 8000);
            this.layout.setInfo(`{red-fg}Delete failed{/red-fg}\n\n${sanitizeForTags(String(r.message ?? 'unknown error'))}`);
            console.log(`[DOORMAN] delete failed: ${d.name}: ${r.message}`);
            this.layout.render();
          }
        } catch (e: any) {
          this.setStatus(`Error: ${e.message}`, 'red', 8000);
          console.log(`[DOORMAN] delete error: ${d.name}: ${e?.message ?? e}`);
        }
      }
    ));
  }

  private doViewDoc(): void {
    const d = this.door(); if (!d) return;
    const svc = getCatalogSvc();
    if (!svc) { this.setStatus('Catalog not available', 'yellow'); return; }
    try {
      const entry = svc.getCatalogEntryByCmd(d.command);
      if (entry?.doc_raw) {
        this.vm.push(new DocView(this.layout, entry.doc_filename ?? entry.archive_name, entry.doc_raw));
      } else { this.setStatus('No documentation in catalog', 'yellow'); }
    } catch { this.setStatus('Catalog lookup failed', 'red'); }
  }

  private doToggleEnabled(): void {
    const d = this.door(); if (!d) return;
    const idx = this.layout.listSelected;
    d.enabled = !d.enabled;
    this.bbs.setDoorEnabled?.(d.command, d.enabled).then((r: any) => {
      this.setStatus(r.message, r.success ? 'green' : 'red');
    }).catch(() => {
      this.setStatus(`${d.name} ${d.enabled ? 'enabled' : 'disabled'} (session only)`, 'yellow');
    });
    this.refresh(idx);
  }

  private doStripAds(): void {
    const d = this.door(); if (!d) return;
    const svc = getCatalogSvc();
    if (!svc) { this.setStatus('Catalog not available', 'yellow'); return; }
    try {
      const entry = svc.getCatalogEntryByCmd(d.command);
      if (!entry) { this.setStatus(`${d.command} not in catalog`, 'yellow'); return; }
      const liveDir = d.resolvedPath ? path.dirname(d.resolvedPath) :
        (d.location ? path.join(PROJECT_ROOT, d.location) : undefined);
      const resolvedArchive = resolveArchivePath(entry.archive_path);
      const archivePathForStrip = resolvedArchive && fs.existsSync(resolvedArchive) ? resolvedArchive : null;
      this.vm.push(new StripView(this.layout, entry, archivePathForStrip, liveDir,
        (stripped) => { if (stripped) this.setStatus(`Stripped ${stripped} ad file(s)`, 'green', 4000); }
      ));
    } catch { this.setStatus('Catalog lookup failed', 'red'); }
  }
}

// ── Repo Browser ──────────────────────────────────────────────────────────────
//
// Role gating (Task 8): RepoView browses either this BBS's own catalog
// (owner/disabled mode -- an entry IS a repo copy this sysop curates) or the
// CENTRAL door-repo API's manifest (consumer mode -- entries belong to a
// repo this sysop does not own). Curation actions that mutate/prune a repo
// copy's archive (Strip) must not be exposed in consumer mode. Install/
// uninstall (always operates on THIS BBS's own Doors/ + Commands/BBSCmd/,
// regardless of mode), viewing docs, browsing archive contents, and the
// system-type filter stay available in every mode.
//
// The gating decision and its wiring are extracted into these three
// exported functions -- RepoView.updateFooter()/enter() call them directly
// -- rather than left inline, so doorman-role-gating.test.ts exercises the
// EXACT code that runs in production (footer string, real KeyBinder/Screen
// hotkey registration) instead of a hand-mirrored copy. RepoView itself
// still cannot be unit-constructed without a live DoormanLayout/Screen (see
// doorman-consumer-mode.test.ts's header comment) -- this extraction is
// what makes the mode-gated PARTS of it testable without one.

/** True when repo-curation actions (Strip on a repo copy, catalog-row
 * edits, archive delete) are permitted. Owner mode and disabled mode both
 * mean "local catalog only, full local control" (see repoDataSource.ts's
 * module doc grouping them under "local") -- consumer mode is the only mode
 * that does not own the catalog it's browsing. */
export function repoViewCurationAllowed(mode: DoorRepoMode): boolean {
  return mode.kind !== 'consumer';
}

/** RepoView's per-entry footer hint string, gated by repo mode. Byte-
 * identical to DOORMAN's pre-Task-8 string in owner mode (and disabled
 * mode, which reads identically) -- only consumer mode differs, by omitting
 * the Strip hint entirely rather than advertising a key that does nothing. */
export function repoViewFooterParts(
  mode: DoorRepoMode,
  opts: { installed: boolean; hasJunk: boolean; hasDoc: boolean }
): string {
  const inst = opts.installed ? 'Uninst' : 'Inst';
  const curationAllowed = repoViewCurationAllowed(mode);
  const parts = [
    `{yellow-fg}R{/yellow-fg}=${inst}`,
    (opts.hasJunk && curationAllowed) ? `{yellow-fg}S{/yellow-fg}trip` : null,
    opts.hasDoc  ? `{yellow-fg}V{/yellow-fg}iew doc` : null,
    `{yellow-fg}A{/yellow-fg}rchive`,
    `{yellow-fg}F{/yellow-fg}=Filter`,
    `{yellow-fg}C{/yellow-fg}=System`,
    `{yellow-fg}ESC{/yellow-fg}=Back`,
    `{yellow-fg}Q{/yellow-fg}uit`,
  ].filter(Boolean).join('  ');
  return `{center}${parts}{/center}`;
}

export interface RepoViewHotkeyHandlers {
  onInstallUninstall: () => void;
  onStrip: () => void;
  onViewDoc: () => void;
  onBrowseArchive: () => void;
  onCycleFilter: () => void;
}

/** Registers RepoView's per-entry action hotkeys (R/S/V/A/C), gated by repo
 * mode: consumer mode omits the [S]trip binding entirely -- see
 * repoViewCurationAllowed. Install/uninstall (R), view doc (V), browse
 * archive contents (A), and the system-type filter (C) register in every
 * mode. */
export function registerRepoViewActionKeys(
  keys: KeyBinder,
  mode: DoorRepoMode,
  handlers: RepoViewHotkeyHandlers
): void {
  keys.key(['r', 'R'], () => handlers.onInstallUninstall());
  if (repoViewCurationAllowed(mode)) {
    keys.key(['s', 'S'], () => handlers.onStrip());
  }
  keys.key(['v', 'V'], () => handlers.onViewDoc());
  keys.key(['a', 'A'], () => handlers.onBrowseArchive());
  keys.key(['c', 'C'], () => handlers.onCycleFilter());
}

class RepoView extends BaseView {
  private layout: DoormanLayout;
  private bbs: any;
  private entries: CatalogEntry[] = [];
  private visibleEntries: CatalogEntry[] = [];
  private systemFilter: string = ALL_TYPES;
  private filter = '';
  private statusTimer: any = null;
  private installing = false; // guards against double-fire on the async install handler

  // Consumer mode: browsing the central door-repo API instead of the local
  // catalog. repoMode is resolved once (env is static per-process).
  // consumerEntries holds the FULL manifest-mapped list (unfiltered by
  // text) so filterManifestEntries can re-run client-side on every
  // keystroke without a network round trip -- see loadEntries() below.
  private repoMode: DoorRepoMode = resolveDoorRepoMode();
  private consumerEntries: CatalogEntry[] | null = null;
  private consumerFromCache = false;
  private consumerCachedAt: string | null = null;
  private consumerError: string | null = null;
  private consumerLoading = false;

  constructor(layout: DoormanLayout, bbs: any) { super(); this.layout = layout; this.bbs = bbs; }

  private static typeOf(e: CatalogEntry): string { return e.door_type || 'XIM'; }

  private entry(): CatalogEntry | null { return this.visibleEntries[this.layout.listSelected] ?? null; }

  private setStatus(msg: string, col: 'green'|'red'|'yellow' = 'yellow', ms = 3000): void {
    clearTimeout(this.statusTimer);
    this.layout.setHeader(`{center}{cyan-fg}DOORMAN v2  REPO{/cyan-fg}  {${col}-fg}${msg}{/${col}-fg}{/center}`);
    this.layout.render();
    this.statusTimer = setTimeout(() => this.refreshHeader(), ms);
  }

  private refreshHeader(): void {
    let stats = '';
    if (this.repoMode.kind === 'consumer') {
      // Central-repo stats (never the local catalog's — a different data
      // source is on screen) plus the offline/cached suffix when the last
      // fetch served the on-disk cache instead of a live network response.
      if (this.consumerEntries !== null) {
        const installedCount = this.consumerEntries.filter(e => e.installed).length;
        stats = `${this.consumerEntries.length} in repo, ${installedCount} installed`;
      } else if (this.consumerError) {
        stats = 'repo fetch failed';
      } else {
        stats = 'loading...';
      }
      stats += formatOfflineSuffix(this.consumerFromCache, this.consumerCachedAt);
    } else {
      // Owner mode AND disabled mode: byte-identical to pre-Task-6 —
      // local catalog stats via the same getCatalogSvc()/catalogStats() call.
      const svc = getCatalogSvc();
      try { const s = svc?.catalogStats(); if (s) stats = `${s.total} in repo, ${s.installed} installed`; } catch {}
    }
    // Always shown (including the default ALL state) — a sysop with no
    // idea the filter exists has no way to discover it otherwise. Count is
    // visibleEntries: rows surviving BOTH the text search (this.filter,
    // via searchCatalog) AND the system-type filter, so it always matches
    // what's actually on screen.
    const sysTag = `  {cyan-fg}${formatSystemTag(this.systemFilter, this.visibleEntries.length)}{/cyan-fg}`;
    this.layout.setHeader(`{center}{cyan-fg}DOORMAN v2  REPO{/cyan-fg}  {white-fg}${stats}${this.filter ? ' (filtered)' : ''}{/white-fg}${sysTag}{/center}`);
  }

  private cycleFilter(): void {
    const availableTypes = distinctTypes(this.entries, RepoView.typeOf);
    this.systemFilter = cycleSystemFilter(this.systemFilter, availableTypes);
    this.refresh(0);
  }

  private repoUnavailable = false;

  private loadEntries(): void {
    if (this.repoMode.kind === 'consumer') {
      // consumerEntries is the FULL manifest-mapped list, fetched once (see
      // loadConsumerManifest, kicked off from enter()) and re-filtered here
      // client-side on every call — never a network fetch per keystroke.
      if (this.consumerEntries === null) { this.entries = []; return; }
      this.entries = filterManifestEntries(this.consumerEntries, this.filter);
      this.repoUnavailable = false;
      return;
    }
    // Owner mode AND disabled mode: byte-identical to pre-Task-6 —
    // extracted into repoDataSource.ts's loadLocalCatalogEntries so both
    // modes share one implementation.
    const svc = getCatalogSvc();
    const result = loadLocalCatalogEntries(svc, this.filter);
    this.entries = result.entries;
    this.repoUnavailable = result.repoUnavailable;
  }

  /** Fetches + maps the central manifest once (guarded against overlapping
   * calls — enter() re-runs every time a child view like ConfirmView/
   * InputView pops back to RepoView, per ViewManager.pop()). Retries on a
   * later enter() if the previous attempt failed (consumerEntries still
   * null) — a transient network blip should not permanently disable
   * browsing for the rest of the session. */
  private async loadConsumerManifest(): Promise<void> {
    if (this.repoMode.kind !== 'consumer' || this.consumerLoading || this.consumerEntries !== null) return;
    this.consumerLoading = true;
    this.updateInfo();
    this.layout.render();
    try {
      const cacheFile = consumerCacheFilePath(PROJECT_ROOT);
      const lookupLocal = buildLocalCatalogLookup();
      const result = await loadConsumerCatalog(this.repoMode.url, cacheFile, lookupLocal);
      this.consumerEntries = result.entries;
      this.consumerFromCache = result.fromCache;
      this.consumerCachedAt = result.cachedAt;
      this.consumerError = null;
      this.consumerLoading = false;
      this.refresh(this.layout.listSelected);
      this.layout.render();
    } catch (err: any) {
      this.consumerLoading = false;
      this.reportRepoFetchFailure(err?.message ?? String(err));
    }
  }

  /** Loud-error convention matching reportInstallFailure below: log to the
   * process console (docker logs / journald visibility) and hold a
   * persistent message in the info panel — no cache and no network must
   * never silently present as an empty catalog. */
  private reportRepoFetchFailure(detail: string): void {
    console.log(`[DOORMAN] repo fetch failed: ${detail}`);
    this.consumerError = detail;
    // updateInfo() first (info panel), THEN setStatus() (header flash +
    // the render() that paints both together) — calling refreshHeader()
    // after setStatus() here would overwrite the red flash before it is
    // ever rendered. setStatus's own 9s timer reverts to refreshHeader(),
    // whose consumer branch already renders "repo fetch failed" in the
    // header from consumerError once the flash clears.
    this.updateInfo();
    this.setStatus('Repo fetch failed', 'red', 9000);
  }

  private refresh(selectIdx = 0): void {
    this.loadEntries();
    this.visibleEntries = filterByDoorType(this.entries, this.systemFilter, RepoView.typeOf);
    const w = this.layout.width;
    const items = this.visibleEntries.map(e => {
      const inst = e.installed ? '*' : ' ';
      const sz = e.archive_size ? `${Math.round(e.archive_size / 1024)}k` : '?';
      const nameW = Math.max(4, w - sz.length - 2);
      const name = (inst + e.archive_name).length > nameW
        ? (inst + e.archive_name).slice(0, nameW) : (inst + e.archive_name).padEnd(nameW);
      return `${name} ${sz}`;
    });
    this.layout.setListLabel(` REPO (${this.visibleEntries.length}) `);
    this.layout.setListItems(items);
    this.layout.setListSelect(selectIdx);
    this.updateInfo();
    this.updateFooter();
    this.refreshHeader();
  }

  private noEntryMessage(): string {
    if (this.repoMode.kind === 'consumer') {
      if (this.consumerLoading) return '{yellow-fg}Loading central door-repo catalog...{/yellow-fg}';
      if (this.consumerError) {
        return `{red-fg}Central door-repo unavailable.{/red-fg}\n\n` +
          `{yellow-fg}Detail:{/yellow-fg} ${sanitizeForTags(this.consumerError)}\n\n` +
          'No offline cache is available either. Check network connectivity\n' +
          'or the DOOR_REPO_URL setting.';
      }
      return 'No entry selected.';
    }
    return this.repoUnavailable
      ? '{yellow-fg}Repo catalog unavailable on this system.{/yellow-fg}\n\n' +
        'Repo browsing/install runs from a dev checkout, where the door\n' +
        'catalog database and the archive files live. Installed doors on\n' +
        'this system are unaffected.'
      : 'No entry selected.';
  }

  private updateInfo(): void {
    const e = this.entry();
    if (!e) {
      this.layout.setInfo(this.noEntryMessage());
      return;
    }

    // Try to get per-file listing from door_catalog_files
    const svc = getCatalogSvc();
    let fileLines = '';
    try {
      const files: any[] = svc?.getArchiveFiles?.(e.id) ?? [];
      if (files.length > 0) {
        const junk = files.filter((f: any) => f.is_junk).length;
        const junkTag = junk > 0 ? `  {red-fg}${junk} ad files{/red-fg}` : '  {green-fg}clean{/green-fg}';
        fileLines = `\n\n{grey-fg}─── ${files.length} files${junkTag}{/grey-fg}  {grey-fg}──────────────────────{/grey-fg}\n`;
        for (const f of files.slice(0, 25)) {
          const sz = f.size < 1024 ? `${f.size}b` : `${Math.round(f.size/1024)}k`;
          const junkMark = f.is_junk ? '{red-fg}!{/red-fg}' : ' ';
          const name = (f.path as string).length > 34
            ? '<' + (f.path as string).slice((f.path as string).length - 33)
            : (f.path as string);
          fileLines += `${junkMark} ${name.padEnd(34)} ${sz.padStart(5)}\n`;
        }
        if (files.length > 25) fileLines += `{grey-fg}  ... and ${files.length - 25} more{/grey-fg}\n`;
      }
    } catch { /* ignore */ }

    let content = `{yellow-fg}${e.archive_name}{/yellow-fg}  ${e.door_type ?? 'XIM'}` +
      (e.archive_size ? `  ${Math.round(e.archive_size / 1024)}k` : '') +
      (e.installed ? `  {green-fg}[${e.installed_as}]{/green-fg}` : '');

    if (e.file_id_diz) {
      content += '\n\n' + sanitizeForTags(e.file_id_diz);
    } else if (e.description) {
      content += `\n\n{white-fg}${sanitizeForTags(e.description)}{/white-fg}`;
    }
    content += fileLines;
    this.layout.setInfo(content);
  }

  private getEntryJunkCount(e: CatalogEntry): number {
    // Prefer live file-level count over catalog's potentially stale junk_count
    try {
      const svc = getCatalogSvc();
      const files: any[] = svc?.getArchiveFiles?.(e.id) ?? [];
      if (files.length > 0) return files.filter((f: any) => f.is_junk).length;
    } catch {}
    return e.junk_count;
  }

  private updateFooter(): void {
    const e = this.entry();
    const hasJunk = e ? this.getEntryJunkCount(e) > 0 : false;
    this.layout.setFooter(repoViewFooterParts(this.repoMode, {
      installed: !!e?.installed,
      hasJunk,
      hasDoc: !!e?.doc_raw,
    }));
  }

  private _onSelectItem: any;

  enter(): void {
    this.layout.showRepoLayout();
    this.refresh(0);
    if (this.repoMode.kind === 'consumer') void this.loadConsumerManifest();
    this.layout.focusList();
    this.layout.render();

    (this.layout.doorList as any).on('select item', this._onSelectItem = () => {
      this.updateInfo(); this.updateFooter(); this.layout.render();
    });
    (this.layout.doorList as any).on('focus', this._onListFocus = () => {
      (this.layout.filterBox as any).setValue(this.filter);
    });

    // Manual filter input — screen.on('keypress') gives us full control
    // regardless of which widget has focus, so Tab always works. filterBox
    // is display-only (keys:false, DoormanLayout constructor) — this is the
    // ONLY thing that ever writes to it, via setValue().
    let filterActive = false;
    // One-shot: consumed by filterKeypress below the very first time it
    // fires after a KEYBOARD activation, so the SAME keystroke that turned
    // filter mode on doesn't also get appended as its first character. Only
    // armed by the keyboard activation handler below — a mouse click (see
    // filterBox's 'click' handler further down) delivers no keypress event
    // at all, so there is nothing for this flag to suppress there; arming
    // it for a click would leave it permanently stuck with nothing left to
    // consume it (the round-3 bug, recurring if misapplied here).
    let suppressNextFilterChar = false;

    const filterKeypress = (ch: string, key: any) => {
      if (suppressNextFilterChar) { suppressNextFilterChar = false; return; }
      if (!filterActive) return;
      const kn = key?.name ?? '';
      if (kn === 'tab' || kn === 'down' || kn === 'enter' || kn === 'return') {
        filterActive = false;
        this.layout.focusList(); this.layout.render(); return;
      }
      if (kn === 'escape') {
        filterActive = false;
        this.filter = ''; (this.layout.filterBox as any).setValue('');
        this.refresh(0); this.layout.focusList(); this.layout.render(); return;
      }
      if (kn === 'backspace' || kn === 'delete') {
        this.filter = this.filter.slice(0, -1);
      } else if (ch && ch.length === 1 && ch.charCodeAt(0) >= 32) {
        this.filter += ch;
      } else { return; }
      (this.layout.filterBox as any).setValue(this.filter);
      this.refresh(0); this.layout.render();
    };
    (this.layout.screen as any).on('keypress', filterKeypress);
    this._onFilterKey = filterKeypress;

    // While the filter box is active, suppress ALL view hotkeys — typing
    // "a" must filter, not open [A]rchive browse (filterKeypress above is a
    // raw keypress listener and is unaffected by this guard).
    this.keys.setGuard(() => !filterActive);

    // Shared activation: keyboard (F/tab/'/') and a click on the filter box
    // (below) both land here. filterBox is display-only (keys:false, see
    // DoormanLayout), so there's no second editor to race against — this
    // just flips our own state and moves real screen focus.
    //
    // History (kept because the actual defect took 4 rounds to find, and
    // the first 3 fixes are still correct at their own layer — see the
    // round-4 report in .superpowers/ for the full trace):
    //   Round 1: deferred the flip with process.nextTick to dodge
    //     Screen._handleKey's 3-phase same-keystroke dispatch — didn't
    //     survive multi-key payloads (Program._handleData drains a whole
    //     payload before any nextTick runs).
    //   Round 2: made activation synchronous + one-shot suppress flags
    //     (this file's suppressNextFilterChar, and one that used to live on
    //     DoormanLayout wrapping filterBox's own keypress listener) so the
    //     activating keystroke can't be re-delivered into either the manual
    //     buffer or the widget. Correct, but round 3 found Tab specifically
    //     never reached the suppress-consuming phase (Screen's own
    //     focusNext() fallback returns first for an unhandled Tab), so the
    //     flag could get stuck.
    //   Round 3: KeyBinder.key() now propagates a handler's return value,
    //     and this handler returns `true` — marks the keystroke `handled`,
    //     so Tab skips Screen's default fallback exactly like 'f'/'F'/'/'
    //     already implicitly did.
    //   Round 4 (this one): all three prior rounds fixed the manual
    //     dispatch-timing path correctly, but missed that Textbox is a
    //     SELF-EDITING widget by default (sdk textbox.ts's own
    //     `_onKeypress`/insertChar, wired up on ANY focus, including a
    //     stray mouse click that never goes through this handler at all) —
    //     a second editor running in parallel with this one, unguarded by
    //     any of `filterActive`/the suppress flags/the KeyBinder guard.
    //     `keys:false` removes that capability at its source instead of
    //     chasing every path that can focus the box.
    const activateFilter = (): void => {
      filterActive = true;
      this.layout.focusFilter();
      this.layout.render();
    };
    this.keys.key(['f', 'F', '/', 'tab'], () => {
      if (filterActive) return; // already in filter
      suppressNextFilterChar = true; // there IS a keystroke here to swallow
      activateFilter();
      return true;
    });
    // A click on the filter box activates the same way — matches the
    // sysop's intuition that clicking the box should let them type into
    // it. filterBox's own built-in 'click' handler (textbox.ts) also fires
    // and calls focus()/positions the cursor; harmless since keys:false
    // means nothing there can insert a character regardless. Deliberately
    // does NOT arm suppressNextFilterChar: a mouse click delivers no
    // keypress event at all, so there is nothing for that flag to consume
    // — arming it here would leave it permanently stuck (the round-3 bug).
    (this.layout.filterBox as any).on('click', this._onFilterClick = () => {
      if (filterActive) return;
      activateFilter();
    });
    registerRepoViewActionKeys(this.keys, this.repoMode, {
      onInstallUninstall: () => this.doInstallUninstall(),
      onStrip: () => this.doStrip(),
      onViewDoc: () => this.doViewDoc(),
      onBrowseArchive: () => this.doBrowseArchive(),
      onCycleFilter: () => this.cycleFilter(),
    });
    this.keys.key(['q', 'Q'], () => {
      clearTimeout(this.statusTimer);
      this.vm.destroy();
      (this.layout.screen as any).destroy();
    });
  }

  private _onListFocus: any;
  private _onFilterKey: any;
  private _onFilterClick: any;
  private _onListTab: any;

  exit(): void {
    (this.layout.doorList as any).off('select item', this._onSelectItem);
    (this.layout.doorList as any).off('focus', this._onListFocus);
    (this.layout.screen as any).off('keypress', this._onFilterKey);
    (this.layout.filterBox as any).off('click', this._onFilterClick);
    clearTimeout(this.statusTimer);
    this.keys.release();
  }

  onEsc(): void { this.vm.pop(); } // returns to installed list

  private doInstallUninstall(): void {
    const e = this.entry(); if (!e) return;
    if (e.installed) {
      this.vm.push(new ConfirmView(this.layout,
        `Uninstall {yellow-fg}${e.installed_as}{/yellow-fg}?\n\nRemoves .info + Doors/${e.installed_as}/`,
        'Uninstall', 'Cancel',
        () => {
          const svc = getCatalogSvc();
          const bbsCmdDir = path.join(PROJECT_ROOT, 'Commands', 'BBSCmd');
          const infoPath = path.join(bbsCmdDir, `${e.installed_as}.info`);
          if (fs.existsSync(infoPath)) fs.unlinkSync(infoPath);
          if (e.install_dir) {
            const abs = path.join(PROJECT_ROOT, e.install_dir);
            if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
          }
          svc?.markUninstalled(e.id);
          void refreshDoorRegistry(); // doors list is boot-cached; drop the entry now
          this.setStatus(`Uninstalled ${e.installed_as}`, 'green', 4000);
          this.refresh(this.layout.listSelected);
        }
      ));
    } else if (this.repoMode.kind === 'consumer') {
      // Consumer mode: no local archive to pre-check (it may never have
      // touched this disk before) — the download itself is the existence
      // check, and any failure surfaces from inside installConsumerDoor's
      // async callback below via the same reportInstallFailure panel.
      const repoUrl = this.repoMode.url;
      const suggested = (e.installed_as ?? e.binary_name ?? e.name ?? 'DOOR')
        .toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 12);
      this.vm.push(new InputView(this.layout,
        `{yellow-fg}Install as BBS command:{/yellow-fg}`, suggested,
        (cmd) => {
          if (!cmd) return;
          if (this.installing) return; // an install is already in flight
          this.installing = true;
          const finalCmd = cmd.trim().toUpperCase() || suggested;
          const installDir = path.join(PROJECT_ROOT, 'Doors', finalCmd);
          fs.mkdirSync(installDir, { recursive: true });
          this.setStatus('Downloading…', 'yellow', 30000);
          const bbsCmdDir = path.join(PROJECT_ROOT, 'Commands', 'BBSCmd');
          const infoPath = path.join(bbsCmdDir, `${finalCmd}.info`);
          const tmpDir = path.join(PROJECT_ROOT, 'tmp-door-repo');
          const tmpArchivePath = path.join(tmpDir, e.archive_name);
          const cfg: RepoClientConfig = { url: repoUrl, cacheFile: consumerCacheFilePath(PROJECT_ROOT) };
          void (async () => {
            try {
              const outcome = await installConsumerDoor(
                cfg, e.archive_name, e.door_type, e.binary_name, finalCmd, installDir, infoPath, tmpDir,
                {
                  fetchManifest,
                  downloadArchive,
                  extractArchiveTo,
                  findExtractedBinary,
                  writeInfoFile: (p, c) => fs.writeFileSync(p, c, 'latin1'),
                  lookupLocal: buildLocalCatalogLookup(),
                  getCatalogEntry: (id) => getCatalogSvc()?.getCatalogEntry(id) ?? null,
                  upsertCatalogEntry: (entry) => { getCatalogSvc()?.upsertCatalogEntry(entry); },
                  markInstalled: (id, cmd2, dir) => { getCatalogSvc()?.markInstalled(id, cmd2, dir); },
                  refreshDoorRegistry,
                  mkdir: (dir) => fs.mkdirSync(dir, { recursive: true }),
                  unlink: (p) => { try { fs.unlinkSync(p); } catch { /* never existed, or already removed */ } },
                }
              );
              if (!outcome.ok) {
                this.reportInstallFailure(outcome.step, outcome.detail, tmpArchivePath, e.archive_name);
                return;
              }
              this.setStatus(`Installed as ${finalCmd} (${outcome.fileCount} files, ${outcome.doorType})`, 'green', 4000);
              this.layout.setInfo(
                `{green-fg}Installed{/green-fg}\n\n` +
                `{yellow-fg}Command:{/yellow-fg} ${finalCmd}\n` +
                `{yellow-fg}Type:{/yellow-fg} ${outcome.doorType}\n` +
                `{yellow-fg}Files:{/yellow-fg} ${outcome.fileCount}\n` +
                `{yellow-fg}Binary:{/yellow-fg} ${sanitizeForTags(outcome.binaryRel)}\n` +
                (outcome.registeredLocally
                  ? ''
                  : `\n{yellow-fg}Note:{/yellow-fg} registry-only — a local catalog id collision\n` +
                    `blocked registration, so it won't show as installed in this browse list.\n` +
                    `See the server log for detail.\n`)
              );
              this.refresh(this.layout.listSelected);
            } catch (err: any) {
              this.reportInstallFailure('install', err?.message ?? String(err), tmpArchivePath, e.archive_name);
            } finally {
              this.installing = false;
            }
          })();
        }
      ));
    } else {
      const resolvedArchive = resolveArchivePath(e.archive_path);
      if (!resolvedArchive || !fs.existsSync(resolvedArchive)) {
        const detail = `archive_path=${e.archive_path ?? '(none)'} resolved=${resolvedArchive ?? '(none)'}`;
        console.log(`[DOORMAN] install failed: resolve-archive: ${detail}`);
        this.setStatus(`Archive not on server`, 'yellow', 8000);
        this.layout.setInfo(
          `{yellow-fg}Archive not on server{/yellow-fg}\n\n` +
          `{yellow-fg}Catalog path:{/yellow-fg} ${sanitizeForTags(e.archive_path ?? '(none)')}\n` +
          `{yellow-fg}Resolved to:{/yellow-fg} ${sanitizeForTags(resolvedArchive ?? '(unresolvable)')}\n`
        );
        this.layout.render();
        return;
      }
      const suggested = (e.installed_as ?? e.binary_name ?? e.name ?? 'DOOR')
        .toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 12);
      this.vm.push(new InputView(this.layout,
        `{yellow-fg}Install as BBS command:{/yellow-fg}`, suggested,
        (cmd) => {
          if (!cmd) return;
          if (this.installing) return; // an install is already in flight
          this.installing = true;
          const finalCmd = cmd.trim().toUpperCase() || suggested;
          const installDir = path.join(PROJECT_ROOT, 'Doors', finalCmd);
          fs.mkdirSync(installDir, { recursive: true });
          this.setStatus('Installing…', 'yellow', 30000);
          const bbsCmdDir = path.join(PROJECT_ROOT, 'Commands', 'BBSCmd');
          const infoPath = path.join(bbsCmdDir, `${finalCmd}.info`);
          void (async () => {
            try {
              const outcome = await extractAndRegisterDoor(
                resolvedArchive, installDir, infoPath, e.door_type, e.binary_name, finalCmd,
                {
                  extractArchiveTo,
                  findExtractedBinary,
                  writeInfoFile: (p, c) => fs.writeFileSync(p, c, 'latin1'),
                  markInstalled: () => { getCatalogSvc()?.markInstalled(e.id, finalCmd, `Doors/${finalCmd}`); },
                  refreshDoorRegistry,
                }
              );
              if (!outcome.ok) {
                this.reportInstallFailure(outcome.step, outcome.detail, resolvedArchive, e.archive_name);
                return;
              }
              this.setStatus(`Installed as ${finalCmd} (${outcome.fileCount} files, ${outcome.doorType})`, 'green', 4000);
              this.layout.setInfo(
                `{green-fg}Installed{/green-fg}\n\n` +
                `{yellow-fg}Command:{/yellow-fg} ${finalCmd}\n` +
                `{yellow-fg}Type:{/yellow-fg} ${outcome.doorType}\n` +
                `{yellow-fg}Files:{/yellow-fg} ${outcome.fileCount}\n` +
                `{yellow-fg}Binary:{/yellow-fg} ${sanitizeForTags(outcome.binaryRel)}\n`
              );
              this.refresh(this.layout.listSelected);
            } catch (err: any) {
              this.reportInstallFailure('install', err?.message ?? String(err), resolvedArchive, e.archive_name);
            } finally {
              this.installing = false;
            }
          })();
        }
      ));
    }
  }

  /**
   * Install failures used to be a status-bar flash that cleared itself in a
   * few seconds — a failed install could leave nothing behind on disk AND
   * nothing in the backend log, so a sysop had no way to tell it happened.
   * Every failure path now: logs to the process console (so it shows up in
   * `docker logs`/journald), holds a red status for long enough to actually
   * read it, and writes the full detail into the persistent info panel.
   */
  private reportInstallFailure(step: string, detail: string, archivePath: string, archiveName: string): void {
    console.log(`[DOORMAN] install failed: ${step}: ${detail} (archive=${archiveName}, path=${archivePath})`);
    this.setStatus(`Install failed: ${step}`, 'red', 9000);
    this.layout.setInfo(
      `{red-fg}Install failed{/red-fg}\n\n` +
      `{yellow-fg}Step:{/yellow-fg} ${sanitizeForTags(step)}\n` +
      `{yellow-fg}Detail:{/yellow-fg} ${sanitizeForTags(detail)}\n` +
      `{yellow-fg}Archive:{/yellow-fg} ${sanitizeForTags(archiveName)}\n` +
      `{yellow-fg}Path:{/yellow-fg} ${sanitizeForTags(archivePath)}\n`
    );
    this.layout.render();
  }

  private doStrip(): void {
    const e = this.entry(); if (!e) return;
    const resolvedArchive = resolveArchivePath(e.archive_path);
    const hasArchive = !!(resolvedArchive && fs.existsSync(resolvedArchive));
    const candidates = [
      e.install_dir ? path.join(PROJECT_ROOT, e.install_dir) : null,
      e.installed_as ? path.join(PROJECT_ROOT, 'Doors', e.installed_as) : null,
      discoverDoorDir(e.archive_name),
    ].filter((d): d is string => !!(d && fs.existsSync(d)));
    const installDir = candidates[0] ?? null;
    if (!hasArchive && !installDir) {
      this.setStatus(e.installed ? 'Install dir not found on server' : 'Install first to strip', 'yellow');
      return;
    }
    this.vm.push(new StripView(this.layout, e, hasArchive ? resolvedArchive : null, installDir ?? undefined,
      (stripped) => { if (stripped) { this.setStatus(`Stripped ${stripped} ad file(s)`, 'green', 4000); this.refresh(this.layout.listSelected); } }
    ));
  }

  private doViewDoc(): void {
    const e = this.entry();
    if (!e?.doc_raw) { this.setStatus('No documentation available', 'yellow'); return; }
    this.vm.push(new DocView(this.layout, e.doc_filename ?? e.archive_name, e.doc_raw));
  }

  private doBrowseArchive(): void {
    const e = this.entry(); if (!e) return;
    const svc = getCatalogSvc();
    if (!svc?.getArchiveFiles) { this.setStatus('File catalog not available', 'yellow'); return; }
    let files: any[];
    try { files = svc.getArchiveFiles(e.id); } catch { this.setStatus('Could not load file list', 'red'); return; }
    if (!files.length) { this.setStatus('No file data in catalog', 'yellow'); return; }
    this.vm.push(new ArchiveBrowseView(this.layout, e.archive_name, files));
  }
}

// ── Archive Browser (from catalog, no lha needed) ────────────────────────────

class ArchiveBrowseView extends BaseView {
  private layout: DoormanLayout;
  private archiveName: string;
  private files: any[];

  constructor(layout: DoormanLayout, archiveName: string, files: any[]) {
    super(); this.layout = layout; this.archiveName = archiveName; this.files = files;
  }

  enter(): void {
    // Hide filter panel (was shown in repo mode), use installed-style layout
    this.layout.showInstalledLayout();

    // Filter out hidden files (starting with . or __) and system files
    const visible = this.files.filter((f: any) => {
      const base = (f.path as string).split('/').pop() ?? f.path;
      return !base.startsWith('.') && !base.startsWith('__');
    });
    const junk = visible.filter((f: any) => f.is_junk).length;
    const items = visible.map((f: any) => {
      const sz = f.size < 1024 ? `${f.size}b` : `${Math.round(f.size / 1024)}k`;
      const mark = f.is_junk ? '!' : ' ';
      const w = this.layout.width - 7;
      const name = (f.path as string).length > w
        ? '<' + (f.path as string).slice((f.path as string).length - w + 1)
        : (f.path as string);
      return `${mark} ${name.padEnd(w)} ${sz.padStart(5)}`;
    });

    this.layout.setListLabel(` ${this.archiveName} (${visible.length} files) `);
    this.layout.setListItems(items);
    this.layout.setListSelect(0);
    this.layout.setInfo(
      `{yellow-fg}${this.archiveName}{/yellow-fg}\n\n` +
      `{white-fg}${visible.length} files{/white-fg}` +
      (junk > 0 ? `  {red-fg}${junk} ad files{/red-fg}` : '  {green-fg}clean{/green-fg}') +
      '\n\n{grey-fg}! = flagged as ad file{/grey-fg}'
    );
    this.layout.setFooter('{center}{yellow-fg}↑/↓{/yellow-fg} Navigate  {yellow-fg}ESC/Q{/yellow-fg} Back{/center}');
    this.layout.focusList();
    this.layout.render();

    this.keys.key(['q', 'Q'], () => this.vm.pop());
  }

  exit(): void {
    this.layout.showRepoLayout(); // restore repo layout on exit
    this.keys.release();
  }
}

// ── Document Viewer ───────────────────────────────────────────────────────────

class DocView extends BaseView {
  private layout: DoormanLayout;
  private title: string;
  private content: string;
  private panel: any; private hint: any;

  constructor(layout: DoormanLayout, title: string, content: string) {
    super(); this.layout = layout; this.title = title; this.content = content;
  }

  enter(): void {
    const isGuide = /^@(?:database|node)\b/im.test(this.content);
    if (isGuide) {
      showAmigaGuideViewer(this.layout.screen, this.content, this.title,
        () => this.vm.pop());
      return;
    }
    // Plain text viewer
    const { Panel, ScrollableBox } = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');
    const text = this.content.replace(/[^\x09\x0a\x20-\x7e]/g, '').replace(/[{}]/g, c => `\\${c}`);
    this.panel = new Panel({ parent: this.layout.screen, top: 0, left: 0, width: '100%',
      height: '100%-3', label: ` ${this.title} `, tags: true, style: { border:{ fg:'cyan' } } } as any);
    const box = new ScrollableBox({ parent: this.panel, top: 1, left: 1, width: '100%-2',
      height: '100%-2', tags: false, scrollable: true, alwaysScroll: true, content: text } as any);
    this.hint = new Panel({ parent: this.layout.screen, bottom: 0, left: 0, width: '100%', height: 3,
      tags: true, content: '{center}[Q/ESC] Close  [↑/↓/PgUp/PgDn] Scroll{/center}',
      style: { fg:'white', bg:'blue', border:{ fg:'blue' } } } as any);
    this.layout.screen.render();
    this.keys.key(['up','down','pageup','pagedown'], (_: any, key: any) => {
      const n = key?.name ?? '';
      if (n==='up') (box as any).scroll(-1); else if (n==='down') (box as any).scroll(1);
      else if (n==='pageup') (box as any).scroll(-20); else if (n==='pagedown') (box as any).scroll(20);
      this.layout.render();
    });
    this.keys.key(['q','Q'], () => this.vm.pop());
  }

  exit(): void {
    this.keys.release();
    if (this.panel) { (this.panel as any).destroy(); this.panel = null; }
    if (this.hint) { (this.hint as any).destroy(); this.hint = null; }
    this.layout.render();
  }
}

// ── Strip Selector ────────────────────────────────────────────────────────────

class StripView extends BaseView {
  private layout: DoormanLayout;
  private entry: CatalogEntry;
  private archivePath: string | null;
  private overrideDir?: string;
  private onDone: (stripped: number | null) => void;
  private checked: boolean[] = [];
  private files: any[] = [];
  private reasons: Record<string, string> = {};
  private origLabel = '';
  // True only when an installed directory backs this entry. DOORMAN strips
  // junk from an INSTALLED door's files (analyzeDirectory/
  // stripFilesFromDirectory — plain fs, no archive format concerns). It does
  // NOT rewrite archive files in place: there is no portable LHA writer
  // (lha.js only reads, lhasa on Linux has no `a` create command either),
  // and silently rewriting a .lha as ZIP bytes under the same filename would
  // mislead the sysop about what's actually on disk. See stripArchive's doc
  // comment in ami-stripper.lib.ts. When a door isn't installed yet, this
  // view still analyzes the archive (read-only, via the portable extractor
  // factory) so the sysop can preview what would be stripped, but [S] just
  // explains that installing comes first.
  private canStrip = false;

  constructor(layout: DoormanLayout, entry: CatalogEntry, archivePath: string | null, overrideDir: string | undefined,
              onDone: (stripped: number | null) => void) {
    super(); this.layout = layout; this.entry = entry; this.archivePath = archivePath;
    this.overrideDir = overrideDir; this.onDone = onDone;
  }

  /** Loud-error convention (see reportInstallFailure in RepoView): log to
   * the process console for docker logs / journald visibility, and hold a
   * persistent message in the info panel instead of a message that quietly
   * self-clears. */
  private reportFailure(step: string, detail: string): void {
    console.log(`[DOORMAN] strip failed: ${step}: ${detail} (archive=${this.entry.archive_name})`);
    this.layout.setInfo(
      `{red-fg}Strip failed{/red-fg}\n\n` +
      `{yellow-fg}Step:{/yellow-fg} ${sanitizeForTags(step)}\n` +
      `{yellow-fg}Detail:{/yellow-fg} ${sanitizeForTags(detail)}\n` +
      `{yellow-fg}Archive:{/yellow-fg} ${sanitizeForTags(this.entry.archive_name)}\n`
    );
    this.layout.render();
  }

  enter(): void {
    const lib = getStripLib();
    if (!lib) {
      console.log(`[DOORMAN] strip failed: lib-unavailable (archive=${this.entry.archive_name})`);
      this.layout.setFooter('{center}{red-fg}Stripper library not available{/red-fg}{/center}');
      this.vm.pop();
      return;
    }
    const installDir = this.overrideDir;
    this.canStrip = !!installDir;

    this.layout.setFooter('{center}{cyan-fg}Analyzing...{/cyan-fg}{/center}'); this.layout.render();
    (installDir ? lib.analyzeDirectory(installDir) : lib.analyzeArchive(this.archivePath))
      .then((result: any) => {
        if (result.stripped.length === 0) {
          this.layout.setInfo('{green-fg}No ad files found — archive is clean.{/green-fg}');
          this.layout.render();
          setTimeout(() => this.vm.pop(), 1200);
          return;
        }
        this.files = result.stripped;
        this.reasons = result.reason;
        this.checked = new Array(this.files.length).fill(true);
        this.origLabel = '';
        try { this.origLabel = (this.layout.listPanel as any).options?.label ?? ''; } catch {}
        this.renderFiles();
        this.keys.key([' '], () => {
          const idx = this.layout.listSelected;
          if (idx < this.checked.length) { this.checked[idx] = !this.checked[idx]; this.renderFiles(); }
        });
        this.keys.key(['a','A'], () => { this.checked.fill(true); this.renderFiles(); });
        this.keys.key(['n','N'], () => { this.checked.fill(false); this.renderFiles(); });
        this.keys.key(['s','S'], () => {
          if (!this.canStrip) {
            this.layout.setInfo(
              `{yellow-fg}This door is not installed.{/yellow-fg}\n\n` +
              `DOORMAN strips junk from an INSTALLED door's files, not from\n` +
              `the archive itself — there is no portable way to rewrite a\n` +
              `.lha/.lzx archive in its original format on this platform.\n\n` +
              `Install {yellow-fg}${sanitizeForTags(this.entry.archive_name)}{/yellow-fg} first, then Strip.`
            );
            this.layout.render();
            return;
          }
          this.doStrip(lib, installDir as string);
        });
        this.keys.key(['q','Q'], () => { this.vm.pop(); this.onDone(null); });
      })
      .catch((e: any) => {
        this.reportFailure('analyze', e?.message ?? String(e));
        setTimeout(() => this.vm.pop(), 2500);
      });
  }

  private renderFiles(): void {
    const items = this.files.map((f: any, i: number) => {
      const box = this.checked[i] ? '[X]' : '[ ]';
      const fpath = f.path as string;
      const name = fpath.length > 24 ? '<' + fpath.slice(fpath.length - 23) : fpath.padEnd(24);
      return `${box} ${name}`;
    });
    const selCount = this.checked.filter(Boolean).length;
    const modeTag = this.canStrip ? '' : ' (preview)';
    (this.layout.listPanel as any).setLabel(` ${this.entry.archive_name} — Strip Ads${modeTag} `);
    this.layout.setListItems(items);
    const sel = this.files[this.layout.listSelected];
    const hint = this.canStrip
      ? '\n{grey-fg}[Space] Toggle  [A] All  [N] None  [S] Strip  [ESC/Q] Cancel{/grey-fg}'
      : '\n{grey-fg}[Space] Toggle  [A] All  [N] None  Not installed — [S] shows how  [ESC/Q] Cancel{/grey-fg}';
    this.layout.setInfo(
      `{yellow-fg}${selCount}/${this.files.length} selected{/yellow-fg}\n\n` +
      (sel ? `{cyan-fg}${(sel.path as string)}{/cyan-fg}\nReason: ${this.reasons[sel.path] ?? '?'}\n` : '') +
      hint
    );
    this.layout.setFooter(this.canStrip
      ? '{center}{yellow-fg}Space{/yellow-fg}=Toggle  {yellow-fg}A{/yellow-fg}=All  {yellow-fg}N{/yellow-fg}=None  {yellow-fg}S{/yellow-fg}=Strip  {yellow-fg}ESC/Q{/yellow-fg}=Cancel{/center}'
      : '{center}{yellow-fg}Space{/yellow-fg}=Toggle  {yellow-fg}A{/yellow-fg}=All  {yellow-fg}N{/yellow-fg}=None  {grey-fg}Preview only{/grey-fg}  {yellow-fg}ESC/Q{/yellow-fg}=Cancel{/center}'
    );
    this.layout.render();
  }

  private doStrip(lib: any, installDir: string): void {
    const toStrip = this.files.filter((_: any, i: number) => this.checked[i]);
    if (toStrip.length === 0) { this.vm.pop(); this.onDone(null); return; }
    this.layout.setFooter('{center}{cyan-fg}Stripping...{/cyan-fg}{/center}'); this.layout.render();
    (async () => {
      try {
        lib.stripFilesFromDirectory(installDir, toStrip.map((f: any) => f.path));
        const svc = getCatalogSvc();
        if (svc) {
          try { svc.updateJunkCount(this.entry.id, this.files.length - toStrip.length); } catch {}
          try { svc.removeArchiveFiles(this.entry.id, toStrip.map((f: any) => f.path)); } catch {}
        }
        this.vm.pop();
        this.onDone(toStrip.length);
      } catch (e: any) {
        this.reportFailure('strip', e?.message ?? String(e));
        setTimeout(() => { this.vm.pop(); this.onDone(null); }, 2500);
      }
    })();
  }

  exit(): void {
    if (this.origLabel) try { (this.layout.listPanel as any).setLabel(this.origLabel); } catch {}
    this.keys.release();
  }

  onEsc(): void { this.vm.pop(); this.onDone(null); }
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────

class ConfirmView extends BaseView {
  private layout: DoormanLayout;
  private content: string; private confirmText: string; private cancelText: string;
  private onConfirm: () => void;

  constructor(layout: DoormanLayout, content: string, confirmText: string, cancelText: string,
              onConfirm: () => void) {
    super(); this.layout = layout; this.content = content;
    this.confirmText = confirmText; this.cancelText = cancelText; this.onConfirm = onConfirm;
  }

  enter(): void {
    new ConfirmModal({
      parent: this.layout.screen, title: ` ${this.confirmText} `,
      content: this.content, confirmText: this.confirmText, cancelText: this.cancelText,
      confirmColor: 'red', cancelColor: 'green', style: { border:{ fg:'yellow' } },
      onConfirm: () => { this.onConfirm(); this.vm.pop(); },
      onCancel: () => this.vm.pop(),
    } as any).display();
  }

  exit(): void { this.keys.release(); }
}

// ── Text Input ────────────────────────────────────────────────────────────────

class InputView extends BaseView {
  private layout: DoormanLayout;
  private prompt: string; private defaultValue: string;
  private onSubmit: (value: string | null) => void;

  constructor(layout: DoormanLayout, prompt: string, defaultValue: string,
              onSubmit: (value: string | null) => void) {
    super(); this.layout = layout; this.prompt = prompt;
    this.defaultValue = defaultValue; this.onSubmit = onSubmit;
  }

  enter(): void {
    const p = new Prompt({ parent: this.layout.screen, top:'center', left:'center',
      width: 50, height: 7, tags: true, style: { border:{ fg:'yellow' } }, overlay: true } as any);
    (p as any).showInput(this.prompt, this.defaultValue, (_err: any, val?: string) => {
      (p as any).destroy();
      this.vm.pop();
      this.onSubmit(val ?? null);
    });
    this.layout.render();
  }

  exit(): void { this.keys.release(); }
  onEsc(): void { this.vm.pop(); this.onSubmit(null); }
}

// ── Info Editor Overlay ───────────────────────────────────────────────────────

class InfoEditorOverlayView extends BaseView {
  private layout: DoormanLayout; private bbs: any; private command: string;
  private overlayInstance: InfoEditorOverlay | null = null;

  constructor(layout: DoormanLayout, bbs: any, command: string) {
    super(); this.layout = layout; this.bbs = bbs; this.command = command;
  }

  enter(): void {
    this.overlayInstance = new InfoEditorOverlay({ screen: this.layout.screen, command: this.command, bbs: this.bbs,
      onClose: () => this.vm.pop() });
    this.layout.render();
  }

  exit(): void { this.keys.release(); }
  onEsc(): void { this.overlayInstance?.requestClose(); }
}

// ── File Explorer Overlay ─────────────────────────────────────────────────────

class FileExplorerOverlayView extends BaseView {
  private layout: DoormanLayout; private doorPath: string;

  constructor(layout: DoormanLayout, doorPath: string) { super(); this.layout = layout; this.doorPath = doorPath; }

  enter(): void {
    new FileExplorerOverlay({ screen: this.layout.screen, doorPath: this.doorPath,
      onClose: () => this.vm.pop() });
  }

  exit(): void { this.keys.release(); }

  // Let FileExplorerOverlay handle all ESC internally via screen.on('keypress').
  // The ViewManager's ESC would fire first and destroy the overlay prematurely.
  onEsc(): void { /* no-op */ }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export async function createApp(session: DoorSession): Promise<void> {
  const { bbs, user } = session;
  if (!user || (user.secLevel ?? 0) < 250) {
    bbs.write('\r\n\x1b[31mAccess Denied: SysOp only\x1b[0m\r\n'); return;
  }

  let doors = await fetchDoors(bbs);
  if (doors.length === 0) {
    bbs.write('\r\n\x1b[36mNo doors installed.\x1b[0m\r\n'); return;
  }

  const screen = new Screen({ smartCSR: true, fullUnicode: true, title: 'DOORMAN v2',
    output: (data: string) => bbs.write(data) } as any);

  const inputManager = new DoorInputManager(session, screen, { enableGameMode:false, enableGrabKeys:false, enableMouse:true });
  inputManager.enable();

  const nodeId = (session.bbsSession as any)?.nodeId ?? '?';
  const layout = new DoormanLayout(screen, nodeId);
  const vm = new ViewManager(screen);

  // Hide cursor after every render — blessed re-shows it on each refresh.
  // This is the only reliable way since blessed ignores external cursor state.
  screen.on('render', () => { bbs.write('\x1b[?25l'); });
  screen.on('resize', () => { screen.render(); });
  screen.on('destroy', () => { inputManager.disable(); bbs.write('\x1b[?25h'); });

  vm.push(new InstalledView(layout, bbs, doors));

  await new Promise<void>(resolve => { screen.on('destroy', resolve); });
}
