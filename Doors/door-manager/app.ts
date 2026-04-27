/**
 * DOORMAN v2 - SysOp Door Management Tool
 * Spot / Up Rough
 */

import {
  Screen,
  Panel,
  List,
  ScrollableBox,
  ConfirmModal,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { FileExplorerOverlay } from './FileExplorerOverlay';
import { InfoEditorOverlay } from './InfoEditorOverlay';

interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params: string[];
}

interface DoorInfo {
  id: string;
  command: string;
  name: string;
  description: string;
  type: string;
  size: number;
  accessLevel: number;
  location: string;
  resolvedPath?: string;  // absolute OS path returned by backend
  enabled: boolean;
}

const HEADER_PREFIX = `{center}{cyan-fg}DOORMAN v2{/cyan-fg}  {white-fg}Spot/Up Rough{/white-fg}`;

// --- helpers -----------------------------------------------------------------

function formatSize(bytes: number): string {
  if (bytes === 0) return '  0 B ';
  if (bytes < 1024) return `${bytes} B`.padStart(6);
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`.padStart(6);
  return `${Math.round(bytes / (1024 * 1024))} MB`.padStart(6);
}

function typeBadge(type: string): string {
  const map: Record<string, string> = {
    'TS': 'TS', 'typescript': 'TS', 'SDK': 'TS',
    'XIM': '68', 'SIM': 'SI', 'TIM': 'TI',
    'AMI': '68', 'amiga': '68',
  };
  return map[type] || '??';
}

function formatListItem(door: DoorInfo, width: number): string {
  const badge = `[${typeBadge(door.type)}]`;
  const status = door.enabled ? '{green-fg}*{/green-fg}' : '{red-fg}-{/red-fg}';
  const sz = formatSize(door.size);
  const nameWidth = Math.max(10, width - 18);
  const name = door.name.length > nameWidth
    ? door.name.slice(0, nameWidth - 1) + '...'
    : door.name.padEnd(nameWidth);
  return `${badge} ${name} ${status} ${sz}`;
}

async function fetchDoors(bbs: any): Promise<DoorInfo[]> {
  if (!bbs.getDoorList) return [];
  const raw = await bbs.getDoorList();
  return raw.map((d: any) => ({
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

function buildInfoContent(door: DoorInfo): string {
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

export async function createApp(session: DoorSession): Promise<void> {
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

  const screen = new Screen({
    smartCSR: true,
    fullUnicode: true,
    title: 'DOORMAN v2',
    output: (data: string) => bbs.write(data),
  } as any);

  const inputManager = new DoorInputManager(session, screen, {
    enableGameMode: false,
    enableGrabKeys: false,
    enableMouse: true,
  });
  inputManager.enable();

  const nodeId = (session.bbsSession as any)?.nodeId ?? '?';

  const header = new Panel({
    parent: screen,
    top: 0, left: 0, width: '100%', height: 3,
    tags: true,
    content: '',
    style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
    focusable: false,
  } as any);

  new Panel({
    parent: screen,
    bottom: 0, left: 0, width: '100%', height: 3,
    tags: true,
    content: `{center}{yellow-fg}[U]{/yellow-fg}pload  {yellow-fg}[I]{/yellow-fg}nfo  {yellow-fg}[F]{/yellow-fg}iles  {yellow-fg}[D]{/yellow-fg}elete  {yellow-fg}[E]{/yellow-fg}nable  {yellow-fg}[Q]{/yellow-fg}uit{/center}`,
    style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
    focusable: false,
  } as any);

  const listPanel = new Panel({
    parent: screen,
    top: 3, left: 0, width: '50%', height: '100%-6',
    label: ' INSTALLED DOORS ',
    tags: true,
    style: { border: { fg: 'cyan' } },
    focusable: false,
  } as any);

  const doorList = new List({
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
  } as any);

  const infoPanel = new Panel({
    parent: screen,
    top: 3, left: '50%', width: '50%', height: '100%-6',
    label: ' DOOR INFO ',
    tags: true,
    style: { border: { fg: 'blue' } },
    focusable: false,
  } as any);

  const infoBox = new ScrollableBox({
    parent: infoPanel,
    top: 1, left: 1, width: '100%-2', height: '100%-2',
    tags: true, scrollable: true, keys: true,
    style: { fg: 'white' },
  } as any);

  let statusTimer: ReturnType<typeof setTimeout> | null = null;

  function refreshHeader(): void {
    const ec = doors.filter(d => d.enabled).length;
    (header as any).setContent(
      HEADER_PREFIX +
      `  * ${doors.length} doors  * ${ec} enabled  * Node ${nodeId}{/center}`
    );
  }

  function setStatus(msg: string, color: 'green' | 'red' | 'yellow' = 'yellow', durationMs = 3000): void {
    (header as any).setContent(
      HEADER_PREFIX +
      `  {${color}-fg}${msg}{/${color}-fg}{/center}`
    );
    screen.render();
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { refreshHeader(); screen.render(); }, durationMs);
  }

  function getListWidth(): number {
    return Math.floor((screen as any).width / 2) - 4;
  }

  function populateList(selectIndex = 0): void {
    const items = doors.map(d => formatListItem(d, getListWidth()));
    (doorList as any).setItems(items);
    if (doors.length > 0) {
      (doorList as any).select(Math.min(selectIndex, doors.length - 1));
    }
    screen.render();
  }

  function selectedDoor(): DoorInfo | null {
    const idx = (doorList as any).selected ?? 0;
    return doors[idx] ?? null;
  }

  function updateInfoPane(): void {
    const door = selectedDoor();
    if (!door) { (infoBox as any).setContent('No door selected.'); return; }
    (infoBox as any).setContent(buildInfoContent(door));
    screen.render();
  }

  function applyResponsive(): void {
    const w = (screen as any).width;
    if (w < 100) {
      (infoPanel as any).hide();
      (listPanel as any).width = '100%';
    } else {
      (infoPanel as any).show();
      (listPanel as any).width = '50%';
    }
    populateList((doorList as any).selected ?? 0);
  }

  refreshHeader();
  populateList(0);
  updateInfoPane();
  applyResponsive();
  (doorList as any).focus();

  screen.on('resize', () => { applyResponsive(); screen.render(); });
  (doorList as any).on('select item', () => { updateInfoPane(); });

  (screen as any).key(['q', 'Q', 'escape'], () => {
    if (statusTimer) clearTimeout(statusTimer);
    inputManager.disable();
    (screen as any).destroy();
  });

  (screen as any).key(['f', 'F'], () => {
    const door = selectedDoor();
    if (!door) return;
    // resolvedPath (absolute) > location (relative from LOCATION= tooltype) > fallback
    const doorPath = door.resolvedPath || door.location || `Doors/${door.command}`;
    new FileExplorerOverlay({
      screen,
      doorPath,
      onClose: () => { (doorList as any).focus(); screen.render(); },
    });
  });

  (screen as any).key(['i', 'I'], () => {
    const door = selectedDoor();
    if (!door) return;
    new InfoEditorOverlay({
      screen,
      command: door.command,
      bbs,
      onClose: () => { (doorList as any).focus(); screen.render(); },
    });
    screen.render();
  });

  (screen as any).key(['u', 'U'], async () => {
    setStatus('Waiting for file selection...');
    let uploadResult: { path: string; filename: string };
    try {
      uploadResult = await (bbs as any).requestArchiveUpload();
    } catch (err) {
      setStatus(`Upload cancelled: ${(err as Error).message}`, 'yellow');
      return;
    }
    setStatus(`Installing ${uploadResult.filename}...`);
    try {
      const result = await (bbs as any).installDoor(uploadResult.path);
      if (result.success) {
        setStatus(`Installed: ${result.command} (${result.type})`, 'green');
        doors = await fetchDoors(bbs);
        populateList(0);
        updateInfoPane();
      } else {
        setStatus(`Install failed: ${result.message}`, 'red');
      }
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`, 'red');
    }
  });

  (screen as any).key(['e', 'E'], async () => {
    const door = selectedDoor();
    if (!door) return;
    const idx = (doorList as any).selected ?? 0;
    door.enabled = !door.enabled;
    setStatus(`${door.enabled ? 'Enabling' : 'Disabling'} ${door.name}...`);
    try {
      if (bbs.setDoorEnabled) {
        const result = await bbs.setDoorEnabled(door.command, door.enabled);
        setStatus(result.message, result.success ? 'green' : 'red');
      } else {
        setStatus(`${door.name} ${door.enabled ? 'enabled' : 'disabled'} (session only)`, 'yellow');
      }
    } catch (err) {
      door.enabled = !door.enabled;
      setStatus(`Error: ${(err as Error).message}`, 'red');
    }
    populateList(idx);
    updateInfoPane();
  });

  (screen as any).key(['t', 'T'], () => {
    const door = selectedDoor();
    if (!door) return;
    if (bbs.runCommand) {
      bbs.runCommand(door.command);
    } else {
      setStatus('Test: use BBS menu to run the door', 'yellow');
    }
  });

  (screen as any).key(['d', 'D'], () => {
    const door = selectedDoor();
    if (!door) return;

    new ConfirmModal({
      parent: screen,
      title: ' Delete Door ',
      content: `Delete this door?\n\n  {yellow-fg}${door.name}{/yellow-fg}\n  ${door.command}\n\n{red-fg}This cannot be undone.{/red-fg}`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      cancelColor: 'green',
      style: { border: { fg: 'red' } },
      onConfirm: async () => {
        const idx = (doorList as any).selected ?? 0;
        const isTS = ['TS', 'typescript', 'SDK'].includes(door.type);
        const identifier = door.location
          ? door.location.replace(/^Doors[\\/]/i, '') || door.command
          : door.command;
        setStatus(`Deleting ${door.name}...`);
        try {
          const result = await (bbs as any).deleteDoor(identifier, isTS);
          if (result.success) {
            setStatus(`${door.name} deleted`, 'green');
            doors = await fetchDoors(bbs);
            populateList(Math.max(0, idx - 1));
            updateInfoPane();
          } else {
            setStatus(`Delete failed: ${result.message}`, 'red');
          }
        } catch (err) {
          setStatus(`Error: ${(err as Error).message}`, 'red');
        }
        (doorList as any).focus();
      },
      onCancel: () => { (doorList as any).focus(); screen.render(); },
    } as any);

    screen.render();
  });

  await new Promise<void>(resolve => { screen.on('destroy', resolve); });
}
