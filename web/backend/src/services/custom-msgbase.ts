/**
 * `customMsgbaseCmd` - a conference whose message base is a DOOR.
 *
 * express.e:12426-12437:
 *
 *     PROC customMsgbaseCmd(msgcmd,confnum,passCmdLine)
 *       IF passCmdLine
 *         StrCopy(customMsgCmd,commandText)
 *       ELSE
 *         StrCopy(customMsgCmd,'')
 *       ENDIF
 *       customMsgParam1:=msgcmd
 *       customMsgParam2:=confnum
 *       runCommand(CMDTYPE_CUSTOM,'MSGBASE.DEF','',1)
 *     ENDPROC
 *
 * A conference carrying the tooltype `CUSTOM` does not use the board's own
 * MailStats/HeaderFile pipeline at all. Every message command it owns - read,
 * enter, scan, stats, comment to sysop, zoom - is handed instead to ONE door,
 * named `MSGBASE.DEF` and resolved in the conference's own directory
 * (`TOOLTYPE_CONFCMD2`, tooltypes.e:62-64). The door is told which function it
 * is standing in for through `param1`, and which conference through `param2`,
 * because AmigaDOS gives a door one argument and that argument is the node.
 *
 * THIS IS WHY IT IS WORTH HAVING. It is one opt-in per conference instead of
 * six `Commands/BBSCmd/<CMD>.info` overrides per board, it is what a real
 * AmiExpress does (so a door written against it runs on one), and it makes the
 * expensive-looking things cheap: `MS` scans every conference by walking them
 * itself and calling this once per conference (express.e:25260-25268 into
 * 5120-5125), so a door never needs to enumerate anything.
 *
 * Three branches in `conference.handler.ts` named this function in a comment
 * and did nothing, because it did not exist: *"We don't have customMsgbaseCmd
 * (no in-tree CUSTOM message base implementation), so the CUSTOM branch is a
 * no-op"*. A CUSTOM conference was therefore a conference with no mail at all.
 */
import * as fs from 'fs';
import * as path from 'path';

import { BBSSession } from '../index';
import { conferenceDir } from '../conferences/conference-paths';
import { readTooltypeMap } from '../utils/info-file.util';
import { getConferenceToolFlags } from '../utils/conference-tooltypes.util';

/**
 * The message functions, from `axenums.e:27`. There is no 5 - the gap is in
 * AmiExpress, not here, and inventing one would put this port's numbering
 * half a step out from every door written for a real board.
 */
export enum MailFunction {
  READ = 1,
  CREATE = 2,
  SCAN = 3,
  STATS = 4,
  SYSOP_COMMENT = 6,
  ZOOM = 7,
}

/** The file a conference names its message-base door with. */
const MSGBASE_DEF = 'MSGBASE.DEF';

export interface CustomMsgbaseDoor {
  /** Absolute path to the door, from the `.info`'s LOCATION. */
  path: string;
  /** What the `.info` is called, which is what the door is launched as. */
  name: string;
  /** DOORTYPE from the icon's TYPE tooltype; XIM unless it says otherwise. */
  type: string;
  accessLevel: number;
}

/**
 * Is this conference's message base a door, and if so which one?
 *
 * Returns null when the conference is an ordinary one, when it claims `CUSTOM`
 * but ships no `MSGBASE.DEF`, or when the icon names a door that is not on the
 * disk. **A conference that says CUSTOM and cannot produce a door falls back to
 * the board's own message base**, which is the only safe direction: the other
 * way round is a conference whose mail silently does not exist.
 */
