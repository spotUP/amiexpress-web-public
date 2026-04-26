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
    this.doorRoot = path.resolve(this.projectRoot, opts.doorPath);
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
      content: `{center}{yellow-fg}Enter{/yellow-fg}=Open  {yellow-fg}Bksp{/yellow-fg}=Up  {yellow-fg}ESC{/yellow-fg}=Close{/center}`,
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
    } catch {
      this.listWidget.setItems(['{red-fg}Cannot read directory{/red-fg}']);
      this.screen.render();
      return;
    }

    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
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
        items.push(`{#555555-fg}${f.name.padEnd(36)} ${size}{/#555555-fg}`);
      }
    }

    if (items.length === 0) {
      items.push('{#555555-fg}(empty directory){/#555555-fg}');
    }

    this.listWidget.setItems(items);
    this.listWidget.select(0);
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
        `  {cyan-fg}${breadcrumb}{/cyan-fg}{|}  {yellow-fg}B{/yellow-fg}=back  {yellow-fg}ESC{/yellow-fg}=close  `,
        true
      );
    } else {
      this.header.setContent(
        `  {cyan-fg}FILES: ${relDir}/{/cyan-fg}{|}  {yellow-fg}ESC{/yellow-fg}=close  `,
        true
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

  private close(): void {
    this.overlay.destroy();
    this.onClose();
  }
}
