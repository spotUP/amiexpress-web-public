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
import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';

import { config } from '../config';
import { db } from '../database';
import { checkConfAccess } from '../handlers/message/message-scan.handler';
import { ACSPermission } from '../constants/acs-permissions';
import { checkSecurity, getACSConfig, ToggleFlags } from '../utils/acs.util';
import { checkDownloadRatios, updateDownloadStats } from '../utils/download-ratios.util';
import { resolveFile } from '../handlers/transfer/batch-download.handler';
import { loadConfConfig } from '../services/conf-config.service';
import { fileUploadedFile } from '../services/upload-filing.service';
import { registerFtpCaller, releaseFtpCaller } from './ftp-presence';
import { conferenceDir } from '../conferences/conference-paths';
import { getNodeWorkDir, getPlaypenDir } from '../utils/bbs-paths.util';
import { readTooltypeMap } from '../utils/info-file.util';
import { testFile, TestResult } from '../utils/file-test.util';
import { validateFilename } from '../utils/file-upload.util';
import { FtpFilesystem } from './ftp-filesystem';
import { nodeManager } from '../services/node-manager.service';
import { writeToCallersLog } from '../utils/download-logging.util';
import { getTimeRemainingMinutes } from '../utils/time-tracking.util';
import type { FtpDeps, FtpUser } from './ftp-session';

/**
 * The board's own conference tree, for browsing.
 *
 * `ConfConfig.info` is the list - the same one `conferenceDir` reads - and
 * `checkConfAccess` is express.e:8499 itself, so a caller sees over FTP
 * exactly the conferences he sees at the `J` prompt, minus EXCLUDE_FTP.
 */
export function boardFtpFilesystem(root?: string): FtpFilesystem {
  // The root is a parameter so a test can point this at a board of its own.
  // `config` captures the data directory when it loads, which is before any
  // test can set an environment variable - and testing the WIRING is the
  // whole point: the defect was here, not in the layer underneath.
  const bbsRoot = root ?? config.get('dataDir');

  return new FtpFilesystem({
    /**
     * THE BOARD, NOT THE MIRROR.
     *
     * The first version of this read `conference_config` through the config
     * repository, which is the list the admin edits. On the live board that
     * table has ZERO rows - the conferences are in `ConfConfig.info`, as
     * `NCONFS` plus `NAME.n`/`LOCATION.n` - so every FTP listing came back
     * empty while the caller had access to five conferences. It looked
     * exactly like a permissions problem and was not one.
     *
     * The rule this belongs to is already written down: user and conference
     * truth lives on disk and SQL is a mirror that may be empty, stale, or
     * absent. `loadConfConfig` is the same reader `conferenceDir` uses to
     * find where a conference's files are, so the names and the directories
     * cannot disagree.
     *
     * The database is still consulted, but only as an OVERLAY and only for
     * what the icon has no field for here - `exclude_ftp`. A missing table or
     * an empty one now costs a flag, not the whole tree.
     */
    conferences: () => {
      const onDisk = loadConfConfig(bbsRoot);
      if (!onDisk) return [];

      const flags = new Map<number, { exclude_ftp?: boolean; ndirs?: number }>();
      try {
        for (const row of db.getConfigRepository().getConferenceConfigs()) {
          flags.set(row.conference_id, { exclude_ftp: row.exclude_ftp, ndirs: row.ndirs });
        }
      } catch {
        // No table, no rows, no database - the board still has conferences.
      }

      return onDisk.entries.map((entry, index) => {
        const conferenceId = index + 1;
        return {
          conference_id: conferenceId,
          name: entry.name,
          exclude_ftp: flags.get(conferenceId)?.exclude_ftp ?? false,
          ndirs: flags.get(conferenceId)?.ndirs,
        };
      });
    },
    canAccess: (user, conferenceId) => checkConfAccess(user, conferenceId),
    bbsRoot,
  });
}

