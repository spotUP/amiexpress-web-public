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
  emitNextPrompt(session);
}

/** StringF's `\s[12]`: the name in a twelve-column field. */
function name12(name: string): string {
  return name.length >= 12 ? name.slice(0, 12) : name.padEnd(12);
}

/**
 * express.e:18150-18156 - the next partial. Under "All" every one left is
 * deleted without asking (removeAll, 18153-18154, 18171, 18187-18188).
 */
function emitNextPrompt(session: BBSSession): void {
  const state = (session as any).resumeStuffState as ResumeState | undefined;
  if (!state) return;
  while (state.deleteAll && state.index < state.partials.length) {
    const p = state.partials[state.index];
    state.emitter.emit('ansi-output', `Delete ${name12(p.basename)} [${p.size}] All.. Deleted!\r\n`);
    try { fs.unlinkSync(p.fullPath); } catch { /* DeleteFile of nothing */ }
    state.index++;
  }
  if (state.index >= state.partials.length) {
    finish(session);
    return;
  }
  const p = state.partials[state.index];
  state.emitter.emit('ansi-output', `Resume ${name12(p.basename)} [${p.size}] (Y/N)? `);
  session.subState = LoggedOnSubState.UPLOAD_RESUME_PROMPT;
}

function finish(session: BBSSession): void {
  const state = (session as any).resumeStuffState as ResumeState | undefined;
  if (!state) return;
  (session as any).resumeStuffState = undefined;
  (session as any).uploadResumeInputHandler = undefined;
  state.onComplete({ resumed: state.resumed, aborted: false });
}

/** Each key is one readChar (express.e:18170, 18182); other keys are read and dropped. */
function handleResumeInput(session: BBSSession, data: string): void {
  for (const ch of data) {
    if (!(session as any).resumeStuffState) return;
    processAnswer(session, ch.toUpperCase());
  }
}

function processAnswer(session: BBSSession, answer: string): void {
  const state = (session as any).resumeStuffState as ResumeState | undefined;
  if (!state) return;
  const p = state.partials[state.index];

  if (session.subState === LoggedOnSubState.UPLOAD_RESUME_PROMPT) {
    if (answer === 'N') {
      // express.e:18177-18178
      state.emitter.emit('ansi-output', 'No!   Delete (Y/N/All)? ');
      session.subState = LoggedOnSubState.UPLOAD_RESUME_DELETE;
      return;
    }
    if (answer !== 'Y') return;
    // express.e:18217-18249 - back to the playpen under its own name, and
    // resumeStuff returns: one partial resumes per upload. A move that fails
    // is silent there too.
    state.emitter.emit('ansi-output', 'Yes..\r\n');
    state.emitter.emit('ansi-output', `\r\nResuming upload: ${p.basename}\r\n\r\n`);
    try {
      if (!fs.existsSync(state.playpenDir)) fs.mkdirSync(state.playpenDir, { recursive: true });
      const dest = path.join(state.playpenDir, p.basename);
      try {
        fs.renameSync(p.fullPath, dest);
        // rename preserves mtime, which would leave the restored partial
        // looking older than this logon - and cleanPlayPen now refuses to
        // claim anything that old. Stamp it as this session's so a second
        // abort files it again instead of orphaning it in the playpen.
        try {
          const nowTs = new Date();
          fs.utimesSync(dest, nowTs, nowTs);
        } catch { /* best effort: attribution only */ }
      } catch (err: any) {
        if (err?.code === 'EXDEV') {
          fs.copyFileSync(p.fullPath, dest);
          fs.unlinkSync(p.fullPath);
        } else throw err;
      }
      state.resumed++;
    } catch (err: any) {
      console.error(`[resumeStuff] resume ${p.basename} failed: ${err?.message || err}`);
    }
    finish(session);
    return;
  }

  if (session.subState === LoggedOnSubState.UPLOAD_RESUME_DELETE) {
    if (answer === 'N') {
      // express.e:18196-18198
      state.emitter.emit('ansi-output', 'No!\r\n');
      state.index++;
      emitNextPrompt(session);
      return;
    }
    if (answer !== 'Y' && answer !== 'A') return;
    if (answer === 'A') state.deleteAll = true;
    // express.e:18209-18216
    state.emitter.emit('ansi-output', state.deleteAll ? 'All.. Deleted!\r\n' : 'Yes.. Deleted!\r\n');
    try { fs.unlinkSync(p.fullPath); } catch (err: any) {
      console.error(`[resumeStuff] delete ${p.basename} failed: ${err?.message || err}`);
    }
    state.index++;
    emitNextPrompt(session);
  }
}
