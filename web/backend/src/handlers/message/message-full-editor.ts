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
): Promise<string[] | 'abandoned' | 'not-run'> {
  const files = fullEditFiles(session);
  amigafs.mkdirSync(path.dirname(files.result), { recursive: true });
  for (const f of [files.include, files.result]) {
    try { amigafs.unlinkSync(f); } catch { /* not there */ }
  }
  // express.e:9952-9967 saveMsg - one line per row, only when there are rows.
  if (body.length > 0) amigafs.writeFileSync(files.include, body.map((l) => `${l}\n`).join(''));

  flushOutput(socket);
  const { runSysCommand } = require('../command-execution.handler');
  const { RESULT_SUCCESS } = require('../../constants/command-results');
  const ran = await runSysCommand(socket, session, 'FULLEDIT', '');

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
  return lines;
}
