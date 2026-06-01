/**
 * DoorManagerCatalog — repo browser and install/uninstall logic for DoorManager.
 *
 * Extracted here to keep DoorManager.ts under the 2000-line limit.
 * DoorManager calls these functions, passing `this` as the context object.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { Socket } from 'socket.io';
import {
  CatalogEntry,
  searchCatalog,
  catalogStats,
  markInstalled,
  markUninstalled,
  getCatalogEntryByCmd,
  updateJunkCount,
} from './door-catalog.service';

const LHA_BIN = '/opt/homebrew/bin/lha';

// Minimal interface of DoorManager state needed here
export interface CatalogContext {
  socket: Socket;
  doorsPath: string;
  projectRoot: string;
  pad: (str: string, width: number) => string;
  showFileViewer: () => void;
  showList: () => void;
  cleanup: () => void;
  browseCatalogArchive: (archivePath: string) => void;
  state: {
    mode: string;
    listMode: string;
    scrollOffset: number;
    selectedIndex: number;
    catalogEntries: CatalogEntry[];
    catalogSelectedIndex: number;
    catalogFilter?: string;
    currentCatalogEntry?: CatalogEntry;
    viewingFile?: { name: string; content: string; type: 'text' | 'amigaguide' };
  };
}

export function loadCatalogEntries(ctx: CatalogContext): void {
  try {
    ctx.state.catalogEntries = searchCatalog(ctx.state.catalogFilter ?? '');
  } catch {
    ctx.state.catalogEntries = [];
  }
}

export function showRepoList(ctx: CatalogContext): void {
  ctx.state.mode = 'repo';
  ctx.socket.emit('ansi-output', '\x1b[2J\x1b[H');

  let statsStr = '';
  try {
    const stats = catalogStats();
    statsStr = ` [${stats.total} in repo, ${stats.installed} installed]`;
  } catch { /* catalog not yet built */ }

  const header = ` DOOR MANAGER - REPO${ctx.state.catalogFilter ? ' (filtered)' : ''}${statsStr}`;
  ctx.socket.emit('ansi-output', '\x1b[1;1H\x1b[0;37;44m' + ctx.pad(header, 80) + '\x1b[0m');
  ctx.socket.emit('ansi-output', '\x1b[3;1H');

  const entries = ctx.state.catalogEntries;

  if (entries.length === 0) {
    ctx.socket.emit('ansi-output', '\x1b[33mNo doors in catalog. Run: npm run catalog:build\x1b[0m\r\n\r\n');
  } else {
    const pageSize = 14;
    const start = ctx.state.scrollOffset;
    const end = Math.min(start + pageSize, entries.length);

    for (let i = start; i < end; i++) {
      const entry = entries[i];
      const isSelected = i === ctx.state.catalogSelectedIndex;
      const installed = entry.installed ? '\x1b[32m[*]\x1b[0m' : '\x1b[90m[ ]\x1b[0m';
      const typeStr = (entry.door_type ?? 'XIM').substring(0, 3).padEnd(3);
      const cmd = (entry.installed_as ?? '').substring(0, 10).padEnd(10);
      const name = (entry.name ?? '').substring(0, 26).padEnd(26);
      const group = (entry.release_group ?? '').substring(0, 13).padEnd(13);

      if (isSelected) {
        ctx.socket.emit('ansi-output', `\x1b[0;37;44m ${installed} [${typeStr}] ${cmd} ${name} ${group}\x1b[0m\r\n`);
      } else {
        ctx.socket.emit('ansi-output', ` ${installed} \x1b[33m[${typeStr}]\x1b[0m \x1b[33m${cmd}\x1b[0m ${name} \x1b[90m${group}\x1b[0m\r\n`);
      }
    }

    if (entries.length > pageSize) {
      const current = Math.floor(ctx.state.catalogSelectedIndex / pageSize) + 1;
      const total = Math.ceil(entries.length / pageSize);
      ctx.socket.emit('ansi-output', `\r\n\x1b[90mPage ${current}/${total} of ${entries.length} doors\x1b[0m\r\n`);
    }
  }

  ctx.socket.emit('ansi-output', '\r\n');
  ctx.socket.emit('ansi-output', '\x1b[0;37m' + '─'.repeat(80) + '\x1b[0m\r\n');
  ctx.socket.emit('ansi-output', '\x1b[33m↑/↓\x1b[0m Nav  ');
  ctx.socket.emit('ansi-output', '\x1b[33mENTER\x1b[0m Info  ');
  ctx.socket.emit('ansi-output', '\x1b[33mF\x1b[0m Filter  ');
  ctx.socket.emit('ansi-output', '\x1b[33mTab\x1b[0m Installed  ');
  ctx.socket.emit('ansi-output', '\x1b[33mQ\x1b[0m Quit\r\n');
}

