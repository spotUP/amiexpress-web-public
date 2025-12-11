/**
 * Door Manager - .info File Editor Module
 *
 * Provides terminal UI for editing Amiga .info files (tooltypes)
 * Uses info-file.util.ts for binary .info file parsing/writing
 */

import * as fs from 'fs';
import * as path from 'path';
import { Socket } from 'socket.io';
import {
  parseInfoFile as parseInfoFileUtil,
  writeInfoFile as writeInfoFileUtil,
  updateTooltype,
  removeTooltype,
  addTooltype as addTooltypeUtil,
  toggleTooltypeComment,
  InfoFile,
  Tooltype
} from '../utils/info-file.util';

export interface InfoEditorState {
  infoFile?: InfoFile;
  infoSelectedIndex?: number;
  infoEditingKey?: string;
  infoEditBuffer?: string;
  infoHasChanges?: boolean;
  scrollOffset: number;
}

export interface InfoEditorCallbacks {
  onBack: () => void;
  onQuit: () => void;
}

/**
 * Find .info file for a door
 */
export function findInfoFile(
  doorId: string,
  doorsPath: string,
  projectRoot: string
): string | null {
  // 1. Check for .info in door directory (local .info file)
  const doorDir = path.join(doorsPath, doorId);
  if (fs.existsSync(doorDir)) {
    const localInfoFiles = fs.readdirSync(doorDir).filter(f => f.endsWith('.info'));
    if (localInfoFiles.length > 0) {
      return path.join(doorDir, localInfoFiles[0]);
    }
  }

  // 2. Check Commands/BBSCmd/ for matching command .info
  const bbsCmdPath = path.join(projectRoot, 'Commands', 'BBSCmd');
  if (fs.existsSync(bbsCmdPath)) {
    const cmdFiles = fs.readdirSync(bbsCmdPath).filter(f => f.endsWith('.info'));
    for (const cmdFile of cmdFiles) {
      const cmdPath = path.join(bbsCmdPath, cmdFile);
      const cmdName = path.basename(cmdFile, '.info');

      // First check if filename matches (e.g., ADVENTURE.info for door "ADVENTURE")
      if (cmdName.toLowerCase() === doorId.toLowerCase()) {
        return cmdPath;
      }

      // Fallback to checking LOCATION tooltype
      try {
        const info = parseInfoFileUtil(cmdPath);
        const location = info.tooltypes.find(t => t.key === 'LOCATION')?.value;
        if (location && location.toLowerCase().includes(doorId.toLowerCase())) {
          return cmdPath;
        }
      } catch { continue; }
    }
  }

  // 3. Check Commands/SysCmd/ for matching command .info
  const sysCmdPath = path.join(projectRoot, 'Commands', 'SysCmd');
  if (fs.existsSync(sysCmdPath)) {
    const cmdFiles = fs.readdirSync(sysCmdPath).filter(f => f.endsWith('.info'));
    for (const cmdFile of cmdFiles) {
      const cmdPath = path.join(sysCmdPath, cmdFile);
      const cmdName = path.basename(cmdFile, '.info');

      // First check if filename matches
      if (cmdName.toLowerCase() === doorId.toLowerCase()) {
        return cmdPath;
      }

      // Fallback to checking LOCATION tooltype
      try {
        const info = parseInfoFileUtil(cmdPath);
        const location = info.tooltypes.find(t => t.key === 'LOCATION')?.value;
        if (location && location.toLowerCase().includes(doorId.toLowerCase())) {
          return cmdPath;
        }
      } catch { continue; }
    }
  }

  return null;
}

/**
 * Parse .info file and initialize state
 */
export function openInfoFile(infoPath: string): InfoEditorState {
  const infoFile = parseInfoFileUtil(infoPath);
  return {
    infoFile,
    infoSelectedIndex: 0,
    infoEditingKey: undefined,
    infoEditBuffer: undefined,
    infoHasChanges: false,
    scrollOffset: 0
  };
}

/**
 * Render the .info editor UI
 */