export function customMsgbaseDoor(
  bbsRoot: string,
  conferenceNumber: number,
): CustomMsgbaseDoor | null {
  if (!getConferenceToolFlags(conferenceNumber).custom) return null;

  // `Conf<n>/` is NOT the path - the directory is whatever `LOCATION.n` says,
  // which is exactly what express.e's `currentConfDir` holds at this point.
  const dir = conferenceDir(bbsRoot, conferenceNumber);
  if (!dir) return null;

  const icon = path.join(dir, `${MSGBASE_DEF}.info`);
  if (!fs.existsSync(icon)) return null;

  let tooltypes: Map<string, string>;
  try {
    tooltypes = readTooltypeMap(icon);
  } catch {
    return null;
  }

  const location = (tooltypes.get('LOCATION') || '').trim();
  if (!location) return null;

  // Amiga assigns (`BBS:Doors/SUBS/subs`) reach the same file as a path.
  const resolved = location.includes(':')
    ? path.join(bbsRoot, location.slice(location.indexOf(':') + 1))
    : path.resolve(bbsRoot, location);
  if (!fs.existsSync(resolved)) return null;

  const level = parseInt(tooltypes.get('ACCESS') || '', 10);

  return {
    path: resolved,
    name: MSGBASE_DEF,
    type: (tooltypes.get('TYPE') || 'XIM').toUpperCase(),
    accessLevel: Number.isFinite(level) ? level : 0,
  };
}

/**
 * Run the conference's message-base door for one message function.
 *
 * `commandText` is express.e's `passCmdLine`: the command line the caller
 * typed, passed for `R`/`E`/`C` (which take arguments) and empty for the scan
 * and the stats, which nobody types.
 *
 * Returns false when there is no such door, so every call site can fall
 * through to the board's own implementation rather than leaving the caller
 * with nothing.
 */
export async function runCustomMsgbaseCommand(
  socket: any,
  session: BBSSession,
  fn: MailFunction,
  conferenceNumber: number,
  commandText = '',
): Promise<boolean> {
  const { config } = require('../config');
  const bbsRoot = config.get('dataDir');

  const door = customMsgbaseDoor(bbsRoot, conferenceNumber);
  if (!door) return false;

  /*
   * The three values the door reads back over XIM 600 / 601 / 605. They live
   * on the session because that is where the door's own message handler can
   * reach them, and they are set BEFORE the launch for the same reason
   * express.e sets its globals before runCommand: the door asks for them as
   * its first act.
   */
  (session as any).customMsgParam1 = fn;
  (session as any).customMsgParam2 = conferenceNumber;
  (session as any).customMsgCmd = commandText;

  const { executeDoor } = require('../handlers/door.handler');
  try {
    await executeDoor(socket, session, {
      id: 'msgbase-def',
      name: door.name,
      command: door.name,
      description: `custom message base for conference ${conferenceNumber}`,
      type: door.type,
      path: door.path,
      accessLevel: door.accessLevel,
      enabled: true,
      parameters: [],
    });
  } finally {
    /*
     * CLEARED ON THE WAY OUT, always. A door that reads 600 after some LATER
     * command launched it would be told it is a message-base invocation and
     * act like one - the same class of bug as a stale `doorCommand`, and this
     * one would have a door writing mail nobody asked for.
     */
    (session as any).customMsgParam1 = undefined;
    (session as any).customMsgParam2 = undefined;
    (session as any).customMsgCmd = undefined;
  }

  return true;
}

/**
 * The call site's whole job, for the commands a caller TYPES.
 *
 * `R`, `E`, `EALL` and `C` each read as "if this conference's message base is
 * a door, that door answers; otherwise do what the board has always done" -
 * which is exactly the shape of express.e:25525-25530, 24864-24869 and
 * 24664-24668. Written once so the four sites cannot drift apart, and so the
 * conference the command applies to is read from one place.
 *
 * Returns true when the door ran and the caller has been served.
 */
export async function tryCustomMsgbase(
  socket: any,
  session: BBSSession,
  fn: MailFunction,
  commandText = '',
): Promise<boolean> {
  const conf = session.currentConf || 0;
  if (conf <= 0) return false;
  try {
    return await runCustomMsgbaseCommand(socket, session, fn, conf, commandText);
  } catch (error) {
    // A door that will not launch must not take the command down with it: the
    // board's own message base is still there and still works.
console.error('[customMsgbase] door failed, falling back to the board:', error);
    return false;
  }
}
