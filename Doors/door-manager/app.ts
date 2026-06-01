/**
 * DOORMAN v2 - SysOp Door Management Tool
 * Spot / Up Rough
 */

import {
  Screen,
  Panel,
  List,
  ScrollableBox,
  ConfirmModal,
  Prompt,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { FileExplorerOverlay } from './FileExplorerOverlay';
import { InfoEditorOverlay } from './InfoEditorOverlay';
import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';
// CatalogEntry shape — mirrors door-catalog.service.ts (loaded at runtime via require)
interface CatalogEntry {
  id: string; archive_name: string; archive_path: string; binary_name: string | null;
  door_type: string; name: string; version: string | null; author: string | null;
  release_group: string | null; description: string | null; file_id_diz: string | null;
  doc_filename: string | null; doc_raw: string | null; suggested_tooltypes: string | null;
  category: string | null; archive_size: number; junk_count: number;
  installed: number; installed_as: string | null; install_dir: string | null; corpus_id: string | null;
}

const LHA_BIN = [
  '/app/data/bbs/tools/bin/lha',
  '/opt/homebrew/bin/lha',
  '/usr/bin/lha',
  '/usr/local/bin/lha',
].find(p => fs.existsSync(p)) ?? 'lha';

// __dirname = Doors/door-manager/dist/ → ../../.. = BBS root (data/bbs/ on server, project root locally)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

function fromCache(marker: string): any {
  // The BBS server has already loaded this module via tsx. Retrieve it from
  // the shared require cache rather than re-transpiling the .ts source.
  for (const key of Object.keys(require.cache)) {
    if (key.includes(marker)) return require.cache[key]?.exports ?? null;
  }
  return null;
}
function getCatalogSvc(): any { return fromCache('door-catalog.service'); }
function getStripLib(): any { return fromCache('ami-stripper.lib'); }

interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params: string[];
}

interface DoorInfo {
  id: string;
  command: string;
  name: string;
  description: string;
  type: string;
  size: number;
  accessLevel: number;
  location: string;
  resolvedPath?: string;
  enabled: boolean;
}

const HEADER_PREFIX = `{center}{cyan-fg}DOORMAN v2{/cyan-fg}  {white-fg}Spot/Up Rough{/white-fg}`;

// --- helpers -----------------------------------------------------------------

