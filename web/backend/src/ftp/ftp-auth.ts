/**
 * The board's own answers, wired to the FTP session's questions.
 *
 * Nothing here decides anything: the password check is `database.verifyPassword`
 * (bcrypt, exactly what `handlers/user/auth.handler.ts:59` calls), the node
 * comes from the one node manager, the time remaining is
 * `utils/time-tracking.util.ts`'s own calculation, and the log line goes
 * through the same CallersLog writer a download uses. An FTP caller who could
 * log in with a password the BBS rejects, or hold a node WHO cannot see, would
 * be a second board.
 */
import { config } from '../config';
import { db } from '../database';
import { checkConfAccess } from '../handlers/message/message-scan.handler';
import { FtpFilesystem } from './ftp-filesystem';
import { nodeManager } from '../services/node-manager.service';
import { writeToCallersLog } from '../utils/download-logging.util';
import { getTimeRemainingMinutes } from '../utils/time-tracking.util';
import type { FtpDeps, FtpUser } from './ftp-session';

/**
 * The board's own conference tree, for browsing.
 *
 * `getConferenceConfigs` is the same list the admin edits and `checkConfAccess`
 * is express.e:8499 itself, so a caller sees over FTP exactly the conferences
 * he sees at the `J` prompt - minus the ones marked EXCLUDE_FTP.
 */
export function boardFtpFilesystem(): FtpFilesystem {
  // The repository the board already built, not a second one: it is the same
  // list the admin edits, and nothing here needs ConfigService's validation or
  // its write path. Read at call time so a conference added while the board
  // runs is visible to the next listing.
  return new FtpFilesystem({
    conferences: () =>
      db.getConfigRepository().getConferenceConfigs().map((conf) => ({
        conference_id: conf.conference_id,
        name: conf.name,
        exclude_ftp: conf.exclude_ftp,
        ndirs: conf.ndirs,
      })),
    canAccess: (user, conferenceId) => checkConfAccess(user, conferenceId),
    bbsRoot: config.get('dataDir'),
  });
}

export function boardFtpDeps(): FtpDeps {
  return {
    filesystem: boardFtpFilesystem(),
    async authenticate(username: string, password: string): Promise<FtpUser | null> {
      const user = await db.authenticateUser(username, password);
      if (!user) return null;
      return { id: user.id, username: user.username, ...user } as FtpUser;
    },

    async reserveNode(sessionId: string, user: FtpUser): Promise<number | null> {
      try {
        const session = await nodeManager.assignSessionToNode(sessionId, `ftp:${sessionId}`, String(user.id));
        return session.nodeId;
      } catch {
        // The one reason assignSessionToNode throws: every node is busy.
        return null;
      }
    },

    async releaseNode(sessionId: string): Promise<void> {
      try {
        await nodeManager.releaseSession(sessionId);
      } catch {
        /* a session that never took a node has none to give back */
      }
    },

    log(username: string, message: string, nodeId: number): void {
      void writeToCallersLog(username, message, nodeId);
    },

    timeRemainingMinutes(user: FtpUser): number {
      // getTimeRemainingMinutes reads `session.user` and nothing else, and it
      // is the ONE place express.e:28417's Div(timeTotal-timeUsed,60) lives -
      // including the sysop's unlimited case.
      //
      // Its parameter type is taken from the function rather than imported:
      // `BBSSession` is exported from `src/index.ts`, and importing that here
      // would pull the whole server - listeners and all - into any module that
      // touches FTP.
      type SessionArg = Parameters<typeof getTimeRemainingMinutes>[0];
      return getTimeRemainingMinutes({ user } as unknown as SessionArg);
    },
  };
}
