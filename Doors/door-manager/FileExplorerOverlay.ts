/**
 * FileExplorerOverlay - full-screen file browser + viewer
 * Spot / Up Rough
 */

import {
  Box,
  Panel,
  List,
  ScrollableBox,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import * as path from 'path';
import * as fs from 'fs';

interface FileExplorerOptions {
  screen: any;
  doorPath: string;
  onClose: () => void;
}

const READABLE_EXTS = new Set(['.txt', '.nfo', '.guide', '.readme', '.doc', '.me', '.1st']);

function isReadable(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const base = path.basename(filename).toLowerCase();
  return READABLE_EXTS.has(ext) || base === 'readme' || base === 'readme.txt';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * Walk an absolute path component-by-component, matching each segment
 * case-insensitively against the on-disk entries. Returns the resolved
 * absolute path or null if any component is missing. Used to bridge the
 * gap between AmigaDOS-style mixed-case door tooltypes and the
 * lowercased on-disk dir names many of our doors actually use.
 */
function resolveCaseInsensitive(absPath: string): string | null {
  if (!path.isAbsolute(absPath)) return null;
  const components = absPath.split(path.sep).filter(Boolean);
  let current: string = path.sep;
  for (const seg of components) {
    let entries: string[];
    try {
      entries = fs.readdirSync(current);
    } catch {
      return null;
    }
    const match = entries.find((e) => e.toLowerCase() === seg.toLowerCase());
    if (!match) return null;
    current = path.join(current, match);
  }
  return current;
}

function getFileSize(fullPath: string): number {
  try {
    return fs.statSync(fullPath).size;
  } catch {
    return 0;
  }
}

export class FileExplorerOverlay {
  private screen: any;
  private onClose: () => void;
  private projectRoot: string;
  private doorRoot: string;
  private currentDir: string;
  private overlay: any;
  private header: any;
  private footer: any;
  private listWidget: any;
  private viewerBox: any | null = null;

  private viewerState: 'browser' | 'viewer' = 'browser';
  private viewerScrollOffset = 0;
  private viewerLines: string[] = [];
  private viewerTotalLines = 0;
  private viewerFilename = '';
  private isGuide = false;
  private guideParser: any = null;
  private guideNodeHistory: string[] = [];
  private guideCurrentNode = '';
  private guideLinks: any[] = [];

  constructor(opts: FileExplorerOptions) {
    this.screen = opts.screen;
    this.onClose = opts.onClose;
    this.projectRoot = process.cwd();
    // Resolve to absolute path, then if it points to a file (e.g. 68K executable) use parent dir
    let resolved = path.isAbsolute(opts.doorPath)
      ? opts.doorPath
      : path.resolve(this.projectRoot, opts.doorPath);
    try {
      this.doorRoot = fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
    } catch {
      // Try case-insensitive resolution per path component — many .info
      // tooltypes use AmigaDOS conventions (mixed case) but the on-disk
      // dirs may be all-lowercase or differently-cased (e.g. tooltype says
      // `Doors/EmP_Tools/Bulls` but on disk it's `Doors/emp_tools/Bulls`).
      const ciResolved = resolveCaseInsensitive(resolved);
      if (ciResolved && fs.existsSync(ciResolved)) {
        try {
          this.doorRoot = fs.statSync(ciResolved).isDirectory()
            ? ciResolved
            : path.dirname(ciResolved);
        } catch {
          this.doorRoot = ciResolved;
        }
      } else {
        this.doorRoot = resolved;
      }
    }
    this.currentDir = this.doorRoot;
    this.buildUI();
    this.loadDirectory(this.doorRoot);
    this.screen.render();
  }

  private buildUI(): void {
    this.overlay = new Box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      style: { bg: 'black' },
      tags: true,
      keys: true,
      focusable: true,
    } as any);

    this.header = new Panel({
      parent: this.overlay,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      tags: true,
      content: '',
      style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
      focusable: false,
    } as any);

    this.footer = new Panel({
      parent: this.overlay,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      tags: true,
      content: `{center}{yellow-fg}Enter{/yellow-fg}=Open  {yellow-fg}D{/yellow-fg}el  {yellow-fg}R{/yellow-fg}ename  {yellow-fg}Bksp{/yellow-fg}=Up  {yellow-fg}ESC{/yellow-fg}=Close{/center}`,
      style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
      focusable: false,
    } as any);

    this.listWidget = new List({
      parent: this.overlay,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-6',
      keys: true,
      vi: true,
      mouse: true,
      tags: true,
      style: {
        selected: { bg: 'blue', fg: 'white' },
        item: { fg: 'white' },
      },
    } as any);

    this.listWidget.on('select item', (item: any, _index: number) => {
      const label: string = typeof item === 'string' ? item : (item?.content ?? '');
      this.handleSelect(label);
    });

    this.listWidget.key(['enter'], () => {
      const selected = this.listWidget.getSelectedItem ? this.listWidget.getSelectedItem() : undefined;
      if (selected) {
        this.handleSelect(selected);
      }
    });

    this.listWidget.key(['backspace'], () => {
      if (this.currentDir !== this.doorRoot) {
        this.loadDirectory(path.dirname(this.currentDir));
      }
    });

    this.overlay.key(['escape'], () => {
      if (this.viewerState === 'viewer') {
        this.backFromViewer();
      } else {
        this.close();
      }
    });

    // List widget emits 'cancel' when ESC is pressed (before overlay sees it),
    // so we must also listen here to close the browser view.
    this.listWidget.on('cancel', () => {
      if (this.viewerState === 'browser') {
        this.close();
      }
    });

    this.listWidget.key(['d', 'D'], () => {
      if (this.viewerState !== 'browser') return;
      this.deleteSelected();
    });

    this.listWidget.key(['r', 'R'], () => {
      if (this.viewerState !== 'browser') return;
      this.renameSelected();
    });

    this.listWidget.focus();
    this.updateHeader();
  }

  private loadDirectory(absDir: string): void {
    if (absDir !== this.doorRoot && !absDir.startsWith(this.doorRoot + path.sep)) {
      absDir = this.doorRoot;
    }
    this.currentDir = absDir;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      // Surface the actual reason — sysops were getting a generic "Cannot read directory"
      // with no clue why (path missing? permission denied? not a directory?).
      const code = e?.code ?? 'ERR';
      const msg = e?.message ?? String(err);
      this.listWidget.setItems([
        `{red-fg}Cannot read directory: ${code}{/red-fg}`,
        `{gray-fg}${absDir}{/gray-fg}`,
        `{gray-fg}${msg}{/gray-fg}`,
      ]);
      this.screen.render();
      return;
    }

    const SKIP_DIRS = new Set(['node_modules', '.git', 'tmp', 'temp', 'backup', 'bak', '__pycache__']);
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name.toLowerCase()))
      .map((e) => e.name)
      .sort();

    const files = entries
      .filter((e) => e.isFile())
      .sort((a, b) => a.name.localeCompare(b.name));

    const items: string[] = [];

    if (absDir !== this.doorRoot) {
      items.push('{blue-fg}.. (parent){/blue-fg}');
    }

    for (const d of dirs) {
      items.push(`{cyan-fg}[${d}/]{/cyan-fg}`);
    }

    for (const f of files) {
      const size = formatFileSize(getFileSize(path.join(absDir, f.name)));
      if (isReadable(f.name)) {
        items.push(`${f.name.padEnd(36)} {white-fg}${size}{/white-fg}`);
      } else {
        items.push(`{gray-fg}${f.name.padEnd(36)} ${size}{/gray-fg}`);
      }
    }

    if (items.length === 0) {
      items.push('{gray-fg}(empty directory){/gray-fg}');
    }

    this.listWidget.setItems(items);
    this.listWidget.select(0);
    this.listWidget.focus();
    this.updateHeader();
    this.screen.render();
  }

  private handleSelect(label: string): void {
    const plain = label.replace(/\{[^}]+\}/g, '').trim();

    if (plain === '.. (parent)') {
      this.loadDirectory(path.dirname(this.currentDir));
      return;
    }

    if (plain.startsWith('[') && plain.endsWith('/]')) {
      const dirName = plain.slice(1, -2);
      this.loadDirectory(path.join(this.currentDir, dirName));
      return;
    }

    const filename = plain.split(/\s{2,}/)[0].trim();
    if (!filename || !isReadable(filename)) return;

    this.openFile(path.join(this.currentDir, filename), filename);
  }

  private openFile(fullPath: string, filename: string): void {
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'latin1');
    } catch {
      // Show error in viewer area
      this.viewerLines = [`Cannot read file: ${filename}`];
      this.viewerTotalLines = 1;
      this.renderViewer();
      return;
    }

    this.viewerFilename = filename;
    this.isGuide = path.extname(filename).toLowerCase() === '.guide';
    this.viewerScrollOffset = 0;
    this.viewerState = 'viewer';

    if (this.isGuide) {
      this.openGuide(content);
    } else {
      this.viewerLines = content.split(/\r?\n/);
      this.viewerTotalLines = this.viewerLines.length;
      this.renderViewer();
    }
  }

  private getViewerHeight(): number {
    return Math.max(5, (this.screen.height ?? 24) - 6);
  }

  private openGuide(content: string): void {
    try {
      const parserPath = path.join(
        process.cwd(),
        'web',
        'backend',
        'dist',
        'amigaguide',
        'AmigaGuideParser'
      );
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { AmigaGuideParser } = require(parserPath);
      this.guideParser = new AmigaGuideParser();
      const doc = this.guideParser.parse(content);
      this.guideNodeHistory = [];
      this.guideCurrentNode = doc.mainNode || 'main';
      this.renderGuideNode(this.guideCurrentNode);
    } catch {
      this.isGuide = false;
      this.viewerLines = content.split(/\r?\n/);
      this.viewerTotalLines = this.viewerLines.length;
      this.renderViewer();
    }
  }

  private renderGuideNode(nodeName: string): void {
    const w = (this.screen.width ?? 80) - 2;
    const h = this.getViewerHeight();
    const result = this.guideParser.renderNode(nodeName, w, h, this.viewerScrollOffset);
    this.viewerLines = result.lines;
    this.viewerTotalLines = result.totalLines;
    this.guideLinks = result.links;
    this.guideCurrentNode = nodeName;
    this.renderViewer();
  }

  private renderViewer(): void {
    this.listWidget.hide();

    if (!this.viewerBox) {
      this.viewerBox = new ScrollableBox({
        parent: this.overlay,
        top: 3,
        left: 0,
        width: '100%',
        height: '100%-6',
        tags: false,
        style: { fg: 'white', bg: 'black' },
        keys: true,
        focusable: true,
      } as any);

      this.viewerBox.key(['b', 'B'], () => this.backFromViewer());

      this.viewerBox.key(['up', 'k'], () => {
        this.viewerScrollOffset = Math.max(0, this.viewerScrollOffset - 1);
        this.refreshViewer();
      });

      this.viewerBox.key(['down', 'j'], () => {
        this.viewerScrollOffset = Math.min(
          Math.max(0, this.viewerTotalLines - this.getViewerHeight()),
          this.viewerScrollOffset + 1
        );
        this.refreshViewer();
      });

      this.viewerBox.key(['pageup'], () => {
        this.viewerScrollOffset = Math.max(0, this.viewerScrollOffset - this.getViewerHeight());
        this.refreshViewer();
      });

      this.viewerBox.key(['pagedown'], () => {
        this.viewerScrollOffset = Math.min(
          Math.max(0, this.viewerTotalLines - this.getViewerHeight()),
          this.viewerScrollOffset + this.getViewerHeight()
        );
        this.refreshViewer();
      });

      for (let n = 1; n <= 9; n++) {
        const num = n;
        this.viewerBox.key([`${num}`], () => {
          if (!this.isGuide || !this.guideLinks) return;
          const link = this.guideLinks.find((l: any) => l.index === num);
          if (link) {
            this.guideNodeHistory.push(this.guideCurrentNode);
            this.viewerScrollOffset = 0;
            this.renderGuideNode(link.target);
          }
        });
      }

      this.viewerBox.key(['p', 'P'], () => {
        if (!this.isGuide || !this.guideParser) return;
        const node = this.guideParser.getNode(this.guideCurrentNode);
        if (node?.prev) {
          this.guideNodeHistory.push(this.guideCurrentNode);
          this.viewerScrollOffset = 0;
          this.renderGuideNode(node.prev);
        }
      });

      this.viewerBox.key(['n', 'N'], () => {
        if (!this.isGuide || !this.guideParser) return;
        const node = this.guideParser.getNode(this.guideCurrentNode);
        if (node?.next) {
          this.guideNodeHistory.push(this.guideCurrentNode);
          this.viewerScrollOffset = 0;
          this.renderGuideNode(node.next);
        }
      });

      this.viewerBox.key(['escape'], () => this.backFromViewer());
    } else {
      this.viewerBox.show();
    }

    this.refreshViewer();
    this.viewerBox.focus();
  }

  private refreshViewer(): void {
    const h = this.getViewerHeight();
    const visible = this.viewerLines.slice(
      this.viewerScrollOffset,
      this.viewerScrollOffset + h
    );
    this.viewerBox.setContent(visible.join('\n'));
    this.updateHeader();
    this.updateFooterViewer();
    this.screen.render();
  }

  private backFromViewer(): void {
    if (this.isGuide && this.guideNodeHistory.length > 0) {
      const prev = this.guideNodeHistory.pop()!;
      this.viewerScrollOffset = 0;
      this.renderGuideNode(prev);
      return;
    }
    this.viewerState = 'browser';
    this.viewerScrollOffset = 0;
    if (this.viewerBox) {
      this.viewerBox.hide();
    }
    this.listWidget.show();
    this.listWidget.focus();
    this.updateHeader();
    this.updateFooterBrowser();
    this.screen.render();
  }

  private updateHeader(): void {
    const relDir = path.relative(this.doorRoot, this.currentDir) || '.';
    if (this.viewerState === 'viewer') {
      const breadcrumb =
        this.isGuide && this.guideCurrentNode
          ? `${this.viewerFilename} > ${this.guideCurrentNode}`
          : this.viewerFilename;
      this.header.setContent(
        `  {cyan-fg}${breadcrumb}{/cyan-fg}  |  {yellow-fg}B{/yellow-fg}=back  {yellow-fg}ESC{/yellow-fg}=close  `
      );
    } else {
      this.header.setContent(
        `  {cyan-fg}FILES: ${relDir}/{/cyan-fg}  |  {yellow-fg}ESC{/yellow-fg}=close  `
      );
    }
  }

  private updateFooterBrowser(): void {
    this.footer.setContent(
      `{center}{yellow-fg}Enter{/yellow-fg}=Open  {yellow-fg}Bksp{/yellow-fg}=Up  {yellow-fg}ESC{/yellow-fg}=Close{/center}`
    );
  }

  private updateFooterViewer(): void {
    const line1 = this.viewerScrollOffset + 1;
    const lineN = Math.min(
      this.viewerScrollOffset + this.getViewerHeight(),
      this.viewerTotalLines
    );
    const guideHint = this.isGuide
      ? `  {yellow-fg}1-9{/yellow-fg}=link  {yellow-fg}P{/yellow-fg}/{yellow-fg}N{/yellow-fg}=prev/next`
      : '';
    this.footer.setContent(
      `{center}Lines ${line1}-${lineN}/${this.viewerTotalLines}  {yellow-fg}up/dn{/yellow-fg}=scroll${guideHint}  {yellow-fg}B{/yellow-fg}=back{/center}`
    );
  }

  private getSelectedFilename(): string | null {
    const idx = (this.listWidget as any).selected ?? 0;
    const items: string[] = (this.listWidget as any).items ?? [];
    const raw: string = typeof items[idx] === 'string' ? items[idx] : '';
    // Strip tags and get filename (trim size suffix)
    const clean = raw.replace(/\{[^}]+\}/g, '').trim();
    if (!clean || clean.startsWith('[') || clean.startsWith('..')) return null;
    return clean.split(/\s+/)[0].trim() || null;
  }

  private deleteSelected(): void {
    const name = this.getSelectedFilename(); if (!name) return;
    const fullPath = path.join(this.currentDir, name);
    const isDir = fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
    this.promptInFooter(`Delete ${name}? (y/N): `, (answer) => {
      if (answer.trim().toLowerCase() !== 'y') { this.restoreFooter(); return; }
      try {
        if (isDir) fs.rmSync(fullPath, { recursive: true, force: true });
        else fs.unlinkSync(fullPath);
        this.loadDirectory(this.currentDir);
        this.restoreFooter();
      } catch (e) {
        this.showFooterMsg(`Error: ${(e as Error).message}`, 2000);
      }
    });
  }

  private renameSelected(): void {
    const name = this.getSelectedFilename(); if (!name) return;
    this.promptInFooter(`Rename ${name} to: `, (newName) => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === name) { this.restoreFooter(); return; }
      try {
        fs.renameSync(path.join(this.currentDir, name), path.join(this.currentDir, trimmed));
        this.loadDirectory(this.currentDir);
        this.restoreFooter();
      } catch (e) {
        this.showFooterMsg(`Error: ${(e as Error).message}`, 2000);
      }
    });
  }

  private _promptHandler: ((ch: string, key: any) => void) | null = null;

  private promptInFooter(prompt: string, onSubmit: (value: string) => void): void {
    let buf = '';
    this.footer.setContent(`{center}{yellow-fg}${prompt}{/yellow-fg}${buf}_`);
    this.screen.render();
    const handler = (ch: string, key: any) => {
      const kn = key?.name ?? '';
      if (kn === 'enter' || kn === 'return' || ch === '\r') {
        this.screen.off('keypress', handler); this._promptHandler = null;
        onSubmit(buf);
      } else if (kn === 'escape') {
        this.screen.off('keypress', handler); this._promptHandler = null;
        this.restoreFooter();
      } else if (kn === 'backspace' || ch === '\x7f' || ch === '\b') {
        buf = buf.slice(0, -1);
        this.footer.setContent(`{center}{yellow-fg}${prompt}{/yellow-fg}${buf}_`);
        this.screen.render();
      } else if (ch && ch.length === 1 && ch.charCodeAt(0) >= 32) {
        buf += ch;
        this.footer.setContent(`{center}{yellow-fg}${prompt}{/yellow-fg}${buf}_`);
        this.screen.render();
      }
    };
    this._promptHandler = handler;
    this.screen.on('keypress', handler);
  }

  private restoreFooter(): void {
    this.footer.setContent(
      `{center}{yellow-fg}Enter{/yellow-fg}=Open  {yellow-fg}D{/yellow-fg}el  {yellow-fg}R{/yellow-fg}ename  {yellow-fg}Bksp{/yellow-fg}=Up  {yellow-fg}ESC{/yellow-fg}=Close{/center}`
    );
    this.screen.render();
  }

  private showFooterMsg(msg: string, ms = 2000): void {
    this.footer.setContent(`{center}{red-fg}${msg}{/red-fg}{/center}`);
    this.screen.render();
    setTimeout(() => this.restoreFooter(), ms);
  }

  private close(): void {
    if (this._promptHandler) { this.screen.off('keypress', this._promptHandler); }
    this.overlay.destroy();
    this.onClose();
  }
}
