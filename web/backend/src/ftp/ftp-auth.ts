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
import { db } from '../database';
import { nodeManager } from '../services/node-manager.service';
import { writeToCallersLog } from '../utils/download-logging.util';
import { getTimeRemainingMinutes } from '../utils/time-tracking.util';
import type { FtpDeps, FtpUser } from './ftp-session';

export function boardFtpDeps(): FtpDeps {
  return {
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
