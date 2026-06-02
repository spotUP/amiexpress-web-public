"use strict";
/**
 * DOORMAN v2 - SysOp Door Management Tool
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
exports.createApp = createApp;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const FileExplorerOverlay_1 = require("./FileExplorerOverlay");
const InfoEditorOverlay_1 = require("./InfoEditorOverlay");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const LHA_BIN = [
    '/usr/bin/lha', // Alpine lhasa package
    '/usr/local/bin/lha',
    '/opt/homebrew/bin/lha',
    '/app/data/bbs/tools/bin/lha',
].find(p => fs.existsSync(p)) ?? 'lha';
// __dirname = Doors/door-manager/dist/ → ../../.. = BBS root (data/bbs/ on server, project root locally)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
function fromCache(marker) {
    // The BBS server has already loaded this module via tsx. Retrieve it from
    // the shared require cache rather than re-transpiling the .ts source.
    for (const key of Object.keys(require.cache)) {
        if (key.includes(marker))
            return require.cache[key]?.exports ?? null;
    }
    return null;
}
function getCatalogSvc() { return fromCache('door-catalog.service'); }
function getStripLib() { return fromCache('ami-stripper.lib'); }
const HEADER_PREFIX = `{center}{cyan-fg}DOORMAN v2{/cyan-fg}  {white-fg}Spot/Up Rough{/white-fg}`;
// --- helpers -----------------------------------------------------------------
function formatSize(bytes) {
    if (bytes === 0)
        return '  0 B ';
    if (bytes < 1024)
        return `${bytes} B`.padStart(6);
    if (bytes < 1024 * 1024)
        return `${Math.round(bytes / 1024)} KB`.padStart(6);
    return `${Math.round(bytes / (1024 * 1024))} MB`.padStart(6);
}
function typeBadge(type) {
    const map = {
        'TS': 'TS', 'typescript': 'TS', 'SDK': 'TS',
        'XIM': '68', 'SIM': 'SI', 'TIM': 'TI',
        'AMI': '68', 'amiga': '68',
    };
    return map[type] || '??';
}
function formatListItem(door, width) {
    const badge = `[${typeBadge(door.type)}]`;
    const status = door.enabled ? '{green-fg}*{/green-fg}' : '{red-fg}-{/red-fg}';
    const sz = formatSize(door.size);
    const nameWidth = Math.max(10, width - 18);
    const name = door.name.length > nameWidth
        ? door.name.slice(0, nameWidth - 1) + '...'
        : door.name.padEnd(nameWidth);
    return `${badge} ${name} ${status} ${sz}`;
}
function dizFirstLine(entry) {
    if (!entry.file_id_diz)
        return '';
    for (const line of entry.file_id_diz.split('\n')) {
        const clean = line.replace(/[^\x20-\x7E]/g, '').trim();
        if (clean.length > 3)
            return clean;
    }
    return '';
}
function formatCatalogItem(entry, width) {
    const sz = entry.archive_size ? `${Math.round(entry.archive_size / 1024)}k` : '?';
    const nameWidth = Math.max(4, width - sz.length - 1);
    const archiveName = (entry.installed ? '*' : '') + entry.archive_name;
    const name = archiveName.length > nameWidth ? archiveName.slice(0, nameWidth) : archiveName.padEnd(nameWidth);
    const line = `${name} ${sz}`;
    return line;
}
async function fetchDoors(bbs) {
    if (!bbs.getDoorList)
        return [];
    const raw = await bbs.getDoorList();
    return raw.map((d) => ({
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
function buildInfoContent(door) {
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
function escapeTags(s) {
    return s.replace(/[^\x20-\x7E]/g, '').replace(/[{}]/g, '\\$&');
}
function buildCatalogInfoContent(entry) {
    const meta = [];
    meta.push(`{yellow-fg}${entry.archive_name}{/yellow-fg}  ${entry.door_type ?? 'XIM'}  ${entry.archive_size ? Math.round(entry.archive_size / 1024) + 'k' : ''}${entry.installed ? `  {green-fg}[${entry.installed_as}]{/green-fg}` : ''}${entry.junk_count > 0 ? `  {red-fg}${entry.junk_count} ad files{/red-fg}` : ''}`);
    if (entry.file_id_diz) {
        meta.push('');
        meta.push(...entry.file_id_diz.split('\n').map(escapeTags));
    }
    else {
        meta.push('', '{grey-fg}(no FILE_ID.DIZ){/grey-fg}');
    }
    return meta.join('\n');
}
// --- main --------------------------------------------------------------------
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
    // --- state -----------------------------------------------------------------
    let mode = 'installed';
    let catalogEntries = [];
    let catalogFilter = '';
    // Strip selector overlay state
    let stripOverlayActive = false;
    let _stripConfirm = null;
    let _stripCancel = null;
    // Generic overlay depth — ESC is blocked when > 0 so modals can handle it
    let overlayDepth = 0;
    function pushOverlay() { overlayDepth++; }
    function popOverlay() { overlayDepth = Math.max(0, overlayDepth - 1); }
    // --- screen ----------------------------------------------------------------
    const screen = new blessed_1.Screen({
        smartCSR: true,
        fullUnicode: true,
        title: 'DOORMAN v2',
        output: (data) => bbs.write(data),
    });
    const inputManager = new blessed_helpers_1.DoorInputManager(session, screen, {
        enableGameMode: false,
        enableGrabKeys: false,
        enableMouse: true,
    });
    inputManager.enable();
    const nodeId = session.bbsSession?.nodeId ?? '?';
    // --- layout ----------------------------------------------------------------
    const header = new blessed_1.Panel({
        parent: screen,
        top: 0, left: 0, width: '100%', height: 3,
        tags: true,
        content: '',
        style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
        focusable: false,
    });
    const footer = new blessed_1.Panel({
        parent: screen,
        bottom: 0, left: 0, width: '100%', height: 3,
        tags: true,
        content: '',
        style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
        focusable: false,
    });
    const listPanel = new blessed_1.Panel({
        parent: screen,
        top: 3, left: 0, width: '35%', height: '100%-6',
        label: ' INSTALLED DOORS ',
        tags: true,
        style: { border: { fg: 'cyan' } },
        focusable: false,
    });
    const doorList = new blessed_1.List({
        parent: listPanel,
        top: 1, left: 1, width: '100%-2', height: '100%-2',
        keys: true, vi: false, mouse: true,
        scrollable: true, alwaysScroll: true,
        tags: true,
        wrapItems: false,
        scrollbar: { ch: ' ', style: { bg: 'blue' } },
        style: {
            selected: { bg: 'blue', fg: 'white' },
            item: { fg: 'white' },
        },
    });
    const infoPanel = new blessed_1.Panel({
        parent: screen,
        top: 3, left: '35%', width: '65%', height: '100%-6',
        label: ' DOOR INFO ',
        tags: true,
        style: { border: { fg: 'blue' } },
        focusable: false,
    });
    const infoBox = new blessed_1.ScrollableBox({
        parent: infoPanel,
        top: 1, left: 1, width: '100%-2', height: '100%-2',
        tags: true, scrollable: true, keys: true,
        style: { fg: 'white' },
    });
    let statusTimer = null;
    // --- helpers ---------------------------------------------------------------
    function getListWidth() {
        return Math.floor(screen.width * 0.35) - 8; // borders(4) + selection marker(2) + scrollbar(1) + slack(1)
    }
    function selectedDoor() {
        if (mode !== 'installed')
            return null;
        const idx = doorList.selected ?? 0;
        return doors[idx] ?? null;
    }
    function selectedCatalogEntry() {
        if (mode !== 'repo')
            return null;
        const idx = doorList.selected ?? 0;
        return catalogEntries[idx] ?? null;
    }
    function refreshHeader() {
        if (mode === 'installed') {
            const ec = doors.filter(d => d.enabled).length;
            header.setContent(HEADER_PREFIX +
                `  * ${doors.length} doors  * ${ec} enabled  * Node ${nodeId}{/center}`);
        }
        else {
            const svc = getCatalogSvc();
            let statsStr = '';
            try {
                if (svc) {
                    const st = svc.catalogStats();
                    statsStr = `  * ${st.total} in repo  * ${st.installed} installed`;
                }
            }
            catch { /* catalog not built */ }
            const filterStr = catalogFilter ? `  * filter: ${catalogFilter}` : '';
            header.setContent(HEADER_PREFIX +
                `${statsStr}${filterStr}  * Node ${nodeId}{/center}`);
        }
    }
    function setStatus(msg, color = 'yellow', durationMs = 3000) {
        header.setContent(HEADER_PREFIX + `  {${color}-fg}${msg}{/${color}-fg}{/center}`);
        screen.render();
        if (statusTimer)
            clearTimeout(statusTimer);
        statusTimer = setTimeout(() => { refreshHeader(); screen.render(); }, durationMs);
    }
    function updateFooter() {
        if (mode === 'installed') {
            const door = selectedDoor();
            const en = (!door || door.enabled) ? 'Dis' : 'En';
            footer.setContent(`{center}{yellow-fg}U{/yellow-fg}pload {yellow-fg}I{/yellow-fg}nfo {yellow-fg}F{/yellow-fg}iles {yellow-fg}D{/yellow-fg}el {yellow-fg}E{/yellow-fg}=${en} {yellow-fg}S{/yellow-fg}trip {yellow-fg}T{/yellow-fg}ab=Repo {yellow-fg}Q{/yellow-fg}uit{/center}`);
        }
        else {
            const entry = selectedCatalogEntry();
            const inst = entry?.installed ? 'Uninst' : 'Inst';
            footer.setContent(`{center}{yellow-fg}R{/yellow-fg}=${inst} {yellow-fg}S{/yellow-fg}trip {yellow-fg}D{/yellow-fg}oc {yellow-fg}/{/yellow-fg}Filter {yellow-fg}T{/yellow-fg}ab=List {yellow-fg}Q{/yellow-fg}uit{/center}`);
        }
    }
    function populateInstalledList(selectIndex = 0) {
        const items = doors.map(d => formatListItem(d, getListWidth()));
        doorList.setItems(items);
        if (doors.length > 0)
            doorList.select(Math.min(selectIndex, doors.length - 1));
        listPanel.setLabel(' INSTALLED DOORS ');
        screen.render();
    }
    function loadCatalog() {
        const svc = getCatalogSvc();
        if (!svc) {
            catalogEntries = [];
            return;
        }
        try {
            catalogEntries = svc.searchCatalog(catalogFilter);
        }
        catch {
            catalogEntries = [];
        }
    }
    function populateCatalogList(selectIndex = 0) {
        loadCatalog();
        const items = catalogEntries.map(e => formatCatalogItem(e, getListWidth()));
        doorList.setItems(items);
        if (catalogEntries.length > 0)
            doorList.select(Math.min(selectIndex, catalogEntries.length - 1));
        const label = catalogFilter ? ` REPO (${catalogEntries.length} results) ` : ` REPO (${catalogEntries.length} doors) `;
        listPanel.setLabel(label);
        screen.render();
    }
    function updateInfoPane() {
        if (stripOverlayActive)
            return;
        if (mode === 'installed') {
            const door = selectedDoor();
            if (!door) {
                infoBox.setContent('No door selected.');
                return;
            }
            infoBox.setContent(buildInfoContent(door));
        }
        else {
            const entry = selectedCatalogEntry();
            if (!entry) {
                infoBox.setContent('No entry selected.');
                return;
            }
            infoBox.setContent(buildCatalogInfoContent(entry));
        }
        screen.render();
    }
    function applyResponsive() {
        const w = screen.width;
        if (w < 70) {
            infoPanel.hide();
            listPanel.width = '100%';
        }
        else {
            infoPanel.show();
            listPanel.width = '35%';
        }
        if (mode === 'installed')
            populateInstalledList(doorList.selected ?? 0);
        else
            populateCatalogList(doorList.selected ?? 0);
    }
    // --- initial render --------------------------------------------------------
    refreshHeader();
    populateInstalledList(0);
    updateInfoPane();
    updateFooter();
    applyResponsive();
    doorList.focus();
    screen.on('resize', () => { applyResponsive(); screen.render(); });
    doorList.on('select item', () => { updateInfoPane(); updateFooter(); });
    // --- catalog operations ----------------------------------------------------
    function showDocViewer(title, content, onDone) {
        pushOverlay();
        const { Panel, ScrollableBox } = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');
        const panel = new Panel({
            parent: screen, top: 0, left: 0, width: '100%', height: '100%-3',
            label: ` ${title} `, tags: true,
            style: { border: { fg: 'cyan' } },
        });
        const box = new ScrollableBox({
            parent: panel, top: 1, left: 1, width: '100%-2', height: '100%-2',
            tags: false, scrollable: true, keys: true, alwaysScroll: true,
            style: { fg: 'white' },
            content: content.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, ''),
        });
        const hint = new Panel({
            parent: screen, bottom: 0, left: 0, width: '100%', height: 3,
            tags: true, content: '{center}[ESC/Q] Close  [↑/↓] Scroll{/center}',
            style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
        });
        box.focus();
        screen.render();
        function closeDoc() {
            popOverlay();
            panel.destroy();
            hint.destroy();
            onDone();
            screen.render();
        }
        screen.key(['escape', 'q', 'Q'], closeDoc);
    }
    function installFromCatalog(entry) {
        if (!entry.archive_path || !fs.existsSync(entry.archive_path)) {
            setStatus(`Archive not found: ${entry.archive_name}`, 'red');
            return;
        }
        const suggested = (entry.installed_as ?? entry.binary_name ?? entry.name ?? 'DOOR')
            .toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 12);
        pushOverlay();
        const prompt = new blessed_1.Prompt({
            parent: screen,
            top: 'center', left: 'center', width: 50, height: 7,
            tags: true,
            style: { border: { fg: 'yellow' } },
            overlay: true,
        });
        prompt.showInput(`{yellow-fg}Install as BBS command:{/yellow-fg}`, suggested, (_err, cmd) => {
            popOverlay();
            prompt.destroy();
            const finalCmd = (cmd ?? '').trim().toUpperCase() || suggested;
            const installDir = path.join(PROJECT_ROOT, 'Doors', finalCmd);
            const bbsCmdDir = path.join(PROJECT_ROOT, 'Commands', 'BBSCmd');
            setStatus(`Extracting ${entry.archive_name}...`);
            fs.mkdirSync(installDir, { recursive: true });
            const result = (0, child_process_1.spawnSync)(LHA_BIN, [`xw=${installDir}`, entry.archive_path], { timeout: 30000 });
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
                try {
                    svc.markInstalled(entry.id, finalCmd, `Doors/${finalCmd}`);
                }
                catch { /* ignore */ }
            }
            setStatus(`Installed as ${finalCmd}`, 'green', 4000);
            const idx = doorList.selected ?? 0;
            populateCatalogList(idx);
            updateInfoPane();
            updateFooter();
            doorList.focus();
        });
        screen.render();
    }
    function uninstallFromCatalog(entry) {
        pushOverlay();
        new blessed_1.ConfirmModal({
            parent: screen,
            title: ' Uninstall Door ',
            content: `Uninstall {yellow-fg}${entry.installed_as}{/yellow-fg}?\n\nThis removes the .info file and Doors/${entry.installed_as} directory.`,
            confirmText: 'Uninstall',
            cancelText: 'Cancel',
            confirmColor: 'red',
            cancelColor: 'green',
            style: { border: { fg: 'red' } },
            onConfirm: async () => {
                popOverlay();
                const bbsCmdDir = path.join(PROJECT_ROOT, 'Commands', 'BBSCmd');
                const infoPath = path.join(bbsCmdDir, `${entry.installed_as}.info`);
                if (fs.existsSync(infoPath))
                    fs.unlinkSync(infoPath);
                if (entry.install_dir) {
                    const abs = path.join(PROJECT_ROOT, entry.install_dir);
                    if (fs.existsSync(abs))
                        fs.rmSync(abs, { recursive: true, force: true });
                }
                const svc = getCatalogSvc();
                if (svc) {
                    try {
                        svc.markUninstalled(entry.id);
                    }
                    catch { /* ignore */ }
                }
                setStatus(`Uninstalled ${entry.installed_as}`, 'green', 4000);
                const idx = doorList.selected ?? 0;
                populateCatalogList(idx);
                updateInfoPane();
                updateFooter();
                doorList.focus();
            },
            onCancel: () => { popOverlay(); doorList.focus(); screen.render(); },
        }).display();
    }
    function showStripSelector(entry, stripped, reasons, onConfirm, onCancel) {
        stripOverlayActive = true;
        const checked = new Array(stripped.length).fill(true);
        const origListLabel = listPanel.options?.label ?? ' INSTALLED DOORS ';
        listPanel.setLabel(` ${entry.archive_name} — deselect false positives `);
        function renderFiles() {
            const items = stripped.map((f, i) => {
                const box = checked[i] ? '[X]' : '[ ]';
                const name = f.path.length > 24
                    ? '<' + f.path.slice(f.path.length - 23)
                    : f.path.padEnd(24);
                return `${box} ${name}`;
            });
            doorList.setItems(items);
            const sel = doorList.selected ?? 0;
            const selFile = stripped[sel];
            const selCount = checked.filter(Boolean).length;
            infoBox.setContent(`{yellow-fg}${selCount} of ${stripped.length} files selected to strip{/yellow-fg}\n\n` +
                (selFile ? `{cyan-fg}${selFile.path}{/cyan-fg}\nReason: ${reasons[selFile.path] ?? '?'}\n` : '') +
                '\n{grey-fg}[Space] Toggle  [A] All  [N] None\n[S] Strip selected  [Esc] Cancel{/grey-fg}');
            screen.render();
        }
        function exitOverlay() {
            stripOverlayActive = false;
            _stripConfirm = null;
            _stripCancel = null;
            listPanel.setLabel(origListLabel);
            if (mode === 'repo')
                populateCatalogList(doorList.selected ?? 0);
            else
                populateInstalledList(doorList.selected ?? 0);
            updateInfoPane();
            doorList.focus();
        }
        _stripConfirm = () => {
            const preserve = new Set(stripped.filter((_, i) => !checked[i]).map((f) => f.path));
            exitOverlay();
            onConfirm(preserve);
        };
        _stripCancel = () => { exitOverlay(); onCancel(); };
        // Space to toggle
        const spaceKey = () => {
            if (!stripOverlayActive)
                return;
            const idx = doorList.selected ?? 0;
            if (idx < checked.length) {
                checked[idx] = !checked[idx];
                renderFiles();
            }
        };
        const allKey = () => { if (!stripOverlayActive)
            return; checked.fill(true); renderFiles(); };
        const noneKey = () => { if (!stripOverlayActive)
            return; checked.fill(false); renderFiles(); };
        screen.key([' ', 'space', '\r', '\n'], spaceKey);
        screen.key(['a', 'A'], allKey);
        screen.key(['n', 'N'], noneKey);
        doorList.once('destroy', () => {
            screen.unkey([' ', 'space', '\r', '\n'], spaceKey);
            screen.unkey(['a', 'A'], allKey);
            screen.unkey(['n', 'N'], noneKey);
        });
        renderFiles();
        doorList.focus();
    }
    function discoverDoorDir(archiveName) {
        const base = archiveName.replace(/\.(lha|lzx|lzh)$/i, '');
        const doorsDir = path.join(PROJECT_ROOT, 'Doors');
        if (!fs.existsSync(doorsDir))
            return null;
        try {
            const match = fs.readdirSync(doorsDir).find(e => e.toLowerCase() === base.toLowerCase() && fs.statSync(path.join(doorsDir, e)).isDirectory());
            return match ? path.join(doorsDir, match) : null;
        }
        catch {
            return null;
        }
    }
    async function stripAds(entry, onDone, overrideDir) {
        const lib = getStripLib();
        if (!lib) {
            setStatus('Stripper library not available', 'red');
            onDone();
            return;
        }
        const hasArchive = !!(entry.archive_path && fs.existsSync(entry.archive_path));
        const candidateDirs = [
            overrideDir ?? null,
            entry.install_dir ? path.join(PROJECT_ROOT, entry.install_dir) : null,
            entry.installed_as ? path.join(PROJECT_ROOT, 'Doors', entry.installed_as) : null,
            discoverDoorDir(entry.archive_name),
        ].filter((d) => !!(d && fs.existsSync(d)));
        const installDirAbs = candidateDirs[0] ?? null;
        const hasDir = !!installDirAbs;
        if (!hasArchive && !hasDir) {
            setStatus(`${entry.archive_name}: not installed on this server`, 'yellow');
            onDone();
            return;
        }
        setStatus('Analyzing for ad files...');
        let result;
        try {
            result = hasArchive
                ? await lib.analyzeArchive(entry.archive_path)
                : await lib.analyzeDirectory(installDirAbs);
        }
        catch (err) {
            setStatus(`Analysis failed: ${err.message}`, 'red');
            onDone();
            return;
        }
        if (result.stripped.length === 0) {
            setStatus('No ad files found — clean', 'green', 3000);
            onDone();
            return;
        }
        showStripSelector(entry, result.stripped, result.reason, async (preservePaths) => {
            const toStrip = result.stripped.filter((f) => !preservePaths.has(f.path));
            if (toStrip.length === 0) {
                setStatus('Nothing to strip', 'yellow', 2000);
                onDone();
                return;
            }
            setStatus(`Stripping ${toStrip.length} file(s)...`);
            try {
                if (hasArchive) {
                    // Strip archive in-place: repack to tmp, replace original
                    const tmpOut = entry.archive_path + '.strip_tmp';
                    await lib.stripArchive(entry.archive_path, tmpOut, preservePaths);
                    if (fs.existsSync(tmpOut) && !fs.statSync(tmpOut).isDirectory()) {
                        fs.renameSync(tmpOut, entry.archive_path); // replace original LHA
                    }
                    else if (fs.existsSync(tmpOut)) {
                        fs.rmSync(tmpOut, { recursive: true, force: true });
                    }
                    if (installDirAbs) {
                        fs.mkdirSync(installDirAbs, { recursive: true });
                        (0, child_process_1.spawnSync)(LHA_BIN, [`xw=${installDirAbs}`, entry.archive_path], { timeout: 30000 });
                    }
                }
                else if (hasDir) {
                    lib.stripFilesFromDirectory(installDirAbs, toStrip.map((f) => f.path));
                }
                const svc = getCatalogSvc();
                if (svc) {
                    try {
                        svc.updateJunkCount(entry.id, result.stripped.length - toStrip.length);
                    }
                    catch { /* ignore */ }
                }
                setStatus(`Stripped ${toStrip.length} ad file(s)`, 'green', 4000);
            }
            catch (err) {
                setStatus(`Strip failed: ${err.message}`, 'red');
            }
            onDone();
        }, onDone);
    }
    // --- key handlers ----------------------------------------------------------
    // Disable type-ahead search — _onKeypress was already .bind(this) at construction
    // so patching the instance method has no effect. Remove all keypress listeners
    // and add our own that skips printable chars (which are action keys on screen.key).
    {
        const _nav = doorList._onKeypress?.bind(doorList);
        doorList.removeAllListeners('keypress');
        if (_nav) {
            doorList.on('keypress', (ch, key) => {
                if (ch && typeof ch === 'string' && ch.length === 1 && /[a-zA-Z0-9/ ]/.test(ch)) {
                    return; // printable: let screen.key handle, skip type-ahead
                }
                if (key?.name === 'escape' || ch === '\x1b') {
                    return; // let screen.key('escape') handle it, don't let List emit 'cancel'
                }
                return _nav(ch, key); // arrows, enter, page up/down etc.
            });
        }
    }
    screen.key(['tab'], () => {
        const idx = doorList.selected ?? 0;
        if (mode === 'installed') {
            mode = 'repo';
            loadCatalog();
            populateCatalogList(0);
        }
        else {
            mode = 'installed';
            populateInstalledList(idx);
        }
        refreshHeader();
        updateInfoPane();
        updateFooter();
        doorList.focus();
    });
    screen.key(['escape'], () => {
        if (stripOverlayActive) {
            if (_stripCancel)
                _stripCancel();
            return;
        }
        if (overlayDepth > 0)
            return; // let overlay handle ESC via its own key binding
        if (mode === 'repo') {
            mode = 'installed';
            populateInstalledList(0);
            refreshHeader();
            updateInfoPane();
            updateFooter();
        }
        // Installed mode: ESC re-focuses list (no-op); Q is the only exit
        doorList.focus();
    });
    screen.key(['q', 'Q'], () => {
        if (stripOverlayActive) {
            if (_stripCancel)
                _stripCancel();
            return;
        }
        if (statusTimer)
            clearTimeout(statusTimer);
        inputManager.disable();
        screen.destroy();
    });
    // --- installed-mode keys ---------------------------------------------------
    screen.key(['f', 'F'], () => {
        if (mode !== 'installed')
            return;
        const door = selectedDoor();
        if (!door)
            return;
        let doorPath = door.resolvedPath || door.location || `Doors/${door.command}`;
        const assignMatch = /^([A-Za-z][A-Za-z0-9]*):(.*)$/.exec(doorPath);
        if (assignMatch) {
            const assign = assignMatch[1].toUpperCase();
            const subpath = assignMatch[2].replace(/^\/+/, '');
            if (assign === 'BBS' || assign === 'WORK')
                doorPath = subpath;
            else if (assign === 'DOORS')
                doorPath = `Doors/${subpath}`;
        }
        pushOverlay();
        new FileExplorerOverlay_1.FileExplorerOverlay({
            screen,
            doorPath,
            onClose: () => { popOverlay(); doorList.focus(); screen.render(); },
        });
    });
    screen.key(['i', 'I'], () => {
        if (mode !== 'installed')
            return;
        const door = selectedDoor();
        if (!door)
            return;
        pushOverlay();
        new InfoEditorOverlay_1.InfoEditorOverlay({
            screen,
            command: door.command,
            bbs,
            onClose: () => { popOverlay(); doorList.focus(); screen.render(); },
        });
        screen.render();
    });
    screen.key(['s', 'S'], async () => {
        if (stripOverlayActive) {
            if (_stripConfirm)
                _stripConfirm();
            return;
        }
        if (mode === 'installed') {
            const door = selectedDoor();
            if (!door)
                return;
            const svc = getCatalogSvc();
            if (!svc) {
                setStatus('Catalog not available', 'yellow');
                return;
            }
            let entry = null;
            try {
                entry = svc.getCatalogEntryByCmd(door.command);
            }
            catch { /* ignore */ }
            if (!entry) {
                setStatus(`${door.command} not in catalog`, 'yellow');
                return;
            }
            // Derive live install dir from resolvedPath (more reliable than stale catalog install_dir)
            const liveDir = door.resolvedPath
                ? path.dirname(door.resolvedPath)
                : (door.location ? path.join(PROJECT_ROOT, door.location) : undefined);
            await stripAds(entry, () => { doorList.focus(); screen.render(); }, liveDir);
        }
        else {
            const entry = selectedCatalogEntry();
            if (!entry)
                return;
            await stripAds(entry, () => { doorList.focus(); screen.render(); });
        }
    });
    screen.key(['u', 'U'], async () => {
        if (mode !== 'installed')
            return;
        setStatus('Waiting for file selection...');
        let uploadResult;
        try {
            uploadResult = await bbs.requestArchiveUpload();
        }
        catch (err) {
            setStatus(`Upload cancelled: ${err.message}`, 'yellow');
            return;
        }
        setStatus(`Installing ${uploadResult.filename}...`);
        try {
            const result = await bbs.installDoor(uploadResult.path);
            if (result.success) {
                setStatus(`Installed: ${result.command} (${result.type})`, 'green');
                doors = await fetchDoors(bbs);
                populateInstalledList(0);
                updateInfoPane();
            }
            else {
                setStatus(`Install failed: ${result.message}`, 'red');
            }
        }
        catch (err) {
            setStatus(`Error: ${err.message}`, 'red');
        }
    });
    screen.key(['e', 'E'], async () => {
        if (mode !== 'installed')
            return;
        const door = selectedDoor();
        if (!door)
            return;
        const idx = doorList.selected ?? 0;
        door.enabled = !door.enabled;
        setStatus(`${door.enabled ? 'Enabling' : 'Disabling'} ${door.name}...`);
        try {
            if (bbs.setDoorEnabled) {
                const result = await bbs.setDoorEnabled(door.command, door.enabled);
                setStatus(result.message, result.success ? 'green' : 'red');
            }
            else {
                setStatus(`${door.name} ${door.enabled ? 'enabled' : 'disabled'} (session only)`, 'yellow');
            }
        }
        catch (err) {
            door.enabled = !door.enabled;
            setStatus(`Error: ${err.message}`, 'red');
        }
        populateInstalledList(idx);
        updateInfoPane();
        updateFooter();
    });
    screen.key(['t', 'T'], () => {
        if (mode !== 'installed')
            return;
        const door = selectedDoor();
        if (!door)
            return;
        if (bbs.runCommand)
            bbs.runCommand(door.command);
        else
            setStatus('Test: use BBS menu to run the door', 'yellow');
    });
    screen.key(['d', 'D'], () => {
        if (mode === 'repo') {
            const entry = selectedCatalogEntry();
            if (!entry)
                return;
            if (entry.doc_raw) {
                showDocViewer(entry.doc_filename ?? entry.archive_name, entry.doc_raw, () => { doorList.focus(); });
            }
            else {
                setStatus('No documentation available', 'yellow');
            }
            return;
        }
        // installed mode: delete
        const door = selectedDoor();
        if (!door)
            return;
        pushOverlay();
        new blessed_1.ConfirmModal({
            parent: screen,
            title: ' Delete Door ',
            content: `Delete this door?\n\n  {yellow-fg}${door.name}{/yellow-fg}${door.command !== door.name ? `\n  Command: ${door.command}` : ''}\n\n{red-fg}This cannot be undone.{/red-fg}`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            confirmColor: 'red',
            cancelColor: 'green',
            style: { border: { fg: 'red' } },
            onConfirm: async () => {
                popOverlay();
                const idx = doorList.selected ?? 0;
                const isTS = ['TS', 'typescript', 'SDK'].includes(door.type);
                const identifier = isTS
                    ? (door.location
                        ? door.location.replace(/^Doors[\\/]/i, '').split(/[\\/]/)[0] || door.command
                        : door.command)
                    : door.command;
                setStatus(`Deleting ${door.name}...`);
                try {
                    const result = await bbs.deleteDoor(identifier, isTS);
                    if (result.success) {
                        setStatus(`${door.name} deleted`, 'green');
                        doors = await fetchDoors(bbs);
                        populateInstalledList(Math.max(0, idx - 1));
                        updateInfoPane();
                    }
                    else {
                        setStatus(`Delete failed: ${result.message}`, 'red');
                    }
                }
                catch (err) {
                    setStatus(`Error: ${err.message}`, 'red');
                }
                doorList.focus();
            },
            onCancel: () => { popOverlay(); doorList.focus(); screen.render(); },
        }).display();
    });
    // --- repo-mode keys --------------------------------------------------------
    screen.key(['r', 'R'], () => {
        if (mode !== 'repo')
            return;
        const entry = selectedCatalogEntry();
        if (!entry)
            return;
        if (entry.installed)
            uninstallFromCatalog(entry);
        else
            installFromCatalog(entry);
    });
    screen.key(['/'], () => {
        if (mode !== 'repo')
            return;
        pushOverlay();
        const prompt = new blessed_1.Prompt({
            parent: screen,
            top: 'center', left: 'center', width: 50, height: 7,
            tags: true,
            style: { border: { fg: 'cyan' } },
            overlay: true,
        });
        prompt.showInput('{cyan-fg}Filter (name/author/group), blank to clear:{/cyan-fg}', catalogFilter, (_err, val) => {
            popOverlay();
            prompt.destroy();
            catalogFilter = (val ?? '').trim();
            populateCatalogList(0);
            refreshHeader();
            updateInfoPane();
            updateFooter();
            doorList.focus();
        });
        screen.render();
    });
    await new Promise(resolve => { screen.on('destroy', resolve); });
}
//# sourceMappingURL=app.js.map