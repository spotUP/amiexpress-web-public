"use strict";
/**
 * DOORMAN v2 - SysOp Door Management Tool
 * Spot / Up Rough
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const FileExplorerOverlay_1 = require("./FileExplorerOverlay");
const InfoEditorOverlay_1 = require("./InfoEditorOverlay");
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
    const header = new blessed_1.Panel({
        parent: screen,
        top: 0, left: 0, width: '100%', height: 3,
        tags: true,
        content: '',
        style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
        focusable: false,
    });
    new blessed_1.Panel({
        parent: screen,
        bottom: 0, left: 0, width: '100%', height: 3,
        tags: true,
        content: `{center}{yellow-fg}[U]{/yellow-fg}pload  {yellow-fg}[I]{/yellow-fg}nfo  {yellow-fg}[F]{/yellow-fg}iles  {yellow-fg}[D]{/yellow-fg}elete  {yellow-fg}[E]{/yellow-fg}nable  {yellow-fg}[Q]{/yellow-fg}uit{/center}`,
        style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
        focusable: false,
    });
    const listPanel = new blessed_1.Panel({
        parent: screen,
        top: 3, left: 0, width: '50%', height: '100%-6',
        label: ' INSTALLED DOORS ',
        tags: true,
        style: { border: { fg: 'cyan' } },
        focusable: false,
    });
    const doorList = new blessed_1.List({
        parent: listPanel,
        top: 1, left: 1, width: '100%-2', height: '100%-2',
        keys: true, vi: true, mouse: true,
        scrollable: true, alwaysScroll: true,
        tags: true,
        scrollbar: { ch: ' ', style: { bg: 'blue' } },
        style: {
            selected: { bg: 'blue', fg: 'white' },
            item: { fg: 'white' },
        },
    });
    const infoPanel = new blessed_1.Panel({
        parent: screen,
        top: 3, left: '50%', width: '50%', height: '100%-6',
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
    function refreshHeader() {
        const ec = doors.filter(d => d.enabled).length;
        header.setContent(HEADER_PREFIX +
            `  * ${doors.length} doors  * ${ec} enabled  * Node ${nodeId}{/center}`);
    }
    function setStatus(msg, color = 'yellow', durationMs = 3000) {
        header.setContent(HEADER_PREFIX +
            `  {${color}-fg}${msg}{/${color}-fg}{/center}`);
        screen.render();
        if (statusTimer)
            clearTimeout(statusTimer);
        statusTimer = setTimeout(() => { refreshHeader(); screen.render(); }, durationMs);
    }
    function getListWidth() {
        return Math.floor(screen.width / 2) - 4;
    }
    function populateList(selectIndex = 0) {
        const items = doors.map(d => formatListItem(d, getListWidth()));
        doorList.setItems(items);
        if (doors.length > 0) {
            doorList.select(Math.min(selectIndex, doors.length - 1));
        }
        screen.render();
    }
    function selectedDoor() {
        const idx = doorList.selected ?? 0;
        return doors[idx] ?? null;
    }
    function updateInfoPane() {
        const door = selectedDoor();
        if (!door) {
            infoBox.setContent('No door selected.');
            return;
        }
        infoBox.setContent(buildInfoContent(door));
        screen.render();
    }
    function applyResponsive() {
        const w = screen.width;
        if (w < 100) {
            infoPanel.hide();
            listPanel.width = '100%';
        }
        else {
            infoPanel.show();
            listPanel.width = '50%';
        }
        populateList(doorList.selected ?? 0);
    }
    refreshHeader();
    populateList(0);
    updateInfoPane();
    applyResponsive();
    doorList.focus();
    screen.on('resize', () => { applyResponsive(); screen.render(); });
    doorList.on('select item', () => { updateInfoPane(); });
    screen.key(['q', 'Q', 'escape'], () => {
        if (statusTimer)
            clearTimeout(statusTimer);
        inputManager.disable();
        screen.destroy();
    });
    screen.key(['f', 'F'], () => {
        const door = selectedDoor();
        if (!door)
            return;
        // resolvedPath (absolute) > location (relative from LOCATION= tooltype) > fallback
        const doorPath = door.resolvedPath || door.location || `Doors/${door.command}`;
        new FileExplorerOverlay_1.FileExplorerOverlay({
            screen,
            doorPath,
            onClose: () => { doorList.focus(); screen.render(); },
        });
    });
    screen.key(['i', 'I'], () => {
        const door = selectedDoor();
        if (!door)
            return;
        new InfoEditorOverlay_1.InfoEditorOverlay({
            screen,
            command: door.command,
            bbs,
            onClose: () => { doorList.focus(); screen.render(); },
        });
        screen.render();
    });
    screen.key(['u', 'U'], async () => {
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
                populateList(0);
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
        populateList(idx);
        updateInfoPane();
    });
    screen.key(['t', 'T'], () => {
        const door = selectedDoor();
        if (!door)
            return;
        if (bbs.runCommand) {
            bbs.runCommand(door.command);
        }
        else {
            setStatus('Test: use BBS menu to run the door', 'yellow');
        }
    });
    screen.key(['d', 'D'], () => {
        const door = selectedDoor();
        if (!door)
            return;
        new blessed_1.ConfirmModal({
            parent: screen,
            title: ' Delete Door ',
            content: `Delete this door?\n\n  {yellow-fg}${door.name}{/yellow-fg}\n  ${door.command}\n\n{red-fg}This cannot be undone.{/red-fg}`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            confirmColor: 'red',
            cancelColor: 'green',
            style: { border: { fg: 'red' } },
            onConfirm: async () => {
                const idx = doorList.selected ?? 0;
                const isTS = ['TS', 'typescript', 'SDK'].includes(door.type);
                const identifier = door.location
                    ? door.location.replace(/^Doors[\\/]/i, '') || door.command
                    : door.command;
                setStatus(`Deleting ${door.name}...`);
                try {
                    const result = await bbs.deleteDoor(identifier, isTS);
                    if (result.success) {
                        setStatus(`${door.name} deleted`, 'green');
                        doors = await fetchDoors(bbs);
                        populateList(Math.max(0, idx - 1));
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
            onCancel: () => { doorList.focus(); screen.render(); },
        });
        screen.render();
    });
    await new Promise(resolve => { screen.on('destroy', resolve); });
}
//# sourceMappingURL=app.js.map