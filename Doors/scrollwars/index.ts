/**
 * Scrollwars - Realtime multiuser line chat
 *
 * Each user owns a line. Text scrolls left when it reaches the edge.
 * Enter clears the user's line; Backspace deletes; ESC exits.
 */

import { ServerDoor, DoorContext, KeyPress } from '@amiexpress/bbs-door-sdk';
import { createBox, createScreen } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { DockablePanel } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

/** Door metadata */
export const metadata = {
  name: 'scrollwars',
  version: '1.0.0',
  description: 'Realtime multiuser line chat',
  author: 'AmiExpress',
  command: 'SCROLLWARS',
};

interface ParticipantUi {
  screen: any;
  userPanel: any;
  chatPanel: any;
  statusBar: any;
}

interface Participant {
  id: string;
  username: string;
  socket: any;
  bbsSession: any;
  lineIndex: number;
  color: BlessedColor;
  buffer: string;
  active: boolean;
  ui: ParticipantUi;
}

const SCREEN_WIDTH = 80;
const SCREEN_HEIGHT = 25;
const PANEL_HEIGHT = SCREEN_HEIGHT - 1;
const MAX_USERS = PANEL_HEIGHT - 2;
const USER_PANEL_WIDTH = 18;
const CHAT_PANEL_WIDTH = SCREEN_WIDTH - USER_PANEL_WIDTH;
const USERLIST_WIDTH = USER_PANEL_WIDTH - 2;
const MESSAGE_WIDTH = CHAT_PANEL_WIDTH - 2;

const CURSOR_CHAR = ' ';
const CURSOR_BLINK_MS = 500;

// Standard blessed color names
const COLOR_PALETTE = [
  'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray'
] as const;
type BlessedColor = typeof COLOR_PALETTE[number];

const EMPTY_USER_LINE = ' '.repeat(USERLIST_WIDTH);
const EMPTY_CHAT_LINE = ' '.repeat(MESSAGE_WIDTH);

const roomState = {
  participants: new Map<string, Participant>(),
  lineSlots: new Array<boolean>(MAX_USERS).fill(false),
  lineParticipants: new Array<Participant | null>(MAX_USERS).fill(null),
  userLines: new Array<string>(MAX_USERS).fill(EMPTY_USER_LINE),
  chatLines: new Array<string>(MAX_USERS).fill(EMPTY_CHAT_LINE),
};

const pendingRenders = new Set<string>();

let cursorVisible = true;
let cursorTimer: NodeJS.Timeout | null = null;

function startCursorTimer(): void {
  if (cursorTimer) return;
  cursorTimer = setInterval(() => {
    cursorVisible = !cursorVisible;
    if (roomState.participants.size > 0) {
      refreshAllLines(false);
    }
  }, CURSOR_BLINK_MS);
}

function stopCursorTimerIfIdle(): void {
  if (roomState.participants.size > 0) return;
  if (cursorTimer) {
    clearInterval(cursorTimer);
    cursorTimer = null;
  }
}

function scheduleRender(participant: Participant): void {
  if (!participant.active) return;
  if (pendingRenders.has(participant.id)) return;

  pendingRenders.add(participant.id);
  setImmediate(() => {
    pendingRenders.delete(participant.id);
    if (participant.active) {
      participant.ui.screen.render();
    }
  });
}

function allocateLineIndex(): number | null {
  for (let i = 0; i < MAX_USERS; i++) {
    if (!roomState.lineSlots[i]) {
      roomState.lineSlots[i] = true;
      return i;
    }
  }
  return null;
}

function releaseLineIndex(index: number): void {
  if (index >= 0 && index < MAX_USERS) {
    roomState.lineSlots[index] = false;
  }
}

function formatStatus(text: string): string {
  if (text.length >= SCREEN_WIDTH) return text.slice(0, SCREEN_WIDTH);
  return text.padEnd(SCREEN_WIDTH, ' ');
}

