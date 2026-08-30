/**
 * DOORMAN v2 — SysOp Door Management Tool
 * Rewritten around a ViewManager / view stack so each screen owns its
 * own key bindings and ESC always pops cleanly.
 */

import * as path from 'path';
import { isSafeToDelete, resolveDoorInstallDir } from './safe-install-dir';
import { ActionLog, installLogPanel } from './action-log';
import { ArchiveBrowseView } from './archive-browse-view';
import {
  buildDoorInfoContent,
  extractAndRegisterDoor,
  extractArchiveTo,
  findExtractedBinary,
} from './install-core';
import { commandClaimedByOtherArchive, installConsumerDoor } from './install-core';
import type { InstallDeps, InstallStep, DoorInstallEntry } from './install-core';
// Re-exported: the install core moved to its own module when app.ts passed
// the 2000-line ceiling, and the tests import these from here.
export {
  buildDoorInfoContent,
  extractAndRegisterDoor,
  extractArchiveTo,
  findExtractedBinary,
  commandClaimedByOtherArchive,
  installConsumerDoor,
} from './install-core';
export type {
  InstallDeps, InstallOutcome, DoorInstallEntry, ConsumerInstallDeps, ConsumerInstallOutcome,
} from './install-core';
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
  filterManifestEntries, formatOfflineSuffix, consumerCacheFilePath, mergeDoorDetailIntoEntry,
} from './repoDataSource';
import type {
  DoorRepoMode, CatalogEntry as RepoCatalogEntry, LocalCatalogRow, LocalCatalogLookup, InstallLookup,
} from './repoDataSource';
import { downloadArchive, fetchDoorDetail, fetchManifest } from './repo-client';
import type { RepoClientConfig, FetchManifestResult, RepoDoorDetail } from './repo-client';
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
function getInstallsRepo(): any {
  // Same require.cache discovery as getCatalogSvc -- door_installs is the
  // single source of truth for what THIS node has installed.
  for (const k of Object.keys(require.cache))
    if (k.includes('door-installs.repository')) return require.cache[k]?.exports ?? null;
  return null;
}

