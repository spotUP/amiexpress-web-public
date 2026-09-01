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
exports.formatSuggestedTooltypes = exports.renderFileLines = exports.entryHasDoc = exports.registerRepoViewActionKeys = exports.repoViewFooterParts = exports.repoViewCurationAllowed = exports.clampSelection = exports.wrapText = exports.installConsumerDoor = exports.commandClaimedByOtherArchive = exports.findExtractedBinary = exports.extractArchiveTo = exports.extractAndRegisterDoor = exports.buildDoorInfoContent = void 0;
exports.resolveArchivePath = resolveArchivePath;
exports.createApp = createApp;
const path = __importStar(require("path"));
const run_door_1 = require("./run-door");
const installed_footer_1 = require("./installed-footer");
const type_badge_1 = require("./type-badge");
const delete_door_action_1 = require("./delete-door-action");
const safe_install_dir_1 = require("./safe-install-dir");
const action_log_1 = require("./action-log");
const archive_browse_view_1 = require("./archive-browse-view");
const install_core_1 = require("./install-core");
const install_core_2 = require("./install-core");
const archive_command_1 = require("./archive-command");
// Re-exported: the install core moved to its own module when app.ts passed
// the 2000-line ceiling, and the tests import these from here.
var install_core_3 = require("./install-core");
Object.defineProperty(exports, "buildDoorInfoContent", { enumerable: true, get: function () { return install_core_3.buildDoorInfoContent; } });
Object.defineProperty(exports, "extractAndRegisterDoor", { enumerable: true, get: function () { return install_core_3.extractAndRegisterDoor; } });
Object.defineProperty(exports, "extractArchiveTo", { enumerable: true, get: function () { return install_core_3.extractArchiveTo; } });
Object.defineProperty(exports, "findExtractedBinary", { enumerable: true, get: function () { return install_core_3.findExtractedBinary; } });
Object.defineProperty(exports, "commandClaimedByOtherArchive", { enumerable: true, get: function () { return install_core_3.commandClaimedByOtherArchive; } });
Object.defineProperty(exports, "installConsumerDoor", { enumerable: true, get: function () { return install_core_3.installConsumerDoor; } });
const fs = __importStar(require("fs"));
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const FileExplorerOverlay_1 = require("./FileExplorerOverlay");
const InfoEditorOverlay_1 = require("./InfoEditorOverlay");
const ViewManager_1 = require("./ViewManager");
const doorman_layout_1 = require("./doorman-layout");
const doorman_services_1 = require("./doorman-services");
const doc_strip_views_1 = require("./doc-strip-views");
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
// The require.cache service getters moved to doorman-services.ts when app.ts
// reached the 2000-line ceiling.
/** Adapts the local catalog service's getCatalogEntryByArchive into the
 * LocalCatalogLookup shape repoDataSource's mapManifestDoorToEntry expects
 * (consumer mode: resolving what's installed on THIS BBS is always a local
 * lookup, never something the central manifest knows). Missing service or a
 * thrown lookup error both fold into "nothing known locally" rather than
 * propagating -- a lookup failure must never abort the whole browse. */