function formatSize(bytes: number): string {
  if (bytes === 0) return '  0 B ';
  if (bytes < 1024) return `${bytes} B`.padStart(6);
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`.padStart(6);
  return `${Math.round(bytes / (1024 * 1024))} MB`.padStart(6);
}

function typeBadge(type: string): string {
  const map: Record<string, string> = {
    'TS': 'TS', 'typescript': 'TS', 'SDK': 'TS',
    'XIM': '68', 'SIM': 'SI', 'TIM': 'TI',
    'AMI': '68', 'amiga': '68',
  };
  return map[type] || '??';
}

function formatListItem(door: DoorInfo, width: number): string {
  const badge = `[${typeBadge(door.type)}]`;
  const status = door.enabled ? '{green-fg}*{/green-fg}' : '{red-fg}-{/red-fg}';
  const sz = formatSize(door.size);
  const nameWidth = Math.max(10, width - 18);
  const name = door.name.length > nameWidth
    ? door.name.slice(0, nameWidth - 1) + '...'
    : door.name.padEnd(nameWidth);
  return `${badge} ${name} ${status} ${sz}`;
}

function dizFirstLine(entry: CatalogEntry): string {
  if (!entry.file_id_diz) return '';
  for (const line of entry.file_id_diz.split('\n')) {
    const clean = line.replace(/[^\x20-\x7E]/g, '').trim();
    if (clean.length > 3) return clean;
  }
  return '';
}

function formatCatalogItem(entry: CatalogEntry, width: number): string {
  const inst = entry.installed ? '*' : ' ';
  const sz = entry.archive_size ? `${Math.round(entry.archive_size / 1024)}k` : '?';
  const nameWidth = Math.max(4, width - sz.length - 3);
  const archiveName = entry.archive_name;
  const name = archiveName.length > nameWidth ? archiveName.slice(0, nameWidth) : archiveName.padEnd(nameWidth);
  return `${inst} ${name} ${sz}`;
}

async function fetchDoors(bbs: any): Promise<DoorInfo[]> {
  if (!bbs.getDoorList) return [];
  const raw = await bbs.getDoorList();
  return raw.map((d: any) => ({
    id: d.id || d.command,
    command: d.command || d.id,
    name: d.name || d.command || d.id,
    description: d.description || '',
    type: d.type || 'AMI',
    size: d.size || 0,
    accessLevel: d.accessLevel || 0,
    location: d.location || d.path || '',
    resolvedPath: d.resolvedPath || undefined,
    enabled: d.enabled !== false,
  }));
}

function buildInfoContent(door: DoorInfo): string {
  const status = door.enabled
    ? '{green-fg}[ON] ENABLED{/green-fg}'
    : '{red-fg}[OFF] DISABLED{/red-fg}';
  const loc = door.location.length > 30
    ? door.location.slice(0, 29) + '...'
    : door.location || '(unknown)';
  return [
    `{yellow-fg}Name:{/yellow-fg}    ${door.name}`,
    `{yellow-fg}Type:{/yellow-fg}    ${door.type}`,
    `{yellow-fg}Command:{/yellow-fg} ${door.command}`,
    `{yellow-fg}Access:{/yellow-fg}  ${door.accessLevel}${door.accessLevel === 0 ? ' (all users)' : ''}`,
    `{yellow-fg}Size:{/yellow-fg}    ${formatSize(door.size).trim()}`,
    `{yellow-fg}Status:{/yellow-fg}  ${status}`,
    `{yellow-fg}Path:{/yellow-fg}    ${loc}`,
    '',
    `{white-fg}${door.description}{/white-fg}`,
  ].join('\n');
}

function escapeTags(s: string): string {
  return s.replace(/[^\x20-\x7E]/g, '').replace(/[{}]/g, '\\$&');
}

function buildCatalogInfoContent(entry: CatalogEntry): string {
  const meta: string[] = [];
  meta.push(`{yellow-fg}${entry.archive_name}{/yellow-fg}  ${entry.door_type ?? 'XIM'}  ${entry.archive_size ? Math.round(entry.archive_size / 1024) + 'k' : ''}${entry.installed ? `  {green-fg}[${entry.installed_as}]{/green-fg}` : ''}${entry.junk_count > 0 ? `  {red-fg}${entry.junk_count} ad files{/red-fg}` : ''}`);
  if (entry.file_id_diz) {
    meta.push('');
    meta.push(...entry.file_id_diz.split('\n').map(escapeTags));
  } else {
    meta.push('', '{grey-fg}(no FILE_ID.DIZ){/grey-fg}');
  }
  return meta.join('\n');
}

// --- main --------------------------------------------------------------------

export async function createApp(session: DoorSession): Promise<void> {
  const { bbs, user } = session;

  if (!user || (user.secLevel ?? 0) < 250) {
    bbs.write('\r\n\x1b[31mAccess Denied: SysOp only\x1b[0m\r\n');
    return;
  }

  let doors = await fetchDoors(bbs);
  if (doors.length === 0) {
    bbs.write('\r\n\x1b[36mNo doors installed.\x1b[0m\r\n');
    return;
  }

  // --- state -----------------------------------------------------------------

  let mode: 'installed' | 'repo' = 'installed';
  let catalogEntries: CatalogEntry[] = [];
  let catalogFilter = '';

  // Strip selector overlay state
  let stripOverlayActive = false;
  let _stripConfirm: (() => void) | null = null;
  let _stripCancel: (() => void) | null = null;

  // --- screen ----------------------------------------------------------------

  const screen = new Screen({
    smartCSR: true,
    fullUnicode: true,
    title: 'DOORMAN v2',
    output: (data: string) => bbs.write(data),
  } as any);

  const inputManager = new DoorInputManager(session, screen, {
    enableGameMode: false,
    enableGrabKeys: false,
    enableMouse: true,
  });
  inputManager.enable();

  const nodeId = (session.bbsSession as any)?.nodeId ?? '?';

  // --- layout ----------------------------------------------------------------

  const header = new Panel({
    parent: screen,
    top: 0, left: 0, width: '100%', height: 3,
    tags: true,
    content: '',
    style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
    focusable: false,
  } as any);

  const footer = new Panel({
    parent: screen,
    bottom: 0, left: 0, width: '100%', height: 3,
    tags: true,
    content: '',
    style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
    focusable: false,
  } as any);

  const listPanel = new Panel({
    parent: screen,
    top: 3, left: 0, width: '35%', height: '100%-6',
    label: ' INSTALLED DOORS ',
    tags: true,
    style: { border: { fg: 'cyan' } },
    focusable: false,
  } as any);

  const doorList = new List({
    parent: listPanel,
    top: 1, left: 1, width: '100%-2', height: '100%-2',
    keys: true, vi: true, mouse: true,
    scrollable: true, alwaysScroll: true,
    tags: true,
    wrapItems: false,
    scrollbar: { ch: ' ', style: { bg: 'blue' } },
    style: {
      selected: { bg: 'blue', fg: 'white' },
      item: { fg: 'white' },
    },
  } as any);

  const infoPanel = new Panel({
    parent: screen,
    top: 3, left: '35%', width: '65%', height: '100%-6',
    label: ' DOOR INFO ',
    tags: true,
    style: { border: { fg: 'blue' } },
    focusable: false,
  } as any);

  const infoBox = new ScrollableBox({
    parent: infoPanel,
    top: 1, left: 1, width: '100%-2', height: '100%-2',
    tags: true, scrollable: true, keys: true,
    style: { fg: 'white' },
  } as any);

  let statusTimer: ReturnType<typeof setTimeout> | null = null;

  // --- helpers ---------------------------------------------------------------

  function getListWidth(): number {
    return Math.floor((screen as any).width * 0.35) - 6; // -4 borders, -2 selection marker
  }

  function selectedDoor(): DoorInfo | null {
    if (mode !== 'installed') return null;
    const idx = (doorList as any).selected ?? 0;
    return doors[idx] ?? null;
  }

  function selectedCatalogEntry(): CatalogEntry | null {
    if (mode !== 'repo') return null;
    const idx = (doorList as any).selected ?? 0;
    return catalogEntries[idx] ?? null;
  }

  function refreshHeader(): void {
    if (mode === 'installed') {
      const ec = doors.filter(d => d.enabled).length;
      (header as any).setContent(
        HEADER_PREFIX +
        `  * ${doors.length} doors  * ${ec} enabled  * Node ${nodeId}{/center}`
      );
    } else {
      const svc = getCatalogSvc();
      let statsStr = '';
      try {
        if (svc) {
          const st = svc.catalogStats();
          statsStr = `  * ${st.total} in repo  * ${st.installed} installed`;
        }
      } catch { /* catalog not built */ }
      const filterStr = catalogFilter ? `  * filter: ${catalogFilter}` : '';
      (header as any).setContent(
        HEADER_PREFIX +
        `${statsStr}${filterStr}  * Node ${nodeId}{/center}`
      );
    }
  }

  function setStatus(msg: string, color: 'green' | 'red' | 'yellow' = 'yellow', durationMs = 3000): void {
    (header as any).setContent(
      HEADER_PREFIX + `  {${color}-fg}${msg}{/${color}-fg}{/center}`
    );
    screen.render();
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { refreshHeader(); screen.render(); }, durationMs);
  }

  function updateFooter(): void {
    if (mode === 'installed') {
      const door = selectedDoor();
      const toggleLabel = (!door || door.enabled) ? 'Disable' : 'Enable';
      (footer as any).setContent(
        `{center}{yellow-fg}[U]{/yellow-fg}pload  {yellow-fg}[I]{/yellow-fg}nfo  {yellow-fg}[F]{/yellow-fg}iles  {yellow-fg}[D]{/yellow-fg}elete  {yellow-fg}[E]{/yellow-fg}${toggleLabel}  {yellow-fg}[S]{/yellow-fg}trip Ads  {yellow-fg}[T]{/yellow-fg}ab Repo  {yellow-fg}[Q]{/yellow-fg}uit{/center}`
      );
    } else {
      const entry = selectedCatalogEntry();
      const instLabel = entry?.installed ? 'Uninstall' : 'Install';
      (footer as any).setContent(
        `{center}{yellow-fg}[I]{/yellow-fg}${instLabel}  {yellow-fg}[S]{/yellow-fg}trip Ads  {yellow-fg}[D]{/yellow-fg}oc  {yellow-fg}[F]{/yellow-fg}ilter  {yellow-fg}[/]{/yellow-fg}Clear filter  {yellow-fg}[T]{/yellow-fg}ab Installed  {yellow-fg}[Q]{/yellow-fg}uit{/center}`
      );
    }
  }

  function populateInstalledList(selectIndex = 0): void {
    const items = doors.map(d => formatListItem(d, getListWidth()));
    (doorList as any).setItems(items);
    if (doors.length > 0) (doorList as any).select(Math.min(selectIndex, doors.length - 1));
    (listPanel as any).setLabel(' INSTALLED DOORS ');
    screen.render();
  }

  function loadCatalog(): void {
    const svc = getCatalogSvc();
    if (!svc) { catalogEntries = []; return; }
    try { catalogEntries = svc.searchCatalog(catalogFilter); } catch { catalogEntries = []; }
  }

  function populateCatalogList(selectIndex = 0): void {
    loadCatalog();
    const items = catalogEntries.map(e => formatCatalogItem(e, getListWidth()));
    (doorList as any).setItems(items);
    if (catalogEntries.length > 0) (doorList as any).select(Math.min(selectIndex, catalogEntries.length - 1));
    const label = catalogFilter ? ` REPO (${catalogEntries.length} results) ` : ` REPO (${catalogEntries.length} doors) `;
    (listPanel as any).setLabel(label);
    screen.render();
  }

  function updateInfoPane(): void {
    if (stripOverlayActive) return;
    if (mode === 'installed') {
      const door = selectedDoor();
      if (!door) { (infoBox as any).setContent('No door selected.'); return; }
      (infoBox as any).setContent(buildInfoContent(door));
    } else {
      const entry = selectedCatalogEntry();
      if (!entry) { (infoBox as any).setContent('No entry selected.'); return; }
      (infoBox as any).setContent(buildCatalogInfoContent(entry));
    }
    screen.render();
  }

  function applyResponsive(): void {
    const w = (screen as any).width;
    if (w < 70) {
      (infoPanel as any).hide();
      (listPanel as any).width = '100%';
    } else {
      (infoPanel as any).show();
      (listPanel as any).width = '35%';
    }
    if (mode === 'installed') populateInstalledList((doorList as any).selected ?? 0);
    else populateCatalogList((doorList as any).selected ?? 0);
  }

  // --- initial render --------------------------------------------------------

  refreshHeader();
  populateInstalledList(0);
  updateInfoPane();
  updateFooter();
  applyResponsive();
  (doorList as any).focus();

  screen.on('resize', () => { applyResponsive(); screen.render(); });
  (doorList as any).on('select item', () => { updateInfoPane(); updateFooter(); });

  // --- catalog operations ----------------------------------------------------

  function showDocViewer(entry: CatalogEntry): void {
    if (!entry.doc_raw) { setStatus('No documentation available', 'yellow'); return; }
    new InfoEditorOverlay({
      screen,
      command: '__doc__',
      bbs,
      docContent: entry.doc_raw,
      docTitle: entry.doc_filename ?? 'Documentation',
      onClose: () => { (doorList as any).focus(); screen.render(); },
    } as any);
    screen.render();
  }

  function installFromCatalog(entry: CatalogEntry): void {
    if (!entry.archive_path || !fs.existsSync(entry.archive_path)) {
      setStatus(`Archive not found: ${entry.archive_name}`, 'red');
      return;
    }
    const suggested = (entry.installed_as ?? entry.binary_name ?? entry.name ?? 'DOOR')
      .toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 12);

    const prompt = new Prompt({
      parent: screen,
      top: 'center', left: 'center', width: 50, height: 7,
      tags: true,
      style: { border: { fg: 'yellow' } },
      overlay: true,
    } as any);
    (prompt as any).showInput(`{yellow-fg}Install as BBS command:{/yellow-fg}`, suggested, (_err: any, cmd: string | undefined) => {
      (prompt as any).destroy();
      const finalCmd = (cmd ?? '').trim().toUpperCase() || suggested;
      const installDir = path.join(PROJECT_ROOT, 'Doors', finalCmd);
      const bbsCmdDir = path.join(PROJECT_ROOT, 'Commands', 'BBSCmd');

      setStatus(`Extracting ${entry.archive_name}...`);
      fs.mkdirSync(installDir, { recursive: true });
      const result = spawnSync(LHA_BIN, ['e', '-q', entry.archive_path, installDir + '/'], { timeout: 30000 });
      if (result.status !== 0 && result.status !== 1) {
        setStatus(`Extract failed (lha status ${result.status})`, 'red');
        return;
      }

      const infoPath = path.join(bbsCmdDir, `${finalCmd}.info`);
      const location = `Doors:${finalCmd}/${entry.binary_name ?? finalCmd}`;
      const lines = [`TYPE=XIM`, `LOCATION=${location}`, `STACK=65536`, `ACCESS=0`].join('\n');
      fs.writeFileSync(infoPath, lines + '\n', 'latin1');

      const svc = getCatalogSvc();
      if (svc) {
        try { svc.markInstalled(entry.id, finalCmd, `Doors/${finalCmd}`); } catch { /* ignore */ }
      }

      setStatus(`Installed as ${finalCmd}`, 'green', 4000);
      const idx = (doorList as any).selected ?? 0;
      populateCatalogList(idx);
      updateInfoPane();
      updateFooter();
      (doorList as any).focus();
    });
    screen.render();
  }

  function uninstallFromCatalog(entry: CatalogEntry): void {
    new ConfirmModal({
      parent: screen,
      title: ' Uninstall Door ',
      content: `Uninstall {yellow-fg}${entry.installed_as}{/yellow-fg}?\n\nThis removes the .info file and Doors/${entry.installed_as} directory.`,
      confirmText: 'Uninstall',
      cancelText: 'Cancel',
      confirmColor: 'red',
      cancelColor: 'green',
      style: { border: { fg: 'red' } },
      onConfirm: async () => {
        const bbsCmdDir = path.join(PROJECT_ROOT, 'Commands', 'BBSCmd');
        const infoPath = path.join(bbsCmdDir, `${entry.installed_as}.info`);
        if (fs.existsSync(infoPath)) fs.unlinkSync(infoPath);
        if (entry.install_dir) {
          const abs = path.join(PROJECT_ROOT, entry.install_dir);
          if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
        }
        const svc = getCatalogSvc();
        if (svc) { try { svc.markUninstalled(entry.id); } catch { /* ignore */ } }

        setStatus(`Uninstalled ${entry.installed_as}`, 'green', 4000);
        const idx = (doorList as any).selected ?? 0;
        populateCatalogList(idx);
        updateInfoPane();
        updateFooter();
        (doorList as any).focus();
      },
      onCancel: () => { (doorList as any).focus(); screen.render(); },
    } as any).display();
  }

  function showStripSelector(
    entry: CatalogEntry,
    stripped: any[],
    reasons: Record<string, string>,
    onConfirm: (preservePaths: Set<string>) => void,
    onCancel: () => void
  ): void {
    stripOverlayActive = true;
    const checked = new Array(stripped.length).fill(true);
    const origListLabel = (listPanel as any).options?.label ?? ' INSTALLED DOORS ';

    (listPanel as any).setLabel(` ${entry.archive_name} — deselect false positives `);

    function renderFiles(): void {
      const items = stripped.map((f: any, i: number) => {
        const box = checked[i] ? '[X]' : '[ ]';
        const name = (f.path as string).length > 24
          ? (f.path as string).slice(0, 23) + '>'
          : (f.path as string).padEnd(24);
        return `${box} ${name}`;
      });
      (doorList as any).setItems(items);

      const sel = (doorList as any).selected ?? 0;
      const selFile = stripped[sel];
      const selCount = checked.filter(Boolean).length;
      (infoBox as any).setContent(
        `{yellow-fg}${selCount} of ${stripped.length} files selected to strip{/yellow-fg}\n\n` +
        (selFile ? `{cyan-fg}${selFile.path}{/cyan-fg}\nReason: ${reasons[selFile.path] ?? '?'}\n` : '') +
        '\n{grey-fg}[Space] Toggle  [A] All  [N] None\n[S] Strip selected  [Esc] Cancel{/grey-fg}'
      );
      screen.render();
    }

    function exitOverlay(): void {
      stripOverlayActive = false;
      _stripConfirm = null;
      _stripCancel = null;
      (listPanel as any).setLabel(origListLabel);
      if (mode === 'repo') populateCatalogList((doorList as any).selected ?? 0);
      else populateInstalledList((doorList as any).selected ?? 0);
      updateInfoPane();
      (doorList as any).focus();
    }

    _stripConfirm = () => {
      const preserve = new Set(stripped.filter((_: any, i: number) => !checked[i]).map((f: any) => f.path as string));
      exitOverlay();
      onConfirm(preserve);
    };
    _stripCancel = () => { exitOverlay(); onCancel(); };

    // Space to toggle
    const spaceKey = () => {
      if (!stripOverlayActive) return;
      const idx = (doorList as any).selected ?? 0;
      if (idx < checked.length) { checked[idx] = !checked[idx]; renderFiles(); }
    };
    const allKey = () => { if (!stripOverlayActive) return; checked.fill(true); renderFiles(); };
    const noneKey = () => { if (!stripOverlayActive) return; checked.fill(false); renderFiles(); };
    (screen as any).key([' '], spaceKey);
    (screen as any).key(['a', 'A'], allKey);
    (screen as any).key(['n', 'N'], noneKey);
    (doorList as any).once('destroy', () => {
      (screen as any).unkey([' '], spaceKey);
      (screen as any).unkey(['a', 'A'], allKey);
      (screen as any).unkey(['n', 'N'], noneKey);
    });

    renderFiles();
    (doorList as any).focus();
  }

  async function stripAds(entry: CatalogEntry, onDone: () => void): Promise<void> {
    const lib = getStripLib();
    if (!lib) { setStatus('Stripper library not available', 'red'); onDone(); return; }

    const hasArchive = !!(entry.archive_path && fs.existsSync(entry.archive_path));
    const installDirAbs = entry.install_dir ? path.join(PROJECT_ROOT, entry.install_dir) : null;
    const hasDir = !!(installDirAbs && fs.existsSync(installDirAbs));

    if (!hasArchive && !hasDir) {
      setStatus('No archive or install directory found', 'yellow'); onDone(); return;
    }

    setStatus('Analyzing for ad files...');
    let result: any;
    try {
      result = hasArchive
        ? await lib.analyzeArchive(entry.archive_path)
        : await lib.analyzeDirectory(installDirAbs);
    } catch (err) {
      setStatus(`Analysis failed: ${(err as Error).message}`, 'red'); onDone(); return;
    }

    if (result.stripped.length === 0) {
      setStatus('No ad files found — clean', 'green', 3000); onDone(); return;
    }

    showStripSelector(entry, result.stripped, result.reason,
      async (preservePaths: Set<string>) => {
        const toStrip = result.stripped.filter((f: any) => !preservePaths.has(f.path));
        if (toStrip.length === 0) {
          setStatus('Nothing to strip', 'yellow', 2000); onDone(); return;
        }
        setStatus(`Stripping ${toStrip.length} file(s)...`);
        try {
          if (hasArchive) {
            const outPath = entry.archive_path.replace(/(\.(lha|lzx|lzh))$/i, '-clean$1');
            await lib.stripArchive(entry.archive_path, outPath, preservePaths);
            if (installDirAbs) {
              fs.mkdirSync(installDirAbs, { recursive: true });
              spawnSync(LHA_BIN, ['e', '-q', outPath, installDirAbs + '/'], { timeout: 30000 });
            }
          } else if (hasDir) {
            lib.stripFilesFromDirectory(installDirAbs, toStrip.map((f: any) => f.path));
          }
          const svc = getCatalogSvc();
          if (svc) { try { svc.updateJunkCount(entry.id, result.stripped.length - toStrip.length); } catch { /* ignore */ } }
          setStatus(`Stripped ${toStrip.length} ad file(s)`, 'green', 4000);
        } catch (err) {
          setStatus(`Strip failed: ${(err as Error).message}`, 'red');
        }
        onDone();
      },
      onDone
    );
  }

  // --- key handlers ----------------------------------------------------------

  (screen as any).key(['tab'], () => {
    const idx = (doorList as any).selected ?? 0;
    if (mode === 'installed') {
      mode = 'repo';
      loadCatalog();
      populateCatalogList(0);
    } else {
      mode = 'installed';
      populateInstalledList(idx);
    }
    refreshHeader();
    updateInfoPane();
    updateFooter();
    (doorList as any).focus();
  });

  (screen as any).key(['q', 'Q', 'escape'], () => {
    if (stripOverlayActive) { if (_stripCancel) _stripCancel(); return; }
    if (statusTimer) clearTimeout(statusTimer);
    inputManager.disable();
    (screen as any).destroy();
  });

  // --- installed-mode keys ---------------------------------------------------

  (screen as any).key(['f', 'F'], () => {
    if (mode !== 'installed') return;
    const door = selectedDoor();
    if (!door) return;
    let doorPath = door.resolvedPath || door.location || `Doors/${door.command}`;
    const assignMatch = /^([A-Za-z][A-Za-z0-9]*):(.*)$/.exec(doorPath);
    if (assignMatch) {
      const assign = assignMatch[1].toUpperCase();
      const subpath = assignMatch[2].replace(/^\/+/, '');
      if (assign === 'BBS' || assign === 'WORK') doorPath = subpath;
      else if (assign === 'DOORS') doorPath = `Doors/${subpath}`;
    }
    new FileExplorerOverlay({
      screen,
      doorPath,
      onClose: () => { (doorList as any).focus(); screen.render(); },
    });
  });

  (screen as any).key(['i', 'I'], () => {
    if (mode !== 'installed') return;
    const door = selectedDoor();
    if (!door) return;
    new InfoEditorOverlay({
      screen,
      command: door.command,
      bbs,
      onClose: () => { (doorList as any).focus(); screen.render(); },
    });
    screen.render();
  });

  (screen as any).key(['s', 'S'], async () => {
    if (stripOverlayActive) { if (_stripConfirm) _stripConfirm(); return; }
    if (mode === 'installed') {
      const door = selectedDoor();
      if (!door) return;
      const svc = getCatalogSvc();
      if (!svc) { setStatus('Catalog not available', 'yellow'); return; }
      let entry: CatalogEntry | null = null;
      try { entry = svc.getCatalogEntryByCmd(door.command); } catch { /* ignore */ }
      if (!entry) { setStatus(`${door.command} not in catalog`, 'yellow'); return; }
      await stripAds(entry, () => { (doorList as any).focus(); screen.render(); });
    } else {
      const entry = selectedCatalogEntry();
      if (!entry) return;
      await stripAds(entry, () => { (doorList as any).focus(); screen.render(); });
    }
  });

  (screen as any).key(['u', 'U'], async () => {
    if (mode !== 'installed') return;
    setStatus('Waiting for file selection...');
    let uploadResult: { path: string; filename: string };
    try {
      uploadResult = await (bbs as any).requestArchiveUpload();
    } catch (err) {
      setStatus(`Upload cancelled: ${(err as Error).message}`, 'yellow');
      return;
    }
    setStatus(`Installing ${uploadResult.filename}...`);
    try {
      const result = await (bbs as any).installDoor(uploadResult.path);
      if (result.success) {
        setStatus(`Installed: ${result.command} (${result.type})`, 'green');
        doors = await fetchDoors(bbs);
        populateInstalledList(0);
        updateInfoPane();
      } else {
        setStatus(`Install failed: ${result.message}`, 'red');
      }
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`, 'red');
    }
  });

  (screen as any).key(['e', 'E'], async () => {
    if (mode !== 'installed') return;
    const door = selectedDoor();
    if (!door) return;
    const idx = (doorList as any).selected ?? 0;
    door.enabled = !door.enabled;
    setStatus(`${door.enabled ? 'Enabling' : 'Disabling'} ${door.name}...`);
    try {
      if (bbs.setDoorEnabled) {
        const result = await bbs.setDoorEnabled(door.command, door.enabled);
        setStatus(result.message, result.success ? 'green' : 'red');
      } else {
        setStatus(`${door.name} ${door.enabled ? 'enabled' : 'disabled'} (session only)`, 'yellow');
      }
    } catch (err) {
      door.enabled = !door.enabled;
      setStatus(`Error: ${(err as Error).message}`, 'red');
    }
    populateInstalledList(idx);
    updateInfoPane();
    updateFooter();
  });

  (screen as any).key(['t', 'T'], () => {
    if (mode !== 'installed') return;
    const door = selectedDoor();
    if (!door) return;
    if (bbs.runCommand) bbs.runCommand(door.command);
    else setStatus('Test: use BBS menu to run the door', 'yellow');
  });

  (screen as any).key(['d', 'D'], () => {
    if (mode === 'repo') {
      const entry = selectedCatalogEntry();
      if (entry) showDocViewer(entry);
      return;
    }
    // installed mode: delete
    const door = selectedDoor();
    if (!door) return;
    new ConfirmModal({
      parent: screen,
      title: ' Delete Door ',
      content: `Delete this door?\n\n  {yellow-fg}${door.name}{/yellow-fg}${door.command !== door.name ? `\n  Command: ${door.command}` : ''}\n\n{red-fg}This cannot be undone.{/red-fg}`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      cancelColor: 'green',
      style: { border: { fg: 'red' } },
      onConfirm: async () => {
        const idx = (doorList as any).selected ?? 0;
        const isTS = ['TS', 'typescript', 'SDK'].includes(door.type);
        const identifier = isTS
          ? (door.location
              ? door.location.replace(/^Doors[\\/]/i, '').split(/[\\/]/)[0] || door.command
              : door.command)
          : door.command;
        setStatus(`Deleting ${door.name}...`);
        try {
          const result = await (bbs as any).deleteDoor(identifier, isTS);
          if (result.success) {
            setStatus(`${door.name} deleted`, 'green');
            doors = await fetchDoors(bbs);
            populateInstalledList(Math.max(0, idx - 1));
            updateInfoPane();
          } else {
            setStatus(`Delete failed: ${result.message}`, 'red');
          }
        } catch (err) {
          setStatus(`Error: ${(err as Error).message}`, 'red');
        }
        (doorList as any).focus();
      },
      onCancel: () => { (doorList as any).focus(); screen.render(); },
    } as any).display();
  });

  // --- repo-mode keys --------------------------------------------------------

  (screen as any).key(['r', 'R'], () => {
    if (mode !== 'repo') return;
    const entry = selectedCatalogEntry();
    if (!entry) return;
    if (entry.installed) uninstallFromCatalog(entry);
    else installFromCatalog(entry);
  });

  (screen as any).key(['/'], () => {
    if (mode !== 'repo') return;
    const prompt = new Prompt({
      parent: screen,
      top: 'center', left: 'center', width: 50, height: 7,
      tags: true,
      style: { border: { fg: 'cyan' } },
      overlay: true,
    } as any);
    (prompt as any).showInput('{cyan-fg}Filter (name/author/group), blank to clear:{/cyan-fg}', catalogFilter, (_err: any, val: string | undefined) => {
      (prompt as any).destroy();
      catalogFilter = (val ?? '').trim();
      populateCatalogList(0);
      refreshHeader();
      updateInfoPane();
      updateFooter();
      (doorList as any).focus();
    });
    screen.render();
  });

  await new Promise<void>(resolve => { screen.on('destroy', resolve); });
}
