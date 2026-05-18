/**
 * resume-stuff.service.ts
 *
 * Port of express.e:18119-18257 resumeStuff().
 *
 * Before an interactive upload starts, scan <confDir>/PartUpload/ for
 * files whose @<slot> (or @<node>-<slot>) suffix matches the logged-on
 * user. For each, prompt:
 *
 *     Resume <fn> [<size>] (Y/N)?
 *
 *   Y → rename/copy back into the node playpen under the original
 *       filename (drop suffix). Sets "resumed" flag so caller can
 *       skip the description prompt (upload will continue from where
 *       it left off).
 *   N → "Delete (Y/N/All)?" follow-up. Y deletes; N keeps in PartUpload;
 *       All switches to silent delete-all mode for the remainder of this
 *       resume session.
 *
 * Returns:
 *   { resumed: number }      — count of files moved back to playpen
 *   { aborted: true }        — carrier dropped mid-prompt
 *
 * Caller is responsible for transitioning state OUT of the upload-
 * resume prompts and into the actual receive (lrzsz spawn or whatever
 * uLFType=0 path follows). Caller passes an `onComplete(result)`
 * callback that runs once every partial has been resolved.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';

export interface ResumeStuffEmitter {
  emit(event: string, ...args: unknown[]): unknown;
}

export interface ResumeStuffResult {
  resumed: number;
  aborted: boolean;
}

/**
 * Internal per-session state for the resume prompt loop.
 */
interface ResumeState {
  partials: { fullPath: string; basename: string; size: number }[];
  index: number;
  playpenDir: string;
  resumed: number;
  deleteAll: boolean;
  bufferedInput: string;
  emitter: ResumeStuffEmitter;
  onComplete: (result: ResumeStuffResult) => void;
}

/**
 * Public entry: scan PartUpload for user's partials, install input
 * handler if any are found, run the prompt loop. If no partials,
 * onComplete fires synchronously with resumed=0.
 */
export function startResumeStuff(
  emitter: ResumeStuffEmitter,
  session: BBSSession,
  playpenDir: string,
  config: any,
  onComplete: (result: ResumeStuffResult) => void,
): void {
  if (!session.user?.slotNumber) {
    onComplete({ resumed: 0, aborted: false });
    return;
  }
  const slot = session.user.slotNumber;
  const nodeId = session.nodeId || 0;
  const ownPartFiles = (config && typeof config.get === 'function')
    ? !!config.get('ownPartFiles')
    : false;
  const suffix = ownPartFiles ? `@${nodeId}-${slot}` : `@${slot}`;

  const { getConferenceDir } = require('../utils/file-hold.util');
  const dataDir = (config && typeof config.get === 'function')
    ? config.get('dataDir')
    : path.resolve(process.cwd(), '..', '..');
  const confDir = getConferenceDir(session.currentConf || 1, dataDir);
  const partUploadDir = path.join(confDir, 'PartUpload');

  const partials: ResumeState['partials'] = [];
  try {
    if (fs.existsSync(partUploadDir) && fs.statSync(partUploadDir).isDirectory()) {
      for (const entry of fs.readdirSync(partUploadDir)) {
        if (!entry.endsWith(suffix)) continue;
        const fullPath = path.join(partUploadDir, entry);
        let stat: fs.Stats;
        try { stat = fs.statSync(fullPath); } catch { continue; }
        if (!stat.isFile()) continue;
        partials.push({
          fullPath,
          basename: entry.slice(0, -suffix.length),
          size: stat.size,
        });
      }
    }
  } catch (err: any) {
    console.error(`[resumeStuff] scan failed: ${err?.message || err}`);
    onComplete({ resumed: 0, aborted: false });
    return;
  }

  console.log(`[resumeStuff] scan: confDir=${confDir} partUploadDir=${partUploadDir} suffix=${suffix} matches=${partials.length}`);
  if (partials.length === 0) {
    onComplete({ resumed: 0, aborted: false });
    return;
  }

  const state: ResumeState = {
    partials,
    index: 0,
    playpenDir,
    resumed: 0,
    deleteAll: false,
    bufferedInput: '',
    emitter,
    onComplete,
  };
  (session as any).resumeStuffState = state;

  // Install input handler. command.handler.ts must route input through
  // session.uploadResumeInputHandler when subState is in
  // UPLOAD_RESUME_PROMPT or UPLOAD_RESUME_DELETE.
  (session as any).uploadResumeInputHandler = (data: Buffer | string) =>
    handleResumeInput(session, typeof data === 'string' ? data : data.toString('latin1'));

  session.subState = LoggedOnSubState.UPLOAD_RESUME_PROMPT;
  console.log(`[resumeStuff] subState SET to UPLOAD_RESUME_PROMPT`);

  // DIAG: trap any subsequent subState writes during this resume
  // session and log who's clobbering it. Self-removes after the
  // resume state ends. Use a private symbol to back the value
  // so we can keep the getter/setter without infinite recursion.
  const sessAny = session as any;
  if (!sessAny.__subStateTrapped) {
    const initial = session.subState;
    let backing = initial;
    sessAny.__subStateTrapped = true;
    Object.defineProperty(session, 'subState', {
      configurable: true,
      get() { return backing; },
      set(v) {
        if (backing !== v) {
          const stack = new Error().stack?.split('\n').slice(2, 7).join('\n          ') || '?';
          console.log(`[subState] ${backing} -> ${v}\n          ${stack}`);
        }
        backing = v;
      },
    });
    // schedule removal of the trap after a short window so we don't
    // spam logs for the rest of the session.
    setTimeout(() => {
      try {
        delete sessAny.__subStateTrapped;
        Object.defineProperty(session, 'subState', { value: backing, writable: true, configurable: true });
      } catch (_e) {}
    }, 5000);
  }

  emitNextPrompt(session);
}

