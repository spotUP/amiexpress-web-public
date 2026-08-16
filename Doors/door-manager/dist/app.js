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
exports.resolveArchivePath = resolveArchivePath;
exports.buildDoorInfoContent = buildDoorInfoContent;
exports.extractArchiveTo = extractArchiveTo;
exports.findExtractedBinary = findExtractedBinary;
exports.createApp = createApp;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const FileExplorerOverlay_1 = require("./FileExplorerOverlay");
const InfoEditorOverlay_1 = require("./InfoEditorOverlay");
const AmigaGuideViewer_1 = require("./AmigaGuideViewer");
const ViewManager_1 = require("./ViewManager");
const systemFilter_1 = require("./systemFilter");
// ─── Constants ────────────────────────────────────────────────────────────────
// Install/re-extract now goes through the portable extractor factory
// (extractArchiveTo, below) instead of the native `lha` CLI — see
// getExtractorFactory(). That extractor handles both LHA and LZX and works
// identically on macOS dev machines and the Linux container on the live
// server, so no LHA_BIN path probing is needed here anymore.
const PROJECT_ROOT = (0, ViewManager_1.resolveBbsRoot)(__dirname);
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
    return { TS: 'TS', typescript: 'TS', SDK: 'TS', XIM: '68', SIM: 'SI', TIM: 'TI', FIM: 'FI',
        AMI: '68', amiga: '68', RX: 'RX', AREXX: 'RX', ARexx: 'RX', RXD: 'RX' }[type] ?? '??';
}
function getCatalogSvc() {
    for (const k of Object.keys(require.cache))
        if (k.includes('door-catalog.service'))
            return require.cache[k]?.exports ?? null;
    return null;
}
function getExtractorFactory() {
    // Same require.cache discovery as getCatalogSvc — the backend's shared
    // archive-extractor (WASM unlzx included) when loaded in this process.
    for (const k of Object.keys(require.cache))
        if (k.includes('archive-extractor'))
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
function resolveArchivePath(archivePath) {
    if (!archivePath)
        return null;
    const svc = getCatalogSvc();
    try {
        return svc?.resolveArchivePath ? svc.resolveArchivePath(archivePath) : archivePath;
    }
    catch {
        return archivePath;
    }
}
/** Content of the .info-style command config written on install. Pure and
 * exported for testing: door_type must flow through as TYPE= (a FIM door
 * force-typed XIM at install time simply won't run under the FIM engine). */
function buildDoorInfoContent(doorType, cmd, binaryRel) {
    return `TYPE=${doorType}\nLOCATION=Doors:${cmd}/${binaryRel}\nSTACK=65536\nACCESS=0\n`;
}
/**
 * Extract every file in an archive into destDir, preserving the archive's
 * internal directory structure. Portable — uses the backend's shared
 * extractor factory (pure-JS LHA, WASM LZX, etc.) instead of the native
 * `lha` CLI, so it works the same on macOS dev machines and the Linux
 * container on the live server.
 */
async function extractArchiveTo(archivePath, destDir) {
    const factory = getExtractorFactory();
    if (!factory?.getExtractorForFile) {
        return { ok: false, fileCount: 0, error: 'Extractor unavailable in this process' };
    }
    let extractor;
    try {
        extractor = await factory.getExtractorForFile(archivePath);
    }
    catch (err) {
        return { ok: false, fileCount: 0, error: `Extractor init failed: ${err.message}` };
    }
    if (!extractor)
        return { ok: false, fileCount: 0, error: 'Unsupported archive format' };
    let entries;
    try {
        entries = await extractor.getEntries(archivePath);
    }
    catch (err) {
        return { ok: false, fileCount: 0, error: `Could not read archive: ${err.message}` };
    }
    if (!entries.length)
        return { ok: false, fileCount: 0, error: 'Archive is empty or unreadable' };
    const destRoot = path.normalize(destDir + path.sep);
    let written = 0;
    for (const entry of entries) {
        if (!entry.name)
            continue;
        // The pure-JS LHA reader emits Amiga-style directory-separated names
        // with '\' (its "directory" extended header joins path segments with
        // 0xFF, which the parser renders as a literal backslash) — normalize
        // to '/' so path.join/dirname treat it as real subdirectories on every
        // OS instead of writing one file with a literal backslash in its name.
        const entryPath = entry.name.replace(/\\/g, '/');
        if (entryPath.endsWith('/'))
            continue; // directory marker, nothing to write
        let data = null;
        try {
            data = await extractor.extractFile(archivePath, entry.name);
        }
        catch { /* skip unreadable member, keep going */ }
        if (!data)
            continue;
        const outPath = path.normalize(path.join(destDir, entryPath));
        if (!outPath.startsWith(destRoot))
            continue; // zip-slip guard
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
function findExtractedBinary(destDir, binaryName) {
    if (!binaryName)
        return null;
    const target = binaryName.toLowerCase();
    const stack = [destDir];
    while (stack.length) {
        const dir = stack.pop();
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                stack.push(full);
                continue;
            }
            if (e.name.toLowerCase() === target) {
                return path.relative(destDir, full).split(path.sep).join('/');
            }
        }
    }
    return null;
}
// ─── Shared Layout ───────────────────────────────────────────────────────────
// A single set of panels that all views update in-place.
class DoormanLayout {
    constructor(screen, nodeId) {
        this.suppressNextFilterKeypress = false;
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
        // Guard filterBox's own key handling against the activating keystroke's
        // echo — same class of leak as doorList's type-ahead disable below.
        // Screen._handleKey's phase-2 emit re-delivers a keystroke to whichever
        // element JUST became focused during phase 1 of the SAME dispatch, so
        // when focusFilter() synchronously focuses this box mid-keystroke, that
        // same keystroke would otherwise also land in Textbox's own
        // _onKeypress/insertChar. focusFilter() arms suppressNextFilterKeypress
        // immediately before calling focus(), so exactly that one re-delivered
        // event is swallowed here; normal typing afterward is untouched.
        const _filterNav = this.filterBox._onKeypress?.bind(this.filterBox);
        this.filterBox.removeAllListeners('keypress');
        if (_filterNav) {
            this.filterBox.on('keypress', (ch, key) => {
                if (this.suppressNextFilterKeypress) {
                    this.suppressNextFilterKeypress = false;
                    return;
                }
                return _filterNav(ch, key);
            });
        }
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
    /** Focuses filterBox and arms the one-shot guard above so the keystroke
     * that triggered this call doesn't get re-delivered into the widget. */
    focusFilter() {
        this.suppressNextFilterKeypress = true;
        this.filterBox.focus();
    }
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
        // FILE_ID.DIZ from the catalog when this door was installed from the
        // repo (matched by installed_as == command); falls back to description.
        // Both are raw archive text — sanitize or blessed parses the art as tags.
        let body = '';
        try {
            const cat = getCatalogSvc()?.getCatalogEntryByCmd?.(d.command);
            if (cat?.file_id_diz)
                body = '\n' + (0, ViewManager_1.sanitizeForTags)(cat.file_id_diz);
        }
        catch { /* catalog optional */ }
        if (!body && d.description)
            body = `\n{white-fg}${(0, ViewManager_1.sanitizeForTags)(d.description)}{/white-fg}`;
        this.layout.setInfo([
            `{yellow-fg}Name:{/yellow-fg}    ${d.name}`,
            `{yellow-fg}Command:{/yellow-fg} ${d.command}`,
            `{yellow-fg}Type:{/yellow-fg}    ${d.type}`,
            `{yellow-fg}Size:{/yellow-fg}    ${formatSize(d.size)}`,
            `{yellow-fg}Status:{/yellow-fg}  ${st}`,
            body,
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
                    // Belt and braces: deleteDoor refreshes backend caches itself,
                    // but a stale registry here left deleted doors visible with no
                    // feedback (2026-08-15). Refresh again from our side, re-fetch,
                    // and confirm persistently in the info panel.
                    await (0, ViewManager_1.refreshDoorRegistry)();
                    this.doors = await fetchDoors(this.bbs);
                    this.refresh(Math.max(0, idx - 1));
                    this.setStatus(`${d.name} deleted`, 'green', 8000);
                    this.layout.setInfo(`{green-fg}Deleted{/green-fg}\n\n${(0, ViewManager_1.sanitizeForTags)(d.name)} removed.`);
                    this.layout.render();
                }
                else {
                    this.setStatus(`Failed: ${r.message}`, 'red', 8000);
                    this.layout.setInfo(`{red-fg}Delete failed{/red-fg}\n\n${(0, ViewManager_1.sanitizeForTags)(String(r.message ?? 'unknown error'))}`);
                    console.log(`[DOORMAN] delete failed: ${d.name}: ${r.message}`);
                    this.layout.render();
                }
            }
            catch (e) {
                this.setStatus(`Error: ${e.message}`, 'red', 8000);
                console.log(`[DOORMAN] delete error: ${d.name}: ${e?.message ?? e}`);
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
            const resolvedArchive = resolveArchivePath(entry.archive_path);
            const archivePathForStrip = resolvedArchive && fs.existsSync(resolvedArchive) ? resolvedArchive : null;
            this.vm.push(new StripView(this.layout, entry, archivePathForStrip, liveDir, (stripped) => { if (stripped)
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
        this.visibleEntries = [];
        this.systemFilter = systemFilter_1.ALL_TYPES;
        this.filter = '';
        this.statusTimer = null;
        this.installing = false; // guards against double-fire on the async install handler
        this.repoUnavailable = false;
        this.layout = layout;
        this.bbs = bbs;
    }
    static typeOf(e) { return e.door_type || 'XIM'; }
    entry() { return this.visibleEntries[this.layout.listSelected] ?? null; }
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
        const sysTag = this.systemFilter !== systemFilter_1.ALL_TYPES
            ? `  {cyan-fg}System: ${this.systemFilter} (${this.visibleEntries.length}){/cyan-fg}` : '';
        this.layout.setHeader(`{center}{cyan-fg}DOORMAN v2  REPO{/cyan-fg}  {white-fg}${stats}${this.filter ? ' (filtered)' : ''}{/white-fg}${sysTag}{/center}`);
    }
    cycleFilter() {
        const availableTypes = (0, systemFilter_1.distinctTypes)(this.entries, RepoView.typeOf);
        this.systemFilter = (0, systemFilter_1.cycleSystemFilter)(this.systemFilter, availableTypes);
        this.refresh(0);
    }
    loadEntries() {
        const svc = getCatalogSvc();
        if (!svc) {
            this.entries = [];
            this.repoUnavailable = true;
            return;
        }
        try {
            this.entries = svc.searchCatalog(this.filter);
            this.repoUnavailable = false;
        }
        catch {
            // e.g. live volume DB has no door_catalog table — repo browsing/install
            // is a dev-checkout feature (catalog + archive files live there).
            this.entries = [];
            this.repoUnavailable = true;
        }
    }
    refresh(selectIdx = 0) {
        this.loadEntries();
        this.visibleEntries = (0, systemFilter_1.filterByDoorType)(this.entries, this.systemFilter, RepoView.typeOf);
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
    updateInfo() {
        const e = this.entry();
        if (!e) {
            this.layout.setInfo(this.repoUnavailable
                ? '{yellow-fg}Repo catalog unavailable on this system.{/yellow-fg}\n\n' +
                    'Repo browsing/install runs from a dev checkout, where the door\n' +
                    'catalog database and the archive files live. Installed doors on\n' +
                    'this system are unaffected.'
                : 'No entry selected.');
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
            content += '\n\n' + (0, ViewManager_1.sanitizeForTags)(e.file_id_diz);
        }
        else if (e.description) {
            content += `\n\n{white-fg}${(0, ViewManager_1.sanitizeForTags)(e.description)}{/white-fg}`;
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
            `{yellow-fg}C{/yellow-fg}=System`,
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
        // One-shot: consumed by filterKeypress below the very first time it
        // fires after activation, so the SAME keystroke that turned filter mode
        // on doesn't also get appended as its first character. Twin of
        // DoormanLayout's suppressNextFilterKeypress (armed by focusFilter()),
        // which closes the other half of the same leak on filterBox's own
        // internal typing. See the activation handler below for why both are
        // needed and why they're synchronous, not deferred.
        let suppressNextFilterChar = false;
        const filterKeypress = (ch, key) => {
            if (suppressNextFilterChar) {
                suppressNextFilterChar = false;
                return;
            }
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
        // While the filter box is active, suppress ALL view hotkeys — typing
        // "a" must filter, not open [A]rchive browse (filterKeypress above is a
        // raw keypress listener and is unaffected by this guard).
        this.keys.setGuard(() => !filterActive);
        // F/Tab from the LIST → enter filter mode.
        //
        // BUG FIX (leak, round 2 — supersedes the process.nextTick version):
        // blessed's Screen._handleKey dispatches ONE physical keystroke in
        // three synchronous phases against the SAME event — (1) screen.key()-
        // registered handlers (this KeyBinder), (2) an emit to whichever
        // element is `_focused` *at that moment*, (3) a final broadcast
        // emit('keypress', ...) to plain screen.on('keypress', ...) listeners
        // (filterKeypress above). The FIRST fix deferred the mode flip + focus()
        // with process.nextTick to dodge this — but Program._handleData
        // (sdk core/program.ts) parses and dispatches EVERY key in one input
        // payload inside a single synchronous while loop, calling _handleKey
        // per key with no tick boundary in between. A deferred nextTick doesn't
        // run until the WHOLE payload is drained, so on coalesced/pasted input
        // (multiple keys arriving in one payload) it does not close the race
        // for the keys immediately following the activator, and per Screen's
        // own emit() semantics KeyBinder's wrapped handler never returns true,
        // so phase (3)'s broadcast still runs for every key regardless.
        //
        // Fixed synchronously instead, same-tick, no deferral at all — the only
        // approach that's correct no matter how keys are chunked into payloads.
        // Two one-shot flags, each swallowing exactly the activating keystroke
        // on its own delivery path, both armed here and both self-clearing
        // before this call returns to Screen._handleKey:
        //   1. focusFilter() (DoormanLayout) arms suppressNextFilterKeypress
        //      immediately before calling filterBox.focus() — the wrapped
        //      listener installed on filterBox in DoormanLayout's constructor
        //      swallows the one keystroke phase (2) re-delivers to the
        //      newly-focused widget, so Textbox's own _onKeypress/insertChar
        //      never sees it.
        //   2. suppressNextFilterChar (this closure) is consumed by
        //      filterKeypress at the top of phase (3), so the same keystroke
        //      never gets appended to `this.filter` either.
        // Because both flags are set AND consumed within this single
        // synchronous `_handleKey` call for the activating keystroke, the very
        // next key — even if it arrived in the same payload — sees fully
        // settled state (filterActive=true, filterBox genuinely focused).
        //
        // BUG FIX (round 3, Tab specifically): 'tab' is one of the activator
        // keys above, but Screen._handleKey has a DEFAULT fallback branch for
        // an *unhandled* Tab — `if (!handled && focusKeys) { if (name==='tab')
        // { focusNext(); render(); return; } }` — that fires its OWN
        // `focusNext()` and returns BEFORE phase (3) ever runs. Since this
        // handler never returned `true`, every Tab press hit that branch:
        // (a) blessed's `focusNext()` immediately re-stole focus away from
        //     filterBox right after `focusFilter()` just set it, and
        // (b) phase (3) never ran, so `suppressNextFilterChar` (armed above)
        //     was never consumed — it stayed stuck `true` and silently
        //     swallowed the sysop's next real keystroke, whenever it arrived
        //     in a later payload.
        // Root cause: `KeyBinder.key()`'s wrapped handler (ViewManager.ts)
        // never returned its inner handler's result, so there was no way to
        // signal `handled` back to Screen._handleKey — fixed there (now
        // propagates), so returning `true` here is enough to make
        // `_handleKey` skip its own Tab-fallback entirely for this keystroke.
        // Phase (3) still runs unconditionally either way (screen.ts's final
        // `this.emit('keypress', ...)` isn't gated on `handled`), so
        // `suppressNextFilterChar` is still consumed there exactly as before —
        // 'f'/'F'/'/' were never affected by this branch (only Tab has a
        // default fallback) and are unchanged by returning `true` here (it
        // just also skips their already-harmless phase 2).
        this.keys.key(['f', 'F', '/', 'tab'], () => {
            if (filterActive)
                return; // already in filter
            filterActive = true;
            suppressNextFilterChar = true;
            this.layout.focusFilter();
            this.layout.render();
            return true;
        });
        this.keys.key(['r', 'R'], () => this.doInstallUninstall());
        this.keys.key(['s', 'S'], () => this.doStrip());
        this.keys.key(['v', 'V'], () => this.doViewDoc());
        this.keys.key(['a', 'A'], () => this.doBrowseArchive());
        this.keys.key(['c', 'C'], () => this.cycleFilter());
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
                void (0, ViewManager_1.refreshDoorRegistry)(); // doors list is boot-cached; drop the entry now
                this.setStatus(`Uninstalled ${e.installed_as}`, 'green', 4000);
                this.refresh(this.layout.listSelected);
            }));
        }
        else {
            const resolvedArchive = resolveArchivePath(e.archive_path);
            if (!resolvedArchive || !fs.existsSync(resolvedArchive)) {
                const detail = `archive_path=${e.archive_path ?? '(none)'} resolved=${resolvedArchive ?? '(none)'}`;
                console.log(`[DOORMAN] install failed: resolve-archive: ${detail}`);
                this.setStatus(`Archive not on server`, 'yellow', 8000);
                this.layout.setInfo(`{yellow-fg}Archive not on server{/yellow-fg}\n\n` +
                    `{yellow-fg}Catalog path:{/yellow-fg} ${(0, ViewManager_1.sanitizeForTags)(e.archive_path ?? '(none)')}\n` +
                    `{yellow-fg}Resolved to:{/yellow-fg} ${(0, ViewManager_1.sanitizeForTags)(resolvedArchive ?? '(unresolvable)')}\n`);
                this.layout.render();
                return;
            }
            const suggested = (e.installed_as ?? e.binary_name ?? e.name ?? 'DOOR')
                .toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 12);
            this.vm.push(new InputView(this.layout, `{yellow-fg}Install as BBS command:{/yellow-fg}`, suggested, (cmd) => {
                if (!cmd)
                    return;
                if (this.installing)
                    return; // an install is already in flight
                this.installing = true;
                const finalCmd = cmd.trim().toUpperCase() || suggested;
                const installDir = path.join(PROJECT_ROOT, 'Doors', finalCmd);
                fs.mkdirSync(installDir, { recursive: true });
                this.setStatus('Installing…', 'yellow', 30000);
                void (async () => {
                    try {
                        const result = await extractArchiveTo(resolvedArchive, installDir);
                        if (!result.ok) {
                            this.reportInstallFailure('extract', result.error ?? 'unknown error', resolvedArchive, e.archive_name);
                            return;
                        }
                        const bbsCmdDir = path.join(PROJECT_ROOT, 'Commands', 'BBSCmd');
                        const infoPath = path.join(bbsCmdDir, `${finalCmd}.info`);
                        const doorType = e.door_type || 'XIM';
                        const binaryRel = findExtractedBinary(installDir, e.binary_name) ?? (e.binary_name ?? finalCmd);
                        try {
                            fs.writeFileSync(infoPath, buildDoorInfoContent(doorType, finalCmd, binaryRel), 'latin1');
                        }
                        catch (err) {
                            this.reportInstallFailure('write-info', `${infoPath}: ${err?.message ?? err}`, resolvedArchive, e.archive_name);
                            return;
                        }
                        try {
                            getCatalogSvc()?.markInstalled(e.id, finalCmd, `Doors/${finalCmd}`);
                        }
                        catch (err) {
                            // The door is on disk and the .info is written — it will run.
                            // The catalog just won't show it as installed. Surface it but
                            // don't roll back a working install over a bookkeeping error.
                            console.log(`[DOORMAN] install failed: mark-installed: ${err?.message ?? err}`);
                        }
                        // The BBS door registry is a boot-time cache — refresh it or
                        // the new door is invisible in the doors list until restart.
                        const refreshed = await (0, ViewManager_1.refreshDoorRegistry)();
                        if (!refreshed)
                            console.log('[DOORMAN] warning: door registry refresh unavailable — new door hidden until BBS restart');
                        this.setStatus(`Installed as ${finalCmd} (${result.fileCount} files, ${doorType})`, 'green', 4000);
                        this.layout.setInfo(`{green-fg}Installed{/green-fg}\n\n` +
                            `{yellow-fg}Command:{/yellow-fg} ${finalCmd}\n` +
                            `{yellow-fg}Type:{/yellow-fg} ${doorType}\n` +
                            `{yellow-fg}Files:{/yellow-fg} ${result.fileCount}\n` +
                            `{yellow-fg}Binary:{/yellow-fg} ${(0, ViewManager_1.sanitizeForTags)(binaryRel)}\n`);
                        this.refresh(this.layout.listSelected);
                    }
                    catch (err) {
                        this.reportInstallFailure('install', err?.message ?? String(err), resolvedArchive, e.archive_name);
                    }
                    finally {
                        this.installing = false;
                    }
                })();
            }));
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
    reportInstallFailure(step, detail, archivePath, archiveName) {
        console.log(`[DOORMAN] install failed: ${step}: ${detail} (archive=${archiveName}, path=${archivePath})`);
        this.setStatus(`Install failed: ${step}`, 'red', 9000);
        this.layout.setInfo(`{red-fg}Install failed{/red-fg}\n\n` +
            `{yellow-fg}Step:{/yellow-fg} ${(0, ViewManager_1.sanitizeForTags)(step)}\n` +
            `{yellow-fg}Detail:{/yellow-fg} ${(0, ViewManager_1.sanitizeForTags)(detail)}\n` +
            `{yellow-fg}Archive:{/yellow-fg} ${(0, ViewManager_1.sanitizeForTags)(archiveName)}\n` +
            `{yellow-fg}Path:{/yellow-fg} ${(0, ViewManager_1.sanitizeForTags)(archivePath)}\n`);
        this.layout.render();
    }
    doStrip() {
        const e = this.entry();
        if (!e)
            return;
        const resolvedArchive = resolveArchivePath(e.archive_path);
        const hasArchive = !!(resolvedArchive && fs.existsSync(resolvedArchive));
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
        this.vm.push(new StripView(this.layout, e, hasArchive ? resolvedArchive : null, installDir ?? undefined, (stripped) => { if (stripped) {
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
    constructor(layout, entry, archivePath, overrideDir, onDone) {
        super();
        this.checked = [];
        this.files = [];
        this.reasons = {};
        this.origLabel = '';
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
        this.canStrip = false;
        this.layout = layout;
        this.entry = entry;
        this.archivePath = archivePath;
        this.overrideDir = overrideDir;
        this.onDone = onDone;
    }
    /** Loud-error convention (see reportInstallFailure in RepoView): log to
     * the process console for docker logs / journald visibility, and hold a
     * persistent message in the info panel instead of a message that quietly
     * self-clears. */
    reportFailure(step, detail) {
        console.log(`[DOORMAN] strip failed: ${step}: ${detail} (archive=${this.entry.archive_name})`);
        this.layout.setInfo(`{red-fg}Strip failed{/red-fg}\n\n` +
            `{yellow-fg}Step:{/yellow-fg} ${(0, ViewManager_1.sanitizeForTags)(step)}\n` +
            `{yellow-fg}Detail:{/yellow-fg} ${(0, ViewManager_1.sanitizeForTags)(detail)}\n` +
            `{yellow-fg}Archive:{/yellow-fg} ${(0, ViewManager_1.sanitizeForTags)(this.entry.archive_name)}\n`);
        this.layout.render();
    }
    enter() {
        const lib = getStripLib();
        if (!lib) {
            console.log(`[DOORMAN] strip failed: lib-unavailable (archive=${this.entry.archive_name})`);
            this.layout.setFooter('{center}{red-fg}Stripper library not available{/red-fg}{/center}');
            this.vm.pop();
            return;
        }
        const installDir = this.overrideDir;
        this.canStrip = !!installDir;
        this.layout.setFooter('{center}{cyan-fg}Analyzing...{/cyan-fg}{/center}');
        this.layout.render();
        (installDir ? lib.analyzeDirectory(installDir) : lib.analyzeArchive(this.archivePath))
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
            this.keys.key(['s', 'S'], () => {
                if (!this.canStrip) {
                    this.layout.setInfo(`{yellow-fg}This door is not installed.{/yellow-fg}\n\n` +
                        `DOORMAN strips junk from an INSTALLED door's files, not from\n` +
                        `the archive itself — there is no portable way to rewrite a\n` +
                        `.lha/.lzx archive in its original format on this platform.\n\n` +
                        `Install {yellow-fg}${(0, ViewManager_1.sanitizeForTags)(this.entry.archive_name)}{/yellow-fg} first, then Strip.`);
                    this.layout.render();
                    return;
                }
                this.doStrip(lib, installDir);
            });
            this.keys.key(['q', 'Q'], () => { this.vm.pop(); this.onDone(null); });
        })
            .catch((e) => {
            this.reportFailure('analyze', e?.message ?? String(e));
            setTimeout(() => this.vm.pop(), 2500);
        });
    }
    renderFiles() {
        const items = this.files.map((f, i) => {
            const box = this.checked[i] ? '[X]' : '[ ]';
            const fpath = f.path;
            const name = fpath.length > 24 ? '<' + fpath.slice(fpath.length - 23) : fpath.padEnd(24);
            return `${box} ${name}`;
        });
        const selCount = this.checked.filter(Boolean).length;
        const modeTag = this.canStrip ? '' : ' (preview)';
        this.layout.listPanel.setLabel(` ${this.entry.archive_name} — Strip Ads${modeTag} `);
        this.layout.setListItems(items);
        const sel = this.files[this.layout.listSelected];
        const hint = this.canStrip
            ? '\n{grey-fg}[Space] Toggle  [A] All  [N] None  [S] Strip  [ESC/Q] Cancel{/grey-fg}'
            : '\n{grey-fg}[Space] Toggle  [A] All  [N] None  Not installed — [S] shows how  [ESC/Q] Cancel{/grey-fg}';
        this.layout.setInfo(`{yellow-fg}${selCount}/${this.files.length} selected{/yellow-fg}\n\n` +
            (sel ? `{cyan-fg}${sel.path}{/cyan-fg}\nReason: ${this.reasons[sel.path] ?? '?'}\n` : '') +
            hint);
        this.layout.setFooter(this.canStrip
            ? '{center}{yellow-fg}Space{/yellow-fg}=Toggle  {yellow-fg}A{/yellow-fg}=All  {yellow-fg}N{/yellow-fg}=None  {yellow-fg}S{/yellow-fg}=Strip  {yellow-fg}ESC/Q{/yellow-fg}=Cancel{/center}'
            : '{center}{yellow-fg}Space{/yellow-fg}=Toggle  {yellow-fg}A{/yellow-fg}=All  {yellow-fg}N{/yellow-fg}=None  {grey-fg}Preview only{/grey-fg}  {yellow-fg}ESC/Q{/yellow-fg}=Cancel{/center}');
        this.layout.render();
    }
    doStrip(lib, installDir) {
        const toStrip = this.files.filter((_, i) => this.checked[i]);
        if (toStrip.length === 0) {
            this.vm.pop();
            this.onDone(null);
            return;
        }
        this.layout.setFooter('{center}{cyan-fg}Stripping...{/cyan-fg}{/center}');
        this.layout.render();
        (async () => {
            try {
                lib.stripFilesFromDirectory(installDir, toStrip.map((f) => f.path));
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
                this.reportFailure('strip', e?.message ?? String(e));
                setTimeout(() => { this.vm.pop(); this.onDone(null); }, 2500);
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