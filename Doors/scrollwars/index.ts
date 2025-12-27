/**
 * Scrollwars - Realtime multiuser line chat
 *
 * Each user owns a line. Text scrolls left when it reaches the edge.
 * Enter clears the user's line; Backspace deletes; ESC exits.
 */

import { createBox, createScreen } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

/** Door metadata */
export const metadata = {
  name: 'scrollwars',
  version: '1.0.0',
  description: 'Realtime multiuser line chat',
  author: 'AmiExpress',
  command: 'SCROLLWARS',
};

/** Door session from BBS handler */
interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params: string[];
}

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
const STATUS_ROW = SCREEN_HEIGHT - 1;
const PANEL_HEIGHT = SCREEN_HEIGHT - 1;
const MAX_USERS = PANEL_HEIGHT - 2;
const USER_PANEL_WIDTH = 18;
const CHAT_PANEL_WIDTH = SCREEN_WIDTH - USER_PANEL_WIDTH;
const USERLIST_WIDTH = USER_PANEL_WIDTH - 2;
const MESSAGE_WIDTH = CHAT_PANEL_WIDTH - 2;

const USER_PANEL_LEFT = 0;
const CHAT_PANEL_LEFT = USER_PANEL_WIDTH;

const CURSOR_CHAR = ' ';
const CURSOR_BLINK_MS = 500;

// Standard blessed color names (8 colors that neo-blessed supports)
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
  if (cursorTimer) {
    return;
  }

  cursorTimer = setInterval(() => {
    cursorVisible = !cursorVisible;
    if (roomState.participants.size > 0) {
      refreshAllLines(false);
    }
  }, CURSOR_BLINK_MS);
}

function stopCursorTimerIfIdle(): void {
  if (roomState.participants.size > 0) {
    return;
  }
  if (cursorTimer) {
    clearInterval(cursorTimer);
    cursorTimer = null;
  }
}

function scheduleRender(participant: Participant): void {
  if (!participant.active) {
    return;
  }
  if (pendingRenders.has(participant.id)) {
    return;
  }

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
  if (text.length >= SCREEN_WIDTH) {
    return text.slice(0, SCREEN_WIDTH);
  }
  return text.padEnd(SCREEN_WIDTH, ' ');
}

function sanitizeLabel(text: string, max: number): string {
  const ascii = text.replace(/[^\x20-\x7E]/g, '');
  return ascii.length > max ? ascii.slice(0, max) : ascii;
}

function padText(text: string, width: number): string {
  if (text.length >= width) {
    return text.slice(0, width);
  }
  return text.padEnd(width, ' ');
}

function buildMessageLine(buffer: string, color: BlessedColor): string {
  if (MESSAGE_WIDTH <= 0) {
    return '';
  }

  const trimmed = buffer.length > MESSAGE_WIDTH
    ? buffer.slice(buffer.length - MESSAGE_WIDTH)
    : buffer;
  const padded = trimmed.padEnd(MESSAGE_WIDTH, ' ');
  const cursorPos = Math.min(trimmed.length, MESSAGE_WIDTH - 1);
  const before = padded.slice(0, cursorPos);
  const baseChar = padded[cursorPos] || ' ';
  const cursorChar = baseChar === ' ' ? CURSOR_CHAR : baseChar;
  const after = padded.slice(cursorPos + 1);

  // For cursor, use explicit fg/bg swap instead of {inverse} tag
  // ({inverse} uses reset which clears all formatting)
  let cursorCell: string;
  if (cursorVisible) {
    // Cursor: swap colors - background becomes the user color, foreground black
    cursorCell = `{${color}-bg}{black-fg}${cursorChar}{/black-fg}{/${color}-bg}`;
  } else {
    cursorCell = `{${color}-fg}${baseChar}{/${color}-fg}`;
  }

  // Build line with color tags
  return `{${color}-fg}${before}{/${color}-fg}${cursorCell}{${color}-fg}${after}{/${color}-fg}`;
}

