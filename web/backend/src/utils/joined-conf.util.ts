/**
 * The conference whose message base the caller is working in.
 *
 * express.e keeps two things apart that this board long kept as one:
 * `currentConf`, the conference the caller stands in, and the globals joinConf
 * loads for a conference - `msgBaseLocation` (getMsgBaseLocation, 5015) and
 * `confNameType` (5017-5024). A scan (confScan 28103, MS 25256) sets
 * currentConf:=0 and calls joinConf(conf,msgbase,confScan=TRUE) per base,
 * which leaves currentConf alone (4997-5000) and loads the rest. saveNewMSG
 * writes `<msgBaseLocation><msgNumb>` (10694), the quote reads it (10887),
 * and the message's X files go to `<msgBaseLocation>F<msgNumb>` (10722).
 *
 * joinConference records the joined base on `session.joinedConf`; a session
 * no join has reached yet falls back to the conference it stands in.
 */
import type { BBSSession } from '../index';

export interface JoinedConf {
  conf: number;
  msgBase: number;
}

export function joinedConf(session: Pick<BBSSession, 'joinedConf' | 'currentConf' | 'currentMsgBase'>): JoinedConf {
  return session.joinedConf ?? { conf: session.currentConf || 1, msgBase: session.currentMsgBase || 1 };
}