export function renderInfoEditor(socket: Socket, state: InfoEditorState): void {
  if (!state.infoFile) return;

  const info = state.infoFile;
  const tooltypes = info.tooltypes;
  const selectedIndex = state.infoSelectedIndex || 0;
  const pageSize = 15;
  const scrollOffset = state.scrollOffset;

  socket.emit('ansi-output', '\x1b[2J\x1b[H');

  // Header
  const filename = path.basename(info.filePath);
  const header = ` Tooltype Editor: ${filename} `;
  const padding = Math.max(0, 76 - header.length);
  socket.emit('ansi-output', '\x1b[44;37;1m' + header + ' '.repeat(padding) + '\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[90m' + '-'.repeat(76) + '\x1b[0m\r\n');

  // Column headers
  socket.emit('ansi-output', '\x1b[33m  #  Key                    Value                                      \x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[90m' + '-'.repeat(76) + '\x1b[0m\r\n');

  // Tooltype list
  if (tooltypes.length === 0) {
    socket.emit('ansi-output', '  \x1b[90m(No tooltypes defined)\x1b[0m\r\n');
  } else {
    const startIdx = scrollOffset;
    const endIdx = Math.min(tooltypes.length, startIdx + pageSize);

    for (let i = startIdx; i < endIdx; i++) {
      const tt = tooltypes[i];
      const isSelected = i === selectedIndex;
      const prefix = isSelected ? '\x1b[47;30m>' : ' ';
      const suffix = isSelected ? '\x1b[0m' : '';

      // Format: # | Key | Value
      const num = String(i + 1).padStart(3);
      const key = (tt.commented ? '!' : '') + tt.key;
      const keyDisplay = key.substring(0, 20).padEnd(20);
      const valueDisplay = tt.value.substring(0, 45).padEnd(45);

      const color = tt.commented ? '\x1b[90m' : '\x1b[36m';
      socket.emit('ansi-output', `${prefix} ${num}  ${color}${keyDisplay}\x1b[0m ${valueDisplay}${suffix}\r\n`);
    }

    // Scroll indicator
    if (tooltypes.length > pageSize) {
      const pages = Math.ceil(tooltypes.length / pageSize);
      const currentPage = Math.floor(scrollOffset / pageSize) + 1;
      socket.emit('ansi-output', `\x1b[90m  Page ${currentPage}/${pages} (${tooltypes.length} tooltypes)\x1b[0m\r\n`);
    }
  }

  // Status line
  if (state.infoHasChanges) {
    socket.emit('ansi-output', '\r\n\x1b[33m  * Unsaved changes\x1b[0m\r\n');
  }

  // Footer with commands
  socket.emit('ansi-output', '\r\n\x1b[90m' + '-'.repeat(76) + '\x1b[0m\r\n');

  if (state.infoEditingKey !== undefined) {
    // In edit mode
    socket.emit('ansi-output', '\x1b[33m  Editing: \x1b[36m' + state.infoEditingKey + '\x1b[0m\r\n');
    socket.emit('ansi-output', '  Value: \x1b[37m' + (state.infoEditBuffer || '') + '\x1b[0m_\r\n');
    socket.emit('ansi-output', '\x1b[90m  [Enter] Save  [Esc] Cancel\x1b[0m\r\n');
  } else {
    // Normal mode
    socket.emit('ansi-output', '\x1b[36m  [UP/DOWN]\x1b[0m Navigate  ');
    socket.emit('ansi-output', '\x1b[36m[Enter]\x1b[0m Edit  ');
    socket.emit('ansi-output', '\x1b[36m[A]\x1b[0m Add  ');
    socket.emit('ansi-output', '\x1b[36m[D]\x1b[0m Delete  ');
    socket.emit('ansi-output', '\x1b[36m[T]\x1b[0m Toggle  ');
    socket.emit('ansi-output', '\x1b[36m[S]\x1b[0m Save  ');
    socket.emit('ansi-output', '\x1b[36m[B]\x1b[0m Back\r\n');
  }
}

/**
 * Handle input in .info editor mode
 * Returns updated state
 */