// Shared by owner/consumer install sites: no-op + warning, not a throw, when unavailable.
function recordInstallSafe(entry: DoorInstallEntry): void {
  const repo = getInstallsRepo();
  if (!repo) {
    console.log('[DOORMAN] warning: door-installs repository unavailable -- install not recorded locally');
    return;
  }
  repo.recordInstall(entry);
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

/** Adapts the installs repository into the InstallLookup shape
 * mapManifestDoorToEntry expects. Reads listInstalls() ONCE into a Map
 * rather than opening a sqlite connection per manifest row (was 3300 opens
 * per browse); missing repo or a thrown read both fold into "nothing known
 * locally". Keys are lower-cased -- archive_name lookups are NOCASE. */
function buildInstallLookup(): InstallLookup {
  const repo = getInstallsRepo();
  let byArchive: Map<string, { command: string; install_dir: string }> | null = null;
  try {
    byArchive = new Map(
      (repo?.listInstalls?.() ?? []).map((row: any) =>
        [String(row.archive_name).toLowerCase(), { command: row.command, install_dir: row.install_dir }])
    );
  } catch {
    byArchive = null;
  }
  return (archiveName: string) => byArchive?.get(archiveName.toLowerCase()) ?? null;
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
    // Same clamp as the repo view: uninstalling or deleting the last door in
    // the list would otherwise leave the index one past the end.
    this.layout.setListSelect(clampSelection(selectIdx, items.length));
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
        fetchDoors(this.bbs).then(doors => { this.doors = doors; this.refresh(this.layout.listSelected); });
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
        const isTS = ['TS','typescript','SDK'].includes(d.type);
        const id = isTS ? (d.location?.replace(/^Doors[\\/]/i,'').split(/[\\/]/)[0] || d.command) : d.command;

        // The delete used to run behind a single status line, and the
        // backend did its filesystem work synchronously - so the board froze
        // and the sysop watched a still screen with no idea how far along it
        // was. The work is asynchronous now; this shows each stage as it
        // happens, in the same panel an install reports into.
        const log = new ActionLog(`Deleting ${d.name}`);
        const paint = (extra = '') => {
          this.layout.setInfo(log.render() + extra);
          this.layout.render();
        };
        this.setStatus(`Deleting ${d.name}...`, 'yellow', 30000);
        log.ok(`${d.command}: ${isTS ? `Doors/${id}` : `${id} (${d.type})`}`);
        paint('\n\n{yellow-fg}Working...{/yellow-fg}\n');

        try {
          // Each step is painted AS it happens. DOORMAN runs in the backend's
          // own process, so this callback is a direct call from the delete -
          // and because the filesystem work between steps is asynchronous,
          // the repaint actually reaches the terminal instead of arriving as
          // one finished log after the pause.
          const onStep = (step: { kind: 'ok' | 'skip' | 'fail'; text: string }) => {
            log.add(step.kind, step.text);
            paint('\n\n{yellow-fg}Working...{/yellow-fg}\n');
          };
          const r = await (this.bbs as any).deleteDoor(id, isTS, onStep);
          if (r.success) {
            // Belt and braces: deleteDoor refreshes backend caches itself,
            // but a stale registry here left deleted doors visible with no
            // feedback (2026-08-15). Refresh again from our side, re-fetch,
            // and confirm persistently in the info panel.
            log.ok('reloading the door registry');
            paint('\n\n{yellow-fg}Reloading...{/yellow-fg}\n');
            await refreshDoorRegistry();
            this.doors = await fetchDoors(this.bbs);
            this.refresh(Math.max(0, idx - 1));

            // The door is only deleted when it has left the list the sysop is
            // looking at. Saying "deleted" while it is still on screen is the
            // exact report this fix came from.
            const stillListed = this.doors.some(other => other.command === d.command);
            if (stillListed) {
              log.fail(`${d.command} is still registered - the BBS still lists it`);
              this.setStatus(`${d.name} still listed`, 'red', 8000);
              paint(`\n\n{red-fg}Still registered{/red-fg}\n\n` +
                `The files were removed but ${sanitizeForTags(d.command)} is still in the door list.\n`);
              console.log(`[DOORMAN] delete incomplete: ${d.command} still in the registry after delete`);
              return;
            }

            log.ok(`${d.command} is gone from the door list`);
            this.setStatus(`${d.name} deleted`, 'green', 8000);
            paint(`\n\n{green-fg}Deleted{/green-fg}\n`);
          } else {
            log.fail(String(r.message ?? 'unknown error'));
            this.setStatus(`Failed: ${r.message}`, 'red', 8000);
            paint(`\n\n{red-fg}Delete failed{/red-fg}\n`);
            console.log(`[DOORMAN] delete failed: ${d.name}: ${r.message}`);
          }
        } catch (e: any) {
          log.fail(e?.message ?? String(e));
          this.setStatus(`Error: ${e.message}`, 'red', 8000);
          paint(`\n\n{red-fg}Delete failed{/red-fg}\n`);
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
export {
  wrapText,
  clampSelection,
  repoViewCurationAllowed,
  repoViewFooterParts,
  registerRepoViewActionKeys,
  entryHasDoc,
  renderFileLines,
  formatSuggestedTooltypes,
  type RepoViewHotkeyHandlers,
} from './repo-view-helpers';
import {
  wrapToInfoPane,
  clampSelection,
  repoViewCurationAllowed,
  repoViewFooterParts,
  registerRepoViewActionKeys,
  entryHasDoc,
  renderFileLines,
  formatSuggestedTooltypes,
  type RepoViewHotkeyHandlers,
  type ArchiveFileRow,
} from './repo-view-helpers';

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

  // Per-archive detail (GET /doors/:archiveName), consumer mode only. The
  // manifest is a list; everything the info pane, the doc viewer and the
  // archive browser want about ONE door - version, the suggested tooltypes,
  // the documentation, the file list - lives behind this endpoint.
  //
  // Cached by archive name for the life of the view: browsing back and
  // forth over the same handful of doors, or pressing V then A on one, is
  // one request per door and not one per keystroke. A cached `null` is a
  // real answer ("the repo has nothing for this archive") and stops the
  // retry loop that re-asking on every render would be.
  private detailCache = new Map<string, RepoDoorDetail | null>();
  private detailInFlight = new Set<string>();
  private detailTimer: any = null;
  // False between exit() and the next enter() (the ViewManager exits this
  // view whenever a child is pushed) - an in-flight fetch that lands while
  // a ConfirmView is on screen still fills the cache, but must not repaint
  // the panels underneath it.
  private active = false;
  private static readonly DETAIL_DEBOUNCE_MS = 350;

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
    // Owner mode AND disabled mode share loadLocalCatalogEntries.
    // buildInstallLookup() overlays door_installs (Task 5) so a fresh
    // owner-mode install still shows as installed here.
    const svc = getCatalogSvc();
    const result = loadLocalCatalogEntries(svc, this.filter, buildInstallLookup());
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
      const lookupInstall = buildInstallLookup();
      const result = await loadConsumerCatalog(this.repoMode.url, cacheFile, lookupLocal, fetchManifest, lookupInstall);
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
    this.layout.setListSelect(clampSelection(selectIdx, this.visibleEntries.length));
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

  /** The selected entry with whatever the detail endpoint has already told
   *  us folded in. Identical to the entry itself in owner mode, and until
   *  the fetch lands. */
  private entryWithDetail(e: CatalogEntry): CatalogEntry {
    const detail = this.detailCache.get(e.archive_name);
    return detail ? mergeDoorDetailIntoEntry(e, detail) : e;
  }

  /** The archive's contents, from whichever source this node has: the local
   *  catalog (owner), or the already-fetched detail (consumer). */
  private archiveFilesFor(e: CatalogEntry): ArchiveFileRow[] {
    try {
      const files: any[] = getCatalogSvc()?.getArchiveFiles?.(e.id) ?? [];
      if (files.length > 0) return files as ArchiveFileRow[];
    } catch { /* the local catalog is optional - a consumer has none */ }
    return this.detailCache.get(e.archive_name)?.files ?? [];
  }

  private updateInfo(): void {
    const selected = this.entry();
    if (!selected) {
      this.layout.setInfo(this.noEntryMessage());
      return;
    }
    const e = this.entryWithDetail(selected);

    const fileLines = renderFileLines(this.archiveFilesFor(e));

    let content = `{yellow-fg}${e.archive_name}{/yellow-fg}  ${e.door_type ?? 'XIM'}` +
      (e.version ? `  {white-fg}${sanitizeForTags(e.version)}{/white-fg}` : '') +
      (e.archive_size ? `  ${Math.round(e.archive_size / 1024)}k` : '') +
      (e.installed ? `  {green-fg}[${e.installed_as}]{/green-fg}` : '');

    if (e.file_id_diz) {
      content += '\n\n' + sanitizeForTags(e.file_id_diz);
    } else if (e.description) {
      content += `\n\n{white-fg}${sanitizeForTags(e.description)}{/white-fg}`;
    }
    content += fileLines;

    // What the door's author configured, as the catalog read it. Shown, not
    // applied: an install takes the archive's own icon, tooltypes and all
    // (extractAndRegisterDoor), and plenty of these rows are half-read
    // guesses from a doc file.
    const tooltypes = formatSuggestedTooltypes(e.suggested_tooltypes);
    if (tooltypes.length > 0) {
      content += `\n{grey-fg}─── suggested tooltypes{/grey-fg}  {grey-fg}──────────────────{/grey-fg}\n` +
        tooltypes.map(line => `{grey-fg}${sanitizeForTags(line)}{/grey-fg}`).join('\n') + '\n';
    }

    this.layout.setInfo(content);
    this.scheduleDetailFetch(selected.archive_name);
  }

  /**
   * Asks the door server about the selected archive, once the cursor has
   * settled. Consumer mode only - an owner already has every one of these
   * fields in its own catalog.
   *
   * Debounced because this runs from updateInfo, which runs on every
   * 'select item': holding an arrow key down the length of a 5000-row list
   * would otherwise be one HTTP request per row. Only the archive still
   * selected when the timer fires is fetched.
   */
  private scheduleDetailFetch(archiveName: string): void {
    if (this.repoMode.kind !== 'consumer') return;
    if (this.detailCache.has(archiveName) || this.detailInFlight.has(archiveName)) return;
    clearTimeout(this.detailTimer);
    this.detailTimer = setTimeout(() => {
      const current = this.entry();
      if (!current || current.archive_name !== archiveName) return;
      if (this.detailCache.has(archiveName) || this.detailInFlight.has(archiveName)) return;
      this.detailInFlight.add(archiveName);
      const cfg = this.consumerClientConfig();
      void (async () => {
        let detail: RepoDoorDetail | null = null;
        try {
          detail = await fetchDoorDetail(cfg, archiveName);
        } finally {
          this.detailInFlight.delete(archiveName);
        }
        this.detailCache.set(archiveName, detail);
        // Repaint only if this is still the door on screen AND this view is
        // still the one on screen - a fetch that lands under a pushed child
        // view has done its job by filling the cache.
        if (!this.active) return;
        if (this.entry()?.archive_name !== archiveName) return;
        this.updateInfo();
        this.updateFooter();
        this.layout.render();
      })();
    }, RepoView.DETAIL_DEBOUNCE_MS);
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
    const selected = this.entry();
    const e = selected ? this.entryWithDetail(selected) : null;
    const hasJunk = e ? this.getEntryJunkCount(e) > 0 : false;
    this.layout.setFooter(repoViewFooterParts(this.repoMode, {
      installed: !!e?.installed,
      hasJunk,
      hasDoc: entryHasDoc(e),
    }));
  }

  private _onSelectItem: any;

  enter(): void {
    this.active = true;
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
      onDelete: () => this.doDeleteFromRepo(),
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
    clearTimeout(this.detailTimer);
    this.active = false;
    this.keys.release();
  }

  onEsc(): void { this.vm.pop(); } // returns to installed list

  /**
   * Redraw the list AFTER the door registry has actually reloaded.
   *
   * The uninstall used to fire `void refreshDoorRegistry()` and redraw in the
   * same tick, so the list was rebuilt from the still-cached registry and the
   * door that had just been deleted was still on it - reported as "when I
   * delete a door in doorman the list doesn't update".
   */
  private async refreshAfterRegistry(): Promise<void> {
    try {
      await refreshDoorRegistry();
    } finally {
      this.refresh(this.layout.listSelected);
    }
  }

  private doInstallUninstall(): void {
    const e = this.entry(); if (!e) return;
    if (e.installed) {
      this.vm.push(new ConfirmView(this.layout,
        `Uninstall {yellow-fg}${e.installed_as}{/yellow-fg}?\n\nRemoves .info + Doors/${e.installed_as}/`,
        'Uninstall', 'Cancel',
        () => {
          // Every path this removes is checked first and named as it goes.
          // Unguarded, this deleted the whole Doors directory on the live
          // board - install_dir is written as `Doors/${command}`, so a record
          // with no command gives `Doors/`, and a recursive force-delete of
          // that takes every door with it, DOORMAN included.
          const log = new ActionLog(`Uninstalling ${e.installed_as}`);
          const removed: string[] = [];
          const bbsCmdDir = path.join(PROJECT_ROOT, 'Commands', 'BBSCmd');
          const infoPath = path.join(bbsCmdDir, `${e.installed_as}.info`);
          if (fs.existsSync(infoPath)) {
            fs.unlinkSync(infoPath);
            removed.push(path.relative(PROJECT_ROOT, infoPath));
            log.ok(`removed ${path.relative(PROJECT_ROOT, infoPath)}`);
          } else {
            log.skip(`no ${path.relative(PROJECT_ROOT, infoPath)} to remove`);
          }

          const decision = resolveDoorInstallDir(PROJECT_ROOT, e.install_dir);
          if (isSafeToDelete(decision)) {
            if (fs.existsSync(decision.path)) {
              fs.rmSync(decision.path, { recursive: true, force: true });
              removed.push(path.relative(PROJECT_ROOT, decision.path) + '/');
              log.ok(`removed ${path.relative(PROJECT_ROOT, decision.path)}/`);
            } else {
              log.skip(`${path.relative(PROJECT_ROOT, decision.path)}/ was not there`);
            }
          } else {
            // Refuse and say so. Leaving a directory behind is recoverable;
            // deleting the wrong one is not.
            log.fail(`kept the files: ${decision.reason}`);
            this.setStatus(`Kept the files: ${decision.reason}`, 'yellow', 8000);
            this.layout.setInfo(log.render());
            this.layout.render();
            getInstallsRepo()?.removeInstall(e.installed_as ?? e.archive_name);
            void this.refreshAfterRegistry();
            return;
          }
          // door_installs (Task 5) is keyed by command -- installed_as is
          // the command this door was installed as; archive_name is only a
          // fallback for a stale row where installed_as was never set.
          getInstallsRepo()?.removeInstall(e.installed_as ?? e.archive_name);
          log.ok('dropped the install record');
          this.setStatus(`Uninstalled ${e.installed_as}: ${log.summary()}`, 'green', 6000);
          this.layout.setInfo(log.render());
          this.layout.render();
          void this.refreshAfterRegistry();
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
                  getInstallByCommand: (command) => getInstallsRepo()?.getInstallByCommand(command) ?? null,
                  recordInstall: recordInstallSafe,
                  refreshDoorRegistry,
                  mkdir: (dir) => fs.mkdirSync(dir, { recursive: true }),
                  unlink: (p) => { try { fs.unlinkSync(p); } catch { /* never existed, or already removed */ } },
                  fetchDoorDetail,
                }
              );
              if (!outcome.ok) {
                this.reportInstallFailure(outcome.step, outcome.detail, tmpArchivePath, e.archive_name);
                return;
              }
              this.setStatus(`Installed as ${finalCmd} (${outcome.fileCount} files, ${outcome.doorType})`, 'green', 4000);
              this.layout.setInfo(
                installLogPanel(`Installed ${finalCmd}`, outcome.steps) + '\n\n' +
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
                  // Same door_installs shape + collision guard as consumer
                  // mode, using the real local catalog row's id (e.id).
                  recordInstall: (installedCmd, installedDir) => {
                    // The archive's own command wins, so record that one.
                    const chk = (cmd: string) => getInstallsRepo()?.getInstallByCommand(cmd) ?? null;
                    if (commandClaimedByOtherArchive(chk, installedCmd, e.archive_name)) return;
                    recordInstallSafe({
                      id: `install-${installedCmd}`,
                      catalog_id: e.id ?? null,
                      archive_name: e.archive_name,
                      command: installedCmd,
                      install_dir: installedDir,
                      door_type: e.door_type ?? null,
                      name: e.name ?? null,
                      md5: null,
                      description: e.description ?? null,
                      category: e.category ?? null,
                      version: e.version ?? null,
                      release_group: e.release_group ?? null,
                      source_url: null, // resolved from this BBS's own local archive corpus, not the central repo
                      source_revision: null,
                    });
                  },
                  refreshDoorRegistry,
                }
              );
              if (!outcome.ok) {
                this.reportInstallFailure(outcome.step, outcome.detail, resolvedArchive, e.archive_name);
                return;
              }
              this.setStatus(`Installed as ${finalCmd} (${outcome.fileCount} files, ${outcome.doorType})`, 'green', 4000);
              this.layout.setInfo(
                installLogPanel(`Installed ${finalCmd}`, outcome.steps) + '\n\n' +
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

  /**
   * Remove a door from the repository: catalog rows and the archive file,
   * permanently.
   *
   * Deliberately does NOT consult `installed`. Install state and repository
   * publication share a catalog row but are different concerns, and making
   * curation wait on local state gets it backwards. A door installed here
   * keeps running - its directory and BBS command are untouched - the
   * repository simply stops carrying it.
   *
   * The confirmation says "permanently" and names the archive because there
   * is no undo: the archive is unlinked, and D sits one key away from S.
   */
  private doDeleteFromRepo(): void {
    const e = this.entry(); if (!e) return;
    const svc = getCatalogSvc();
    if (!svc?.deleteCatalogEntry) {
      this.setStatus('Catalog service not available', 'yellow');
      return;
    }

    this.vm.push(new ConfirmView(this.layout,
      `Delete {yellow-fg}${e.archive_name}{/yellow-fg} from the repository?\n\n` +
      `This removes the catalog entry AND the archive file.\n` +
      `It cannot be undone.` +
      (e.installed ? `\n\n{green-fg}${e.installed_as}{/green-fg} stays installed and keeps working.` : ''),
      'Delete', 'Cancel',
      () => {
        let result: { ok: boolean; archiveName?: string; fileRemoved?: boolean; reason?: string };
        try {
          result = svc.deleteCatalogEntry(e.id);
        } catch (err: any) {
          this.setStatus(`Delete failed: ${err?.message ?? err}`, 'red', 6000);
          return;
        }

        if (!result.ok) {
          this.setStatus(`Delete failed: ${result.reason ?? 'unknown error'}`, 'red', 6000);
          return;
        }

        this.setStatus(
          result.fileRemoved
            ? `Deleted ${result.archiveName}`
            : `Deleted ${result.archiveName} (archive was already missing)`,
          'green', 4000
        );
        // The row is gone, so the list is rebuilt - but the cursor stays on
        // the same INDEX, which now holds the door that moved up into the
        // slot. clampSelection() handles deleting the last row.
        this.refresh(this.layout.listSelected);
      }
    ));
  }

  /**
   * The detail this view already holds for an archive, fetching it once if
   * it does not. Consumer mode only; an owner reads its own catalog.
   *
   * Every per-archive action shares this one cache, so pressing [V] then
   * [A] on the same door is one request, not two - and the row the info
   * pane already fetched costs neither.
   */
  private async ensureDetail(archiveName: string): Promise<RepoDoorDetail | null> {
    if (this.detailCache.has(archiveName)) return this.detailCache.get(archiveName) ?? null;
    if (this.repoMode.kind !== 'consumer') return null;
    this.detailInFlight.add(archiveName);
    let detail: RepoDoorDetail | null = null;
    try {
      detail = await fetchDoorDetail(this.consumerClientConfig(), archiveName);
    } finally {
      this.detailInFlight.delete(archiveName);
    }
    this.detailCache.set(archiveName, detail);
    return detail;
  }

  /**
   * Documentation comes from wherever this BBS's catalog actually is.
   *
   * An owner has it locally, in the entry's own doc_raw. A consumer does not
   * - the catalog lives on the door server - so it asks the server, which
   * has answered at /api/door-repo/doors/:archiveName all along. Before
   * this, [V]iew doc on a consumer did nothing at all.
   */
  private doViewDoc(): void {
    const selected = this.entry();
    if (!selected) return;
    const e = this.entryWithDetail(selected);
    if (e.doc_raw) {
      this.vm.push(new DocView(this.layout, e.doc_filename ?? e.archive_name, e.doc_raw));
      return;
    }
    if (this.repoMode.kind !== 'consumer') {
      this.setStatus('No documentation available', 'yellow');
      return;
    }

    this.setStatus('Fetching documentation...', 'yellow', 15000);
    void (async () => {
      const detail = await this.ensureDetail(e.archive_name);
      if (!detail?.doc) { this.setStatus('No documentation available', 'yellow', 4000); return; }
      this.vm.push(new DocView(this.layout, detail.docFilename ?? e.archive_name, detail.doc));
    })();
  }

  /** The archive's contents, from the local catalog or from the server. */
  private doBrowseArchive(): void {
    const e = this.entry(); if (!e) return;

    const svc = getCatalogSvc();
    if (svc?.getArchiveFiles) {
      let files: any[] = [];
      try { files = svc.getArchiveFiles(e.id); } catch { files = []; }
      if (files.length) {
        this.vm.push(new ArchiveBrowseView(this.layout, e.archive_name, files));
        return;
      }
    }

    if (this.repoMode.kind !== 'consumer') {
      this.setStatus('No file data in catalog', 'yellow');
      return;
    }

    this.setStatus('Fetching file list...', 'yellow', 15000);
    void (async () => {
      const detail = await this.ensureDetail(e.archive_name);
      if (!detail || detail.files.length === 0) {
        this.setStatus('The repo has no file list for this archive', 'yellow', 4000);
        return;
      }
      // ArchiveBrowseView reads the catalog's own column names.
      this.vm.push(new ArchiveBrowseView(this.layout, e.archive_name,
        detail.files.map(f => ({ path: f.path, size: f.size, is_junk: f.isJunk ? 1 : 0 }))));
    })();
  }

  /** The repo client config for this node's consumer mode. */
  private consumerClientConfig(): RepoClientConfig {
    return {
      url: (this.repoMode as { url: string }).url,
      cacheFile: consumerCacheFilePath(PROJECT_ROOT),
    };
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
    // Keeps 0x80+ for the same reason sanitizeForTags() does: Amiga door
    // documentation is drawn with high-bit glyphs, and dropping them pulls
    // the columns out of alignment. Tabs and newlines survive; other control
    // characters do not.
    const text = this.content.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').replace(/[{}]/g, c => `\\${c}`);
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
  /** Set when this strip would edit the repository archive rather than an
   *  installed directory; `reason` explains why it cannot, when it cannot. */
  private archiveStrip: { reason: string | null } | null = null;

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
    // Two ways to strip. An installed door's DIRECTORY is edited in place
    // (always possible, pure fs). A repository ARCHIVE is edited in place by
    // the lha binary, which works for .lha/.lzh and not for .lzx - so a door
    // that was never installed can still be cleaned on the server, which is
    // the whole point of curating the repo rather than each install.
    this.canStrip = !!installDir;
    this.archiveStrip = null;
    if (!installDir && this.archivePath) {
      const svc = getCatalogSvc();
      const capability = svc?.canStripArchiveOnServer?.(this.archivePath);
      if (capability?.ok) {
        this.canStrip = true;
        this.archiveStrip = { reason: null };
      } else if (capability?.reason) {
        this.archiveStrip = { reason: capability.reason };
      }
    }

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
        this.keys.key(['l','L'], () => { this.learnSelected(); });
        this.keys.key(['s','S'], () => {
          if (this.canStrip && !this.overrideDir && this.archiveStrip) {
            this.doStripArchive();
            return;
          }
          if (!this.canStrip) {
            // Wrapped to the pane rather than hard-wrapped at a guessed
            // width: the old fixed line breaks re-broke mid-word on a
            // narrower pane ("fi les", "thi s platform").
            const why = this.archiveStrip?.reason
              ?? "This archive cannot be edited in place on this server.";
            this.layout.setInfo(
              `{yellow-fg}Cannot strip this archive.{/yellow-fg}\n\n` +
              wrapToInfoPane(why, this.layout) + '\n\n' +
              wrapToInfoPane(
                `Install ${sanitizeForTags(this.entry.archive_name)} first and strip the ` +
                `installed copy instead.`, this.layout
              )
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

  /**
   * Learn the currently selected file as a junk pattern. This teaches the
   * central classifier to recognise this filename in future archives.
   * Re-runs the analysis afterward so the sysop sees the updated verdict.
   */
  private learnSelected(): void {
    const idx = this.layout.listSelected;
    const sel = this.files[idx];
    if (!sel) return;
    const filePath = sel.path as string;

    const { learnPattern } = require('./repo-client') as typeof import('./repo-client');
    const { resolveDoorRepoMode, consumerCacheFilePath } = require('./repoDataSource') as typeof import('./repoDataSource');
    const mode = resolveDoorRepoMode();
    if (mode.kind !== 'consumer') {
      this.layout.setInfo('{yellow-fg}No door-repo config — cannot learn patterns.{/yellow-fg}');
      this.layout.render();
      return;
    }
    const cfg: RepoClientConfig = { url: mode.url, cacheFile: consumerCacheFilePath(PROJECT_ROOT) };

    this.layout.setFooter('{center}{cyan-fg}Learning pattern...{/cyan-fg}{/center}');
    this.layout.render();

    learnPattern(cfg, filePath, mode.learnKey, this.entry.archive_name, filePath)
      .then((result: { ok: boolean; duplicate?: boolean }) => {
        if (result.ok) {
          const msg = result.duplicate ? 'Pattern already known' : `Learned: ${filePath}`;
          this.layout.setInfo(`{green-fg}${msg}{/green-fg}`);
        } else {
          this.layout.setInfo('{yellow-fg}Learn failed — server may not have DOORREPO_LEARN_KEY set.{/yellow-fg}');
        }
        this.layout.render();
        setTimeout(() => { this.layout.setInfo(''); this.layout.render(); }, 1500);
      })
      .catch(() => {
        this.layout.setInfo('{yellow-fg}Learn failed.{/yellow-fg}');
        this.layout.render();
      });
  }

  /**
   * Strip the REPOSITORY archive in place: the published bytes change, so
   * the backend re-describes the row (size, digests, junk rows) in the same
   * step. Every other sysop downloads this file, which is why it is worth
   * doing here rather than making each of them strip their own copy.
   */
  private doStripArchive(): void {
    const toStrip = this.files.filter((_: any, i: number) => this.checked[i]);
    if (toStrip.length === 0) { this.vm.pop(); this.onDone(null); return; }

    const svc = getCatalogSvc();
    if (!svc?.stripArchiveOnServer) {
      this.reportFailure('strip', 'catalog service unavailable');
      setTimeout(() => { this.vm.pop(); this.onDone(null); }, 2500);
      return;
    }

    this.layout.setFooter('{center}{cyan-fg}Stripping archive...{/cyan-fg}{/center}');
    this.layout.render();

    let result: { ok: boolean; removed?: number; reason?: string };
    try {
      result = svc.stripArchiveOnServer(this.entry.id, toStrip.map((f: any) => f.path));
    } catch (e: any) {
      this.reportFailure('strip', e?.message ?? String(e));
      setTimeout(() => { this.vm.pop(); this.onDone(null); }, 2500);
      return;
    }

    if (!result.ok) {
      this.reportFailure('strip', result.reason ?? 'unknown error');
      setTimeout(() => { this.vm.pop(); this.onDone(null); }, 2500);
      return;
    }

    this.vm.pop();
    this.onDone(result.removed ?? toStrip.length);
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