function sanitizeLabel(text: string, max: number): string {
  const ascii = text.replace(/[^\x20-\x7E]/g, '');
  return ascii.length > max ? ascii.slice(0, max) : ascii;
}

function padText(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text.padEnd(width, ' ');
}

function buildMessageLine(buffer: string, color: BlessedColor): string {
  if (MESSAGE_WIDTH <= 0) return '';
  const trimmed = buffer.length > MESSAGE_WIDTH ? buffer.slice(buffer.length - MESSAGE_WIDTH) : buffer;
  const padded = trimmed.padEnd(MESSAGE_WIDTH, ' ');
  const cursorPos = Math.min(trimmed.length, MESSAGE_WIDTH - 1);
  const before = padded.slice(0, cursorPos);
  const baseChar = padded[cursorPos] || ' ';
  const cursorChar = baseChar === ' ' ? CURSOR_CHAR : baseChar;
  const after = padded.slice(cursorPos + 1);

  let cursorCell: string;
  if (cursorVisible) {
    cursorCell = `{${color}-bg}{black-fg}${cursorChar}{/black-fg}{/${color}-bg}`;
  } else {
    cursorCell = `{${color}-fg}${baseChar}{/${color}-fg}`;
  }
  return `{${color}-fg}${before}{/${color}-fg}${cursorCell}{${color}-fg}${after}{/${color}-fg}`;
}

function buildUserLine(participant: Participant): string {
  const nameText = padText(sanitizeLabel(participant.username, USERLIST_WIDTH), USERLIST_WIDTH);
  return `{${participant.color}-fg}${nameText}{/${participant.color}-fg}`;
}

function buildStatusSequence(viewer: Participant): string {
  const count = roomState.participants.size;
  const name = sanitizeLabel(viewer.username, 16);
  const statusText = `Scrollwars | Users ${count}/${MAX_USERS} | You ${name} | Line ${viewer.lineIndex + 1} | Enter clears line | Backspace deletes | ESC quit`;
  return formatStatus(statusText);
}

function updateLineContent(lineIndex: number): void {
  const participant = roomState.lineParticipants[lineIndex];
  if (!participant) {
    roomState.userLines[lineIndex] = EMPTY_USER_LINE;
    roomState.chatLines[lineIndex] = EMPTY_CHAT_LINE;
    return;
  }
  roomState.userLines[lineIndex] = buildUserLine(participant);
  roomState.chatLines[lineIndex] = buildMessageLine(participant.buffer, participant.color);
}

function syncLineAcrossParticipants(lineIndex: number): void {
  const userLine = roomState.userLines[lineIndex];
  const chatLine = roomState.chatLines[lineIndex];
  for (const participant of roomState.participants.values()) {
    participant.ui.userPanel.setLine(lineIndex, userLine);
    participant.ui.chatPanel.setLine(lineIndex, chatLine);
    scheduleRender(participant);
  }
}

function syncStatusBars(): void {
  for (const participant of roomState.participants.values()) {
    participant.ui.statusBar.setContent(buildStatusSequence(participant));
    scheduleRender(participant);
  }
}

function refreshAllLines(updateStatus: boolean): void {
  for (let i = 0; i < MAX_USERS; i++) updateLineContent(i);
  const userContent = roomState.userLines.join('\n');
  const chatContent = roomState.chatLines.join('\n');
  for (const participant of roomState.participants.values()) {
    participant.ui.userPanel.setContent(userContent);
    participant.ui.chatPanel.setContent(chatContent);
    if (updateStatus) participant.ui.statusBar.setContent(buildStatusSequence(participant));
    scheduleRender(participant);
  }
}

