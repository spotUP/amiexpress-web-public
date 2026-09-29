/**
 * The board's EXAMINE step for an upload that has landed: express.e:19573-19600.
 *
 *   runSysCommand('EXAMINE', <playpen file>), then EXAMINE1, EXAMINE2 ... while
 *   each one runs; then, if `<nodeWorkDir><filename>` exists, its first line
 *   is the description's first line and the rest are its continuation lines.
 *
 * EXAMINE is a SYSTEM COMMAND - `Commands/SysCmd/EXAMINE.info`, a door - not a
 * shell string. File Description (MST-FD11) installs itself there: it pulls the
 * FILE_ID.DIZ, strips BBS ads, adds the uploader's tagline and writes the
 * result to `BBS:Node<n>/Work/<filename>`. The upload paths only ever ran the
 * built-in FILE_ID reader, so the door never ran and the tagline never reached
 * the listing (sysop, 2026-09-29: "i dont see it under the file_id").
 *
 * Returns the description lines, or null when EXAMINE is not registered, did
 * not run, or left no description - the caller then falls back to the
 * built-in FILE_ID.DIZ reader, which is what the board did before.
 */
import * as path from 'path';

import type { BBSSession } from '../index';
import { config } from '../config';
import { flushOutput } from '../utils/output.util';
import { getNodeWorkDir } from '../utils/bbs-paths.util';
import * as amigafs from '../utils/amigafs';

/** `BBS:Node1/Playpen/FILE.LHA` - the file as a door is told of it (express.e:19573-19576). */
export function amigaPathOf(dataDir: string, hostPath: string): string | null {
  const relative = path.relative(dataDir, hostPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return `BBS:${relative.split(path.sep).join('/')}`;
}

export async function examineUpload(
  socket: any,
  session: BBSSession,
  playpenPath: string,
  filename: string,
  maxLines: number,
): Promise<string[] | null> {
  const { hasSysCommand, runSysCommand } = require('../handlers/command-execution.handler');
  const { RESULT_SUCCESS } = require('../constants/command-results');
  if (!hasSysCommand('EXAMINE')) return null;

  const dataDir = config.get('dataDir');
  const target = amigaPathOf(dataDir, playpenPath);
  if (!target) return null; // not somewhere a door can open it

  const workFile = path.join(getNodeWorkDir(session.nodeId ?? 0, dataDir), filename);
  amigafs.mkdirSync(path.dirname(workFile), { recursive: true });
  // A description left by an earlier upload of the same name is not this one's.
  try { amigafs.unlinkSync(workFile); } catch { /* not there */ }

  // The door takes over the caller's screen; whatever this flow has buffered
  // goes first.
  flushOutput(socket);

  // express.e:19579-19589: EXAMINE, then EXAMINE<n> until one does not run.
  // (FILEDIZ_SYSCMD, which can end the chain early when the diz door found
  // nothing, is a BBS-config tooltype this board does not read; unset is
  // express.e's own default.)
  const savedSubState = session.subState;
  if ((await runSysCommand(socket, session, 'EXAMINE', target)) !== RESULT_SUCCESS) {
    session.subState = savedSubState;
    return null;
  }
  for (let i = 1; (await runSysCommand(socket, session, `EXAMINE${i}`, target)) === RESULT_SUCCESS; i++) {
    /* each ran; the next may add to what the last one wrote */
  }
  // A door exit sends the session back to the menu; the upload is not done.
  session.subState = savedSubState;

  let text: string;
  try {
    text = amigafs.readFileSync(workFile, 'latin1').toString();
  } catch {
    return null;
  }
  try { amigafs.unlinkSync(workFile); } catch { /* already gone */ }

  // express.e:19591-19600: ReadStr per line, at most max_desclines.
  const lines = text.replace(/\r/g, '').split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.length > 0 ? lines.slice(0, maxLines) : null;
}