export function showCatalogInfo(ctx: CatalogContext): void {
  const entry = ctx.state.currentCatalogEntry;
  if (!entry) return;
  ctx.state.mode = 'catalog-info';

  ctx.socket.emit('ansi-output', '\x1b[2J\x1b[H');
  const header = ` DOOR INFO: ${(entry.name ?? '').toUpperCase()} `;
  ctx.socket.emit('ansi-output', '\x1b[0;37;44m' + ctx.pad(header, 80) + '\x1b[0m\r\n\r\n');

  const row = (label: string, value: string | null | undefined) => {
    if (!value) return;
    ctx.socket.emit('ansi-output', `  \x1b[33m${label.padEnd(14)}\x1b[0m ${value}\r\n`);
  };

  row('Name:', entry.name);
  row('Version:', entry.version);
  row('Author:', entry.author);
  row('Group:', entry.release_group);
  row('Archive:', entry.archive_name);
  row('Type:', entry.door_type);
  row('Category:', entry.category);
  row('Size:', entry.archive_size ? `${(entry.archive_size / 1024).toFixed(1)}k` : null);
  row('Junk files:', entry.junk_count > 0 ? `${entry.junk_count}` : '0 (clean)');
  row('Installed as:', entry.installed_as);
  row('Install dir:', entry.install_dir);

  if (entry.file_id_diz) {
    ctx.socket.emit('ansi-output', '\r\n  \x1b[36mFILE_ID.DIZ:\x1b[0m\r\n');
    const dizLines = entry.file_id_diz.split('\n').slice(0, 10);
    for (const line of dizLines) {
      ctx.socket.emit('ansi-output', `  ${line}\r\n`);
    }
    if (entry.file_id_diz.split('\n').length > 10) {
      ctx.socket.emit('ansi-output', `  \x1b[90m... (${entry.file_id_diz.split('\n').length} lines total)\x1b[0m\r\n`);
    }
  }

  ctx.socket.emit('ansi-output', '\r\n');
  ctx.socket.emit('ansi-output', '\x1b[0;37m' + '─'.repeat(80) + '\x1b[0m\r\n');

  const actions: string[] = [];
  if (entry.doc_raw) actions.push('\x1b[33mD\x1b[0m Doc');
  if (entry.archive_path && fs.existsSync(entry.archive_path)) actions.push('\x1b[33mA\x1b[0m Browse Archive');
  if (!entry.installed) actions.push('\x1b[33mI\x1b[0m Install');
  if (entry.installed) actions.push('\x1b[33mI\x1b[0m Uninstall');
  if (entry.archive_path && fs.existsSync(entry.archive_path)) actions.push('\x1b[33mS\x1b[0m Strip Ads');
  actions.push('\x1b[33mB\x1b[0m Back');
  actions.push('\x1b[33mQ\x1b[0m Quit');
  ctx.socket.emit('ansi-output', actions.join('  ') + '\r\n');
}