export function handleInfoEditorInput(
  key: string,
  rawData: string,
  state: InfoEditorState,
  socket: Socket,
  callbacks: InfoEditorCallbacks
): InfoEditorState {
  if (!state.infoFile) {
    callbacks.onBack();
    return state;
  }

  const tooltypes = state.infoFile.tooltypes;
  const selectedIndex = state.infoSelectedIndex || 0;
  const pageSize = 15;

  // Check if in editing mode
  if (state.infoEditingKey !== undefined) {
    // Escape - cancel edit
    if (rawData === '\x1b' || rawData === '\x1b\x1b') {
      state.infoEditingKey = undefined;
      state.infoEditBuffer = undefined;
      renderInfoEditor(socket, state);
      return state;
    }

    // Enter - save edit or move to value entry
    if (key === '\r' || key === '\n') {
      // Adding new tooltype - two-phase: key, then value
      if (state.infoEditingKey === '__NEW__') {
        const newKey = (state.infoEditBuffer || '').toUpperCase().trim();
        if (newKey) {
          // Check if key already exists
          if (state.infoFile.tooltypes.some(t => t.key === newKey)) {
            socket.emit('ansi-output', `\r\n\x1b[31mTooltype ${newKey} already exists!\x1b[0m\r\n`);
            setTimeout(() => renderInfoEditor(socket, state), 1500);
            state.infoEditingKey = undefined;
            state.infoEditBuffer = undefined;
            return state;
          }
          // Move to value entry phase
          state.infoEditingKey = '__NEW_VALUE__:' + newKey;
          state.infoEditBuffer = '';
          socket.emit('ansi-output', `\r\n\x1b[33mEnter value for ${newKey}: \x1b[0m`);
        } else {
          state.infoEditingKey = undefined;
          state.infoEditBuffer = undefined;
          renderInfoEditor(socket, state);
        }
        return state;
      }

      // Adding new tooltype value phase
      if (state.infoEditingKey?.startsWith('__NEW_VALUE__:')) {
        const newKey = state.infoEditingKey.replace('__NEW_VALUE__:', '');
        const newValue = state.infoEditBuffer || '';
        try {
          state.infoFile = addTooltypeUtil(state.infoFile, newKey, newValue, false);
          state.infoHasChanges = true;
          state.infoSelectedIndex = state.infoFile.tooltypes.length - 1;
        } catch (error) {
          socket.emit('ansi-output', `\r\n\x1b[31m${(error as Error).message}\x1b[0m\r\n`);
        }
        state.infoEditingKey = undefined;
        state.infoEditBuffer = undefined;
        renderInfoEditor(socket, state);
        return state;
      }

      // Editing existing tooltype
      const tt = tooltypes[selectedIndex];
      if (tt && state.infoEditBuffer !== undefined) {
        state.infoFile = updateTooltype(
          state.infoFile,
          tt.key,
          state.infoEditBuffer,
          tt.commented
        );
        state.infoHasChanges = true;
      }
      state.infoEditingKey = undefined;
      state.infoEditBuffer = undefined;
      renderInfoEditor(socket, state);
      return state;
    }

    // Backspace
    if (key === '\x7f' || key === '\b') {
      if (state.infoEditBuffer && state.infoEditBuffer.length > 0) {
        state.infoEditBuffer = state.infoEditBuffer.slice(0, -1);
        renderInfoEditor(socket, state);
      }
      return state;
    }

    // Printable character
    if (key.length === 1 && key.charCodeAt(0) >= 32 && key.charCodeAt(0) < 127) {
      state.infoEditBuffer = (state.infoEditBuffer || '') + key;
      renderInfoEditor(socket, state);
      return state;
    }

    return state;
  }

  // Normal mode navigation

  // Up arrow
  if (rawData === '\x1b[A' || rawData === '\x1b\x5b\x41') {
    if (selectedIndex > 0) {
      state.infoSelectedIndex = selectedIndex - 1;
      // Adjust scroll
      if (state.infoSelectedIndex < state.scrollOffset) {
        state.scrollOffset = Math.max(0, state.scrollOffset - pageSize);
      }
      renderInfoEditor(socket, state);
    }
    return state;
  }

  // Down arrow
  if (rawData === '\x1b[B' || rawData === '\x1b\x5b\x42') {
    if (selectedIndex < tooltypes.length - 1) {
      state.infoSelectedIndex = selectedIndex + 1;
      // Adjust scroll
      if (state.infoSelectedIndex >= state.scrollOffset + pageSize) {
        state.scrollOffset = state.infoSelectedIndex - pageSize + 1;
      }
      renderInfoEditor(socket, state);
    }
    return state;
  }

  // Enter - edit selected tooltype value
  if ((key === '\r' || key === '\n') && tooltypes.length > 0) {
    const tt = tooltypes[selectedIndex];
    if (tt) {
      state.infoEditingKey = tt.key;
      state.infoEditBuffer = tt.value;
      renderInfoEditor(socket, state);
    }
    return state;
  }

  // A - Add new tooltype
  if (key === 'a') {
    socket.emit('ansi-output', '\r\n\x1b[33mEnter tooltype key: \x1b[0m');
    state.infoEditingKey = '__NEW__';
    state.infoEditBuffer = '';
    return state;
  }

  // D - Delete selected tooltype
  if (key === 'd' && tooltypes.length > 0) {
    const tt = tooltypes[selectedIndex];
    if (tt) {
      state.infoFile = removeTooltype(state.infoFile, tt.key);
      state.infoHasChanges = true;
      // Adjust selection
      if (selectedIndex >= state.infoFile.tooltypes.length) {
        state.infoSelectedIndex = Math.max(0, state.infoFile.tooltypes.length - 1);
      }
      renderInfoEditor(socket, state);
    }
    return state;
  }

  // T - Toggle comment status
  if (key === 't' && tooltypes.length > 0) {
    const tt = tooltypes[selectedIndex];
    if (tt) {
      state.infoFile = toggleTooltypeComment(state.infoFile, tt.key);
      state.infoHasChanges = true;
      renderInfoEditor(socket, state);
    }
    return state;
  }

  // S - Save changes
  if (key === 's' && state.infoHasChanges) {
    try {
      writeInfoFileUtil(state.infoFile);
      state.infoHasChanges = false;
      socket.emit('ansi-output', '\r\n\x1b[32mSaved successfully!\x1b[0m\r\n');
      setTimeout(() => renderInfoEditor(socket, state), 1000);
    } catch (error) {
      socket.emit('ansi-output', `\r\n\x1b[31mError saving: ${(error as Error).message}\x1b[0m\r\n`);
      setTimeout(() => renderInfoEditor(socket, state), 2000);
    }
    return state;
  }

  // B - Back to info page
  if (key === 'b') {
    callbacks.onBack();
    return state;
  }

  // Q - Quit
  if (key === 'q') {
    callbacks.onQuit();
    return state;
  }

  return state;
}
