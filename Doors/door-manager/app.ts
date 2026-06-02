/**
 * DOORMAN v2 — SysOp Door Management Tool
 * Rewritten around a ViewManager / view stack so each screen owns its
 * own key bindings and ESC always pops cleanly.
 */

import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';
import {
  Screen, Panel, List, ScrollableBox, ConfirmModal, Prompt, Textbox,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { FileExplorerOverlay } from './FileExplorerOverlay';
import { InfoEditorOverlay } from './InfoEditorOverlay';
import { showAmigaGuideViewer } from './AmigaGuideViewer';
import { ViewManager, BaseView } from './ViewManager';

// ─── Constants ────────────────────────────────────────────────────────────────

const LHA_BIN = [
  '/usr/bin/lha', '/usr/local/bin/lha', '/opt/homebrew/bin/lha',
  '/app/data/bbs/tools/bin/lha',
].find(p => fs.existsSync(p)) ?? 'lha';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// ─── Types ────────────────────────────────────────────────────────────────────

interface DoorSession { socket: any; user: any; bbsSession: any; bbs: any; params: string[] }

interface DoorInfo {
  id: string; command: string; name: string; description: string;
  type: string; size: number; accessLevel: number; location: string;
  resolvedPath?: string; enabled: boolean;
}

interface CatalogEntry {
  id: string; archive_name: string; archive_path: string; binary_name: string | null;
  door_type: string; name: string; version: string | null; author: string | null;
  release_group: string | null; description: string | null; file_id_diz: string | null;
  doc_filename: string | null; doc_raw: string | null; suggested_tooltypes: string | null;
  category: string | null; archive_size: number; junk_count: number;
  installed: number; installed_as: string | null; install_dir: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / 1048576)} MB`;
}

function typeBadge(type: string): string {
  return ({ TS:'TS', typescript:'TS', SDK:'TS', XIM:'68', SIM:'SI', TIM:'TI',
            AMI:'68', amiga:'68' } as any)[type] ?? '??';
}

function getCatalogSvc(): any {
  for (const k of Object.keys(require.cache))
    if (k.includes('door-catalog.service')) return require.cache[k]?.exports ?? null;
  return null;
}

function getStripLib(): any {
  for (const k of Object.keys(require.cache))
    if (k.includes('ami-stripper.lib')) return require.cache[k]?.exports ?? null;
  return null;
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
    this.filterBox = new Textbox({ parent: this.filterPanel, top: 0, left: 1, width: '100%-2',
      height: 1, inputOnFocus: true, mouse: true,
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
    this.layout.setInfo([
      `{yellow-fg}Name:{/yellow-fg}    ${d.name}`,
      `{yellow-fg}Command:{/yellow-fg} ${d.command}`,
      `{yellow-fg}Type:{/yellow-fg}    ${d.type}`,
      `{yellow-fg}Size:{/yellow-fg}    ${formatSize(d.size)}`,
      `{yellow-fg}Status:{/yellow-fg}  ${st}`,
      d.description ? `\n{white-fg}${d.description}{/white-fg}` : '',
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
            this.setStatus(`${d.name} deleted`, 'green');
            this.doors = await fetchDoors(this.bbs);
            this.refresh(Math.max(0, idx - 1));
          } else { this.setStatus(`Failed: ${r.message}`, 'red'); }
        } catch (e: any) { this.setStatus(`Error: ${e.message}`, 'red'); }
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
      this.vm.push(new StripView(this.layout, entry, liveDir,
        (stripped) => { if (stripped) this.setStatus(`Stripped ${stripped} ad file(s)`, 'green', 4000); }
      ));
    } catch { this.setStatus('Catalog lookup failed', 'red'); }
  }
}

// ── Repo Browser ──────────────────────────────────────────────────────────────

class RepoView extends BaseView {
  private layout: DoormanLayout;
  private bbs: any;
  private entries: CatalogEntry[] = [];
  private filter = '';
  private statusTimer: any = null;

  constructor(layout: DoormanLayout, bbs: any) { super(); this.layout = layout; this.bbs = bbs; }

  private entry(): CatalogEntry | null { return this.entries[this.layout.listSelected] ?? null; }

  private setStatus(msg: string, col: 'green'|'red'|'yellow' = 'yellow', ms = 3000): void {
    clearTimeout(this.statusTimer);
    this.layout.setHeader(`{center}{cyan-fg}DOORMAN v2  REPO{/cyan-fg}  {${col}-fg}${msg}{/${col}-fg}{/center}`);
    this.layout.render();
    this.statusTimer = setTimeout(() => this.refreshHeader(), ms);
  }

  private refreshHeader(): void {
    const svc = getCatalogSvc();
    let stats = '';
    try { const s = svc?.catalogStats(); if (s) stats = `${s.total} in repo, ${s.installed} installed`; } catch {}
    this.layout.setHeader(`{center}{cyan-fg}DOORMAN v2  REPO{/cyan-fg}  {white-fg}${stats}${this.filter ? ' (filtered)' : ''}{/white-fg}{/center}`);
  }

  private loadEntries(): void {
    const svc = getCatalogSvc();
    if (!svc) { this.entries = []; return; }
    try { this.entries = svc.searchCatalog(this.filter); } catch { this.entries = []; }
  }

  private refresh(selectIdx = 0): void {
    this.loadEntries();
    const w = this.layout.width;
    const items = this.entries.map(e => {
      const inst = e.installed ? '*' : ' ';
      const sz = e.archive_size ? `${Math.round(e.archive_size / 1024)}k` : '?';
      const nameW = Math.max(4, w - sz.length - 2);
      const name = (inst + e.archive_name).length > nameW
        ? (inst + e.archive_name).slice(0, nameW) : (inst + e.archive_name).padEnd(nameW);
      return `${name} ${sz}`;
    });
    this.layout.setListLabel(` REPO (${this.entries.length}) `);
    this.layout.setListItems(items);
    this.layout.setListSelect(selectIdx);
    this.updateInfo();
    this.updateFooter();
    this.refreshHeader();
  }

  private updateInfo(): void {
    const e = this.entry();
    if (!e) { this.layout.setInfo('No entry selected.'); return; }

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
      content += '\n\n' + e.file_id_diz.split('\n')
        .map(l => l.replace(/[^\x20-\x7e]/g, '').replace(/[{}]/g, c => `\\${c}`)).join('\n');
    } else if (e.description) {
      content += `\n\n{white-fg}${e.description.replace(/[{}]/g, c => `\\${c}`)}{/white-fg}`;
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
    const inst = e?.installed ? 'Uninst' : 'Inst';
    const hasDoc = !!e?.doc_raw;
    const hasJunk = e ? this.getEntryJunkCount(e) > 0 : false;
    const parts = [
      `{yellow-fg}R{/yellow-fg}=${inst}`,
      hasJunk ? `{yellow-fg}S{/yellow-fg}trip` : null,
      hasDoc  ? `{yellow-fg}V{/yellow-fg}iew doc` : null,
      `{yellow-fg}F{/yellow-fg}=Filter`,
      `{yellow-fg}ESC{/yellow-fg}=Back`,
      `{yellow-fg}Q{/yellow-fg}uit`,
    ].filter(Boolean).join('  ');
    this.layout.setFooter(`{center}${parts}{/center}`);
  }

  private _onSelectItem: any;

  enter(): void {
    this.layout.showRepoLayout();
    this.refresh(0);
    this.layout.focusList();
    this.layout.render();

    (this.layout.doorList as any).on('select item', this._onSelectItem = () => {
      this.updateInfo(); this.updateFooter(); this.layout.render();
    });
    (this.layout.doorList as any).on('focus', this._onListFocus = () => {
      (this.layout.filterBox as any).setValue(this.filter);
    });

    // Filter input live update
    (this.layout.filterBox as any).on('keypress', this._onFilterKey = (_ch: string, key: any) => {
      setTimeout(() => {
        const val: string = (this.layout.filterBox as any).getValue() ?? '';
        if (val !== this.filter) { this.filter = val; this.refresh(0); this.layout.render(); }
        if (key?.name === 'down' || key?.name === 'enter' || key?.name === 'return') {
          this.layout.focusList(); this.layout.render();
        }
        if (key?.name === 'escape') {
          this.filter = ''; (this.layout.filterBox as any).setValue('');
          this.refresh(0); this.layout.focusList(); this.layout.render();
        }
      }, 0);
    });

    this.keys.key(['tab'], () => {
      // Tab cycles: list → filter → list
      if ((this.layout.filterBox as any).focused) {
        this.layout.focusList();
      } else {
        this.layout.focusFilter();
      }
      this.layout.render();
    });
    this.keys.key(['f', 'F', '/'], () => { this.layout.focusFilter(); this.layout.render(); });
    this.keys.key(['r', 'R'], () => this.doInstallUninstall());
    this.keys.key(['s', 'S'], () => this.doStrip());
    this.keys.key(['v', 'V'], () => this.doViewDoc());
    this.keys.key(['q', 'Q'], () => {
      clearTimeout(this.statusTimer);
      this.vm.destroy();
      (this.layout.screen as any).destroy();
    });
  }

  private _onListFocus: any;
  private _onFilterKey: any;

  exit(): void {
    (this.layout.doorList as any).off('select item', this._onSelectItem);
    (this.layout.doorList as any).off('focus', this._onListFocus);
    (this.layout.filterBox as any).off('keypress', this._onFilterKey);
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
          this.setStatus(`Uninstalled ${e.installed_as}`, 'green', 4000);
          this.refresh(this.layout.listSelected);
        }
      ));
    } else {
      if (!e.archive_path || !fs.existsSync(e.archive_path)) {
        this.setStatus(`Archive not on server`, 'yellow'); return;
      }
      const suggested = (e.installed_as ?? e.binary_name ?? e.name ?? 'DOOR')
        .toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 12);
      this.vm.push(new InputView(this.layout,
        `{yellow-fg}Install as BBS command:{/yellow-fg}`, suggested,
        (cmd) => {
          if (!cmd) return;
          const finalCmd = cmd.trim().toUpperCase() || suggested;
          const installDir = path.join(PROJECT_ROOT, 'Doors', finalCmd);
          fs.mkdirSync(installDir, { recursive: true });
          const res = spawnSync(LHA_BIN, [`xw=${installDir}`, e.archive_path], { timeout: 30000 });
          if (res.status !== 0 && res.status !== 1) {
            this.setStatus(`Extract failed`, 'red'); return;
          }
          const bbsCmdDir = path.join(PROJECT_ROOT, 'Commands', 'BBSCmd');
          const infoPath = path.join(bbsCmdDir, `${finalCmd}.info`);
          fs.writeFileSync(infoPath,
            `TYPE=XIM\nLOCATION=Doors:${finalCmd}/${e.binary_name ?? finalCmd}\nSTACK=65536\nACCESS=0\n`, 'latin1');
          getCatalogSvc()?.markInstalled(e.id, finalCmd, `Doors/${finalCmd}`);
          this.setStatus(`Installed as ${finalCmd}`, 'green', 4000);
          this.refresh(this.layout.listSelected);
        }
      ));
    }
  }

  private doStrip(): void {
    const e = this.entry(); if (!e) return;
    const hasArchive = !!(e.archive_path && fs.existsSync(e.archive_path));
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
    this.vm.push(new StripView(this.layout, e, installDir ?? undefined,
      (stripped) => { if (stripped) { this.setStatus(`Stripped ${stripped} ad file(s)`, 'green', 4000); this.refresh(this.layout.listSelected); } }
    ));
  }

  private doViewDoc(): void {
    const e = this.entry();
    if (!e?.doc_raw) { this.setStatus('No documentation available', 'yellow'); return; }
    this.vm.push(new DocView(this.layout, e.doc_filename ?? e.archive_name, e.doc_raw));
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
  private overrideDir?: string;
  private onDone: (stripped: number | null) => void;
  private checked: boolean[] = [];
  private files: any[] = [];
  private reasons: Record<string, string> = {};
  private origLabel = '';

  constructor(layout: DoormanLayout, entry: CatalogEntry, overrideDir: string | undefined,
              onDone: (stripped: number | null) => void) {
    super(); this.layout = layout; this.entry = entry;
    this.overrideDir = overrideDir; this.onDone = onDone;
  }

  enter(): void {
    const lib = getStripLib();
    if (!lib) { this.layout.setFooter('{center}{red-fg}Stripper library not available{/red-fg}{/center}'); this.vm.pop(); return; }
    const hasArchive = !!(this.entry.archive_path && fs.existsSync(this.entry.archive_path));
    const installDir = this.overrideDir;

    this.layout.setFooter('{center}{cyan-fg}Analyzing...{/cyan-fg}{/center}'); this.layout.render();
    (hasArchive ? lib.analyzeArchive(this.entry.archive_path) : lib.analyzeDirectory(installDir))
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
        this.keys.key(['s','S'], () => this.doStrip(lib, hasArchive, installDir));
        this.keys.key(['q','Q'], () => { this.vm.pop(); this.onDone(null); });
      })
      .catch((e: any) => { this.layout.setInfo(`{red-fg}Analysis failed: ${e.message}{/red-fg}`); this.layout.render(); setTimeout(() => this.vm.pop(), 1500); });
  }

  private renderFiles(): void {
    const items = this.files.map((f: any, i: number) => {
      const box = this.checked[i] ? '[X]' : '[ ]';
      const fpath = f.path as string;
      const name = fpath.length > 24 ? '<' + fpath.slice(fpath.length - 23) : fpath.padEnd(24);
      return `${box} ${name}`;
    });
    const selCount = this.checked.filter(Boolean).length;
    (this.layout.listPanel as any).setLabel(` ${this.entry.archive_name} — Strip Ads `);
    this.layout.setListItems(items);
    const sel = this.files[this.layout.listSelected];
    this.layout.setInfo(
      `{yellow-fg}${selCount}/${this.files.length} selected{/yellow-fg}\n\n` +
      (sel ? `{cyan-fg}${(sel.path as string)}{/cyan-fg}\nReason: ${this.reasons[sel.path] ?? '?'}\n` : '') +
      '\n{grey-fg}[Space] Toggle  [A] All  [N] None  [S] Strip  [ESC/Q] Cancel{/grey-fg}'
    );
    this.layout.setFooter('{center}{yellow-fg}Space{/yellow-fg}=Toggle  {yellow-fg}A{/yellow-fg}=All  {yellow-fg}N{/yellow-fg}=None  {yellow-fg}S{/yellow-fg}=Strip  {yellow-fg}ESC/Q{/yellow-fg}=Cancel{/center}');
    this.layout.render();
  }

  private doStrip(lib: any, hasArchive: boolean, installDir: string | null | undefined): void {
    const toStrip = this.files.filter((_: any, i: number) => this.checked[i]);
    if (toStrip.length === 0) { this.vm.pop(); this.onDone(null); return; }
    const preservePaths = new Set(this.files.filter((_: any, i: number) => !this.checked[i]).map((f: any) => f.path as string));
    this.layout.setFooter('{center}{cyan-fg}Stripping...{/cyan-fg}{/center}'); this.layout.render();
    (async () => {
      try {
        if (hasArchive) {
          const tmpOut = this.entry.archive_path + '.strip_tmp';
          await lib.stripArchive(this.entry.archive_path, tmpOut, preservePaths);
          if (fs.existsSync(tmpOut) && !fs.statSync(tmpOut).isDirectory()) {
            fs.renameSync(tmpOut, this.entry.archive_path);
          } else if (fs.existsSync(tmpOut)) { fs.rmSync(tmpOut, { recursive: true, force: true }); }
          if (installDir) {
            fs.mkdirSync(installDir, { recursive: true });
            spawnSync(LHA_BIN, [`xw=${installDir}`, this.entry.archive_path], { timeout: 30000 });
          }
        } else if (installDir) {
          lib.stripFilesFromDirectory(installDir, toStrip.map((f: any) => f.path));
        }
        const svc = getCatalogSvc();
        if (svc) {
          try { svc.updateJunkCount(this.entry.id, this.files.length - toStrip.length); } catch {}
          try { svc.removeArchiveFiles(this.entry.id, toStrip.map((f: any) => f.path)); } catch {}
        }
        this.vm.pop();
        this.onDone(toStrip.length);
      } catch (e: any) {
        this.layout.setInfo(`{red-fg}Strip failed: ${(e as Error).message}{/red-fg}`);
        this.layout.render();
        setTimeout(() => { this.vm.pop(); this.onDone(null); }, 2000);
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

  constructor(layout: DoormanLayout, bbs: any, command: string) {
    super(); this.layout = layout; this.bbs = bbs; this.command = command;
  }

  enter(): void {
    new InfoEditorOverlay({ screen: this.layout.screen, command: this.command, bbs: this.bbs,
      onClose: () => this.vm.pop() });
    this.layout.render();
  }

  exit(): void { this.keys.release(); }
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
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export async function createApp(session: DoorSession): Promise<void> {
  const { bbs, user } = session;
  if (!user || (user.secLevel ?? 0) < 250) {
    bbs.write('\r\n\x1b[31mAccess Denied: SysOp only\x1b[0m\r\n'); return;
  }

  let doors = await fetchDoors(bbs);
  if (doors.length === 0) { bbs.write('\r\n\x1b[36mNo doors installed.\x1b[0m\r\n'); return; }

  const screen = new Screen({ smartCSR: true, fullUnicode: true, title: 'DOORMAN v2',
    output: (data: string) => bbs.write(data) } as any);

  const inputManager = new DoorInputManager(session, screen, { enableGameMode:false, enableGrabKeys:false, enableMouse:true });
  inputManager.enable();

  const nodeId = (session.bbsSession as any)?.nodeId ?? '?';
  const layout = new DoormanLayout(screen, nodeId);
  const vm = new ViewManager(screen);

  screen.on('resize', () => { screen.render(); });
  screen.on('destroy', () => { inputManager.disable(); });

  vm.push(new InstalledView(layout, bbs, doors));

  await new Promise<void>(resolve => { screen.on('destroy', resolve); });
}