export function handleRepoInput(ctx: CatalogContext, key: string, rawData: string): void {
  const entries = ctx.state.catalogEntries;
  const pageSize = 14;

  if (rawData === '\x1b[A' || rawData === '\x1b\x5b\x41') {
    if (ctx.state.catalogSelectedIndex > 0) {
      ctx.state.catalogSelectedIndex--;
      if (ctx.state.catalogSelectedIndex < ctx.state.scrollOffset) {
        ctx.state.scrollOffset = Math.max(0, ctx.state.scrollOffset - pageSize);
      }
      showRepoList(ctx);
    }
    return;
  }

  if (rawData === '\x1b[B' || rawData === '\x1b\x5b\x42') {
    if (ctx.state.catalogSelectedIndex < entries.length - 1) {
      ctx.state.catalogSelectedIndex++;
      if (ctx.state.catalogSelectedIndex >= ctx.state.scrollOffset + pageSize) {
        ctx.state.scrollOffset = Math.min(entries.length - pageSize, ctx.state.scrollOffset + pageSize);
      }
      showRepoList(ctx);
    }
    return;
  }

  if (key === '\r' || key === '\n') {
    if (entries.length > 0) {
      ctx.state.currentCatalogEntry = entries[ctx.state.catalogSelectedIndex];
      showCatalogInfo(ctx);
    }
    return;
  }

  if (rawData === '\t') {
    ctx.state.listMode = 'installed';
    ctx.state.selectedIndex = 0;
    ctx.state.scrollOffset = 0;
    ctx.state.mode = 'list';
    ctx.showList();
    return;
  }

  if (key === 'f') {
    promptCatalogFilter(ctx);
    return;
  }

  if (key === 'q') {
    ctx.cleanup();
    ctx.socket.emit('door-exit');
    return;
  }
}

export function handleCatalogInfoInput(ctx: CatalogContext, key: string): void {
  const entry = ctx.state.currentCatalogEntry;
  if (!entry) return;

  if (key === 'd' && entry.doc_raw) {
    const fileType: 'text' | 'amigaguide' = entry.doc_filename?.toLowerCase().endsWith('.guide')
      ? 'amigaguide'
      : 'text';
    ctx.state.viewingFile = {
      name: entry.doc_filename ?? 'doc',
      content: entry.doc_raw,
      type: fileType,
    };
    ctx.state.scrollOffset = 0;
    ctx.state.mode = 'view-file';
    ctx.showFileViewer();
    return;
  }

  if (key === 'i') {
    if (entry.installed) {
      uninstallCatalogDoor(ctx, entry);
    } else {
      installFromCatalog(ctx, entry);
    }
    return;
  }

  if (key === 'a' && entry.archive_path && fs.existsSync(entry.archive_path)) {
    ctx.browseCatalogArchive(entry.archive_path);
    return;
  }

  if (key === 's' && entry.archive_path && fs.existsSync(entry.archive_path)) {
    stripCatalogEntry(ctx, entry);
    return;
  }

  if (key === 'b') {
    ctx.state.mode = 'repo';
    showRepoList(ctx);
    return;
  }

  if (key === 'q') {
    ctx.cleanup();
    ctx.socket.emit('door-exit');
    return;
  }
}

function promptCatalogFilter(ctx: CatalogContext): void {
  ctx.socket.emit('ansi-output', '\r\n\x1b[0;33mFilter (name/author/group/desc), blank to clear:\x1b[0m ');
  const onInput = (data: string) => {
    ctx.socket.off('command', onInput);
    const term = data.trim();
    ctx.state.catalogFilter = term.length > 0 ? term : undefined;
    ctx.state.catalogSelectedIndex = 0;
    ctx.state.scrollOffset = 0;
    loadCatalogEntries(ctx);
    showRepoList(ctx);
  };
  ctx.socket.once('command', onInput);
}

