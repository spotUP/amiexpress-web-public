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
/**
 * Walk an absolute path component-by-component, matching each segment
 * case-insensitively against the on-disk entries. Returns the resolved
 * absolute path or null if any component is missing. Used to bridge the
 * gap between AmigaDOS-style mixed-case door tooltypes and the
 * lowercased on-disk dir names many of our doors actually use.
 */
function resolveCaseInsensitive(absPath) {
    if (!path.isAbsolute(absPath))
        return null;
    const components = absPath.split(path.sep).filter(Boolean);
    let current = path.sep;
    for (const seg of components) {
        let entries;
        try {
            entries = fs.readdirSync(current);
        }
        catch {
            return null;
        }
        const match = entries.find((e) => e.toLowerCase() === seg.toLowerCase());
        if (!match)
            return null;
        current = path.join(current, match);
    }
    return current;
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
        this._keypressHandler = null;
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
        this._promptHandler = null;
        this.screen = opts.screen;
        this.onClose = opts.onClose;
        this.projectRoot = process.cwd();
        // Resolve to absolute path, then if it points to a file (e.g. 68K executable) use parent dir
        let resolved = path.isAbsolute(opts.doorPath)
            ? opts.doorPath
            : path.resolve(this.projectRoot, opts.doorPath);
        try {
            this.doorRoot = fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
        }
        catch {
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
                }
                catch {
                    this.doorRoot = ciResolved;
                }
            }
            else {
                this.doorRoot = resolved;
            }
        }
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
            content: `{center}{yellow-fg}Enter{/yellow-fg}=Open  {yellow-fg}D{/yellow-fg}el  {yellow-fg}R{/yellow-fg}ename  {yellow-fg}Bksp/B{/yellow-fg}=Up  {yellow-fg}ESC{/yellow-fg}=Close{/center}`,
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
        // All keys via screen.on('keypress') — widget.key() only fires when that
        // specific widget is focused, which is unreliable with vi-mode lists.
        this._keypressHandler = (ch, key) => {
            if (this._promptHandler)
                return; // prompt is active — let it handle keys
            const kn = key?.name ?? '';
            if (this.viewerState === 'viewer') {
                if (kn === 'escape' || kn === 'b' || ch === 'b' || ch === 'B') {
                    this.backFromViewer();
                    return;
                }
                if (kn === 'up' || ch === 'k') {
                    this.viewerScrollOffset = Math.max(0, this.viewerScrollOffset - 1);
                    this.refreshViewer();
                    return;
                }
                if (kn === 'down' || ch === 'j') {
                    this.viewerScrollOffset = Math.min(Math.max(0, this.viewerTotalLines - this.getViewerHeight()), this.viewerScrollOffset + 1);
                    this.refreshViewer();
                    return;
                }
                if (kn === 'pageup') {
                    this.viewerScrollOffset = Math.max(0, this.viewerScrollOffset - this.getViewerHeight());
                    this.refreshViewer();
                    return;
                }
                if (kn === 'pagedown') {
                    this.viewerScrollOffset = Math.min(Math.max(0, this.viewerTotalLines - this.getViewerHeight()), this.viewerScrollOffset + this.getViewerHeight());
                    this.refreshViewer();
                    return;
                }
                if (this.isGuide && ch && /[1-9]/.test(ch)) {
                    const n = parseInt(ch, 10);
                    const link = this.guideLinks.find((l) => l.index === n);
                    if (link) {
                        this.guideNodeHistory.push(this.guideCurrentNode);
                        this.viewerScrollOffset = 0;
                        this.renderGuideNode(link.target);
                    }
                    return;
                }
                if (this.isGuide && this.guideParser && (ch === 'p' || ch === 'P')) {
                    const node = this.guideParser.getNode(this.guideCurrentNode);
                    if (node?.prev) {
                        this.guideNodeHistory.push(this.guideCurrentNode);
                        this.viewerScrollOffset = 0;
                        this.renderGuideNode(node.prev);
                    }
                    return;
                }
                if (this.isGuide && this.guideParser && (ch === 'n' || ch === 'N')) {
                    const node = this.guideParser.getNode(this.guideCurrentNode);
                    if (node?.next) {
                        this.guideNodeHistory.push(this.guideCurrentNode);
                        this.viewerScrollOffset = 0;
                        this.renderGuideNode(node.next);
                    }
                    return;
                }
            }
            else {
                if (kn === 'escape') {
                    this.close();
                    return;
                }
                if (kn === 'backspace' || kn === 'b' || ch === 'b' || ch === 'B') {
                    if (this.currentDir !== this.doorRoot)
                        this.loadDirectory(path.dirname(this.currentDir));
                    return;
                }
                if (kn === 'enter' || kn === 'return' || ch === '\r') {
                    const idx = this.listWidget.selected ?? 0;
                    const items = this.listWidget.items ?? [];
                    const raw = typeof items[idx] === 'string' ? items[idx] : '';
                    this.handleSelect(raw);
                    return;
                }
                if (ch === 'd' || ch === 'D') {
                    this.deleteSelected();
                    return;
                }
                if (ch === 'r' || ch === 'R') {
                    this.renameSelected();
                    return;
                }
                if (ch === 'q' || ch === 'Q') {
                    this.close();
                    return;
                }
            }
        };
        this.screen.on('keypress', this._keypressHandler);
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
        catch (err) {
            const e = err;
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
            .filter((e) => e.isFile() && !e.name.startsWith('.') && !e.name.startsWith('__'))
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
            // All key handling is via screen.on('keypress') registered in buildUI()
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
    getSelectedFilename() {
        const idx = this.listWidget.selected ?? 0;
        const items = this.listWidget.items ?? [];
        const raw = typeof items[idx] === 'string' ? items[idx] : '';
        // Strip tags and get filename (trim size suffix)
        const clean = raw.replace(/\{[^}]+\}/g, '').trim();
        if (!clean || clean.startsWith('[') || clean.startsWith('..'))
            return null;
        return clean.split(/\s+/)[0].trim() || null;
    }
    deleteSelected() {
        const name = this.getSelectedFilename();
        if (!name)
            return;
        const fullPath = path.join(this.currentDir, name);
        const isDir = fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
        this.promptInFooter(`Delete ${name}? (y/N): `, (answer) => {
            if (answer.trim().toLowerCase() !== 'y') {
                this.restoreFooter();
                return;
            }
            try {
                if (isDir)
                    fs.rmSync(fullPath, { recursive: true, force: true });
                else
                    fs.unlinkSync(fullPath);
                this.loadDirectory(this.currentDir);
                this.restoreFooter();
            }
            catch (e) {
                this.showFooterMsg(`Error: ${e.message}`, 2000);
            }
        });
    }
    renameSelected() {
        const name = this.getSelectedFilename();
        if (!name)
            return;
        this.promptInFooter(`Rename ${name} to: `, (newName) => {
            const trimmed = newName.trim();
            if (!trimmed || trimmed === name) {
                this.restoreFooter();
                return;
            }
            try {
                fs.renameSync(path.join(this.currentDir, name), path.join(this.currentDir, trimmed));
                this.loadDirectory(this.currentDir);
                this.restoreFooter();
            }
            catch (e) {
                this.showFooterMsg(`Error: ${e.message}`, 2000);
            }
        });
    }
    promptInFooter(prompt, onSubmit) {
        let buf = '';
        this.footer.setContent(`{center}{yellow-fg}${prompt}{/yellow-fg}${buf}_`);
        this.screen.render();
        const handler = (ch, key) => {
            const kn = key?.name ?? '';
            if (kn === 'enter' || kn === 'return' || ch === '\r') {
                this.screen.off('keypress', handler);
                this._promptHandler = null;
                onSubmit(buf);
            }
            else if (kn === 'escape') {
                this.screen.off('keypress', handler);
                this._promptHandler = null;
                this.restoreFooter();
            }
            else if (kn === 'backspace' || ch === '\x7f' || ch === '\b') {
                buf = buf.slice(0, -1);
                this.footer.setContent(`{center}{yellow-fg}${prompt}{/yellow-fg}${buf}_`);
                this.screen.render();
            }
            else if (ch && ch.length === 1 && ch.charCodeAt(0) >= 32) {
                buf += ch;
                this.footer.setContent(`{center}{yellow-fg}${prompt}{/yellow-fg}${buf}_`);
                this.screen.render();
            }
        };
        this._promptHandler = handler;
        this.screen.on('keypress', handler);
    }
    restoreFooter() {
        this.footer.setContent(`{center}{yellow-fg}Enter{/yellow-fg}=Open  {yellow-fg}D{/yellow-fg}el  {yellow-fg}R{/yellow-fg}ename  {yellow-fg}Bksp{/yellow-fg}=Up  {yellow-fg}ESC{/yellow-fg}=Close{/center}`);
        this.screen.render();
    }
    showFooterMsg(msg, ms = 2000) {
        this.footer.setContent(`{center}{red-fg}${msg}{/red-fg}{/center}`);
        this.screen.render();
        setTimeout(() => this.restoreFooter(), ms);
    }
    close() {
        if (this._keypressHandler) {
            this.screen.off('keypress', this._keypressHandler);
            this._keypressHandler = null;
        }
        if (this._promptHandler) {
            this.screen.off('keypress', this._promptHandler);
            this._promptHandler = null;
        }
        this.overlay.destroy();
        this.onClose();
    }
}
exports.FileExplorerOverlay = FileExplorerOverlay;
//# sourceMappingURL=FileExplorerOverlay.js.map