function buildUserLine(participant: Participant): string {
  const nameText = padText(sanitizeLabel(participant.username, USERLIST_WIDTH), USERLIST_WIDTH);
  // Use blessed color tags instead of raw ANSI
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

function syncPanelsToParticipant(participant: Participant): void {
  participant.ui.userPanel.setContent(roomState.userLines.join('\n'));
  participant.ui.chatPanel.setContent(roomState.chatLines.join('\n'));
  participant.ui.statusBar.setContent(buildStatusSequence(participant));
  scheduleRender(participant);
}

function syncStatusBars(): void {
  for (const participant of roomState.participants.values()) {
    participant.ui.statusBar.setContent(buildStatusSequence(participant));
    scheduleRender(participant);
  }
}

function refreshAllLines(updateStatus: boolean): void {
  for (let i = 0; i < MAX_USERS; i++) {
    updateLineContent(i);
  }

  const userContent = roomState.userLines.join('\n');
  const chatContent = roomState.chatLines.join('\n');

  for (const participant of roomState.participants.values()) {
    participant.ui.userPanel.setContent(userContent);
    participant.ui.chatPanel.setContent(chatContent);
    if (updateStatus) {
      participant.ui.statusBar.setContent(buildStatusSequence(participant));
    }
    scheduleRender(participant);
  }
}

function appendChar(buffer: string, ch: string): string {
  const next = buffer + ch;
  if (next.length <= MESSAGE_WIDTH) {
    return next;
  }
  return next.slice(next.length - MESSAGE_WIDTH);
}

function removeChar(buffer: string): string {
  if (buffer.length === 0) {
    return buffer;
  }
  return buffer.slice(0, -1);
}

function isPrintable(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 32 && code <= 126;
}

function handleKeypress(participant: Participant, ch: string | undefined, key: any): boolean {
  if (!participant.active) {
    return false;
  }

  if (key?.name === 'escape' || key?.full === 'C-c' || key?.sequence === '\x03') {
    return true;
  }

  if (key?.name === 'enter') {
    if (participant.buffer.length > 0) {
      participant.buffer = '';
      updateLineContent(participant.lineIndex);
      syncLineAcrossParticipants(participant.lineIndex);
    }
    return false;
  }

  // Handle backspace/delete - check both key object and raw character
  const isBackspace =
    key?.name === 'backspace' ||
    key?.name === 'delete' ||
    key?.sequence === '\x08' ||
    key?.sequence === '\x7f' ||
    ch === '\x08' ||
    ch === '\x7f';

  if (isBackspace) {
    const next = removeChar(participant.buffer);
    if (next !== participant.buffer) {
      participant.buffer = next;
      updateLineContent(participant.lineIndex);
      syncLineAcrossParticipants(participant.lineIndex);
    }
    return false;
  }

  // Ignore arrow keys and other special keys
  const isSpecialKey =
    key?.name === 'up' ||
    key?.name === 'down' ||
    key?.name === 'left' ||
    key?.name === 'right' ||
    key?.name === 'home' ||
    key?.name === 'end' ||
    key?.name === 'pageup' ||
    key?.name === 'pagedown' ||
    key?.name === 'insert' ||
    key?.name === 'tab';

  if (isSpecialKey) {
    return false;
  }

  if (!ch) {
    return false;
  }

  let changed = false;
  for (const char of ch) {
    if (!isPrintable(char)) {
      continue;
    }
    participant.buffer = appendChar(participant.buffer, char);
    changed = true;
  }

  if (changed) {
    updateLineContent(participant.lineIndex);
    syncLineAcrossParticipants(participant.lineIndex);
  }

  return false;
}

function createUi(session: DoorSession): ParticipantUi {
  const { bbs, bbsSession } = session;

  // Use createScreen helper for consistent initialization
  const screen = createScreen({
    smartCSR: true,
    dockBorders: false,
    fullUnicode: false,
    title: 'Scrollwars',
    output: (data: string) => bbs.write(data),
  });

  if (bbsSession) {
    bbsSession.doorInputHandler = (data: string) => {
      screen._handleData(data);
    };
  }

  screen.program.hideCursor();

  const userPanel = createBox({
    parent: screen,
    top: 0,
    left: USER_PANEL_LEFT,
    width: USER_PANEL_WIDTH,
    height: PANEL_HEIGHT,
    border: { type: 'ascii' },
    label: ' Users ',
    // tags: true is automatic with createBox()
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'cyan' }
    },
  });

  const chatPanel = createBox({
    parent: screen,
    top: 0,
    left: CHAT_PANEL_LEFT,
    width: CHAT_PANEL_WIDTH,
    height: PANEL_HEIGHT,
    border: { type: 'ascii' },
    label: ' Scroll ',
    // tags: true is automatic with createBox()
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'cyan' }
    },
  });

  const statusBar = createBox({
    parent: screen,
    top: STATUS_ROW,
    left: 0,
    width: SCREEN_WIDTH,
    height: 1,
    // tags: true is automatic with createBox()
    style: { fg: 'cyan', bg: 'blue' },
  });

  return { screen, userPanel, chatPanel, statusBar };
}

