/**
 * rename-prompt.service.ts
 *
 * 1:1 port of express.e:19192-19256 "<file> is too long a name,
 * please rename" loop. Runs per uploaded file when the filename
 * exceeds 12 chars (express.e:19016 mandates this limit) or
 * contains characters disallowed by express.e:19223 (: / * space # + ?).
 *
 * Express.e flow (inpAgain loop):
 *   1. Print "<oldname> is too long a name, please rename."
 *   2. Print "             [------------]" (visual rule)
 *   3. Prompt "New Filename: " — accept up to 12 chars
 *   4. Empty → loop
 *   5. Exactly "RZ" → "RZ is an invalid name for a file" → loop
 *   6. Any : / * space # + ? → "You may not include any special symbols" → loop
 *   7. checkForFile dup → "The name <X> is used, please rename." → loop
 *   8. Rename(playpen/<old>, playpen/<new>) — on fail → same dup msg → loop
 *   9. Optional uppercase (LVL_CAPITOLS_in_FILE)
 *
 * Web/telnet/SSH all share the same prompt machinery: install
 * session.uploadRenameInputHandler, set subState=UPLOAD_RENAME_PROMPT,
 * route input through priority 9d in command.handler.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';

export interface RenamePromptEmitter {
  emit(event: string, ...args: unknown[]): unknown;
}

export interface RenamePromptResult {
  /** Final approved filename (may equal original if no rename needed). */
  newFilename: string;
  /** Full path of the renamed file in playpen. */
  newPath: string;
  /** True if the user aborted (carrier loss equivalent). */
  aborted: boolean;
}

interface RenameState {
  oldName: string;        // current filename being prompted
  oldPath: string;        // full path in playpen
  playpenDir: string;
  buffer: string;         // line-buffered input
  emitter: RenamePromptEmitter;
  onComplete: (result: RenamePromptResult) => void;
}

/** Express.e:19223 — chars rejected with "no special symbols" error. */
const FORBIDDEN_CHARS = /[:/* #+?]/;

/**
 * Express.e:19016 + 19223 — needs rename if length > 12 OR contains bad chars.
 */
export function needsRename(filename: string): boolean {
  if (filename.length > 12) return true;
  if (FORBIDDEN_CHARS.test(filename)) return true;
  return false;
}

/**
 * Entry point. If filename is acceptable, calls onComplete immediately
 * with the original name. Otherwise installs the rename input handler
 * and emits the first prompt.
 */
export function startRenamePrompt(
  emitter: RenamePromptEmitter,
  session: BBSSession,
  filePath: string,
  onComplete: (result: RenamePromptResult) => void,
): void {
  const oldName = path.basename(filePath);
  if (!needsRename(oldName)) {
    onComplete({ newFilename: oldName, newPath: filePath, aborted: false });
    return;
  }

  const playpenDir = path.dirname(filePath);
  const state: RenameState = {
    oldName,
    oldPath: filePath,
    playpenDir,
    buffer: '',
    emitter,
    onComplete,
  };
  (session as any).renamePromptState = state;
  (session as any).uploadRenameInputHandler = (data: Buffer | string) =>
    handleRenameInput(session, typeof data === 'string' ? data : data.toString('latin1'));

  session.subState = LoggedOnSubState.UPLOAD_RENAME_PROMPT;
  // express.e:19196-19198
  emitter.emit('ansi-output', `\r\n${oldName} is too long a name, please rename.\r\n\r\n`);
  emitter.emit('ansi-output', '             [------------]\r\n');
  emitter.emit('ansi-output', '\r\nNew Filename: ');
  // Browser side: switch to line input for terminal display compat
  emitter.emit('set-input-mode', 'line');
}

function handleRenameInput(session: BBSSession, data: string): void {
  const state = (session as any).renamePromptState as RenameState | undefined;
  if (!state) return;
  for (const ch of data) {
    if (ch === '\r' || ch === '\n') {
      state.emitter.emit('ansi-output', '\r\n');
      const name = state.buffer.trim();
      state.buffer = '';
      processRenameInput(session, name);
      return;
    }
    if (ch === '\x08' || ch === '\x7f') {
      if (state.buffer.length > 0) {
        state.buffer = state.buffer.slice(0, -1);
        state.emitter.emit('ansi-output', '\b \b');
      }
      continue;
    }
    if (state.buffer.length >= 12) continue;  // express.e:19209 max 12 chars
    state.buffer += ch;
    state.emitter.emit('ansi-output', ch);
  }
}

function processRenameInput(session: BBSSession, name: string): void {
  const state = (session as any).renamePromptState as RenameState | undefined;
  if (!state) return;

  // express.e:19215 empty → loop
  if (name.length === 0) {
    state.emitter.emit('ansi-output', '\r\nNew Filename: ');
    return;
  }

  // express.e:19216-19219 "RZ" exact → reject
  if (name.toUpperCase() === 'RZ') {
    state.emitter.emit('ansi-output', '\r\nRZ is an invalid name for a file\r\n');
    state.emitter.emit('ansi-output', '\r\nNew Filename: ');
    return;
  }

  // express.e:19222-19228 char-by-char special-char check
  if (FORBIDDEN_CHARS.test(name)) {
    state.emitter.emit('ansi-output', '\r\nYou may not include any special symbols\r\n');
    state.emitter.emit('ansi-output', '\r\nNew Filename: ');
    return;
  }

  // express.e:19230-19235 checkForFile dup
  const newPath = path.join(state.playpenDir, name);
  if (fs.existsSync(newPath) && newPath !== state.oldPath) {
    state.emitter.emit('ansi-output', `\r\nThe name ${name} is used, please rename.\r\n`);
    state.emitter.emit('ansi-output', '\r\nNew Filename: ');
    return;
  }

  // express.e:19245 rename
  try {
    if (newPath !== state.oldPath) {
      fs.renameSync(state.oldPath, newPath);
    }
  } catch (err: any) {
    state.emitter.emit('ansi-output', `\r\nThe name ${name} is used, please rename.\r\n`);
    state.emitter.emit('ansi-output', '\r\nNew Filename: ');
    return;
  }

  // Cleanup and complete
  (session as any).renamePromptState = undefined;
  (session as any).uploadRenameInputHandler = undefined;
  state.emitter.emit('ansi-output', '\r\n');
  state.onComplete({ newFilename: name, newPath, aborted: false });
}