function emitNextPrompt(session: BBSSession): void {
  const state = (session as any).resumeStuffState as ResumeState | undefined;
  if (!state) return;
  if (state.index >= state.partials.length) {
    finish(session);
    return;
  }
  const p = state.partials[state.index];
  // express.e:18180 ' \s Resume \s [\d bytes] (Y/N)?'
  // (The exact format varies by version; using the canonical pattern.)
  state.emitter.emit('ansi-output', `\r\nResume ${p.basename} [${p.size} bytes] (Y/N)? `);
  session.subState = LoggedOnSubState.UPLOAD_RESUME_PROMPT;
  state.bufferedInput = '';
}

function emitDeletePrompt(session: BBSSession): void {
  const state = (session as any).resumeStuffState as ResumeState | undefined;
  if (!state) return;
  state.emitter.emit('ansi-output', '\r\nDelete (Y/N/All)? ');
  session.subState = LoggedOnSubState.UPLOAD_RESUME_DELETE;
  state.bufferedInput = '';
}

function finish(session: BBSSession): void {
  const state = (session as any).resumeStuffState as ResumeState | undefined;
  if (!state) return;
  (session as any).resumeStuffState = undefined;
  (session as any).uploadResumeInputHandler = undefined;
  state.onComplete({ resumed: state.resumed, aborted: false });
}

/**
 * Per-keystroke input handler installed during the resume prompt loop.
 * Buffers until Enter, then dispatches based on current subState.
 */
function handleResumeInput(session: BBSSession, data: string): void {
  const state = (session as any).resumeStuffState as ResumeState | undefined;
  if (!state) return;

  for (const ch of data) {
    if (ch === '\r' || ch === '\n') {
      const answer = state.bufferedInput.trim().toUpperCase();
      state.emitter.emit('ansi-output', '\r\n');
      state.bufferedInput = '';
      processAnswer(session, answer);
      return;
    }
    if (ch === '\x08' || ch === '\x7f') {
      // backspace
      if (state.bufferedInput.length > 0) {
        state.bufferedInput = state.bufferedInput.slice(0, -1);
        state.emitter.emit('ansi-output', '\b \b');
      }
      continue;
    }
    // For Y/N/A single-char answers we accept the first char as the
    // answer without requiring Enter, matching express.e readChar
    // semantics for prompt loops.
    if (state.bufferedInput.length === 0 && /^[YNAyna]$/.test(ch)) {
      state.bufferedInput = ch;
      state.emitter.emit('ansi-output', ch);
      // Auto-submit on single-char Y/N/A
      const answer = ch.toUpperCase();
      state.emitter.emit('ansi-output', '\r\n');
      state.bufferedInput = '';
      processAnswer(session, answer);
      return;
    }
    state.bufferedInput += ch;
    state.emitter.emit('ansi-output', ch);
  }
}

function processAnswer(session: BBSSession, answer: string): void {
  const state = (session as any).resumeStuffState as ResumeState | undefined;
  if (!state) return;
  const p = state.partials[state.index];

  if (session.subState === LoggedOnSubState.UPLOAD_RESUME_PROMPT) {
    if (answer === 'Y') {
      // Move back to playpen under original filename
      try {
        if (!fs.existsSync(state.playpenDir)) {
          fs.mkdirSync(state.playpenDir, { recursive: true });
        }
        const dest = path.join(state.playpenDir, p.basename);
        try {
          fs.renameSync(p.fullPath, dest);
        } catch (err: any) {
          if (err?.code === 'EXDEV') {
            fs.copyFileSync(p.fullPath, dest);
            fs.unlinkSync(p.fullPath);
          } else throw err;
        }
        state.resumed++;
        console.log(`[resumeStuff] resumed ${p.basename}`);
      } catch (err: any) {
        console.error(`[resumeStuff] resume ${p.basename} failed: ${err?.message || err}`);
        state.emitter.emit('ansi-output', `\r\n\x1b[31mFailed to resume ${p.basename}\x1b[0m\r\n`);
      }
      state.index++;
      emitNextPrompt(session);
    } else {
      // N (or anything else) → Delete prompt
      if (state.deleteAll) {
        // Silent delete-all mode set on a prior answer
        try { fs.unlinkSync(p.fullPath); } catch (_e) {}
        state.index++;
        emitNextPrompt(session);
      } else {
        emitDeletePrompt(session);
      }
    }
    return;
  }

  if (session.subState === LoggedOnSubState.UPLOAD_RESUME_DELETE) {
    if (answer === 'A') {
      state.deleteAll = true;
      // Delete the current AND all remaining
      try { fs.unlinkSync(p.fullPath); } catch (_e) {}
      for (let j = state.index + 1; j < state.partials.length; j++) {
        try { fs.unlinkSync(state.partials[j].fullPath); } catch (_e) {}
      }
      state.emitter.emit('ansi-output', `Deleted all ${state.partials.length - state.index} remaining\r\n`);
      finish(session);
      return;
    }
    if (answer === 'Y') {
      try { fs.unlinkSync(p.fullPath); } catch (err: any) {
        console.error(`[resumeStuff] delete ${p.basename} failed: ${err?.message || err}`);
      }
      state.index++;
      emitNextPrompt(session);
      return;
    }
    // N or anything else: keep file, move on
    state.index++;
    emitNextPrompt(session);
    return;
  }
}