function installFromCatalog(ctx: CatalogContext, entry: CatalogEntry): void {
  if (!entry.archive_path || !fs.existsSync(entry.archive_path)) {
    ctx.socket.emit('ansi-output', `\r\n\x1b[31mArchive not found: ${entry.archive_path}\x1b[0m\r\n`);
    return;
  }

  const suggestedCmd = (entry.installed_as ?? entry.binary_name ?? entry.name ?? 'DOOR')
    .toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 12);

  ctx.socket.emit('ansi-output', `\r\n\x1b[33mInstall as BBS command [${suggestedCmd}]:\x1b[0m `);

  const onCmd = (cmdInput: string) => {
    ctx.socket.off('command', onCmd);
    const cmd = cmdInput.trim().toUpperCase() || suggestedCmd;
    const installDir = path.join(ctx.doorsPath, cmd);
    const bbsCmdDir = path.join(ctx.projectRoot, 'Commands', 'BBSCmd');

    ctx.socket.emit('ansi-output', `\r\n\x1b[36mExtracting ${entry.archive_name} -> Doors/${cmd}/...\x1b[0m\r\n`);

    try {
      extractCatalogArchive(entry, installDir);

      const infoPath = path.join(bbsCmdDir, `${cmd}.info`);
      const location = `Doors:${cmd}/${entry.binary_name ?? cmd}`;
      const tooltypes: Record<string, string> = {
        TYPE: 'XIM',
        LOCATION: location,
        STACK: '65536',
        ACCESS: '0',
      };

      if (entry.suggested_tooltypes) {
        try {
          const suggested = JSON.parse(entry.suggested_tooltypes) as Record<string, string>;
          for (const [k, v] of Object.entries(suggested)) {
            tooltypes[k] = v.replace(/<[^>]+>/g, cmd);
          }
        } catch { /* ignore */ }
      }

      writeXimInfoFile(infoPath, tooltypes);
      markInstalled(entry.id, cmd, `Doors/${cmd}`);

      ctx.state.currentCatalogEntry = { ...entry, installed: 1, installed_as: cmd, install_dir: `Doors/${cmd}` };
      loadCatalogEntries(ctx);

      ctx.socket.emit('ansi-output', `\x1b[32mInstalled as ${cmd}\x1b[0m\r\n`);
      setTimeout(() => showCatalogInfo(ctx), 800);
    } catch (err) {
      ctx.socket.emit('ansi-output', `\x1b[31mInstall failed: ${(err as Error).message}\x1b[0m\r\n`);
      setTimeout(() => showCatalogInfo(ctx), 1500);
    }
  };

  ctx.socket.once('command', onCmd);
}

function uninstallCatalogDoor(ctx: CatalogContext, entry: CatalogEntry): void {
  ctx.socket.emit('ansi-output', `\r\n\x1b[33mUninstall ${entry.installed_as}? (Y/N):\x1b[0m `);

  const onInput = (data: string) => {
    ctx.socket.off('command', onInput);
    if (data.trim().toLowerCase() !== 'y') {
      showCatalogInfo(ctx);
      return;
    }

    try {
      const bbsCmdDir = path.join(ctx.projectRoot, 'Commands', 'BBSCmd');
      const infoPath = path.join(bbsCmdDir, `${entry.installed_as}.info`);
      if (fs.existsSync(infoPath)) fs.unlinkSync(infoPath);

      if (entry.install_dir) {
        const installDirAbs = path.join(ctx.projectRoot, entry.install_dir);
        if (fs.existsSync(installDirAbs)) fs.rmSync(installDirAbs, { recursive: true, force: true });
      }

      markUninstalled(entry.id);
      ctx.state.currentCatalogEntry = { ...entry, installed: 0, installed_as: null, install_dir: null };
      loadCatalogEntries(ctx);

      ctx.socket.emit('ansi-output', `\x1b[32mUninstalled ${entry.installed_as}\x1b[0m\r\n`);
      setTimeout(() => showCatalogInfo(ctx), 800);
    } catch (err) {
      ctx.socket.emit('ansi-output', `\x1b[31mUninstall failed: ${(err as Error).message}\x1b[0m\r\n`);
      setTimeout(() => showCatalogInfo(ctx), 1500);
    }
  };

  ctx.socket.once('command', onInput);
}

function extractCatalogArchive(entry: CatalogEntry, outDir: string): void {
  fs.mkdirSync(outDir, { recursive: true });
  const result = spawnSync(LHA_BIN, ['e', '-q', entry.archive_path, outDir + '/'], { timeout: 30000 });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`lha extract failed (status ${result.status})`);
  }
}

function writeXimInfoFile(infoPath: string, tooltypes: Record<string, string>): void {
  const lines = Object.entries(tooltypes).map(([k, v]) => `${k}=${v}`).join('\n');
  fs.writeFileSync(infoPath, lines + '\n', 'latin1');
}

// Called from DoorManager installed-door info view
export function stripInstalledDoor(ctx: CatalogContext, command: string, onDone: () => void): void {
  const entry = getCatalogEntryByCmd(command);
  if (!entry || !entry.archive_path) {
    ctx.socket.emit('ansi-output', `\r\n\x1b[33mDoor not in catalog — cannot strip.\x1b[0m\r\n`);
    setTimeout(onDone, 1200);
    return;
  }
  stripCatalogEntry(ctx, entry, onDone);
}