export function boardFtpDeps(): FtpDeps {
  const filesystem = boardFtpFilesystem();

  return {
    filesystem,

    /**
     * The same locator `D` uses (`handlers/transfer/batch-download.handler`),
     * so a pooled file is fetched from its bucket for an FTP caller exactly as
     * it is for a caller at the menu, and neither can see a file the other
     * cannot. It THROWS when a volume is down, and that is deliberate: null
     * means "no such file", and a storage outage reported as "not found" is
     * how a sysop deletes a catalogue row for a file that was always fine.
     */
    async resolveFile(conferenceId: number, filename: string) {
      const found = await resolveFile(config.get('dataDir'), conferenceId, filename);
      return found ? { path: found.fullPath, size: found.size, name: found.name } : null;
    },

    /**
     * express.e's own ratio rules, through the call `batch-download` makes -
     * including the sysop bypass and CREDITBYKB. The gate's own sentence is
     * carried back, because "refused" without which limit is useless to the
     * caller.
     */
    async mayDownload(user: FtpUser, size: number) {
      const verdict = await checkDownloadRatios(
        user as unknown as Parameters<typeof checkDownloadRatios>[0],
        [{ size, isFree: false }],
        undefined,
        checkSecurity(user as any, ACSPermission.CONFERENCE_ACCOUNTING),
        getACSConfig().toggles[ToggleFlags.CREDITBYKB] === true
      );
      return { allowed: verdict.canDownload, message: verdict.errorMessage };
    },

    /** Charge it once the bytes have actually gone. */
    async recordDownload(user: FtpUser, size: number) {
      await updateDownloadStats(user as unknown as Parameters<typeof updateDownloadStats>[0], size);
    },

    /**
     * Everything the board refuses BEFORE taking a byte.
     *
     * A caller told no after a ten-megabyte transfer has been told no
     * expensively. `NO_FTP_UPLOADS` is the sysop's own switch, per conference,
     * and `validateFilename` is express.e's name rule - the same one the
     * socket upload applies.
     */
    async refuseUpload(_user: FtpUser, conferenceId: number, filename: string) {
      if (!filename) return 'No filename';

      const name = validateFilename(filename);
      if (!name.valid) return name.error ?? 'That filename is not allowed';

      const areas = await db.getFileAreas(conferenceId);
      if (!areas || areas.length === 0) return 'This conference has no upload area';

      // The tooltype is presence-semantics, like every other boolean on this
      // board: NO_FTP_UPLOADS present means uploads are off here.
      //
      // The icon is the directory's SIBLING - `<root>/Conf2.info`, not
      // `<root>/Conf2/Conf.info`. That is AmiExpress's own layout, and reading
      // the wrong path threw ENOENT on the live board, which escaped as an
      // unhandled rejection and left the caller's STOR hanging with no reply
      // at all (sysop, 2026-09-07).
      //
      // A conference with no icon has no tooltypes and therefore no refusal:
      // absent is not the same as forbidden, and it must never be an error.
      const iconPath = `${conferenceDir(config.get('dataDir'), conferenceId)}.info`;
      try {
        const confIcon = readTooltypeMap(iconPath);
        if (confIcon.has('NO_FTP_UPLOADS')) {
          return confIcon.get('NO_FTP_UPLOADS')?.trim() || 'Uploads are not accepted in this conference';
        }
      } catch {
        // No icon, or one this reader cannot parse. Uploads are not switched
        // off by a file that is not there.
      }

      return undefined;
    },

    /**
     * Take the bytes into the node's playpen, test them, and hand them to the
     * SAME filing the socket upload uses (`services/upload-filing.service`) -
     * the duplicate rule, the quarantine and the DIR entry are one
     * implementation, so an FTP upload and a menu upload cannot drift.
     */
    async acceptUpload(request, data) {
      const dataDir = config.get('dataDir');
      const playpen = getPlaypenDir(request.nodeId || 1, dataDir);
      await fsp.mkdir(playpen, { recursive: true });
      const playpenPath = path.join(playpen, request.filename);

      const bytes = await new Promise<number>((resolve, reject) => {
        let written = 0;
        const out = fs.createWriteStream(playpenPath);
        data.on('data', (chunk: Buffer | string) => {
          written += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
        });
        data.on('error', reject);
        out.on('error', reject);
        out.on('close', () => resolve(written));
        data.pipe(out);
      });

      // express.e tests an upload before it files it, and a failure is a
      // QUARANTINE rather than a rejection: the file goes to the sysop, and
      // the caller is told where it went.
      const nodeWorkDir = getNodeWorkDir(0, dataDir);
      let marker: 'P' | 'F' | 'N' = 'N';
      let initialStatus: 'active' | 'private' | 'hold' = 'active';
      try {
        const result = await testFile(playpenPath, nodeWorkDir);
        if (result === TestResult.SUCCESS) marker = 'P';
        else if (result === TestResult.FAILURE) {
          marker = 'F';
          initialStatus = 'hold';
        }
      } catch {
        marker = 'N';
      }

      const areas = await db.getFileAreas(request.conferenceId);
      const area = areas[0];
      const nodeConfig = db.getConfigRepository().getNodeConfig(request.nodeId || 1);

      const outcome = await fileUploadedFile({
        playpenPath,
        filename: request.filename,
        size: bytes,
        description: `Uploaded over FTP by ${request.user.username}`,
        fileArea: area as never,
        conferenceId: request.conferenceId,
        nodeId: request.nodeId || 1,
        uploader: {
          username: request.user.username,
          location: (request.user as unknown as { location?: string }).location,
        },
        initialStatus,
        marker,
        addSentBy: nodeConfig?.sentby_files ?? true,
      });

      const summary = outcome.orphaned
        ? 'Transfer complete, but the board could not file it - a sysop has been told'
        : outcome.status === 'hold'
          ? 'Transfer complete - held for the sysop'
          : 'Transfer complete';

      return { bytes, summary, notices: outcome.notices.map((notice) => notice.text) };
    },
    async authenticate(username: string, password: string): Promise<FtpUser | null> {
      const user = await db.authenticateUser(username, password);
      if (!user) return null;
      return { id: user.id, username: user.username, ...user } as FtpUser;
    },

    async reserveNode(sessionId: string, user: FtpUser): Promise<number | null> {
      try {
        const session = await nodeManager.assignSessionToNode(sessionId, `ftp:${sessionId}`, String(user.id));
        // WHO reads the BBS session map, which an FTP caller is not in - he
        // holds a node and would otherwise show as a node nobody can account
        // for. See ftp-presence.ts.
        registerFtpCaller(sessionId, {
          nodeId: session.nodeId,
          username: user.username,
          location: (user as unknown as { location?: string }).location ?? '',
        });
        return session.nodeId;
      } catch {
        // The one reason assignSessionToNode throws: every node is busy.
        return null;
      }
    },

    async releaseNode(sessionId: string): Promise<void> {
      releaseFtpCaller(sessionId);
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
