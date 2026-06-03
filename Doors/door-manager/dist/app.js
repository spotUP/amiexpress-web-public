"use strict";
/**
 * DOORMAN v2 — SysOp Door Management Tool
 * Rewritten around a ViewManager / view stack so each screen owns its
 * own key bindings and ESC always pops cleanly.
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
exports.createApp = createApp;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const FileExplorerOverlay_1 = require("./FileExplorerOverlay");
const InfoEditorOverlay_1 = require("./InfoEditorOverlay");
const AmigaGuideViewer_1 = require("./AmigaGuideViewer");
const ViewManager_1 = require("./ViewManager");
// ─── Constants ────────────────────────────────────────────────────────────────
const LHA_BIN = [
    '/usr/bin/lha', '/usr/local/bin/lha', '/opt/homebrew/bin/lha',
    '/app/data/bbs/tools/bin/lha',
].find(p => fs.existsSync(p)) ?? 'lha';
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatSize(bytes) {
    if (bytes === 0)
        return '0 B';
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1048576)
        return `${Math.round(bytes / 1024)} KB`;
    return `${Math.round(bytes / 1048576)} MB`;
}
function typeBadge(type) {
    return { TS: 'TS', typescript: 'TS', SDK: 'TS', XIM: '68', SIM: 'SI', TIM: 'TI',
        AMI: '68', amiga: '68', RX: 'RX', AREXX: 'RX', ARexx: 'RX', RXD: 'RX' }[type] ?? '??';
}
function getCatalogSvc() {
    for (const k of Object.keys(require.cache))
        if (k.includes('door-catalog.service'))
            return require.cache[k]?.exports ?? null;
    return null;
}
function getStripLib() {
    for (const k of Object.keys(require.cache))
        if (k.includes('ami-stripper.lib'))
            return require.cache[k]?.exports ?? null;
    return null;
}
async function fetchDoors(bbs) {
    if (!bbs.getDoorList)
        return [];
    return (await bbs.getDoorList()).map((d) => ({
        id: d.id || d.command, command: d.command || d.id,
        name: d.name || d.command || d.id, description: d.description || '',
        type: d.type || 'AMI', size: d.size || 0, accessLevel: d.accessLevel || 0,
        location: d.location || d.path || '', resolvedPath: d.resolvedPath,
        enabled: d.enabled !== false,
    }));
}
function discoverDoorDir(archiveName) {
    const base = archiveName.replace(/\.(lha|lzx|lzh)$/i, '');
    const doorsDir = path.join(PROJECT_ROOT, 'Doors');
    if (!fs.existsSync(doorsDir))
        return null;
    try {
        const match = fs.readdirSync(doorsDir).find(e => e.toLowerCase() === base.toLowerCase() &&
            fs.statSync(path.join(doorsDir, e)).isDirectory());
        return match ? path.join(doorsDir, match) : null;
    }
    catch {
        return null;
    }
}
// ─── Shared Layout ───────────────────────────────────────────────────────────
// A single set of panels that all views update in-place.
class DoormanLayout {
    constructor(screen, nodeId) {
        this.screen = screen;
        this.width = Math.floor(screen.width * 0.35) - 8;
        this.header = new blessed_1.Panel({ parent: screen, top: 0, left: 0, width: '100%', height: 3,
            tags: true, style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } }, focusable: false });
        this.footer = new blessed_1.Panel({ parent: screen, bottom: 0, left: 0, width: '100%', height: 3,
            tags: true, style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } }, focusable: false });
        this.filterPanel = new blessed_1.Panel({ parent: screen, top: 3, left: 0, width: '35%', height: 3,
            tags: true, style: { border: { fg: 'grey' } }, focusable: false });
        this.filterBox = new blessed_1.Textbox({ parent: this.filterPanel, top: 0, left: 1, width: '100%-2',
            height: 1, mouse: true,
            style: { fg: 'white', focus: { fg: 'yellow' } } });
        this.filterPanel.hide();
        this.listPanel = new blessed_1.Panel({ parent: screen, top: 3, left: 0, width: '35%', height: '100%-6',
            tags: true, style: { border: { fg: 'cyan' } }, focusable: false });
        this.doorList = new blessed_1.List({ parent: this.listPanel, top: 1, left: 1, width: '100%-2',
            height: '100%-2', keys: true, vi: false, mouse: true, scrollable: true,
            alwaysScroll: true, tags: true, wrapItems: false,
            scrollbar: { ch: ' ', style: { bg: 'blue' } },
            style: { selected: { bg: 'blue', fg: 'white' }, item: { fg: 'white' } } });
        this.infoPanel = new blessed_1.Panel({ parent: screen, top: 3, left: '35%', width: '65%',
            height: '100%-6', tags: true, style: { border: { fg: 'blue' } }, focusable: false });
        this.infoBox = new blessed_1.ScrollableBox({ parent: this.infoPanel, top: 1, left: 1,
            width: '100%-2', height: '100%-2', tags: true, scrollable: true, keys: true,
            style: { fg: 'white' } });
        // Disable type-ahead on doorList (re-add keypress without the type-ahead block)
        const _nav = this.doorList._onKeypress?.bind(this.doorList);
        this.doorList.removeAllListeners('keypress');
        if (_nav) {
            this.doorList.on('keypress', (ch, key) => {
                if (ch?.length === 1 && /[a-zA-Z0-9/ ]/.test(ch))
                    return;
                if (key?.name === 'escape' || ch === '\x1b')
                    return;
                return _nav(ch, key);
            });
        }
        this.setHeader(`{center}{cyan-fg}DOORMAN v2{/cyan-fg}  {white-fg}Node ${nodeId}{/white-fg}{/center}`);
    }
    setHeader(content) { this.header.setContent(content); }
    setFooter(content) { this.footer.setContent(content); }
    setListLabel(label) { this.listPanel.setLabel(label); }
    setListItems(items) { this.doorList.setItems(items); }
    setListSelect(idx) { this.doorList.select(idx); }
    get listSelected() { return this.doorList.selected ?? 0; }
    setInfo(content) { this.infoBox.setContent(content); }
    focusList() { this.doorList.focus(); }
    focusFilter() { this.filterBox.focus(); }
    showRepoLayout() {
        this.filterPanel.show();
        this.listPanel.top = 6;
        this.listPanel.height = '100%-9';
    }
    showInstalledLayout() {
        this.filterPanel.hide();
        this.listPanel.top = 3;
        this.listPanel.height = '100%-6';
    }
    render() { this.screen.render(); }
}
// ─── Views ────────────────────────────────────────────────────────────────────
// ── Installed Doors ──────────────────────────────────────────────────────────
class InstalledView extends ViewManager_1.BaseView {
    constructor(layout, bbs, doors) {
        super();
        this.doors = [];
        this.statusTimer = null;
        this.layout = layout;
        this.bbs = bbs;
        this.doors = doors;
    }
    door() { return this.doors[this.layout.listSelected] ?? null; }
    setStatus(msg, col = 'yellow', ms = 3000) {
        clearTimeout(this.statusTimer);
        this.layout.setHeader(`{center}{cyan-fg}DOORMAN v2{/cyan-fg}  {${col}-fg}${msg}{/${col}-fg}{/center}`);
        this.layout.render();
        this.statusTimer = setTimeout(() => this.refreshHeader(), ms);
    }
    refreshHeader() {
        const ec = this.doors.filter(d => d.enabled).length;
        this.layout.setHeader(`{center}{cyan-fg}DOORMAN v2{/cyan-fg}  {white-fg}${this.doors.length} doors, ${ec} enabled{/white-fg}{/center}`);
    }
    refresh(selectIdx = 0) {
        const w = this.layout.width;
        const items = this.doors.map(d => {
            const badge = `[${typeBadge(d.type)}]`;
            const sz = formatSize(d.size).padStart(6);
            const nameW = Math.max(6, w - 14);
            const name = d.name.length > nameW ? d.name.slice(0, nameW - 1) + '…' : d.name.padEnd(nameW);
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
    updateInfo() {
        const d = this.door();
        if (!d) {
            this.layout.setInfo('No door selected.');
            return;
        }
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
    updateFooter() {
        const d = this.door();
        const en = (!d || d.enabled) ? 'Dis' : 'En';
        this.layout.setFooter(`{center}{yellow-fg}U{/yellow-fg}pload {yellow-fg}I{/yellow-fg}nfo {yellow-fg}F{/yellow-fg}iles ` +
            `{yellow-fg}D{/yellow-fg}el {yellow-fg}V{/yellow-fg}iew doc {yellow-fg}E{/yellow-fg}=${en} ` +
            `{yellow-fg}S{/yellow-fg}trip {yellow-fg}Tab{/yellow-fg}=Repo {yellow-fg}Q{/yellow-fg}uit{/center}`);
    }
    enter() {
        this.layout.showInstalledLayout();
        this.refresh(this.layout.listSelected);
        this.layout.focusList();
        this.layout.render();
        this.layout.doorList.on('select item', this._onSelectItem = () => {
            this.updateInfo();
            this.updateFooter();
            this.layout.render();
        });
        this.keys.key(['tab'], () => {
            this.vm.push(new RepoView(this.layout, this.bbs));
        });
        this.keys.key(['q', 'Q'], () => {
            clearTimeout(this.statusTimer);
            this.vm.destroy();
            this.layout.screen.destroy();
        });
        this.keys.key(['u', 'U'], () => this.doUpload());
        this.keys.key(['i', 'I'], () => this.doInfoEditor());
        this.keys.key(['f', 'F'], () => this.doFileExplorer());
        this.keys.key(['d', 'D'], () => this.doDelete());
        this.keys.key(['v', 'V'], () => this.doViewDoc());
        this.keys.key(['e', 'E'], () => this.doToggleEnabled());
        this.keys.key(['s', 'S'], () => this.doStripAds());
    }
    exit() {
        this.layout.doorList.off('select item', this._onSelectItem);
        this.keys.release();
    }
    onEsc() { }
    doUpload() {
        this.setStatus('Waiting for file upload...');
        this.bbs.requestArchiveUpload?.().then((r) => {
            this.setStatus(`Installing ${r.filename}...`);
            return this.bbs.installDoor?.(r.path);
        }).then((result) => {
            if (result?.success) {
                this.setStatus(`Installed: ${result.command}`, 'green');
                fetchDoors(this.bbs).then(doors => { this.doors = doors; this.refresh(0); });
            }
            else {
                this.setStatus(`Install failed: ${result?.message}`, 'red');
            }
        }).catch((e) => this.setStatus(`Error: ${e.message}`, 'red'));
    }
    doInfoEditor() {
        const d = this.door();
        if (!d)
            return;
        this.vm.push(new InfoEditorOverlayView(this.layout, this.bbs, d.command));
    }
    doFileExplorer() {
        const d = this.door();
        if (!d)
            return;
        let doorPath = d.resolvedPath || d.location || `Doors/${d.command}`;
        const m = /^([A-Za-z][A-Za-z0-9]*):(.*)$/.exec(doorPath);
        if (m) {
            const assign = m[1].toUpperCase(), sub = m[2].replace(/^\/+/, '');
            if (assign === 'DOORS')
                doorPath = `Doors/${sub}`;
            else if (assign === 'BBS' || assign === 'WORK')
                doorPath = sub;
        }
        this.vm.push(new FileExplorerOverlayView(this.layout, doorPath));
    }
    doDelete() {
        const d = this.door();
        if (!d)
            return;
        const idx = this.layout.listSelected;
        this.vm.push(new ConfirmView(this.layout, `Delete {yellow-fg}${d.name}{/yellow-fg}?\n\n{red-fg}This cannot be undone.{/red-fg}`, 'Delete', 'Cancel', async () => {
            this.setStatus(`Deleting ${d.name}...`);
            const isTS = ['TS', 'typescript', 'SDK'].includes(d.type);
            const id = isTS ? (d.location?.replace(/^Doors[\\/]/i, '').split(/[\\/]/)[0] || d.command) : d.command;
            try {
                const r = await this.bbs.deleteDoor(id, isTS);
                if (r.success) {
                    this.setStatus(`${d.name} deleted`, 'green');
                    this.doors = await fetchDoors(this.bbs);
                    this.refresh(Math.max(0, idx - 1));
                }
                else {
                    this.setStatus(`Failed: ${r.message}`, 'red');
                }
            }
            catch (e) {
                this.setStatus(`Error: ${e.message}`, 'red');
            }
        }));
    }
    doViewDoc() {
        const d = this.door();
        if (!d)
            return;
        const svc = getCatalogSvc();
        if (!svc) {
            this.setStatus('Catalog not available', 'yellow');
            return;
        }
        try {
            const entry = svc.getCatalogEntryByCmd(d.command);
            if (entry?.doc_raw) {
                this.vm.push(new DocView(this.layout, entry.doc_filename ?? entry.archive_name, entry.doc_raw));
            }
            else {
                this.setStatus('No documentation in catalog', 'yellow');
            }
        }
        catch {
            this.setStatus('Catalog lookup failed', 'red');
        }
    }
    doToggleEnabled() {
        const d = this.door();
        if (!d)
            return;
        const idx = this.layout.listSelected;
        d.enabled = !d.enabled;
        this.bbs.setDoorEnabled?.(d.command, d.enabled).then((r) => {
            this.setStatus(r.message, r.success ? 'green' : 'red');
        }).catch(() => {
            this.setStatus(`${d.name} ${d.enabled ? 'enabled' : 'disabled'} (session only)`, 'yellow');
        });
        this.refresh(idx);
    }
    doStripAds() {
        const d = this.door();
        if (!d)
            return;
        const svc = getCatalogSvc();
        if (!svc) {
            this.setStatus('Catalog not available', 'yellow');
            return;
        }
        try {
            const entry = svc.getCatalogEntryByCmd(d.command);
            if (!entry) {
                this.setStatus(`${d.command} not in catalog`, 'yellow');
                return;
            }
            const liveDir = d.resolvedPath ? path.dirname(d.resolvedPath) :
                (d.location ? path.join(PROJECT_ROOT, d.location) : undefined);
            this.vm.push(new StripView(this.layout, entry, liveDir, (stripped) => { if (stripped)
                this.setStatus(`Stripped ${stripped} ad file(s)`, 'green', 4000); }));
        }
        catch {
            this.setStatus('Catalog lookup failed', 'red');
        }
    }
}
// ── Repo Browser ──────────────────────────────────────────────────────────────
class RepoView extends ViewManager_1.BaseView {
    constructor(layout, bbs) {
        super();
        this.entries = [];
        this.filter = '';
        this.statusTimer = null;
        this.layout = layout;
        this.bbs = bbs;
    }
    entry() { return this.entries[this.layout.listSelected] ?? null; }
    setStatus(msg, col = 'yellow', ms = 3000) {
        clearTimeout(this.statusTimer);
        this.layout.setHeader(`{center}{cyan-fg}DOORMAN v2  REPO{/cyan-fg}  {${col}-fg}${msg}{/${col}-fg}{/center}`);
        this.layout.render();
        this.statusTimer = setTimeout(() => this.refreshHeader(), ms);
    }
    refreshHeader() {
        const svc = getCatalogSvc();
        let stats = '';
        try {
            const s = svc?.catalogStats();
            if (s)
                stats = `${s.total} in repo, ${s.installed} installed`;
        }
        catch { }
        this.layout.setHeader(`{center}{cyan-fg}DOORMAN v2  REPO{/cyan-fg}  {white-fg}${stats}${this.filter ? ' (filtered)' : ''}{/white-fg}{/center}`);
    }
    loadEntries() {
        const svc = getCatalogSvc();
        if (!svc) {
            this.entries = [];
            return;
        }
        try {
            this.entries = svc.searchCatalog(this.filter);
        }
        catch {
            this.entries = [];
        }
    }
    refresh(selectIdx = 0) {
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
    updateInfo() {
        const e = this.entry();
        if (!e) {
            this.layout.setInfo('No entry selected.');
            return;
        }
        // Try to get per-file listing from door_catalog_files
        const svc = getCatalogSvc();
        let fileLines = '';
        try {
            const files = svc?.getArchiveFiles?.(e.id) ?? [];
            if (files.length > 0) {
                const junk = files.filter((f) => f.is_junk).length;
                const junkTag = junk > 0 ? `  {red-fg}${junk} ad files{/red-fg}` : '  {green-fg}clean{/green-fg}';
                fileLines = `\n\n{grey-fg}─── ${files.length} files${junkTag}{/grey-fg}  {grey-fg}──────────────────────{/grey-fg}\n`;
                for (const f of files.slice(0, 25)) {
                    const sz = f.size < 1024 ? `${f.size}b` : `${Math.round(f.size / 1024)}k`;
                    const junkMark = f.is_junk ? '{red-fg}!{/red-fg}' : ' ';
                    const name = f.path.length > 34
                        ? '<' + f.path.slice(f.path.length - 33)
                        : f.path;
                    fileLines += `${junkMark} ${name.padEnd(34)} ${sz.padStart(5)}\n`;
                }
                if (files.length > 25)
                    fileLines += `{grey-fg}  ... and ${files.length - 25} more{/grey-fg}\n`;
            }
        }
        catch { /* ignore */ }
        let content = `{yellow-fg}${e.archive_name}{/yellow-fg}  ${e.door_type ?? 'XIM'}` +
            (e.archive_size ? `  ${Math.round(e.archive_size / 1024)}k` : '') +
            (e.installed ? `  {green-fg}[${e.installed_as}]{/green-fg}` : '');
        if (e.file_id_diz) {
            content += '\n\n' + e.file_id_diz.split('\n')
                .map(l => l.replace(/[^\x20-\x7e]/g, '').replace(/[{}]/g, c => `\\${c}`)).join('\n');
        }
        else if (e.description) {
            content += `\n\n{white-fg}${e.description.replace(/[{}]/g, c => `\\${c}`)}{/white-fg}`;
        }
        content += fileLines;
        this.layout.setInfo(content);
    }
    getEntryJunkCount(e) {
        // Prefer live file-level count over catalog's potentially stale junk_count
        try {
            const svc = getCatalogSvc();
            const files = svc?.getArchiveFiles?.(e.id) ?? [];
            if (files.length > 0)
                return files.filter((f) => f.is_junk).length;
        }
        catch { }
        return e.junk_count;
    }
    updateFooter() {
        const e = this.entry();
        const inst = e?.installed ? 'Uninst' : 'Inst';
        const hasDoc = !!e?.doc_raw;
        const hasJunk = e ? this.getEntryJunkCount(e) > 0 : false;
        const parts = [
            `{yellow-fg}R{/yellow-fg}=${inst}`,
            hasJunk ? `{yellow-fg}S{/yellow-fg}trip` : null,
            hasDoc ? `{yellow-fg}V{/yellow-fg}iew doc` : null,
            `{yellow-fg}A{/yellow-fg}rchive`,
            `{yellow-fg}F{/yellow-fg}=Filter`,
            `{yellow-fg}ESC{/yellow-fg}=Back`,
            `{yellow-fg}Q{/yellow-fg}uit`,
        ].filter(Boolean).join('  ');
        this.layout.setFooter(`{center}${parts}{/center}`);
    }
    enter() {
        this.layout.showRepoLayout();
        this.refresh(0);
        this.layout.focusList();
        this.layout.render();
        this.layout.doorList.on('select item', this._onSelectItem = () => {
            this.updateInfo();
            this.updateFooter();
            this.layout.render();
        });
        this.layout.doorList.on('focus', this._onListFocus = () => {
            this.layout.filterBox.setValue(this.filter);
        });
        // Manual filter input — screen.on('keypress') gives us full control
        // regardless of which widget has focus, so Tab always works.
        let filterActive = false;
        const filterKeypress = (ch, key) => {
            if (!filterActive)
                return;
            const kn = key?.name ?? '';
            if (kn === 'tab' || kn === 'down' || kn === 'enter' || kn === 'return') {
                filterActive = false;
                this.layout.focusList();
                this.layout.render();
                return;
            }
            if (kn === 'escape') {
                filterActive = false;
                this.filter = '';
                this.layout.filterBox.setValue('');
                this.refresh(0);
                this.layout.focusList();
                this.layout.render();
                return;
            }
            if (kn === 'backspace' || kn === 'delete') {
                this.filter = this.filter.slice(0, -1);
            }
            else if (ch && ch.length === 1 && ch.charCodeAt(0) >= 32) {
                this.filter += ch;
            }
            else {
                return;
            }
            this.layout.filterBox.setValue(this.filter);
            this.refresh(0);
            this.layout.render();
        };
        this.layout.screen.on('keypress', filterKeypress);
        this._onFilterKey = filterKeypress;
        // F/Tab from the LIST → enter filter mode
        this.keys.key(['f', 'F', '/', 'tab'], () => {
            if (filterActive)
                return; // already in filter
            filterActive = true;
            this.layout.focusFilter();
            this.layout.render();
        });
        this.keys.key(['r', 'R'], () => this.doInstallUninstall());
        this.keys.key(['s', 'S'], () => this.doStrip());
        this.keys.key(['v', 'V'], () => this.doViewDoc());
        this.keys.key(['a', 'A'], () => this.doBrowseArchive());
        this.keys.key(['q', 'Q'], () => {
            clearTimeout(this.statusTimer);
            this.vm.destroy();
            this.layout.screen.destroy();
        });
    }
    exit() {
        this.layout.doorList.off('select item', this._onSelectItem);
        this.layout.doorList.off('focus', this._onListFocus);
        this.layout.screen.off('keypress', this._onFilterKey);
        clearTimeout(this.statusTimer);
        this.keys.release();
    }
    onEsc() { this.vm.pop(); } // returns to installed list
    doInstallUninstall() {
        const e = this.entry();
        if (!e)
            return;
        if (e.installed) {
            this.vm.push(new ConfirmView(this.layout, `Uninstall {yellow-fg}${e.installed_as}{/yellow-fg}?\n\nRemoves .info + Doors/${e.installed_as}/`, 'Uninstall', 'Cancel', () => {
                const svc = getCatalogSvc();
                const bbsCmdDir = path.join(PROJECT_ROOT, 'Commands', 'BBSCmd');
                const infoPath = path.join(bbsCmdDir, `${e.installed_as}.info`);
                if (fs.existsSync(infoPath))
                    fs.unlinkSync(infoPath);
                if (e.install_dir) {
                    const abs = path.join(PROJECT_ROOT, e.install_dir);
                    if (fs.existsSync(abs))
                        fs.rmSync(abs, { recursive: true, force: true });
                }
                svc?.markUninstalled(e.id);
                this.setStatus(`Uninstalled ${e.installed_as}`, 'green', 4000);
                this.refresh(this.layout.listSelected);
            }));
        }
        else {
            if (!e.archive_path || !fs.existsSync(e.archive_path)) {
                this.setStatus(`Archive not on server`, 'yellow');
                return;
            }
            const suggested = (e.installed_as ?? e.binary_name ?? e.name ?? 'DOOR')
                .toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 12);
            this.vm.push(new InputView(this.layout, `{yellow-fg}Install as BBS command:{/yellow-fg}`, suggested, (cmd) => {
                if (!cmd)
                    return;
                const finalCmd = cmd.trim().toUpperCase() || suggested;
                const installDir = path.join(PROJECT_ROOT, 'Doors', finalCmd);
                fs.mkdirSync(installDir, { recursive: true });
                const res = (0, child_process_1.spawnSync)(LHA_BIN, [`xw=${installDir}`, e.archive_path], { timeout: 30000 });
                if (res.status !== 0 && res.status !== 1) {
                    this.setStatus(`Extract failed`, 'red');
                    return;
                }
                const bbsCmdDir = path.join(PROJECT_ROOT, 'Commands', 'BBSCmd');
                const infoPath = path.join(bbsCmdDir, `${finalCmd}.info`);
                fs.writeFileSync(infoPath, `TYPE=XIM\nLOCATION=Doors:${finalCmd}/${e.binary_name ?? finalCmd}\nSTACK=65536\nACCESS=0\n`, 'latin1');
                getCatalogSvc()?.markInstalled(e.id, finalCmd, `Doors/${finalCmd}`);
                this.setStatus(`Installed as ${finalCmd}`, 'green', 4000);
                this.refresh(this.layout.listSelected);
            }));
        }
    }
    doStrip() {
        const e = this.entry();
        if (!e)
            return;
        const hasArchive = !!(e.archive_path && fs.existsSync(e.archive_path));
        const candidates = [
            e.install_dir ? path.join(PROJECT_ROOT, e.install_dir) : null,
            e.installed_as ? path.join(PROJECT_ROOT, 'Doors', e.installed_as) : null,
            discoverDoorDir(e.archive_name),
        ].filter((d) => !!(d && fs.existsSync(d)));
        const installDir = candidates[0] ?? null;
        if (!hasArchive && !installDir) {
            this.setStatus(e.installed ? 'Install dir not found on server' : 'Install first to strip', 'yellow');
            return;
        }
        this.vm.push(new StripView(this.layout, e, installDir ?? undefined, (stripped) => { if (stripped) {
            this.setStatus(`Stripped ${stripped} ad file(s)`, 'green', 4000);
            this.refresh(this.layout.listSelected);
        } }));
    }
    doViewDoc() {
        const e = this.entry();
        if (!e?.doc_raw) {
            this.setStatus('No documentation available', 'yellow');
            return;
        }
        this.vm.push(new DocView(this.layout, e.doc_filename ?? e.archive_name, e.doc_raw));
    }
    doBrowseArchive() {
        const e = this.entry();
        if (!e)
            return;
        const svc = getCatalogSvc();
        if (!svc?.getArchiveFiles) {
            this.setStatus('File catalog not available', 'yellow');
            return;
        }
        let files;
        try {
            files = svc.getArchiveFiles(e.id);
        }
        catch {
            this.setStatus('Could not load file list', 'red');
            return;
        }
        if (!files.length) {
            this.setStatus('No file data in catalog', 'yellow');
            return;
        }
        this.vm.push(new ArchiveBrowseView(this.layout, e.archive_name, files));
    }
}
// ── Archive Browser (from catalog, no lha needed) ────────────────────────────
class ArchiveBrowseView extends ViewManager_1.BaseView {
    constructor(layout, archiveName, files) {
        super();
        this.layout = layout;
        this.archiveName = archiveName;
        this.files = files;
    }
    enter() {
        // Hide filter panel (was shown in repo mode), use installed-style layout
        this.layout.showInstalledLayout();
        // Filter out hidden files (starting with . or __) and system files
        const visible = this.files.filter((f) => {
            const base = f.path.split('/').pop() ?? f.path;
            return !base.startsWith('.') && !base.startsWith('__');
        });
        const junk = visible.filter((f) => f.is_junk).length;
        const items = visible.map((f) => {
            const sz = f.size < 1024 ? `${f.size}b` : `${Math.round(f.size / 1024)}k`;
            const mark = f.is_junk ? '!' : ' ';
            const w = this.layout.width - 7;
            const name = f.path.length > w
                ? '<' + f.path.slice(f.path.length - w + 1)
                : f.path;
            return `${mark} ${name.padEnd(w)} ${sz.padStart(5)}`;
        });
        this.layout.setListLabel(` ${this.archiveName} (${visible.length} files) `);
        this.layout.setListItems(items);
        this.layout.setListSelect(0);
        this.layout.setInfo(`{yellow-fg}${this.archiveName}{/yellow-fg}\n\n` +
            `{white-fg}${visible.length} files{/white-fg}` +
            (junk > 0 ? `  {red-fg}${junk} ad files{/red-fg}` : '  {green-fg}clean{/green-fg}') +
            '\n\n{grey-fg}! = flagged as ad file{/grey-fg}');
        this.layout.setFooter('{center}{yellow-fg}↑/↓{/yellow-fg} Navigate  {yellow-fg}ESC/Q{/yellow-fg} Back{/center}');
        this.layout.focusList();
        this.layout.render();
        this.keys.key(['q', 'Q'], () => this.vm.pop());
    }
    exit() {
        this.layout.showRepoLayout(); // restore repo layout on exit
        this.keys.release();
    }
}
// ── Document Viewer ───────────────────────────────────────────────────────────
class DocView extends ViewManager_1.BaseView {
    constructor(layout, title, content) {
        super();
        this.layout = layout;
        this.title = title;
        this.content = content;
    }
    enter() {
        const isGuide = /^@(?:database|node)\b/im.test(this.content);
        if (isGuide) {
            (0, AmigaGuideViewer_1.showAmigaGuideViewer)(this.layout.screen, this.content, this.title, () => this.vm.pop());
            return;
        }
        // Plain text viewer
        const { Panel, ScrollableBox } = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');
        const text = this.content.replace(/[^\x09\x0a\x20-\x7e]/g, '').replace(/[{}]/g, c => `\\${c}`);
        this.panel = new Panel({ parent: this.layout.screen, top: 0, left: 0, width: '100%',
            height: '100%-3', label: ` ${this.title} `, tags: true, style: { border: { fg: 'cyan' } } });
        const box = new ScrollableBox({ parent: this.panel, top: 1, left: 1, width: '100%-2',
            height: '100%-2', tags: false, scrollable: true, alwaysScroll: true, content: text });
        this.hint = new Panel({ parent: this.layout.screen, bottom: 0, left: 0, width: '100%', height: 3,
            tags: true, content: '{center}[Q/ESC] Close  [↑/↓/PgUp/PgDn] Scroll{/center}',
            style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } } });
        this.layout.screen.render();
        this.keys.key(['up', 'down', 'pageup', 'pagedown'], (_, key) => {
            const n = key?.name ?? '';
            if (n === 'up')
                box.scroll(-1);
            else if (n === 'down')
                box.scroll(1);
            else if (n === 'pageup')
                box.scroll(-20);
            else if (n === 'pagedown')
                box.scroll(20);
            this.layout.render();
        });
        this.keys.key(['q', 'Q'], () => this.vm.pop());
    }
    exit() {
        this.keys.release();
        if (this.panel) {
            this.panel.destroy();
            this.panel = null;
        }
        if (this.hint) {
            this.hint.destroy();
            this.hint = null;
        }
        this.layout.render();
    }
}
// ── Strip Selector ────────────────────────────────────────────────────────────
class StripView extends ViewManager_1.BaseView {
    constructor(layout, entry, overrideDir, onDone) {
        super();
        this.checked = [];
        this.files = [];
        this.reasons = {};
        this.origLabel = '';
        this.layout = layout;
        this.entry = entry;
        this.overrideDir = overrideDir;
        this.onDone = onDone;
    }
    enter() {
        const lib = getStripLib();
        if (!lib) {
            this.layout.setFooter('{center}{red-fg}Stripper library not available{/red-fg}{/center}');
            this.vm.pop();
            return;
        }
        const hasArchive = !!(this.entry.archive_path && fs.existsSync(this.entry.archive_path));
        const installDir = this.overrideDir;
        this.layout.setFooter('{center}{cyan-fg}Analyzing...{/cyan-fg}{/center}');
        this.layout.render();
        (hasArchive ? lib.analyzeArchive(this.entry.archive_path) : lib.analyzeDirectory(installDir))
            .then((result) => {
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
            try {
                this.origLabel = this.layout.listPanel.options?.label ?? '';
            }
            catch { }
            this.renderFiles();
            this.keys.key([' '], () => {
                const idx = this.layout.listSelected;
                if (idx < this.checked.length) {
                    this.checked[idx] = !this.checked[idx];
                    this.renderFiles();
                }
            });
            this.keys.key(['a', 'A'], () => { this.checked.fill(true); this.renderFiles(); });
            this.keys.key(['n', 'N'], () => { this.checked.fill(false); this.renderFiles(); });
            this.keys.key(['s', 'S'], () => this.doStrip(lib, hasArchive, installDir));
            this.keys.key(['q', 'Q'], () => { this.vm.pop(); this.onDone(null); });
        })
            .catch((e) => { this.layout.setInfo(`{red-fg}Analysis failed: ${e.message}{/red-fg}`); this.layout.render(); setTimeout(() => this.vm.pop(), 1500); });
    }
    renderFiles() {
        const items = this.files.map((f, i) => {
            const box = this.checked[i] ? '[X]' : '[ ]';
            const fpath = f.path;
            const name = fpath.length > 24 ? '<' + fpath.slice(fpath.length - 23) : fpath.padEnd(24);
            return `${box} ${name}`;
        });
        const selCount = this.checked.filter(Boolean).length;
        this.layout.listPanel.setLabel(` ${this.entry.archive_name} — Strip Ads `);
        this.layout.setListItems(items);
        const sel = this.files[this.layout.listSelected];
        this.layout.setInfo(`{yellow-fg}${selCount}/${this.files.length} selected{/yellow-fg}\n\n` +
            (sel ? `{cyan-fg}${sel.path}{/cyan-fg}\nReason: ${this.reasons[sel.path] ?? '?'}\n` : '') +
            '\n{grey-fg}[Space] Toggle  [A] All  [N] None  [S] Strip  [ESC/Q] Cancel{/grey-fg}');
        this.layout.setFooter('{center}{yellow-fg}Space{/yellow-fg}=Toggle  {yellow-fg}A{/yellow-fg}=All  {yellow-fg}N{/yellow-fg}=None  {yellow-fg}S{/yellow-fg}=Strip  {yellow-fg}ESC/Q{/yellow-fg}=Cancel{/center}');
        this.layout.render();
    }
    doStrip(lib, hasArchive, installDir) {
        const toStrip = this.files.filter((_, i) => this.checked[i]);
        if (toStrip.length === 0) {
            this.vm.pop();
            this.onDone(null);
            return;
        }
        const preservePaths = new Set(this.files.filter((_, i) => !this.checked[i]).map((f) => f.path));
        this.layout.setFooter('{center}{cyan-fg}Stripping...{/cyan-fg}{/center}');
        this.layout.render();
        (async () => {
            try {
                if (hasArchive) {
                    const tmpOut = this.entry.archive_path + '.strip_tmp';
                    await lib.stripArchive(this.entry.archive_path, tmpOut, preservePaths);
                    if (fs.existsSync(tmpOut) && !fs.statSync(tmpOut).isDirectory()) {
                        fs.renameSync(tmpOut, this.entry.archive_path);
                    }
                    else if (fs.existsSync(tmpOut)) {
                        fs.rmSync(tmpOut, { recursive: true, force: true });
                    }
                    if (installDir) {
                        fs.mkdirSync(installDir, { recursive: true });
                        (0, child_process_1.spawnSync)(LHA_BIN, [`xw=${installDir}`, this.entry.archive_path], { timeout: 30000 });
                    }
                }
                else if (installDir) {
                    lib.stripFilesFromDirectory(installDir, toStrip.map((f) => f.path));
                }
                const svc = getCatalogSvc();
                if (svc) {
                    try {
                        svc.updateJunkCount(this.entry.id, this.files.length - toStrip.length);
                    }
                    catch { }
                    try {
                        svc.removeArchiveFiles(this.entry.id, toStrip.map((f) => f.path));
                    }
                    catch { }
                }
                this.vm.pop();
                this.onDone(toStrip.length);
            }
            catch (e) {
                this.layout.setInfo(`{red-fg}Strip failed: ${e.message}{/red-fg}`);
                this.layout.render();
                setTimeout(() => { this.vm.pop(); this.onDone(null); }, 2000);
            }
        })();
    }
    exit() {
        if (this.origLabel)
            try {
                this.layout.listPanel.setLabel(this.origLabel);
            }
            catch { }
        this.keys.release();
    }
    onEsc() { this.vm.pop(); this.onDone(null); }
}
// ── Confirm Dialog ────────────────────────────────────────────────────────────
class ConfirmView extends ViewManager_1.BaseView {
    constructor(layout, content, confirmText, cancelText, onConfirm) {
        super();
        this.layout = layout;
        this.content = content;
        this.confirmText = confirmText;
        this.cancelText = cancelText;
        this.onConfirm = onConfirm;
    }
    enter() {
        new blessed_1.ConfirmModal({
            parent: this.layout.screen, title: ` ${this.confirmText} `,
            content: this.content, confirmText: this.confirmText, cancelText: this.cancelText,
            confirmColor: 'red', cancelColor: 'green', style: { border: { fg: 'yellow' } },
            onConfirm: () => { this.onConfirm(); this.vm.pop(); },
            onCancel: () => this.vm.pop(),
        }).display();
    }
    exit() { this.keys.release(); }
}
// ── Text Input ────────────────────────────────────────────────────────────────
class InputView extends ViewManager_1.BaseView {
    constructor(layout, prompt, defaultValue, onSubmit) {
        super();
        this.layout = layout;
        this.prompt = prompt;
        this.defaultValue = defaultValue;
        this.onSubmit = onSubmit;
    }
    enter() {
        const p = new blessed_1.Prompt({ parent: this.layout.screen, top: 'center', left: 'center',
            width: 50, height: 7, tags: true, style: { border: { fg: 'yellow' } }, overlay: true });
        p.showInput(this.prompt, this.defaultValue, (_err, val) => {
            p.destroy();
            this.vm.pop();
            this.onSubmit(val ?? null);
        });
        this.layout.render();
    }
    exit() { this.keys.release(); }
    onEsc() { this.vm.pop(); this.onSubmit(null); }
}
// ── Info Editor Overlay ───────────────────────────────────────────────────────
class InfoEditorOverlayView extends ViewManager_1.BaseView {
    constructor(layout, bbs, command) {
        super();
        this.overlayInstance = null;
        this.layout = layout;
        this.bbs = bbs;
        this.command = command;
    }
    enter() {
        this.overlayInstance = new InfoEditorOverlay_1.InfoEditorOverlay({ screen: this.layout.screen, command: this.command, bbs: this.bbs,
            onClose: () => this.vm.pop() });
        this.layout.render();
    }
    exit() { this.keys.release(); }
    onEsc() { this.overlayInstance?.requestClose(); }
}
// ── File Explorer Overlay ─────────────────────────────────────────────────────
class FileExplorerOverlayView extends ViewManager_1.BaseView {
    constructor(layout, doorPath) { super(); this.layout = layout; this.doorPath = doorPath; }
    enter() {
        new FileExplorerOverlay_1.FileExplorerOverlay({ screen: this.layout.screen, doorPath: this.doorPath,
            onClose: () => this.vm.pop() });
    }
    exit() { this.keys.release(); }
    // Let FileExplorerOverlay handle all ESC internally via screen.on('keypress').
    // The ViewManager's ESC would fire first and destroy the overlay prematurely.
    onEsc() { }
}
// ─── Entry Point ──────────────────────────────────────────────────────────────
async function createApp(session) {
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
    const screen = new blessed_1.Screen({ smartCSR: true, fullUnicode: true, title: 'DOORMAN v2',
        output: (data) => bbs.write(data) });
    const inputManager = new blessed_helpers_1.DoorInputManager(session, screen, { enableGameMode: false, enableGrabKeys: false, enableMouse: true });
    inputManager.enable();
    const nodeId = session.bbsSession?.nodeId ?? '?';
    const layout = new DoormanLayout(screen, nodeId);
    const vm = new ViewManager_1.ViewManager(screen);
    // Hide cursor after every render — blessed re-shows it on each refresh.
    // This is the only reliable way since blessed ignores external cursor state.
    screen.on('render', () => { bbs.write('\x1b[?25l'); });
    screen.on('resize', () => { screen.render(); });
    screen.on('destroy', () => { inputManager.disable(); bbs.write('\x1b[?25h'); });
    vm.push(new InstalledView(layout, bbs, doors));
    await new Promise(resolve => { screen.on('destroy', resolve); });
}
//# sourceMappingURL=app.js.map