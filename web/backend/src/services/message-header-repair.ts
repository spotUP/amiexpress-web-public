/**
 * Repairing a conference's message index, in the direction that cannot lose
 * messages.
 *
 * WHAT THIS REPLACES. `POST /api/config/messages/repair-headers` rebuilt the
 * disk HeaderFile FROM THE DATABASE, renumbering from 1. On this board that is
 * a data-loss button:
 *
 *   Conf1/MsgBase/HeaderFile   328 records, message numbers up to 318
 *   SQL messages for conf 1    ~158
 *
 * `rebuildHeaders` REPLACES the file, so pressing it would have left 158
 * records numbered 1..158. The ~170 messages above that would keep their body
 * files and lose their headers - nothing on the board indexes a message whose
 * header is gone, so they are invisible for ever. Worse, DB message k was
 * written onto disk slot k, whose body belongs to a different message, so the
 * surviving records would carry the wrong sender and subject over the wrong
 * body. And `recv: 0` on every rebuilt record marks the whole conference
 * unread again - the very symptom the button's own comment promised to fix.
 *
 * WHY DISK. `AmiExpress reads disk, not DB` is this port's standing rule: the
 * HeaderFile and MailStats are what the board and every 68K door read, and SQL
 * is a mirror kept for the web UI and search. A repair must therefore be a
 * function OF the disk, not of the mirror.
 *
 * WHAT THE REPAIR ACTUALLY IS. The symptom the button is for - "the same
 * messages appear new at every login" - comes from MailStats disagreeing with
 * the HeaderFile. express.e:5040-5049 and searchNewMail:11666 clamp a pointer
 * that is above `mailStat.highMsgNum` back to `mailStat.lowestKey`:
 *
 *   IF(mailStat.highMsgNum<lastNewReadConf) THEN lastNewReadConf:=mailStat.lowestKey
 *
 * Conf1 says highMsgNum=151 while its HeaderFile holds numbers to 318, so
 * every scan stores 318 and every next login is knocked back to 1. The clamp
 * is correct; the stats are stale. Re-deriving them from the headers already
 * on disk fixes it and moves no message.
 *
 * The database direction survives for exactly one case - a conference with NO
 * HeaderFile at all, where there is nothing on disk to lose and the mirror is
 * the only record left. `assertNoHeaderLoss` is the hard stop that keeps any
 * future edit inside that rule.
 */

import type { MsgHeader } from './MessageIndexManager';
import type { MailStat } from '../types/message-pointers';

/** The slice of MessageIndexManager a repair needs. Injected, so it is testable. */
export interface HeaderIndex {
  readHeaderFile(confNumber: number): MsgHeader[];
  readMailStats(confNumber: number): MailStat | null;
  rebuildHeaders(confNumber: number, headers: MsgHeader[]): void;
}

export interface HeaderRepairOptions {
  conferenceId: number;
  index: HeaderIndex;
  /**
   * The mirror, consulted ONLY when the disk holds no headers at all. Omit it
   * and an empty conference is reported rather than rebuilt.
   */
  databaseHeaders?: () => Promise<MsgHeader[]>;
  /** Report what would happen and write nothing. */
  dryRun?: boolean;
}

export interface HeaderRepairResult {
  conference: number;
  /** Which record the rebuild was taken from. */
  source: 'disk' | 'database' | 'none';
  dryRun: boolean;
  headersBefore: number;
  headersAfter: number;
  mailStatBefore: MailStat | null;
  mailStatAfter: MailStat | null;
  rebuilt: number;
  message: string;
}

/**
 * The invariant, as a function so it cannot be forgotten: a repair may only
 * ever leave the conference with at least as many headers as it found.
 *
 * Thrown, not logged. A repair that would shrink the index is not a repair,
 * and the admin must see why rather than discover it later in a message base
 * that has gone quiet.
 */
export function assertNoHeaderLoss(conferenceId: number, before: number, after: number): void {
  if (after < before) {
    throw new Error(
      `Refusing to repair conference ${conferenceId}: the rebuild holds ${after} `
      + `message header${after === 1 ? '' : 's'} and the disk already holds ${before}. `
      + `That would make ${before - after} message${before - after === 1 ? '' : 's'} `
      + `unreachable - their body files would stay on disk with nothing indexing them. `
      + `The HeaderFile on disk is this board's record of its messages; the database `
      + `mirrors it for the web UI and is not authoritative.`
    );
  }
}

/**
 * Recompute a conference's message index from the record that is authoritative.
 *
 * Disk when the disk has headers - the rebuild writes back the SAME headers,
 * which is what re-derives MailStats (MessageIndexManager.rebuildHeaders
 * recalculates lowestKey / highMsgNum / lowestNotDel from what it is handed).
 * The database only when the disk has nothing.
 */
export async function repairConferenceHeaders(
  opts: HeaderRepairOptions
): Promise<HeaderRepairResult> {
  const { conferenceId, index, databaseHeaders, dryRun = false } = opts;

  const diskHeaders = index.readHeaderFile(conferenceId);
  const mailStatBefore = index.readMailStats(conferenceId);

  let source: HeaderRepairResult['source'];
  let next: MsgHeader[];

  if (diskHeaders.length > 0) {
    source = 'disk';
    next = diskHeaders;
  } else if (databaseHeaders) {
    // Nothing on disk to lose. This is the ONLY case the mirror is used.
    source = 'database';
    next = await databaseHeaders();
  } else {
    return {
      conference: conferenceId,
      source: 'none',
      dryRun,
      headersBefore: 0,
      headersAfter: 0,
      mailStatBefore,
      mailStatAfter: mailStatBefore,
      rebuilt: 0,
      message: `Conference ${conferenceId} has no message headers on disk and no mirror to rebuild from. Nothing was changed.`,
    };
  }

  assertNoHeaderLoss(conferenceId, diskHeaders.length, next.length);

  if (dryRun) {
    return {
      conference: conferenceId,
      source,
      dryRun: true,
      headersBefore: diskHeaders.length,
      headersAfter: next.length,
      mailStatBefore,
      mailStatAfter: mailStatBefore,
      rebuilt: 0,
      message: `Would rebuild ${next.length} header${next.length === 1 ? '' : 's'} for conference ${conferenceId} from the ${source}. Nothing was written.`,
    };
  }

  index.rebuildHeaders(conferenceId, next);
  const mailStatAfter = index.readMailStats(conferenceId);

  const moved = mailStatBefore && mailStatAfter && mailStatBefore.highMsgNum !== mailStatAfter.highMsgNum
    ? ` MailStats highMsgNum ${mailStatBefore.highMsgNum} -> ${mailStatAfter.highMsgNum}.`
    : '';

  return {
    conference: conferenceId,
    source,
    dryRun: false,
    headersBefore: diskHeaders.length,
    headersAfter: next.length,
    mailStatBefore,
    mailStatAfter,
    rebuilt: next.length,
    message: `Rebuilt ${next.length} message header${next.length === 1 ? '' : 's'} for conference ${conferenceId} from the ${source}.${moved}`,
  };
}
