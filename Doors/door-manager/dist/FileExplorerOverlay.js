"use strict";
/**
 * FileExplorerOverlay - full-screen file browser + viewer
 * Spot / Up Rough
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileExplorerOverlay = void 0;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const READABLE_EXTS = new Set(['.txt', '.nfo', '.guide', '.readme', '.doc', '.me', '.1st']);
function isReadable(filename) {
    const ext = path.extname(filename).toLowerCase();
    const base = path.basename(filename).toLowerCase();
    return READABLE_EXTS.has(ext) || base === 'readme' || base === 'readme.txt';
}
function formatFileSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${Math.round(bytes / 1024)} KB`;
    return `${Math.round(bytes / (1024 * 1024))} MB`;
}
function getFileSize(fullPath) {
    try {
        return fs.statSync(fullPath).size;
    }
    catch {
        return 0;
    }
}
class FileExplorerOverlay {
    constructor(opts) {
        this.viewerBox = null;
        this.viewerState = 'browser';
        this.viewerScrollOffset = 0;
        this.viewerLines = [];
        this.viewerTotalLines = 0;
        this.viewerFilename = '';
        this.isGuide = false;
        this.guideParser = null;
        this.guideNodeHistory = [];
        this.guideCurrentNode = '';
        this.guideLinks = [];
        this.screen = opts.screen;
        this.onClose = opts.onClose;
        this.projectRoot = process.cwd();
        // If doorPath is already absolute use it directly; otherwise resolve from cwd
        this.doorRoot = path.isAbsolute(opts.doorPath)
            ? opts.doorPath
            : path.resolve(this.projectRoot, opts.doorPath);
        this.currentDir = this.doorRoot;
        this.buildUI();
        this.loadDirectory(this.doorRoot);
        this.screen.render();
    }
    buildUI() {
        this.overlay = new blessed_1.Box({
            parent: this.screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            style: { bg: 'black' },
            tags: true,
            keys: true,
            focusable: true,
        });
        this.header = new blessed_1.Panel({
            parent: this.overlay,
            top: 0,
            left: 0,
            width: '100%',
            height: 3,
            tags: true,
            content: '',
            style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
            focusable: false,
        });
        this.footer = new blessed_1.Panel({
            parent: this.overlay,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 3,
            tags: true,
            content: `{center}{yellow-fg}Enter{/yellow-fg}=Open  {yellow-fg}Bksp{/yellow-fg}=Up  {yellow-fg}ESC{/yellow-fg}=Close{/center}`,
            style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
            focusable: false,
        });
        this.listWidget = new blessed_1.List({
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
        });
        this.listWidget.on('select item', (item, _index) => {
            const label = typeof item === 'string' ? item : (item?.content ?? '');
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
            }
            else {
                this.close();
            }
        });
        this.listWidget.focus();
        this.updateHeader();
    }
    loadDirectory(absDir) {
        if (absDir !== this.doorRoot && !absDir.startsWith(this.doorRoot + path.sep)) {
            absDir = this.doorRoot;
        }
        this.currentDir = absDir;
        let entries = [];
        try {
            entries = fs.readdirSync(absDir, { withFileTypes: true });
        }
        catch {
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
        const items = [];
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
            }
            else {
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
    handleSelect(label) {
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
        if (!filename || !isReadable(filename))
            return;
        this.openFile(path.join(this.currentDir, filename), filename);
    }
    openFile(fullPath, filename) {
        let content;
        try {
            content = fs.readFileSync(fullPath, 'latin1');
        }
        catch {
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
        }
        else {
            this.viewerLines = content.split(/\r?\n/);
            this.viewerTotalLines = this.viewerLines.length;
            this.renderViewer();
        }
    }
    getViewerHeight() {
        return Math.max(5, (this.screen.height ?? 24) - 6);
    }
    openGuide(content) {
        try {
            const parserPath = path.join(process.cwd(), 'web', 'backend', 'dist', 'amigaguide', 'AmigaGuideParser');
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { AmigaGuideParser } = require(parserPath);
            this.guideParser = new AmigaGuideParser();
            const doc = this.guideParser.parse(content);
            this.guideNodeHistory = [];
            this.guideCurrentNode = doc.mainNode || 'main';
            this.renderGuideNode(this.guideCurrentNode);
        }
        catch {
            this.isGuide = false;
            this.viewerLines = content.split(/\r?\n/);
            this.viewerTotalLines = this.viewerLines.length;
            this.renderViewer();
        }
    }
    renderGuideNode(nodeName) {
        const w = (this.screen.width ?? 80) - 2;
        const h = this.getViewerHeight();
        const result = this.guideParser.renderNode(nodeName, w, h, this.viewerScrollOffset);
        this.viewerLines = result.lines;
        this.viewerTotalLines = result.totalLines;
        this.guideLinks = result.links;
        this.guideCurrentNode = nodeName;
        this.renderViewer();
    }
    renderViewer() {
        this.listWidget.hide();
        if (!this.viewerBox) {
            this.viewerBox = new blessed_1.ScrollableBox({
                parent: this.overlay,
                top: 3,
                left: 0,
                width: '100%',
                height: '100%-6',
                tags: false,
                style: { fg: 'white', bg: 'black' },
                keys: true,
                focusable: true,
            });
            this.viewerBox.key(['b', 'B'], () => this.backFromViewer());
            this.viewerBox.key(['up', 'k'], () => {
                this.viewerScrollOffset = Math.max(0, this.viewerScrollOffset - 1);
                this.refreshViewer();
            });
            this.viewerBox.key(['down', 'j'], () => {
                this.viewerScrollOffset = Math.min(Math.max(0, this.viewerTotalLines - this.getViewerHeight()), this.viewerScrollOffset + 1);
                this.refreshViewer();
            });
            this.viewerBox.key(['pageup'], () => {
                this.viewerScrollOffset = Math.max(0, this.viewerScrollOffset - this.getViewerHeight());
                this.refreshViewer();
            });
            this.viewerBox.key(['pagedown'], () => {
                this.viewerScrollOffset = Math.min(Math.max(0, this.viewerTotalLines - this.getViewerHeight()), this.viewerScrollOffset + this.getViewerHeight());
                this.refreshViewer();
            });
            for (let n = 1; n <= 9; n++) {
                const num = n;
                this.viewerBox.key([`${num}`], () => {
                    if (!this.isGuide || !this.guideLinks)
                        return;
                    const link = this.guideLinks.find((l) => l.index === num);
                    if (link) {
                        this.guideNodeHistory.push(this.guideCurrentNode);
                        this.viewerScrollOffset = 0;
                        this.renderGuideNode(link.target);
                    }
                });
            }
            this.viewerBox.key(['p', 'P'], () => {
                if (!this.isGuide || !this.guideParser)
                    return;
                const node = this.guideParser.getNode(this.guideCurrentNode);
                if (node?.prev) {
                    this.guideNodeHistory.push(this.guideCurrentNode);
                    this.viewerScrollOffset = 0;
                    this.renderGuideNode(node.prev);
                }
            });
            this.viewerBox.key(['n', 'N'], () => {
                if (!this.isGuide || !this.guideParser)
                    return;
                const node = this.guideParser.getNode(this.guideCurrentNode);
                if (node?.next) {
                    this.guideNodeHistory.push(this.guideCurrentNode);
                    this.viewerScrollOffset = 0;
                    this.renderGuideNode(node.next);
                }
            });
            this.viewerBox.key(['escape'], () => this.backFromViewer());
        }
        else {
            this.viewerBox.show();
        }
        this.refreshViewer();
        this.viewerBox.focus();
    }
    refreshViewer() {
        const h = this.getViewerHeight();
        const visible = this.viewerLines.slice(this.viewerScrollOffset, this.viewerScrollOffset + h);
        this.viewerBox.setContent(visible.join('\n'));
        this.updateHeader();
        this.updateFooterViewer();
        this.screen.render();
    }
    backFromViewer() {
        if (this.isGuide && this.guideNodeHistory.length > 0) {
            const prev = this.guideNodeHistory.pop();
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
    updateHeader() {
        const relDir = path.relative(this.doorRoot, this.currentDir) || '.';
        if (this.viewerState === 'viewer') {
            const breadcrumb = this.isGuide && this.guideCurrentNode
                ? `${this.viewerFilename} > ${this.guideCurrentNode}`
                : this.viewerFilename;
            this.header.setContent(`  {cyan-fg}${breadcrumb}{/cyan-fg}  |  {yellow-fg}B{/yellow-fg}=back  {yellow-fg}ESC{/yellow-fg}=close  `);
        }
        else {
            this.header.setContent(`  {cyan-fg}FILES: ${relDir}/{/cyan-fg}  |  {yellow-fg}ESC{/yellow-fg}=close  `);
        }
    }
    updateFooterBrowser() {
        this.footer.setContent(`{center}{yellow-fg}Enter{/yellow-fg}=Open  {yellow-fg}Bksp{/yellow-fg}=Up  {yellow-fg}ESC{/yellow-fg}=Close{/center}`);
    }
    updateFooterViewer() {
        const line1 = this.viewerScrollOffset + 1;
        const lineN = Math.min(this.viewerScrollOffset + this.getViewerHeight(), this.viewerTotalLines);
        const guideHint = this.isGuide
            ? `  {yellow-fg}1-9{/yellow-fg}=link  {yellow-fg}P{/yellow-fg}/{yellow-fg}N{/yellow-fg}=prev/next`
            : '';
        this.footer.setContent(`{center}Lines ${line1}-${lineN}/${this.viewerTotalLines}  {yellow-fg}up/dn{/yellow-fg}=scroll${guideHint}  {yellow-fg}B{/yellow-fg}=back{/center}`);
    }
    close() {
        this.overlay.destroy();
        this.onClose();
    }
}
exports.FileExplorerOverlay = FileExplorerOverlay;
//# sourceMappingURL=FileExplorerOverlay.js.map