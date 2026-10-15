/**
 * The full-screen message editor's side of express.e's edit() (10093-10141):
 * whether it is on offer, and running it - msg.i in, SysCmd FULLEDIT, msg
 * out. message-entry.handler decides what to do with the result.
 */
import * as path from 'path';

import { BBSSession } from '../../index';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/security.util';
import { config } from '../../config';
import { flushOutput } from '../../utils/output.util';
import * as amigafs from '../../utils/amigafs';
import { EditorFlag } from '../../constants/express-flags';
import { sessionLineLen } from '../../utils/flag-pause.util';
import type { EditorState } from '../../amiga-emulation/xim/editor-struct';

/**
 * express.e:10108-10109 - the full-screen editor's two files: `msg.i`, what
 * the editor starts with (the quote, or the body being edited), and `msg`,
 * what it leaves.
 */
export function fullEditFiles(session: BBSSession): { include: string; result: string } {
  const work = path.join(config.get('dataDir'), `Node${session.nodeId ?? 0}`, 'Work');
  return { include: path.join(work, 'msg.i'), result: path.join(work, 'msg') };
}

/**
 * express.e:10094-10095 - is the full-screen editor on offer? A registered
 * SysCmd FULLEDIT, ACS_FULL_EDIT, and a caller whose editor is not Line (1).
 */
export function fullEditOffered(session: BBSSession): boolean {
  const { hasSysCommand } = require('../command-execution.handler');
  return hasSysCommand('FULLEDIT')
    && checkSecurity(session.user, ACSPermission.FULL_EDIT)
    && (session.user as { editorType?: number } | undefined)?.editorType !== 1;
}

/**
 * Hand the editor msg.i, run SysCmd FULLEDIT, read msg back. Returns the
 * message lines, 'abandoned' when the caller left without saving, or
 * 'not-run' when FULLEDIT did not run.
 */
export async function editInFullScreen(
  socket: any,
  session: BBSSession,
  body: string[],
  fileAttach: { batch: boolean; attach: boolean } = { batch: false, attach: false },
): Promise<{ lines: string[]; batchRequested: boolean } | 'abandoned' | 'not-run'> {
  const files = fullEditFiles(session);
  amigafs.mkdirSync(path.dirname(files.result), { recursive: true });
  for (const f of [files.include, files.result]) {
    try { amigafs.unlinkSync(f); } catch { /* not there */ }
  }
  // express.e:9952-9967 saveMsg - one line per row, only when there are rows.
  if (body.length > 0) amigafs.writeFileSync(files.include, body.map((l) => `${l}\n`).join(''));

  session.editor = fullEditorObject(session, body.length > 0, fileAttach);

  flushOutput(socket);
  const { runSysCommand } = require('../command-execution.handler');
  const { RESULT_SUCCESS } = require('../../constants/command-results');
  const ran = await runSysCommand(socket, session, 'FULLEDIT', '');

  // express.e:10133-10143 - the editor asked for the message's batch upload
  // (a FULLEDIT door copies the object back with ED_BATCH_REQUESTED set);
  // every way out clears the four request flags.
  const editorFlags = session.editor?.editorFlags ?? 0;
  const batchRequested = (editorFlags & EditorFlag.BATCH_REQUESTED) !== 0;
  if (session.editor) session.editor.editorFlags = editorFlags & ~FILE_REQUEST_FLAGS;

  // express.e:9969-9996 loadMsg - CRs dropped, trailing empty lines removed.
  let text: string | null = null;
  if (ran === RESULT_SUCCESS) {
    try { text = amigafs.readFileSync(files.result, 'latin1').toString(); } catch { /* nothing saved */ }
  }
  for (const f of [files.include, files.result]) {
    try { amigafs.unlinkSync(f); } catch { /* not there */ }
  }
  if (ran !== RESULT_SUCCESS) return 'not-run';
  if (text === null) return 'abandoned';
  const lines = text.replace(/\r/g, '').split('\n');
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return { lines, batchRequested };
}

const FILE_REQUEST_FLAGS = EditorFlag.BATCH_UPLOAD | EditorFlag.ATTACH_FILE
  | EditorFlag.BATCH_REQUESTED | EditorFlag.ATTACH_REQUESTED;

/**
 * express.e:10106-10123 - the editor object as edit() sets it before SysCmd
 * FULLEDIT: the board's paths (`\sNode\d/Work/msg[.i]`, BBS: here), the
 * include file only when the caller has text, abort and ANSI allowed, 76
 * wide from row 1, 100 lines, and the upload / attach commands when the
 * caller may file into the message.
 */
export function fullEditorObject(
  session: BBSSession,
  hasInclude: boolean,
  fileAttach: { batch: boolean; attach: boolean },
): EditorState {
  const work = `BBS:Node${session.nodeId ?? 0}/Work`;
  let editorFlags = EditorFlag.ABORT_ALLOWED | EditorFlag.ANSI_ALLOWED;
  if (fileAttach.batch) editorFlags |= EditorFlag.BATCH_UPLOAD;
  if (fileAttach.attach) editorFlags |= EditorFlag.ATTACH_FILE;
  return {
    maxFileLength: 100,
    maxScrLength: sessionLineLen(session),
    editorTop: 1,
    editorMaxWidth: 76,
    editorFlags,
    editorFile: `${work}/msg`,
    editorIncludeFile: hasInclude ? `${work}/msg.i` : null,
    editorPrependFile: null,
    editorPostPendFile: null,
  };
}