function buildLocalCatalogLookup() {
    const svc = (0, doorman_services_1.getCatalogSvc)();
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
/** Adapts the installs repository into the InstallLookup shape
 * mapManifestDoorToEntry expects. Reads listInstalls() ONCE into a Map
 * rather than opening a sqlite connection per manifest row (was 3300 opens
 * per browse); missing repo or a thrown read both fold into "nothing known
 * locally". Keys are lower-cased -- archive_name lookups are NOCASE. */
function buildInstallLookup() {
    const repo = (0, doorman_services_1.getInstallsRepo)();
    let byArchive = null;
    try {
        byArchive = new Map((repo?.listInstalls?.() ?? []).map((row) => [String(row.archive_name).toLowerCase(), { command: row.command, install_dir: row.install_dir }]));
    }
    catch {
        byArchive = null;
    }
    return (archiveName) => byArchive?.get(archiveName.toLowerCase()) ?? null;
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
    const svc = (0, doorman_services_1.getCatalogSvc)();
    try {
        return svc?.resolveArchivePath ? svc.resolveArchivePath(archivePath) : archivePath;
    }
    catch {
        return archivePath;
    }
}
// ─── Shared Layout ───────────────────────────────────────────────────────────
// A single set of panels that all views update in-place.
// DoormanLayout moved to doorman-layout.ts when app.ts reached the 2000-line
// ceiling; imported at the bottom of the import block above.
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
        this.layout.setHeader(`{center}{${door_theme_1.T.accent}-fg}DOORMAN v2{/${door_theme_1.T.accent}-fg}  {${col}-fg}${msg}{/${col}-fg}{/center}`);
        this.layout.render();
        this.statusTimer = setTimeout(() => this.refreshHeader(), ms);
    }
    refreshHeader() {
        const ec = this.doors.filter(d => d.enabled).length;
        this.layout.setHeader(`{center}{${door_theme_1.T.accent}-fg}DOORMAN v2{/${door_theme_1.T.accent}-fg}  {${door_theme_1.T.ink}-fg}${this.doors.length} doors, ${ec} enabled{/${door_theme_1.T.ink}-fg}{/center}`);
    }
    refresh(selectIdx = 0) {
        const w = this.layout.width;
        const items = this.doors.map(d => {
            const badge = `[${(0, type_badge_1.typeBadge)(d.type)}]`;
            const sz = formatSize(d.size).padStart(6);
            const nameW = Math.max(6, w - 14);
            const name = d.name.length > nameW ? d.name.slice(0, nameW - 1) + '…' : d.name.padEnd(nameW);
            const st = d.enabled ? `{${door_theme_1.T.ok}-fg}*{/${door_theme_1.T.ok}-fg}` : `{${door_theme_1.T.alert}-fg}-{/${door_theme_1.T.alert}-fg}`;
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
        const st = d.enabled ? `{${door_theme_1.T.ok}-fg}ENABLED{/${door_theme_1.T.ok}-fg}` : `{${door_theme_1.T.alert}-fg}DISABLED{/${door_theme_1.T.alert}-fg}`;
        // FILE_ID.DIZ from the catalog when this door was installed from the
        // repo (matched by installed_as == command); falls back to description.
        // Both are raw archive text — sanitize or blessed parses the art as tags.
        let body = '';
        try {
            const cat = (0, doorman_services_1.getCatalogSvc)()?.getCatalogEntryByCmd?.(d.command);
            if (cat?.file_id_diz)
                body = '\n' + (0, ViewManager_1.sanitizeForTags)(cat.file_id_diz);
        }
        catch { /* catalog optional */ }
        if (!body && d.description)
            body = `\n{${door_theme_1.T.ink}-fg}${(0, ViewManager_1.sanitizeForTags)(d.description)}{/${door_theme_1.T.ink}-fg}`;
        this.layout.setInfo([
            `{${door_theme_1.T.warn}-fg}Name:{/${door_theme_1.T.warn}-fg}    ${d.name}`,
            `{${door_theme_1.T.warn}-fg}Command:{/${door_theme_1.T.warn}-fg} ${d.command}`,
            `{${door_theme_1.T.warn}-fg}Type:{/${door_theme_1.T.warn}-fg}    ${d.type}`,
            `{${door_theme_1.T.warn}-fg}Size:{/${door_theme_1.T.warn}-fg}    ${formatSize(d.size)}`,
            `{${door_theme_1.T.warn}-fg}Status:{/${door_theme_1.T.warn}-fg}  ${st}`,
            body,
        ].join('\n'));
    }
    updateFooter() {
        const d = this.door();
        this.layout.setFooter((0, installed_footer_1.installedFooter)(!d || d.enabled !== false));
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
        // ENTER runs the door. Bound to blessed's own 'select' event rather than
        // keys.key(['enter']): List emits 'select' for Enter itself, and a
        // separate key binding would fire alongside it.
        this.layout.doorList.on('select', this._onRun = () => this.doRun());
        this.keys.key(['tab'], () => {
            this.vm.push(new RepoView(this.layout, this.bbs));
        });
        this.keys.key(['q', 'Q'], () => this.shutdown());
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
        this.layout.doorList.off('select', this._onRun);
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
    /** Close the view. Q and a queued ENTER both end here. */
    shutdown() {
        clearTimeout(this.statusTimer);
        this.vm.destroy();
        this.layout.screen.destroy();
    }
    /** ENTER on the list. Everything but the wiring is in run-door.ts. */
    doRun() {
        (0, run_door_1.runSelectedDoor)({
            door: this.door(),
            executeCommand: (c) => this.bbs.executeCommand(c),
            setStatus: (m, col) => this.setStatus(m, col),
            teardown: () => this.shutdown(),
        });
    }
    doDelete() {
        const d = this.door();
        if (!d)
            return;
        const idx = this.layout.listSelected;
        this.vm.push(new ConfirmView(this.layout, `Delete {${door_theme_1.T.warn}-fg}${d.name}{/${door_theme_1.T.warn}-fg}?\n\n{${door_theme_1.T.alert}-fg}This cannot be undone.{/${door_theme_1.T.alert}-fg}`, 'Delete', 'Cancel', () => (0, delete_door_action_1.performDoorDelete)({
            door: d,
            selectedIndex: idx,
            bbs: this.bbs,
            setInfo: (text) => this.layout.setInfo(text),
            render: () => this.layout.render(),
            setStatus: (m, colour, ms) => this.setStatus(m, colour, ms),
            refreshRegistry: () => (0, ViewManager_1.refreshDoorRegistry)(),
            fetchDoors: () => fetchDoors(this.bbs),
            onDoorsChanged: (doors, selectIdx) => { this.doors = doors; this.refresh(selectIdx); },
            showSelectedDoor: () => { this.updateInfo(); this.updateFooter(); this.layout.render(); },
        })));
    }
    doViewDoc() {
        const d = this.door();
        if (!d)
            return;
        const svc = (0, doorman_services_1.getCatalogSvc)();
        if (!svc) {
            this.setStatus('Catalog not available', 'yellow');
            return;
        }
        try {
            const entry = svc.getCatalogEntryByCmd(d.command);
            if (entry?.doc_raw) {
                this.vm.push(new doc_strip_views_1.DocView(this.layout, entry.doc_filename ?? entry.archive_name, entry.doc_raw));
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
        const svc = (0, doorman_services_1.getCatalogSvc)();
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
            this.vm.push(new doc_strip_views_1.StripView(this.layout, entry, archivePathForStrip, liveDir, (stripped) => { if (stripped)
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
Object.defineProperty(exports, "entryHasDoc", { enumerable: true, get: function () { return repo_view_helpers_1.entryHasDoc; } });
Object.defineProperty(exports, "renderFileLines", { enumerable: true, get: function () { return repo_view_helpers_1.renderFileLines; } });
Object.defineProperty(exports, "formatSuggestedTooltypes", { enumerable: true, get: function () { return repo_view_helpers_1.formatSuggestedTooltypes; } });
const repo_view_helpers_2 = require("./repo-view-helpers");
const door_theme_1 = require("./door-theme");
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
        // Per-archive detail (GET /doors/:archiveName), consumer mode only. The
        // manifest is a list; everything the info pane, the doc viewer and the
        // archive browser want about ONE door - version, the suggested tooltypes,
        // the documentation, the file list - lives behind this endpoint.
        //
        // Cached by archive name for the life of the view: browsing back and
        // forth over the same handful of doors, or pressing V then A on one, is
        // one request per door and not one per keystroke. A cached `null` is a
        // real answer ("the repo has nothing for this archive") and stops the
        // retry loop that re-asking on every render would be.
        this.detailCache = new Map();
        this.detailInFlight = new Set();
        this.detailTimer = null;
        // False between exit() and the next enter() (the ViewManager exits this
        // view whenever a child is pushed) - an in-flight fetch that lands while
        // a ConfirmView is on screen still fills the cache, but must not repaint
        // the panels underneath it.
        this.active = false;
        this.repoUnavailable = false;
        this.layout = layout;
        this.bbs = bbs;
    }
    static typeOf(e) { return e.door_type || 'XIM'; }
    entry() { return this.visibleEntries[this.layout.listSelected] ?? null; }
    setStatus(msg, col = 'yellow', ms = 3000) {
        clearTimeout(this.statusTimer);
        this.layout.setHeader(`{center}{${door_theme_1.T.accent}-fg}DOORMAN v2  REPO{/${door_theme_1.T.accent}-fg}  {${col}-fg}${msg}{/${col}-fg}{/center}`);
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
            const svc = (0, doorman_services_1.getCatalogSvc)();
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
        const sysTag = `  {${door_theme_1.T.accent}-fg}${(0, systemFilter_1.formatSystemTag)(this.systemFilter, this.visibleEntries.length)}{/${door_theme_1.T.accent}-fg}`;
        this.layout.setHeader(`{center}{${door_theme_1.T.accent}-fg}DOORMAN v2  REPO{/${door_theme_1.T.accent}-fg}  {${door_theme_1.T.ink}-fg}${stats}${this.filter ? ' (filtered)' : ''}{/${door_theme_1.T.ink}-fg}${sysTag}{/center}`);
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
        // Owner mode AND disabled mode share loadLocalCatalogEntries.
        // buildInstallLookup() overlays door_installs (Task 5) so a fresh
        // owner-mode install still shows as installed here.
        const svc = (0, doorman_services_1.getCatalogSvc)();
        const result = (0, repoDataSource_1.loadLocalCatalogEntries)(svc, this.filter, buildInstallLookup());
        this.entries = result.entries;
        this.repoUnavailable = result.repoUnavailable;
    }
    /** Fetches + maps the central manifest once (guarded against overlapping
     * calls — enter() re-runs every time a child view like ConfirmView pops
     * back to RepoView, per ViewManager.pop()). Retries on a
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
            const lookupInstall = buildInstallLookup();
            const result = await (0, repoDataSource_1.loadConsumerCatalog)(this.repoMode.url, cacheFile, lookupLocal, repo_client_1.fetchManifest, lookupInstall);
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
                return `{${door_theme_1.T.warn}-fg}Loading central door-repo catalog...{/${door_theme_1.T.warn}-fg}`;
            if (this.consumerError) {
                return `{${door_theme_1.T.alert}-fg}Central door-repo unavailable.{/${door_theme_1.T.alert}-fg}\n\n` +
                    `{${door_theme_1.T.warn}-fg}Detail:{/${door_theme_1.T.warn}-fg} ${(0, ViewManager_1.sanitizeForTags)(this.consumerError)}\n\n` +
                    'No offline cache is available either. Check network connectivity\n' +
                    'or the DOOR_REPO_URL setting.';
            }
            return 'No entry selected.';
        }
        return this.repoUnavailable
            ? `{${door_theme_1.T.warn}-fg}Repo catalog unavailable on this system.{/${door_theme_1.T.warn}-fg}\n\n` +
                'Repo browsing/install runs from a dev checkout, where the door\n' +
                'catalog database and the archive files live. Installed doors on\n' +
                'this system are unaffected.'
            : 'No entry selected.';
    }
    /** The selected entry with whatever the detail endpoint has already told
     *  us folded in. Identical to the entry itself in owner mode, and until
     *  the fetch lands. */
    entryWithDetail(e) {
        const detail = this.detailCache.get(e.archive_name);
        return detail ? (0, repoDataSource_1.mergeDoorDetailIntoEntry)(e, detail) : e;
    }
    /** The archive's contents, from whichever source this node has: the local
     *  catalog (owner), or the already-fetched detail (consumer). */
    archiveFilesFor(e) {
        try {
            const files = (0, doorman_services_1.getCatalogSvc)()?.getArchiveFiles?.(e.id) ?? [];
            if (files.length > 0)
                return files;
        }
        catch { /* the local catalog is optional - a consumer has none */ }
        return this.detailCache.get(e.archive_name)?.files ?? [];
    }
    updateInfo() {
        const selected = this.entry();
        if (!selected) {
            this.layout.setInfo(this.noEntryMessage());
            return;
        }
        const e = this.entryWithDetail(selected);
        const fileLines = (0, repo_view_helpers_2.renderFileLines)(this.archiveFilesFor(e));
        let content = `{${door_theme_1.T.warn}-fg}${e.archive_name}{/${door_theme_1.T.warn}-fg}  ${e.door_type ?? 'XIM'}` +
            (e.version ? `  {${door_theme_1.T.ink}-fg}${(0, ViewManager_1.sanitizeForTags)(e.version)}{/${door_theme_1.T.ink}-fg}` : '') +
            (e.archive_size ? `  ${Math.round(e.archive_size / 1024)}k` : '') +
            (e.installed ? `  {${door_theme_1.T.ok}-fg}[${e.installed_as}]{/${door_theme_1.T.ok}-fg}` : '');
        if (e.file_id_diz) {
            content += '\n\n' + (0, ViewManager_1.sanitizeForTags)(e.file_id_diz);
        }
        else if (e.description) {
            content += `\n\n{${door_theme_1.T.ink}-fg}${(0, ViewManager_1.sanitizeForTags)(e.description)}{/${door_theme_1.T.ink}-fg}`;
        }
        content += fileLines;
        // What the door's author configured, as the catalog read it. Shown, not
        // applied: an install takes the archive's own icon, tooltypes and all
        // (extractAndRegisterDoor), and plenty of these rows are half-read
        // guesses from a doc file.
        const tooltypes = (0, repo_view_helpers_2.formatSuggestedTooltypes)(e.suggested_tooltypes);
        if (tooltypes.length > 0) {
            content += `\n{${door_theme_1.T.dim}-fg}─── suggested tooltypes{/${door_theme_1.T.dim}-fg}  {${door_theme_1.T.dim}-fg}──────────────────{/${door_theme_1.T.dim}-fg}\n` +
                tooltypes.map(line => `{${door_theme_1.T.dim}-fg}${(0, ViewManager_1.sanitizeForTags)(line)}{/${door_theme_1.T.dim}-fg}`).join('\n') + '\n';
        }
        this.layout.setInfo(content);
        this.scheduleDetailFetch(selected.archive_name);
    }
    /**
     * Asks the door server about the selected archive, once the cursor has
     * settled. Consumer mode only - an owner already has every one of these
     * fields in its own catalog.
     *
     * Debounced because this runs from updateInfo, which runs on every
     * 'select item': holding an arrow key down the length of a 5000-row list
     * would otherwise be one HTTP request per row. Only the archive still
     * selected when the timer fires is fetched.
     */
    scheduleDetailFetch(archiveName) {
        if (this.repoMode.kind !== 'consumer')
            return;
        if (this.detailCache.has(archiveName) || this.detailInFlight.has(archiveName))
            return;
        clearTimeout(this.detailTimer);
        this.detailTimer = setTimeout(() => {
            const current = this.entry();
            if (!current || current.archive_name !== archiveName)
                return;
            if (this.detailCache.has(archiveName) || this.detailInFlight.has(archiveName))
                return;
            this.detailInFlight.add(archiveName);
            const cfg = this.consumerClientConfig();
            void (async () => {
                let detail = null;
                try {
                    detail = await (0, repo_client_1.fetchDoorDetail)(cfg, archiveName);
                }
                finally {
                    this.detailInFlight.delete(archiveName);
                }
                this.detailCache.set(archiveName, detail);
                // Repaint only if this is still the door on screen AND this view is
                // still the one on screen - a fetch that lands under a pushed child
                // view has done its job by filling the cache.
                if (!this.active)
                    return;
                if (this.entry()?.archive_name !== archiveName)
                    return;
                this.updateInfo();
                this.updateFooter();
                this.layout.render();
            })();
        }, RepoView.DETAIL_DEBOUNCE_MS);
    }
    getEntryJunkCount(e) {
        // Prefer live file-level count over catalog's potentially stale junk_count
        try {
            const svc = (0, doorman_services_1.getCatalogSvc)();
            const files = svc?.getArchiveFiles?.(e.id) ?? [];
            if (files.length > 0)
                return files.filter((f) => f.is_junk).length;
        }
        catch { }
        return e.junk_count;
    }
    updateFooter() {
        const selected = this.entry();
        const e = selected ? this.entryWithDetail(selected) : null;
        const hasJunk = e ? this.getEntryJunkCount(e) > 0 : false;
        this.layout.setFooter((0, repo_view_helpers_2.repoViewFooterParts)(this.repoMode, {
            installed: !!e?.installed,
            hasJunk,
            hasDoc: (0, repo_view_helpers_2.entryHasDoc)(e),
        }));
    }
    enter() {
        this.active = true;
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
        clearTimeout(this.detailTimer);
        this.active = false;
        this.keys.release();
    }
    onEsc() { this.vm.pop(); } // returns to installed list
    /**
     * Redraw the list AFTER the door registry has actually reloaded.
     *
     * The uninstall used to fire `void refreshDoorRegistry()` and redraw in the
     * same tick, so the list was rebuilt from the still-cached registry and the
     * door that had just been deleted was still on it - reported as "when I
     * delete a door in doorman the list doesn't update".
     */
    async refreshAfterRegistry() {
        try {
            await (0, ViewManager_1.refreshDoorRegistry)();
        }
        finally {
            this.refresh(this.layout.listSelected);
        }
    }
    // Neither install mode can read the archive's own .info before extracting
    // it - owner mode has only a path, consumer mode has not downloaded yet -
    // so the confirmation names the fallback, and extractAndRegisterDoor's
    // existing rename applies the archive's real command afterwards and
    // reports it in the install log ("the archive installs as X, not Y").
    confirmArchiveInstall(archiveName, onConfirm) {
        const chosen = (0, archive_command_1.commandForArchive)(archiveName, null);
        this.vm.push(new ConfirmView(this.layout, `Install {${door_theme_1.T.warn}-fg}${(0, ViewManager_1.sanitizeForTags)(archiveName)}{/${door_theme_1.T.warn}-fg}?` +
            `\n\nThe archive names no command yet; using ` +
            `{${door_theme_1.T.warn}-fg}${chosen.command}{/${door_theme_1.T.warn}-fg} from the archive filename.` +
            `\nIf the archive names its own command, the install uses that` +
            `\ninstead and says so.`, 'Install', 'Cancel', () => onConfirm(chosen.command)));
    }
    doInstallUninstall() {
        const e = this.entry();
        if (!e)
            return;
        if (e.installed) {
            this.vm.push(new ConfirmView(this.layout, `Uninstall {${door_theme_1.T.warn}-fg}${e.installed_as}{/${door_theme_1.T.warn}-fg}?\n\nRemoves .info + Doors/${e.installed_as}/`, 'Uninstall', 'Cancel', () => {
                // Every path this removes is checked first and named as it goes.
                // Unguarded, this deleted the whole Doors directory on the live
                // board - install_dir is written as `Doors/${command}`, so a record
                // with no command gives `Doors/`, and a recursive force-delete of
                // that takes every door with it, DOORMAN included.
                const log = new action_log_1.ActionLog(`Uninstalling ${e.installed_as}`);
                const removed = [];
                const bbsCmdDir = path.join(PROJECT_ROOT, 'Commands', 'BBSCmd');
                const infoPath = path.join(bbsCmdDir, `${e.installed_as}.info`);
                if (fs.existsSync(infoPath)) {
                    fs.unlinkSync(infoPath);
                    removed.push(path.relative(PROJECT_ROOT, infoPath));
                    log.ok(`removed ${path.relative(PROJECT_ROOT, infoPath)}`);
                }
                else {
                    log.skip(`no ${path.relative(PROJECT_ROOT, infoPath)} to remove`);
                }
                const decision = (0, safe_install_dir_1.resolveDoorInstallDir)(PROJECT_ROOT, e.install_dir);
                if ((0, safe_install_dir_1.isSafeToDelete)(decision)) {
                    if (fs.existsSync(decision.path)) {
                        fs.rmSync(decision.path, { recursive: true, force: true });
                        removed.push(path.relative(PROJECT_ROOT, decision.path) + '/');
                        log.ok(`removed ${path.relative(PROJECT_ROOT, decision.path)}/`);
                    }
                    else {
                        log.skip(`${path.relative(PROJECT_ROOT, decision.path)}/ was not there`);
                    }
                }
                else {
                    // Refuse and say so. Leaving a directory behind is recoverable;
                    // deleting the wrong one is not.
                    log.fail(`kept the files: ${decision.reason}`);
                    this.setStatus(`Kept the files: ${decision.reason}`, 'yellow', 8000);
                    this.layout.setInfo(log.render());
                    this.layout.render();
                    (0, doorman_services_1.getInstallsRepo)()?.removeInstall(e.installed_as ?? e.archive_name);
                    (0, doorman_services_1.clearInstalledFilesViaRecorder)(e.installed_as);
                    void this.refreshAfterRegistry();
                    return;
                }
                // door_installs (Task 5) is keyed by command -- installed_as is
                // the command this door was installed as; archive_name is only a
                // fallback for a stale row where installed_as was never set.
                (0, doorman_services_1.getInstallsRepo)()?.removeInstall(e.installed_as ?? e.archive_name);
                // door_installed_files (this branch's fix) is keyed by command
                // only -- there is nothing to clear against a bare archive_name.
                (0, doorman_services_1.clearInstalledFilesViaRecorder)(e.installed_as);
                log.ok('dropped the install record');
                this.setStatus(`Uninstalled ${e.installed_as}: ${log.summary()}`, 'green', 6000);
                this.layout.setInfo(log.render());
                this.layout.render();
                void this.refreshAfterRegistry();
            }));
        }
        else if (this.repoMode.kind === 'consumer') {
            // Consumer mode: no local archive to pre-check (it may never have
            // touched this disk before) — the download itself is the existence
            // check, and any failure surfaces from inside installConsumerDoor's
            // async callback below via the same reportInstallFailure panel.
            const repoUrl = this.repoMode.url;
            this.confirmArchiveInstall(e.archive_name, (finalCmd) => {
                if (this.installing)
                    return; // an install is already in flight
                this.installing = true;
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
                        const outcome = await (0, install_core_2.installConsumerDoor)(cfg, e.archive_name, e.door_type, e.binary_name, finalCmd, installDir, infoPath, tmpDir, {
                            fetchManifest: repo_client_1.fetchManifest,
                            downloadArchive: repo_client_1.downloadArchive,
                            extractArchiveTo: install_core_1.extractArchiveTo,
                            findExtractedBinary: install_core_1.findExtractedBinary,
                            writeInfoFile: (p, c) => fs.writeFileSync(p, c, 'latin1'),
                            lookupLocal: buildLocalCatalogLookup(),
                            getInstallByCommand: (command) => (0, doorman_services_1.getInstallsRepo)()?.getInstallByCommand(command) ?? null,
                            recordInstall: doorman_services_1.recordInstallViaRecorder,
                            refreshDoorRegistry: ViewManager_1.refreshDoorRegistry,
                            mkdir: (dir) => fs.mkdirSync(dir, { recursive: true }),
                            unlink: (p) => { try {
                                fs.unlinkSync(p);
                            }
                            catch { /* never existed, or already removed */ } },
                            fetchDoorDetail: repo_client_1.fetchDoorDetail,
                        });
                        if (!outcome.ok) {
                            this.reportInstallFailure(outcome.step, outcome.detail, tmpArchivePath, e.archive_name);
                            return;
                        }
                        this.setStatus(`Installed as ${finalCmd} (${outcome.fileCount} files, ${outcome.doorType})`, 'green', 4000);
                        this.layout.setInfo((0, action_log_1.installLogPanel)(`Installed ${finalCmd}`, outcome.steps) + '\n\n' +
                            `{${door_theme_1.T.ok}-fg}Installed{/${door_theme_1.T.ok}-fg}\n\n` +
                            `{${door_theme_1.T.warn}-fg}Command:{/${door_theme_1.T.warn}-fg} ${finalCmd}\n` +
                            `{${door_theme_1.T.warn}-fg}Type:{/${door_theme_1.T.warn}-fg} ${outcome.doorType}\n` +
                            `{${door_theme_1.T.warn}-fg}Files:{/${door_theme_1.T.warn}-fg} ${outcome.fileCount}\n` +
                            `{${door_theme_1.T.warn}-fg}Binary:{/${door_theme_1.T.warn}-fg} ${(0, ViewManager_1.sanitizeForTags)(outcome.binaryRel)}\n` +
                            (outcome.registeredLocally
                                ? ''
                                : `\n{${door_theme_1.T.warn}-fg}Note:{/${door_theme_1.T.warn}-fg} registry-only — a local catalog id collision\n` +
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
            });
        }
        else {
            const resolvedArchive = resolveArchivePath(e.archive_path);
            if (!resolvedArchive || !fs.existsSync(resolvedArchive)) {
                const detail = `archive_path=${e.archive_path ?? '(none)'} resolved=${resolvedArchive ?? '(none)'}`;
                console.log(`[DOORMAN] install failed: resolve-archive: ${detail}`);
                this.setStatus(`Archive not on server`, 'yellow', 8000);
                this.layout.setInfo(`{${door_theme_1.T.warn}-fg}Archive not on server{/${door_theme_1.T.warn}-fg}\n\n` +
                    `{${door_theme_1.T.warn}-fg}Catalog path:{/${door_theme_1.T.warn}-fg} ${(0, ViewManager_1.sanitizeForTags)(e.archive_path ?? '(none)')}\n` +
                    `{${door_theme_1.T.warn}-fg}Resolved to:{/${door_theme_1.T.warn}-fg} ${(0, ViewManager_1.sanitizeForTags)(resolvedArchive ?? '(unresolvable)')}\n`);
                this.layout.render();
                return;
            }
            this.confirmArchiveInstall(e.archive_name, (finalCmd) => {
                if (this.installing)
                    return; // an install is already in flight
                this.installing = true;
                const installDir = path.join(PROJECT_ROOT, 'Doors', finalCmd);
                fs.mkdirSync(installDir, { recursive: true });
                this.setStatus('Installing…', 'yellow', 30000);
                const bbsCmdDir = path.join(PROJECT_ROOT, 'Commands', 'BBSCmd');
                const infoPath = path.join(bbsCmdDir, `${finalCmd}.info`);
                void (async () => {
                    try {
                        const outcome = await (0, install_core_1.extractAndRegisterDoor)(resolvedArchive, installDir, infoPath, e.door_type, e.binary_name, finalCmd, {
                            extractArchiveTo: install_core_1.extractArchiveTo,
                            findExtractedBinary: install_core_1.findExtractedBinary,
                            writeInfoFile: (p, c) => fs.writeFileSync(p, c, 'latin1'),
                            // Same door_installs shape + collision guard as consumer
                            // mode, using the real local catalog row's id (e.id).
                            recordInstall: (installedCmd, installedDir, archive) => {
                                // The archive's own command wins, so record that one.
                                const chk = (cmd) => (0, doorman_services_1.getInstallsRepo)()?.getInstallByCommand(cmd) ?? null;
                                if ((0, install_core_2.commandClaimedByOtherArchive)(chk, installedCmd, archive))
                                    return;
                                (0, doorman_services_1.recordInstallViaRecorder)({
                                    id: `install-${installedCmd}`,
                                    catalog_id: e.id ?? null,
                                    archive_name: archive,
                                    command: installedCmd,
                                    install_dir: installedDir,
                                    door_type: e.door_type ?? null,
                                    name: e.name ?? null,
                                    md5: null,
                                    description: e.description ?? null,
                                    category: e.category ?? null,
                                    version: e.version ?? null,
                                    release_group: e.release_group ?? null,
                                    source_url: null, // resolved from this BBS's own local archive corpus, not the central repo
                                    source_revision: null,
                                });
                            },
                            refreshDoorRegistry: ViewManager_1.refreshDoorRegistry,
                        }, e.archive_name);
                        if (!outcome.ok) {
                            this.reportInstallFailure(outcome.step, outcome.detail, resolvedArchive, e.archive_name);
                            return;
                        }
                        this.setStatus(`Installed as ${finalCmd} (${outcome.fileCount} files, ${outcome.doorType})`, 'green', 4000);
                        this.layout.setInfo((0, action_log_1.installLogPanel)(`Installed ${finalCmd}`, outcome.steps) + '\n\n' +
                            `{${door_theme_1.T.ok}-fg}Installed{/${door_theme_1.T.ok}-fg}\n\n` +
                            `{${door_theme_1.T.warn}-fg}Command:{/${door_theme_1.T.warn}-fg} ${finalCmd}\n` +
                            `{${door_theme_1.T.warn}-fg}Type:{/${door_theme_1.T.warn}-fg} ${outcome.doorType}\n` +
                            `{${door_theme_1.T.warn}-fg}Files:{/${door_theme_1.T.warn}-fg} ${outcome.fileCount}\n` +
                            `{${door_theme_1.T.warn}-fg}Binary:{/${door_theme_1.T.warn}-fg} ${(0, ViewManager_1.sanitizeForTags)(outcome.binaryRel)}\n`);
                        this.refresh(this.layout.listSelected);
                    }
                    catch (err) {
                        this.reportInstallFailure('install', err?.message ?? String(err), resolvedArchive, e.archive_name);
                    }
                    finally {
                        this.installing = false;
                    }
                })();
            });
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
        this.layout.setInfo(`{${door_theme_1.T.alert}-fg}Install failed{/${door_theme_1.T.alert}-fg}\n\n` +
            `{${door_theme_1.T.warn}-fg}Step:{/${door_theme_1.T.warn}-fg} ${(0, ViewManager_1.sanitizeForTags)(step)}\n` +
            `{${door_theme_1.T.warn}-fg}Detail:{/${door_theme_1.T.warn}-fg} ${(0, ViewManager_1.sanitizeForTags)(detail)}\n` +
            `{${door_theme_1.T.warn}-fg}Archive:{/${door_theme_1.T.warn}-fg} ${(0, ViewManager_1.sanitizeForTags)(archiveName)}\n` +
            `{${door_theme_1.T.warn}-fg}Path:{/${door_theme_1.T.warn}-fg} ${(0, ViewManager_1.sanitizeForTags)(archivePath)}\n`);
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
        this.vm.push(new doc_strip_views_1.StripView(this.layout, e, hasArchive ? resolvedArchive : null, installDir ?? undefined, (stripped) => { if (stripped) {
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
        const svc = (0, doorman_services_1.getCatalogSvc)();
        if (!svc?.deleteCatalogEntry) {
            this.setStatus('Catalog service not available', 'yellow');
            return;
        }
        this.vm.push(new ConfirmView(this.layout, `Delete {${door_theme_1.T.warn}-fg}${e.archive_name}{/${door_theme_1.T.warn}-fg} from the repository?\n\n` +
            `This removes the catalog entry AND the archive file.\n` +
            `It cannot be undone.` +
            (e.installed ? `\n\n{${door_theme_1.T.ok}-fg}${e.installed_as}{/${door_theme_1.T.ok}-fg} stays installed and keeps working.` : ''), 'Delete', 'Cancel', () => {
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
    /**
     * The detail this view already holds for an archive, fetching it once if
     * it does not. Consumer mode only; an owner reads its own catalog.
     *
     * Every per-archive action shares this one cache, so pressing [V] then
     * [A] on the same door is one request, not two - and the row the info
     * pane already fetched costs neither.
     */
    async ensureDetail(archiveName) {
        if (this.detailCache.has(archiveName))
            return this.detailCache.get(archiveName) ?? null;
        if (this.repoMode.kind !== 'consumer')
            return null;
        this.detailInFlight.add(archiveName);
        let detail = null;
        try {
            detail = await (0, repo_client_1.fetchDoorDetail)(this.consumerClientConfig(), archiveName);
        }
        finally {
            this.detailInFlight.delete(archiveName);
        }
        this.detailCache.set(archiveName, detail);
        return detail;
    }
    /**
     * Documentation comes from wherever this BBS's catalog actually is.
     *
     * An owner has it locally, in the entry's own doc_raw. A consumer does not
     * - the catalog lives on the door server - so it asks the server, which
     * has answered at /api/door-repo/doors/:archiveName all along. Before
     * this, [V]iew doc on a consumer did nothing at all.
     */
    doViewDoc() {
        const selected = this.entry();
        if (!selected)
            return;
        const e = this.entryWithDetail(selected);
        if (e.doc_raw) {
            this.vm.push(new doc_strip_views_1.DocView(this.layout, e.doc_filename ?? e.archive_name, e.doc_raw));
            return;
        }
        if (this.repoMode.kind !== 'consumer') {
            this.setStatus('No documentation available', 'yellow');
            return;
        }
        this.setStatus('Fetching documentation...', 'yellow', 15000);
        void (async () => {
            const detail = await this.ensureDetail(e.archive_name);
            if (!detail?.doc) {
                this.setStatus('No documentation available', 'yellow', 4000);
                return;
            }
            this.vm.push(new doc_strip_views_1.DocView(this.layout, detail.docFilename ?? e.archive_name, detail.doc));
        })();
    }
    /** The archive's contents, from the local catalog or from the server. */
    doBrowseArchive() {
        const e = this.entry();
        if (!e)
            return;
        const svc = (0, doorman_services_1.getCatalogSvc)();
        if (svc?.getArchiveFiles) {
            let files = [];
            try {
                files = svc.getArchiveFiles(e.id);
            }
            catch {
                files = [];
            }
            if (files.length) {
                this.vm.push(new archive_browse_view_1.ArchiveBrowseView(this.layout, e.archive_name, files));
                return;
            }
        }
        if (this.repoMode.kind !== 'consumer') {
            this.setStatus('No file data in catalog', 'yellow');
            return;
        }
        this.setStatus('Fetching file list...', 'yellow', 15000);
        void (async () => {
            const detail = await this.ensureDetail(e.archive_name);
            if (!detail || detail.files.length === 0) {
                this.setStatus('The repo has no file list for this archive', 'yellow', 4000);
                return;
            }
            // ArchiveBrowseView reads the catalog's own column names.
            this.vm.push(new archive_browse_view_1.ArchiveBrowseView(this.layout, e.archive_name, detail.files.map(f => ({ path: f.path, size: f.size, is_junk: f.isJunk ? 1 : 0 }))));
        })();
    }
    /** The repo client config for this node's consumer mode. */
    consumerClientConfig() {
        return {
            url: this.repoMode.url,
            cacheFile: (0, repoDataSource_1.consumerCacheFilePath)(PROJECT_ROOT),
        };
    }
}
RepoView.DETAIL_DEBOUNCE_MS = 350;
// DocView and StripView moved to doc-strip-views.ts when app.ts reached the
// 2000-line ceiling.
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
            confirmColor: 'red', cancelColor: 'green', style: { border: { fg: door_theme_1.T.warn } },
            onConfirm: () => { this.onConfirm(); this.vm.pop(); },
            onCancel: () => this.vm.pop(),
        }).display();
    }
    exit() { this.keys.release(); }
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
    (0, door_theme_1.applyTheme)(bbs); // colours all ten modules; see door-theme.ts
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
    const layout = new doorman_layout_1.DoormanLayout(screen, nodeId);
    const vm = new ViewManager_1.ViewManager(screen);
    // Hide cursor after every render — blessed re-shows it on each refresh.
    // This is the only reliable way since blessed ignores external cursor state.
    screen.on('render', () => { bbs.write('\x1b[?25l'); });
    screen.on('resize', () => { screen.render(); });
    screen.on('destroy', () => {
        // Stop the masthead before anything else: a timer writing to a
        // destroyed screen is how a door takes the session with it.
        if (layout.stopMasthead) {
            try {
                layout.stopMasthead();
            }
            catch { /* leaving anyway */ }
            layout.stopMasthead = null;
        }
        inputManager.disable();
        bbs.write('\x1b[?25h');
    });
    vm.push(new InstalledView(layout, bbs, doors));
    await new Promise(resolve => { screen.on('destroy', resolve); });
}
//# sourceMappingURL=app.js.map