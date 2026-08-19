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
exports.registerRepoViewActionKeys = exports.repoViewFooterParts = exports.repoViewCurationAllowed = exports.clampSelection = exports.wrapText = exports.CONSUMER_INSTALL_SOURCE = void 0;
exports.resolveArchivePath = resolveArchivePath;
exports.buildDoorInfoContent = buildDoorInfoContent;
exports.extractArchiveTo = extractArchiveTo;
exports.findExtractedBinary = findExtractedBinary;
exports.extractAndRegisterDoor = extractAndRegisterDoor;
exports.catalogIdForArchive = catalogIdForArchive;
exports.installConsumerDoor = installConsumerDoor;
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
const repoDataSource_1 = require("./repoDataSource");
const repo_client_1 = require("./repo-client");
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
/** Adapts the local catalog service's getCatalogEntryByArchive into the
 * LocalCatalogLookup shape repoDataSource's mapManifestDoorToEntry expects
 * (consumer mode: resolving what's installed on THIS BBS is always a local
 * lookup, never something the central manifest knows). Missing service or a
 * thrown lookup error both fold into "nothing known locally" rather than
 * propagating -- a lookup failure must never abort the whole browse. */
function buildLocalCatalogLookup() {
    const svc = getCatalogSvc();
    return (archiveName) => {
        try {
            const row = svc?.getCatalogEntryByArchive?.(archiveName);
            if (!row)
                return null;
            return {
                id: row.id,
                installed: row.installed,
                installed_as: row.installed_as ?? null,
                install_dir: row.install_dir ?? null,
                binary_name: row.binary_name ?? null,
                archive_path: row.archive_path ?? null,
            };
        }
        catch {
            return null;
        }
    };
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
async function extractAndRegisterDoor(archivePath, installDir, infoPath, doorType, binaryName, finalCmd, deps) {
    const result = await deps.extractArchiveTo(archivePath, installDir);
    if (!result.ok)
        return { ok: false, step: 'extract', detail: result.error ?? 'unknown error' };
    const resolvedDoorType = doorType || 'XIM';
    const binaryRel = deps.findExtractedBinary(installDir, binaryName) ?? (binaryName ?? finalCmd);
    try {
        deps.writeInfoFile(infoPath, buildDoorInfoContent(resolvedDoorType, finalCmd, binaryRel));
    }
    catch (err) {
        return { ok: false, step: 'write-info', detail: `${infoPath}: ${err?.message ?? err}` };
    }
    try {
        deps.markInstalled();
    }
    catch (err) {
        // The door is on disk and the .info is written — it will run. The
        // catalog just won't show it as installed. Surface it but don't roll
        // back a working install over a bookkeeping error.
        console.log(`[DOORMAN] install failed: mark-installed: ${err?.message ?? err}`);
    }
    const refreshed = await deps.refreshDoorRegistry();
    if (!refreshed)
        console.log('[DOORMAN] warning: door registry refresh unavailable — new door hidden until BBS restart');
    return { ok: true, doorType: resolvedDoorType, fileCount: result.fileCount, binaryRel };
}
/**
 * Same stable-slug convention dev/scripts/door-corpus/build-door-catalog.ts
 * uses to derive a door_catalog.id from an archive_name (that script's
 * `baseId`, duplicated here rather than imported: it's a standalone tsx
 * script outside both this package's and web/backend's TypeScript program,
 * not an importable module). Reusing the exact formula matters, not just
 * for readability parity with scanned rows (e.g. "!ALSTER.LHA" -> "_alster"
 * in the seed data) -- it means a door that is BOTH consumer-installed here
 * AND later indexed by a local scan resolves to the SAME id instead of two
 * divergent rows colliding on door_catalog.archive_name's UNIQUE
 * constraint. Deterministic in archiveName alone, so install -> uninstall
 * -> reinstall of the same archive always targets the same row (idempotent
 * upsert, never a duplicate).
 */
function catalogIdForArchive(archiveName) {
    return archiveName.replace(/\.(lha|lzx|lzh)$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '_');
}
/** New door_catalog.source value for this install path. The column's only
 * existing value anywhere in the codebase (schema DEFAULT, every seed row)
 * is 'scan' -- the local archive-corpus scanner's provenance tag. 'door-repo'
 * extends that same informal enum minimally: it marks a row as created by
 * a consumer-mode install from the central door-repo API, never by a local
 * filesystem scan. */
exports.CONSUMER_INSTALL_SOURCE = 'door-repo';
async function installConsumerDoor(cfg, archiveName, doorType, binaryName, finalCmd, installDir, infoPath, tmpDir, deps) {
    const destPath = path.join(tmpDir, archiveName);
    try {
        deps.mkdir(tmpDir);
        let manifest;
        try {
            ({ manifest } = await deps.fetchManifest(cfg));
        }
        catch (err) {
            // This is a SEPARATE fetch from whatever populated the browse list
            // (loadConsumerManifest, on view enter) -- normally a cheap 304 off
            // repo-client's ETag cache, but if the on-disk cache file is gone or
            // the network is down at this exact moment, an install that would
            // otherwise have succeeded (the sysop already saw this door in the
            // browse list moments ago) fails here instead. Said plainly, not
            // just via repo-client's raw error text.
            return {
                ok: false, step: 'manifest-lookup',
                detail: `could not re-fetch the central manifest to verify this download ` +
                    `(browsing and installing re-fetch independently -- this can fail even ` +
                    `right after a successful browse if the network or manifest cache ` +
                    `dropped out in between): ${err?.message ?? String(err)}`,
            };
        }
        const manifestRow = manifest.doors.find(d => d.archiveName === archiveName);
        if (!manifestRow || !manifestRow.sha256) {
            return { ok: false, step: 'manifest-lookup', detail: `No sha256 for ${archiveName} in the central manifest` };
        }
        try {
            await deps.downloadArchive(cfg, archiveName, destPath, manifestRow.sha256);
        }
        catch (err) {
            return { ok: false, step: 'download', detail: err?.message ?? String(err) };
        }
        let registeredLocally = false;
        const localRow = deps.lookupLocal(archiveName);
        const outcome = await extractAndRegisterDoor(destPath, installDir, infoPath, doorType, binaryName, finalCmd, {
            extractArchiveTo: deps.extractArchiveTo,
            findExtractedBinary: deps.findExtractedBinary,
            writeInfoFile: deps.writeInfoFile,
            refreshDoorRegistry: deps.refreshDoorRegistry,
            markInstalled: () => {
                if (localRow) {
                    deps.markInstalled(localRow.id, finalCmd, `Doors/${finalCmd}`);
                    registeredLocally = true;
                    return;
                }
                const newId = catalogIdForArchive(archiveName);
                const collision = deps.getCatalogEntry(newId);
                if (collision && collision.archive_name !== archiveName) {
                    console.log(`[DOORMAN] consumer install: id "${newId}" already belongs to a different ` +
                        `archive (${collision.archive_name}) -- not clobbering it. ${archiveName} ` +
                        `installs registry-only (on disk, registered with the BBS; repo browse ` +
                        `'installed' flag needs its own local catalog row).`);
                    return;
                }
                deps.upsertCatalogEntry({
                    id: newId,
                    archive_name: archiveName,
                    archive_path: '', // lives on the central server, not this BBS -- never claim otherwise
                    binary_name: null,
                    door_type: doorType || 'XIM',
                    name: manifestRow.name ?? archiveName,
                    version: null,
                    author: null,
                    release_group: null,
                    description: manifestRow.description ?? null,
                    file_id_diz: null,
                    doc_filename: null,
                    doc_raw: null,
                    suggested_tooltypes: null,
                    category: null,
                    archive_size: manifestRow.archiveSize ?? 0,
                    junk_count: 0,
                    installed: 0, // markInstalled (below) owns installed/installed_as/install_dir
                    installed_as: null,
                    install_dir: null,
                    corpus_id: null,
                    source: exports.CONSUMER_INSTALL_SOURCE,
                });
                deps.markInstalled(newId, finalCmd, `Doors/${finalCmd}`);
                registeredLocally = true;
            },
        });
        if (!outcome.ok)
            return outcome;
        return { ok: true, doorType: outcome.doorType, fileCount: outcome.fileCount, binaryRel: outcome.binaryRel, registeredLocally };
    }
    finally {
        deps.unlink(destPath);
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
        this.filterBox = new blessed_1.Textbox({ parent: this.filterPanel, top: 0, left: 1, width: '100%-2',
            height: 1, mouse: true, keys: false, inputOnFocus: false,
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
        // Same clamp as the repo view: uninstalling or deleting the last door in
        // the list would otherwise leave the index one past the end.
        this.layout.setListSelect((0, repo_view_helpers_2.clampSelection)(selectIdx, items.length));
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
                fetchDoors(this.bbs).then(doors => { this.doors = doors; this.refresh(this.layout.listSelected); });
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
var repo_view_helpers_1 = require("./repo-view-helpers");
Object.defineProperty(exports, "wrapText", { enumerable: true, get: function () { return repo_view_helpers_1.wrapText; } });
Object.defineProperty(exports, "clampSelection", { enumerable: true, get: function () { return repo_view_helpers_1.clampSelection; } });
Object.defineProperty(exports, "repoViewCurationAllowed", { enumerable: true, get: function () { return repo_view_helpers_1.repoViewCurationAllowed; } });
Object.defineProperty(exports, "repoViewFooterParts", { enumerable: true, get: function () { return repo_view_helpers_1.repoViewFooterParts; } });
Object.defineProperty(exports, "registerRepoViewActionKeys", { enumerable: true, get: function () { return repo_view_helpers_1.registerRepoViewActionKeys; } });
const repo_view_helpers_2 = require("./repo-view-helpers");
class RepoView extends ViewManager_1.BaseView {
    constructor(layout, bbs) {
        super();
        this.entries = [];
        this.visibleEntries = [];
        this.systemFilter = systemFilter_1.ALL_TYPES;
        this.filter = '';
        this.statusTimer = null;
        this.installing = false; // guards against double-fire on the async install handler
        // Consumer mode: browsing the central door-repo API instead of the local
        // catalog. repoMode is resolved once (env is static per-process).
        // consumerEntries holds the FULL manifest-mapped list (unfiltered by
        // text) so filterManifestEntries can re-run client-side on every
        // keystroke without a network round trip -- see loadEntries() below.
        this.repoMode = (0, repoDataSource_1.resolveDoorRepoMode)();
        this.consumerEntries = null;
        this.consumerFromCache = false;
        this.consumerCachedAt = null;
        this.consumerError = null;
        this.consumerLoading = false;
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
        let stats = '';
        if (this.repoMode.kind === 'consumer') {
            // Central-repo stats (never the local catalog's — a different data
            // source is on screen) plus the offline/cached suffix when the last
            // fetch served the on-disk cache instead of a live network response.
            if (this.consumerEntries !== null) {
                const installedCount = this.consumerEntries.filter(e => e.installed).length;
                stats = `${this.consumerEntries.length} in repo, ${installedCount} installed`;
            }
            else if (this.consumerError) {
                stats = 'repo fetch failed';
            }
            else {
                stats = 'loading...';
            }
            stats += (0, repoDataSource_1.formatOfflineSuffix)(this.consumerFromCache, this.consumerCachedAt);
        }
        else {
            // Owner mode AND disabled mode: byte-identical to pre-Task-6 —
            // local catalog stats via the same getCatalogSvc()/catalogStats() call.
            const svc = getCatalogSvc();
            try {
                const s = svc?.catalogStats();
                if (s)
                    stats = `${s.total} in repo, ${s.installed} installed`;
            }
            catch { }
        }
        // Always shown (including the default ALL state) — a sysop with no
        // idea the filter exists has no way to discover it otherwise. Count is
        // visibleEntries: rows surviving BOTH the text search (this.filter,
        // via searchCatalog) AND the system-type filter, so it always matches
        // what's actually on screen.
        const sysTag = `  {cyan-fg}${(0, systemFilter_1.formatSystemTag)(this.systemFilter, this.visibleEntries.length)}{/cyan-fg}`;
        this.layout.setHeader(`{center}{cyan-fg}DOORMAN v2  REPO{/cyan-fg}  {white-fg}${stats}${this.filter ? ' (filtered)' : ''}{/white-fg}${sysTag}{/center}`);
    }
    cycleFilter() {
        const availableTypes = (0, systemFilter_1.distinctTypes)(this.entries, RepoView.typeOf);
        this.systemFilter = (0, systemFilter_1.cycleSystemFilter)(this.systemFilter, availableTypes);
        this.refresh(0);
    }
    loadEntries() {
        if (this.repoMode.kind === 'consumer') {
            // consumerEntries is the FULL manifest-mapped list, fetched once (see
            // loadConsumerManifest, kicked off from enter()) and re-filtered here
            // client-side on every call — never a network fetch per keystroke.
            if (this.consumerEntries === null) {
                this.entries = [];
                return;
            }
            this.entries = (0, repoDataSource_1.filterManifestEntries)(this.consumerEntries, this.filter);
            this.repoUnavailable = false;
            return;
        }
        // Owner mode AND disabled mode: byte-identical to pre-Task-6 —
        // extracted into repoDataSource.ts's loadLocalCatalogEntries so both
        // modes share one implementation.
        const svc = getCatalogSvc();
        const result = (0, repoDataSource_1.loadLocalCatalogEntries)(svc, this.filter);
        this.entries = result.entries;
        this.repoUnavailable = result.repoUnavailable;
    }
    /** Fetches + maps the central manifest once (guarded against overlapping
     * calls — enter() re-runs every time a child view like ConfirmView/
     * InputView pops back to RepoView, per ViewManager.pop()). Retries on a
     * later enter() if the previous attempt failed (consumerEntries still
     * null) — a transient network blip should not permanently disable
     * browsing for the rest of the session. */
    async loadConsumerManifest() {
        if (this.repoMode.kind !== 'consumer' || this.consumerLoading || this.consumerEntries !== null)
            return;
        this.consumerLoading = true;
        this.updateInfo();
        this.layout.render();
        try {
            const cacheFile = (0, repoDataSource_1.consumerCacheFilePath)(PROJECT_ROOT);
            const lookupLocal = buildLocalCatalogLookup();
            const result = await (0, repoDataSource_1.loadConsumerCatalog)(this.repoMode.url, cacheFile, lookupLocal);
            this.consumerEntries = result.entries;
            this.consumerFromCache = result.fromCache;
            this.consumerCachedAt = result.cachedAt;
            this.consumerError = null;
            this.consumerLoading = false;
            this.refresh(this.layout.listSelected);
            this.layout.render();
        }
        catch (err) {
            this.consumerLoading = false;
            this.reportRepoFetchFailure(err?.message ?? String(err));
        }
    }
    /** Loud-error convention matching reportInstallFailure below: log to the
     * process console (docker logs / journald visibility) and hold a
     * persistent message in the info panel — no cache and no network must
     * never silently present as an empty catalog. */
    reportRepoFetchFailure(detail) {
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
        this.layout.setListSelect((0, repo_view_helpers_2.clampSelection)(selectIdx, this.visibleEntries.length));
        this.updateInfo();
        this.updateFooter();
        this.refreshHeader();
    }
    noEntryMessage() {
        if (this.repoMode.kind === 'consumer') {
            if (this.consumerLoading)
                return '{yellow-fg}Loading central door-repo catalog...{/yellow-fg}';
            if (this.consumerError) {
                return `{red-fg}Central door-repo unavailable.{/red-fg}\n\n` +
                    `{yellow-fg}Detail:{/yellow-fg} ${(0, ViewManager_1.sanitizeForTags)(this.consumerError)}\n\n` +
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
    updateInfo() {
        const e = this.entry();
        if (!e) {
            this.layout.setInfo(this.noEntryMessage());
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
        const hasJunk = e ? this.getEntryJunkCount(e) > 0 : false;
        this.layout.setFooter((0, repo_view_helpers_2.repoViewFooterParts)(this.repoMode, {
            installed: !!e?.installed,
            hasJunk,
            hasDoc: !!e?.doc_raw,
        }));
    }
    enter() {
        this.layout.showRepoLayout();
        this.refresh(0);
        if (this.repoMode.kind === 'consumer')
            void this.loadConsumerManifest();
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
        const activateFilter = () => {
            filterActive = true;
            this.layout.focusFilter();
            this.layout.render();
        };
        this.keys.key(['f', 'F', '/', 'tab'], () => {
            if (filterActive)
                return; // already in filter
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
        this.layout.filterBox.on('click', this._onFilterClick = () => {
            if (filterActive)
                return;
            activateFilter();
        });
        (0, repo_view_helpers_2.registerRepoViewActionKeys)(this.keys, this.repoMode, {
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
            this.layout.screen.destroy();
        });
    }
    exit() {
        this.layout.doorList.off('select item', this._onSelectItem);
        this.layout.doorList.off('focus', this._onListFocus);
        this.layout.screen.off('keypress', this._onFilterKey);
        this.layout.filterBox.off('click', this._onFilterClick);
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
        else if (this.repoMode.kind === 'consumer') {
            // Consumer mode: no local archive to pre-check (it may never have
            // touched this disk before) — the download itself is the existence
            // check, and any failure surfaces from inside installConsumerDoor's
            // async callback below via the same reportInstallFailure panel.
            const repoUrl = this.repoMode.url;
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
                this.setStatus('Downloading…', 'yellow', 30000);
                const bbsCmdDir = path.join(PROJECT_ROOT, 'Commands', 'BBSCmd');
                const infoPath = path.join(bbsCmdDir, `${finalCmd}.info`);
                const tmpDir = path.join(PROJECT_ROOT, 'tmp-door-repo');
                const tmpArchivePath = path.join(tmpDir, e.archive_name);
                const cfg = { url: repoUrl, cacheFile: (0, repoDataSource_1.consumerCacheFilePath)(PROJECT_ROOT) };
                void (async () => {
                    try {
                        const outcome = await installConsumerDoor(cfg, e.archive_name, e.door_type, e.binary_name, finalCmd, installDir, infoPath, tmpDir, {
                            fetchManifest: repo_client_1.fetchManifest,
                            downloadArchive: repo_client_1.downloadArchive,
                            extractArchiveTo,
                            findExtractedBinary,
                            writeInfoFile: (p, c) => fs.writeFileSync(p, c, 'latin1'),
                            lookupLocal: buildLocalCatalogLookup(),
                            getCatalogEntry: (id) => getCatalogSvc()?.getCatalogEntry(id) ?? null,
                            upsertCatalogEntry: (entry) => { getCatalogSvc()?.upsertCatalogEntry(entry); },
                            markInstalled: (id, cmd2, dir) => { getCatalogSvc()?.markInstalled(id, cmd2, dir); },
                            refreshDoorRegistry: ViewManager_1.refreshDoorRegistry,
                            mkdir: (dir) => fs.mkdirSync(dir, { recursive: true }),
                            unlink: (p) => { try {
                                fs.unlinkSync(p);
                            }
                            catch { /* never existed, or already removed */ } },
                        });
                        if (!outcome.ok) {
                            this.reportInstallFailure(outcome.step, outcome.detail, tmpArchivePath, e.archive_name);
                            return;
                        }
                        this.setStatus(`Installed as ${finalCmd} (${outcome.fileCount} files, ${outcome.doorType})`, 'green', 4000);
                        this.layout.setInfo(`{green-fg}Installed{/green-fg}\n\n` +
                            `{yellow-fg}Command:{/yellow-fg} ${finalCmd}\n` +
                            `{yellow-fg}Type:{/yellow-fg} ${outcome.doorType}\n` +
                            `{yellow-fg}Files:{/yellow-fg} ${outcome.fileCount}\n` +
                            `{yellow-fg}Binary:{/yellow-fg} ${(0, ViewManager_1.sanitizeForTags)(outcome.binaryRel)}\n` +
                            (outcome.registeredLocally
                                ? ''
                                : `\n{yellow-fg}Note:{/yellow-fg} registry-only — a local catalog id collision\n` +
                                    `blocked registration, so it won't show as installed in this browse list.\n` +
                                    `See the server log for detail.\n`));
                        this.refresh(this.layout.listSelected);
                    }
                    catch (err) {
                        this.reportInstallFailure('install', err?.message ?? String(err), tmpArchivePath, e.archive_name);
                    }
                    finally {
                        this.installing = false;
                    }
                })();
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
                const bbsCmdDir = path.join(PROJECT_ROOT, 'Commands', 'BBSCmd');
                const infoPath = path.join(bbsCmdDir, `${finalCmd}.info`);
                void (async () => {
                    try {
                        const outcome = await extractAndRegisterDoor(resolvedArchive, installDir, infoPath, e.door_type, e.binary_name, finalCmd, {
                            extractArchiveTo,
                            findExtractedBinary,
                            writeInfoFile: (p, c) => fs.writeFileSync(p, c, 'latin1'),
                            markInstalled: () => { getCatalogSvc()?.markInstalled(e.id, finalCmd, `Doors/${finalCmd}`); },
                            refreshDoorRegistry: ViewManager_1.refreshDoorRegistry,
                        });
                        if (!outcome.ok) {
                            this.reportInstallFailure(outcome.step, outcome.detail, resolvedArchive, e.archive_name);
                            return;
                        }
                        this.setStatus(`Installed as ${finalCmd} (${outcome.fileCount} files, ${outcome.doorType})`, 'green', 4000);
                        this.layout.setInfo(`{green-fg}Installed{/green-fg}\n\n` +
                            `{yellow-fg}Command:{/yellow-fg} ${finalCmd}\n` +
                            `{yellow-fg}Type:{/yellow-fg} ${outcome.doorType}\n` +
                            `{yellow-fg}Files:{/yellow-fg} ${outcome.fileCount}\n` +
                            `{yellow-fg}Binary:{/yellow-fg} ${(0, ViewManager_1.sanitizeForTags)(outcome.binaryRel)}\n`);
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
    doDeleteFromRepo() {
        const e = this.entry();
        if (!e)
            return;
        const svc = getCatalogSvc();
        if (!svc?.deleteCatalogEntry) {
            this.setStatus('Catalog service not available', 'yellow');
            return;
        }
        this.vm.push(new ConfirmView(this.layout, `Delete {yellow-fg}${e.archive_name}{/yellow-fg} from the repository?\n\n` +
            `This removes the catalog entry AND the archive file.\n` +
            `It cannot be undone.` +
            (e.installed ? `\n\n{green-fg}${e.installed_as}{/green-fg} stays installed and keeps working.` : ''), 'Delete', 'Cancel', () => {
            let result;
            try {
                result = svc.deleteCatalogEntry(e.id);
            }
            catch (err) {
                this.setStatus(`Delete failed: ${err?.message ?? err}`, 'red', 6000);
                return;
            }
            if (!result.ok) {
                this.setStatus(`Delete failed: ${result.reason ?? 'unknown error'}`, 'red', 6000);
                return;
            }
            this.setStatus(result.fileRemoved
                ? `Deleted ${result.archiveName}`
                : `Deleted ${result.archiveName} (archive was already missing)`, 'green', 4000);
            // The row is gone, so the list is rebuilt - but the cursor stays on
            // the same INDEX, which now holds the door that moved up into the
            // slot. clampSelection() handles deleting the last row.
            this.refresh(this.layout.listSelected);
        }));
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
        // Keeps 0x80+ for the same reason sanitizeForTags() does: Amiga door
        // documentation is drawn with high-bit glyphs, and dropping them pulls
        // the columns out of alignment. Tabs and newlines survive; other control
        // characters do not.
        const text = this.content.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').replace(/[{}]/g, c => `\\${c}`);
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
        /** Set when this strip would edit the repository archive rather than an
         *  installed directory; `reason` explains why it cannot, when it cannot. */
        this.archiveStrip = null;
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
            }
            else if (capability?.reason) {
                this.archiveStrip = { reason: capability.reason };
            }
        }
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
                    this.layout.setInfo(`{yellow-fg}Cannot strip this archive.{/yellow-fg}\n\n` +
                        (0, repo_view_helpers_2.wrapToInfoPane)(why, this.layout) + '\n\n' +
                        (0, repo_view_helpers_2.wrapToInfoPane)(`Install ${(0, ViewManager_1.sanitizeForTags)(this.entry.archive_name)} first and strip the ` +
                            `installed copy instead.`, this.layout));
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
    /**
     * Strip the REPOSITORY archive in place: the published bytes change, so
     * the backend re-describes the row (size, digests, junk rows) in the same
     * step. Every other sysop downloads this file, which is why it is worth
     * doing here rather than making each of them strip their own copy.
     */
    doStripArchive() {
        const toStrip = this.files.filter((_, i) => this.checked[i]);
        if (toStrip.length === 0) {
            this.vm.pop();
            this.onDone(null);
            return;
        }
        const svc = getCatalogSvc();
        if (!svc?.stripArchiveOnServer) {
            this.reportFailure('strip', 'catalog service unavailable');
            setTimeout(() => { this.vm.pop(); this.onDone(null); }, 2500);
            return;
        }
        this.layout.setFooter('{center}{cyan-fg}Stripping archive...{/cyan-fg}{/center}');
        this.layout.render();
        let result;
        try {
            result = svc.stripArchiveOnServer(this.entry.id, toStrip.map((f) => f.path));
        }
        catch (e) {
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