/** Main door entry point - required by BBS */
export async function runDoor(session: DoorSession): Promise<void> {
  const { socket, bbsSession, user, bbs } = session;
  const lineIndex = allocateLineIndex();

  if (lineIndex === null) {
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
    socket.emit('ansi-output', `\x1b[31mScrollwars is full (${MAX_USERS} users max).\x1b[0m\r\n`);
    socket.emit('door:close');
    return;
  }

  if (bbs?.enableGameMode) {
    bbs.enableGameMode();
  }

  const username = sanitizeLabel(user?.username || bbsSession?.user?.username || 'Guest', 32) || 'Guest';
  const id = String(socket.id || `node-${bbsSession?.nodeId || 0}-${Date.now()}`);

  const participant: Participant = {
    id,
    username,
    socket,
    bbsSession,
    lineIndex,
    color: COLOR_PALETTE[lineIndex % COLOR_PALETTE.length],
    buffer: '',
    active: true,
    ui: {} as ParticipantUi,
  };

  participant.ui = createUi(session);
  roomState.participants.set(participant.id, participant);
  roomState.lineParticipants[lineIndex] = participant;
  updateLineContent(lineIndex);

  let closed = false;

  const cleanup = () => {
    if (closed) {
      return;
    }
    closed = true;

    if (bbsSession?.doorInputHandler) {
      bbsSession.doorInputHandler = null;
    }

    if (bbs?.disableGameMode) {
      bbs.disableGameMode();
    }

    participant.active = false;
    roomState.participants.delete(participant.id);
    roomState.lineParticipants[lineIndex] = null;
    releaseLineIndex(participant.lineIndex);

    updateLineContent(participant.lineIndex);
    syncLineAcrossParticipants(participant.lineIndex);
    syncStatusBars();

    // Reset terminal state before destroying screen
    const program = participant.ui.screen.program;
    program.showCursor();
    program.normalBuffer();
    // Reset all attributes, clear screen, home cursor
    bbs.write('\x1b[0m\x1b[2J\x1b[H');
    participant.ui.screen.destroy();
    stopCursorTimerIfIdle();
  };

  const requestExit = () => {
    cleanup();
    socket.emit('door:close');
  };

  participant.ui.screen.on('keypress', (ch: string, key: any) => {
    if (handleKeypress(participant, ch, key)) {
      requestExit();
    }
  });

  startCursorTimer();
  syncPanelsToParticipant(participant);
  syncLineAcrossParticipants(participant.lineIndex);
  syncStatusBars();

  await new Promise<void>((resolve) => {
    const finish = () => {
      cleanup();
      resolve();
    };

    socket.once('door:close', finish);
    socket.once('disconnect', finish);
  });
}

export default { runDoor, metadata };