function stripCatalogEntry(ctx: CatalogContext, entry: CatalogEntry, onDone?: () => void): void {
  const done = onDone ?? (() => showCatalogInfo(ctx));

  if (!fs.existsSync(entry.archive_path)) {
    ctx.socket.emit('ansi-output', `\r\n\x1b[31mArchive not found: ${entry.archive_path}\x1b[0m\r\n`);
    setTimeout(done, 1500);
    return;
  }

  ctx.socket.emit('ansi-output', '\r\n\x1b[36mAnalyzing for ad files...\x1b[0m ');

  let stripLib: any;
  try {
    stripLib = require('./ami-stripper.lib');
  } catch {
    ctx.socket.emit('ansi-output', '\r\n\x1b[31mStripper library unavailable.\x1b[0m\r\n');
    setTimeout(done, 1200);
    return;
  }

  (stripLib.analyzeArchive(entry.archive_path) as Promise<any>).then((result: any) => {
    ctx.socket.emit('ansi-output', `done. ${result.kept.length + result.stripped.length} files.\r\n\r\n`);

    if (result.stripped.length === 0) {
      ctx.socket.emit('ansi-output', '\x1b[32mNo ad files found — archive is clean.\x1b[0m\r\n');
      setTimeout(done, 1200);
      return;
    }

    ctx.socket.emit('ansi-output', `\x1b[31mAd files to remove (${result.stripped.length}):\x1b[0m\r\n`);
    for (const f of (result.stripped as any[]).slice(0, 10)) {
      const reason = result.reason[f.path] ?? '';
      ctx.socket.emit('ansi-output', `  \x1b[31m${(f.path as string).substring(0, 42).padEnd(42)}\x1b[0m \x1b[90m[${reason}]\x1b[0m\r\n`);
    }
    if (result.stripped.length > 10) {
      ctx.socket.emit('ansi-output', `  \x1b[90m... and ${result.stripped.length - 10} more\x1b[0m\r\n`);
    }

    const target = entry.install_dir ? ` and re-extract to ${entry.install_dir}` : '';
    ctx.socket.emit('ansi-output', `\r\n\x1b[33mStrip archive${target}? (Y/N):\x1b[0m `);

    const onConfirm = (data: string) => {
      ctx.socket.off('command', onConfirm);
      if (data.trim().toLowerCase() !== 'y') {
        ctx.socket.emit('ansi-output', '\x1b[33mAborted.\x1b[0m\r\n');
        setTimeout(done, 800);
        return;
      }

      const outPath = entry.archive_path.replace(/(\.(lha|lzx|lzh))$/i, '-clean$1');
      ctx.socket.emit('ansi-output', '\r\n\x1b[36mStripping...\x1b[0m ');

      (stripLib.stripArchive(entry.archive_path, outPath) as Promise<any>).then(() => {
        ctx.socket.emit('ansi-output', 'done.\r\n');

        if (entry.install_dir) {
          const installDirAbs = path.join(ctx.projectRoot, entry.install_dir);
          ctx.socket.emit('ansi-output', `\x1b[36mRe-extracting to ${entry.install_dir}...\x1b[0m `);
          try {
            extractCatalogArchive({ ...entry, archive_path: outPath }, installDirAbs);
            ctx.socket.emit('ansi-output', 'done.\r\n');
          } catch (err) {
            ctx.socket.emit('ansi-output', `\r\n\x1b[31mRe-extract failed: ${(err as Error).message}\x1b[0m\r\n`);
          }
        }

        try { updateJunkCount(entry.id, 0); } catch { /* catalog may not be built */ }
        if (ctx.state.currentCatalogEntry?.id === entry.id) {
          ctx.state.currentCatalogEntry = { ...entry, junk_count: 0 };
        }

        ctx.socket.emit('ansi-output', `\x1b[32mDone. Removed ${result.stripped.length} ad file(s).\x1b[0m\r\n`);
        setTimeout(done, 1200);
      }).catch((err: Error) => {
        ctx.socket.emit('ansi-output', `\r\n\x1b[31mStrip failed: ${err.message}\x1b[0m\r\n`);
        setTimeout(done, 1500);
      });
    };

    ctx.socket.once('command', onConfirm);
  }).catch((err: Error) => {
    ctx.socket.emit('ansi-output', `\r\n\x1b[31mAnalysis failed: ${err.message}\x1b[0m\r\n`);
    setTimeout(done, 1500);
  });
}