function handleKeypress(participant: Participant, ch: string | undefined, key: any): boolean {
  if (!participant.active) return false;
  if (key?.name === 'escape' || key?.full === 'C-c' || key?.sequence === '\x03') return true;
  if (key?.name === 'enter') {
    if (participant.buffer.length > 0) {
      participant.buffer = '';
      updateLineContent(participant.lineIndex);
      syncLineAcrossParticipants(participant.lineIndex);
    }
    return false;
  }
  const isBackspace = key?.name === 'backspace' || key?.name === 'delete' || key?.sequence === '\x08' || key?.sequence === '\x7f' || ch === '\x08' || ch === '\x7f';
  if (isBackspace) {
    const next = participant.buffer.length > 0 ? participant.buffer.slice(0, -1) : participant.buffer;
    if (next !== participant.buffer) {
      participant.buffer = next;
      updateLineContent(participant.lineIndex);
      syncLineAcrossParticipants(participant.lineIndex);
    }
    return false;
  }
  if (!ch || key?.name?.length > 1) return false;
  let changed = false;
  for (const char of ch) {
    if (char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126) continue;
    participant.buffer = (participant.buffer + char).slice(-MESSAGE_WIDTH);
    changed = true;
  }
  if (changed) {
    updateLineContent(participant.lineIndex);
    syncLineAcrossParticipants(participant.lineIndex);
  }
  return false;
}

const door = new ServerDoor(metadata);

door.onStart(async (ctx: DoorContext) => {
  const { socket, bbsSession, user, bbs } = ctx;
  const lineIndex = allocateLineIndex();

  if (lineIndex === null) {
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
    socket.emit('ansi-output', `\x1b[31mScrollwars is full (${MAX_USERS} users max).\x1b[0m\r\n`);
    return;
  }

  if ((bbs as any)?.enableGameMode) (bbs as any).enableGameMode();

  const username = sanitizeLabel(user?.username || 'Guest', 32) || 'Guest';
  const id = String(socket.id);

  const screen = createScreen({
    smartCSR: false,
    fastCSR: false,
    title: 'Scrollwars',
    output: (data: string) => (bbs as any)?.write(data),
    responsive: true,
  });

  const userPanelDock = new DockablePanel({
    parent: screen,
    title: ' Users ',
    width: '25%',
    height: '100%-1',
    border: { type: 'line', fg: 'cyan' },
  });

  const userPanel = createBox({
    parent: userPanelDock,
    top: 1, left: 1, width: '100%-2', height: '100%-2',
    tags: true,
    focusable: false, mouse: false, clickable: false,
  });

  const chatPanelDock = new DockablePanel({
    parent: screen,
    title: ' Scroll ',
    left: '25%',
    width: '75%',
    height: '100%-1',
    border: { type: 'line', fg: 'cyan' },
  });

  const chatPanel = createBox({
    parent: chatPanelDock,
    top: 1, left: 1, width: '100%-2', height: '100%-2',
    tags: true,
    focusable: false, mouse: false, clickable: false,
  });

  const statusBar = createBox({
    parent: screen,
    bottom: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: { fg: 'cyan', bg: 'blue' },
    focusable: false, mouse: false, clickable: false,
  });

  const participant: Participant = {
    id, username, socket, bbsSession, lineIndex,
    color: COLOR_PALETTE[lineIndex % COLOR_PALETTE.length],
    buffer: '', active: true,
    ui: { screen, userPanel, chatPanel, statusBar }
  };

  roomState.participants.set(id, participant);
  roomState.lineParticipants[lineIndex] = participant;
  
  const cleanup = () => {
    if (!participant.active) return;
    participant.active = false;
    roomState.participants.delete(id);
    roomState.lineParticipants[lineIndex] = null;
    releaseLineIndex(lineIndex);
    updateLineContent(lineIndex);
    syncLineAcrossParticipants(lineIndex);
    syncStatusBars();
    if ((bbs as any)?.disableGameMode) (bbs as any).disableGameMode();
    screen.destroy();
    stopCursorTimerIfIdle();
  };

  screen.on('keypress', (ch: string, key: any) => {
    if (handleKeypress(participant, ch, key)) {
      cleanup();
    }
  });

  startCursorTimer();
  refreshAllLines(true);

  await new Promise<void>((resolve) => {
    screen.on('destroy', resolve);
    socket.once('disconnect', cleanup);
  });
});

export default door;
