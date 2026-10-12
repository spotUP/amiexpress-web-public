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
import { fileUploadedFile, areaForConference } from '../services/upload-filing.service';
import { examineTaglineFor } from '../services/examine-tagline.service';
import { extractAndReadDiz } from '../utils/file-diz.util';
import { registerFtpCaller, releaseFtpCaller } from './ftp-presence';
import { conferenceDir, conferenceDownloadDirs } from '../conferences/conference-paths';
import { getNodeWorkDir, getPlaypenDir } from '../utils/bbs-paths.util';
import { readTooltypeMap } from '../utils/info-file.util';
import { testFile, TestResult } from '../utils/file-test.util';
import { BackgroundFileCheck, creditCheckedUpload } from '../services/background-file-check.service';
import { validateFilename } from '../utils/file-upload.util';
import { DEFAULT_LISTING_DAYS, FtpFilesystem } from './ftp-filesystem';
import { nodeManager } from '../services/node-manager.service';
import { logDownload, writeToCallersLog } from '../utils/download-logging.util';
import type { FtpDeps, FtpLogonRefusal, FtpUser } from './ftp-session';
import type { User } from '../database/types';
import { saveAccountAtLogoff } from '../services/account.service';
import { loadAccount } from '../services/load-account';
import { applyLogonDayReset, isNewLogonDay } from '../utils/time-tracking.util';
import {
  accountOnlineElsewhere,
  accountRefusal,
  AccountRefusal,
  nodeReservedForAnother,
} from '../services/logon-gates';
import { countWrongPasswordFor, clearWrongPasswords } from '../services/password-failures';

/**
 * What an FTP caller is told when the board refuses his account. 420 and the
 * deleted sentence are express.e's own FTP logon (28745-28752); the others
 * are the BBS logon's own words (29775-29776, 29768 LOCKOUT0/1, 29785), on
 * the one line FTP has.
 */
/** ftpd.e:1678 `waitFileCheck(ftpData,10)`: seconds the server waits for the check before another "please wait". */
export const FTP_FILE_CHECK_WAIT_SECONDS = 10;

const FTP_REFUSALS: Record<AccountRefusal, { code: number; text: string }> = {
  'deleted-account': { code: 420, text: 'That account has been deleted.' },
  lockout: { code: 420, text: 'Your access level does not allow you to log on.' },
  'account-locked': {
    code: 420,
    text: 'Your account is locked out (possibly due to repeated password failures)',
  },
  'password-change-required': {
    code: 420,
    text: 'Your account requires your password to be changed - log on to the board to change it.',
  },
};

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
        // The conference's own icon, for the two tooltypes express reads
        // here. It is the same sibling `<root>/Conf2.info` that listingDays
        // and listsDirectories below already read.
        let icon: ReturnType<typeof readTooltypeMap> | undefined;
        try {
          icon = readTooltypeMap(`${conferenceDir(bbsRoot, conferenceId)}.info`);
        } catch {
          // No icon is not an error - the conference keeps its defaults.
        }

        return {
          conference_id: conferenceId,
          /**
           * `FTPDIRNAME` (express.e:28948): the name the conference wears
           * over FTP, falling back to its board name. A board whose
           * conference is called `Uploads/Incoming` cannot be browsed under
           * that name - conferenceDirectoryName strips the slash, as express
           * does with removeSlashes - and FTPDIRNAME is how a sysop gives it
           * a name that survives.
           */
          name: icon?.get('FTPDIRNAME')?.trim() || entry.name,
          /**
           * `EXCLUDE_FTP` (express.e:28947) is on the ICON, and it was read
           * only from the mirror. On the live board `conference_config` has
           * zero rows - the paragraph above this says so about the tree
           * itself - so a conference the sysop had excluded on disk was
           * served over FTP anyway. The icon decides; the mirror stays as an
           * overlay for a board whose icon predates the flag.
           */
          exclude_ftp: icon?.has('EXCLUDE_FTP')
            ? (icon.get('EXCLUDE_FTP') ?? '').trim() !== '0'
            : (flags.get(conferenceId)?.exclude_ftp ?? false),
          ndirs: flags.get(conferenceId)?.ndirs,
        };
      });
    },
    canAccess: (user, conferenceId) => checkConfAccess(user, conferenceId),

    /**
     * `FTP_DIR_DAYS` from the conference's own icon - the SIBLING
     * `<root>/Conf2.info`, as everything else on this board reads it. Absent
     * or unreadable means express's default of ten days (ftpd.e:1160); `0` is
     * the sysop asking for no bound at all.
     */
    listingDays: (conferenceId: number) => {
      try {
        const raw = readTooltypeMap(`${conferenceDir(bbsRoot, conferenceId)}.info`)
          .get('FTP_DIR_DAYS')
          ?.trim();
        if (raw === undefined || raw === '') return DEFAULT_LISTING_DAYS;
        const days = Number(raw);
        return Number.isFinite(days) && days >= 0 ? days : DEFAULT_LISTING_DAYS;
      } catch {
        return DEFAULT_LISTING_DAYS;
      }
    },

    /** The conference's DLPATH directories - the same resolver downloads use. */
    downloadDirs: (conferenceId: number) => conferenceDownloadDirs(bbsRoot, conferenceId),

    /** `FTP_NO_DIRLIST` (ftpd.e:1170): list the directories, not the catalogue. */
    listsDirectories: (conferenceId: number) => {
      try {
        return readTooltypeMap(`${conferenceDir(bbsRoot, conferenceId)}.info`).has('FTP_NO_DIRLIST');
      } catch {
        return false;
      }
    },
    bbsRoot,
  });
}

/**
 * @param socketIsAlive whether a web caller's socket is still connected - the
 *   board's socket.io namespace answers it (index.ts passes it). Without it a
 *   web caller's node counts as empty for the already-online gate; telnet and
 *   SSH callers and other FTP sessions are seen either way.
 */
export function boardFtpDeps(socketIsAlive: (socketId: string) => boolean = () => false): FtpDeps {
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
    /** `FILENAMECAPS` on the board's icon (ftpd.e:1443). Presence semantics. */
    uppercaseUploads() {
      try {
        return readTooltypeMap(path.join(config.get('dataDir'), 'bbsConfig.info')).has('FILENAMECAPS');
      } catch {
        return false;
      }
    },

    async recordDownload(user: FtpUser, size: number) {
      await updateDownloadStats(user as unknown as Parameters<typeof updateDownloadStats>[0], size);
    },

    async logDownload(user: FtpUser, name: string, size: number, nodeId: number) {
      // logUDFile(TRUE), express.e:9478 - never 'Free ' here: FTP server
      // mode has no flagged list for ftpDownloadFileStart to find the file in
      // (express.e:15130 freeDFlag:=FALSE).
      await logDownload(user as unknown as Parameters<typeof logDownload>[0], name, size, false, nodeId);
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
      // The CODES are express's, and a client acts on the difference: 553 says
      // "your filename is the problem, pick another", 550 says "this board
      // will not take it at all" (ftpd.e:1463-1553). The log lines are its own
      // too, so a sysop reading the CallersLog sees what AmiExpress showed.
      if (!filename) {
        return { code: 553, text: 'Invalid filename', logAs: 'Invalid filename' };
      }

      const name = validateFilename(filename);
      if (!name.valid) {
        return {
          code: 553,
          text: `${filename}: ${name.error ?? 'Invalid filename'}`,
          logAs: 'Invalid filename',
        };
      }

      // WHERE THE CONFERENCE PUTS FILES, not whether the SQL mirror has a
      // row for it. `file_areas` on this board is seed data - four demo rows
      // for two conferences out of fourteen - so this refused every FTP
      // upload into conferences 3 and up with "Cant upload here", while the
      // menu accepted them. ftpd.e:1447 refuses when the conference has
      // nowhere to put a file, and that is what the icon's DLPATH says.
      const dlPath = conferenceDownloadDirs(config.get('dataDir'), conferenceId)[0];
      if (!dlPath) {
        return { code: 550, text: 'Cant upload here', logAs: 'No upload directory for' };
      }

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
          // ftpd.e:1532-1536 - the conference's own block TEXT, because a
          // sysop writes it to say why.
          return {
            code: 550,
            text: confIcon.get('NO_FTP_UPLOADS')?.trim() || 'Not expecting any uploads',
            logAs: 'Uploads blocked for',
          };
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

      // express.e:15067 ftpUploadFileStart stamps the start, 15078
      // ftpUploadFileEnd the end: the CallersLog's summary for this file
      // (formatFtpUploadLines) carries the time and the cps.
      const receiveStarted = Date.now();
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
      const receiveSeconds = (Date.now() - receiveStarted) / 1000;
      const receiveCps = receiveSeconds > 0 ? Math.floor(bytes / receiveSeconds) : bytes;

      // ftpd.e:1666: every byte is in. express.e's ftpStartFileCheck (15205) then
      // starts the background file-check thread for a SUCCESSFUL transfer only
      // (a failed one rejected above and is never checked) and ftpd.e waits
      // for it, ten seconds at a time (ftpWaitFileCheck 15224), telling the
      // caller "please wait" for each ten seconds that pass (1676-1686).
      request.onReceived?.();

      // express.e nodeWorkDir is the node's own (BBS:Node<n>/Work/).
      const nodeWorkDir = getNodeWorkDir(request.nodeId || 1, dataDir);

      let outcome: Awaited<ReturnType<typeof fileUploadedFile>> | undefined;
      let failure: unknown;
      const thread = new BackgroundFileCheck(async (fname) => {
        try {
          outcome = await checkAndFileFtpUpload(fname);
        } catch (error) {
          failure = error;
          return null;
        }
        return { bytes };
      });
      thread.postThenQuit(request.filename);
      while (!(await thread.waitForExit(FTP_FILE_CHECK_WAIT_SECONDS))) request.onChecking?.();
      if (failure) throw failure;
      if (!outcome) throw new Error('the file check produced no result');

      /**
       * doBackgroundCheck (express.e:19551-19739) for this one file. The order
       * is express's: the description (EXAMINE, 19012), then testFile with
       * bgChecking=TRUE (19051: the checker's output is not shown, and without
       * a caller there is no FILECHECK door), then the duplicate rule, HOLD or
       * the upload area and the DIR line (19061-19130), then the credit.
       */
      async function checkAndFileFtpUpload(fname: string) {
        // WHAT THE FILE SAYS ABOUT ITSELF. A menu upload extracts FILE_ID.DIZ
        // (express.e:19258-19285) and catalogues that; an FTP upload was
        // catalogued as "Uploaded over FTP by <user>", which tells the next
        // caller nothing. Same extractor, same ten-second bound; the
        // placeholder stays only when the archive carries no DIZ, since an
        // FTP caller has no prompt to type a description at (express.e leaves
        // such a file in the playpen; the sysop approved this deviation).
        let description = `Uploaded over FTP by ${request.user.username}`;
        try {
          const dizLines = await Promise.race([
            extractAndReadDiz(playpenPath, nodeWorkDir, [], 10),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
          ]);
          if (dizLines && dizLines.length > 0) {
            description = dizLines.join('\n');
console.log(`[FTP] FILE_ID.DIZ used for ${fname} (${dizLines.length} lines)`);
          }
        } catch (error) {
console.log(`[FTP] no FILE_ID.DIZ for ${fname}: ${error instanceof Error ? error.message : String(error)}`);
        }

        // The uploader's tagline, which the board's EXAMINE door would have added
        // (services/examine-tagline.service - a deliberate deviation: FTP cannot
        // answer the door's prompts, so the door is not run).
        try {
          const slot = (await db.getUserById(String(request.user.id)))?.slotNumber;
          const tagline = examineTaglineFor(config.get('dataDir'), slot);
          if (tagline) description = `${description}\n${tagline}`;
        } catch (error) {
console.log(`[FTP] no tagline for ${fname}: ${error instanceof Error ? error.message : String(error)}`);
        }

        // express.e tests an upload before it files it, and a failure is a
        // QUARANTINE rather than a rejection: the file goes to the sysop, and
        // the caller is told where it went.
        let marker: 'P' | 'F' | 'N' = 'N';
        let initialStatus: 'active' | 'private' | 'hold' = 'active';
        try {
          const result = await testFile(playpenPath, nodeWorkDir, { nodeId: request.nodeId || 1 });
          if (result === TestResult.SUCCESS) marker = 'P';
          else if (result === TestResult.FAILURE) {
            marker = 'F';
            initialStatus = 'hold';
          }
        } catch {
          marker = 'N';
        }

        // The area the board implies, created from the conference's own icons
        // when the mirror has none - the same one the menu upload files into.
        const area = await areaForConference(request.conferenceId, config.get('dataDir'));

        const filed = await fileUploadedFile({
          playpenPath,
          filename: fname,
          size: bytes,
          description,
          fileArea: area,
          conferenceId: request.conferenceId,
          nodeId: request.nodeId || 1,
          uploader: {
            username: request.user.username,
            location: (request.user as unknown as { location?: string }).location,
            slotNumber: (request.user as unknown as { slotNumber?: number }).slotNumber,
          },
          initialStatus,
          marker,
          ftp: { seconds: receiveSeconds, cps: receiveCps },
        });

        /*
         * THE UPLOAD IS THE CALLER'S (doBackgroundCheck 19626-19630, 19676-
         * 19686). A file that tested clean and is no duplicate (hold=0)
         * counts one upload and its bytes (kilobytes under CREDITBYKB), when
         * the credit account tracks uploads. Every checked file, held or not,
         * raises today's limit by fsize - fsize in kilobytes only when it was
         * booked first, E's own order. In memory: the logoff saves it
         * (saveAccount below, 8207).
         */
        if (!filed.orphaned) {
          const user = request.user as unknown as User;
          const held = filed.duplicate || filed.status !== 'active';
          await creditCheckedUpload(user, { held, bytes }, (units) => {
            user.uploads = (user.uploads || 0) + 1;
            user.bytesUpload = (user.bytesUpload || 0) + units;
          });
        }
        return filed;
      }

      // ftpd.e:1690 - 426 when the upload did not survive. A file the board
      // could not file anywhere is not a completed transfer, whatever the
      // socket did; a HOLD is, and the notices say where it went.
      return {
        bytes,
        accepted: !outcome.orphaned,
        notices: outcome.notices.map((notice) => notice.text),
      };
    },
    async authenticate(username: string, password: string): Promise<FtpUser | FtpLogonRefusal | null> {
      const row = await db.authenticateUser(username, password);

      /*
       * THE ACCOUNT'S PASSWORD COUNTER, as the BBS logon keeps it.
       *
       * express.e's ftpAuth (15411) is checkUserPassword (1008-1018), the
       * same procedure the board's logon uses: a wrong password bumps
       * userMisc.invalidAttempts and locks the account at
       * MAX_PASSWORD_FAILS, a right one zeroes it. This answered 430 and
       * counted nothing, so FTP was an unmetered place to guess a caller's
       * password that the board's lockout never saw. The counter and the
       * lock are UserDatabaseManager's, through services/password-failures -
       * the one helper the BBS logon and both chat logins count with too; the lock itself is honoured below, by
       * the board's gates. (express's own FTP logon frees the account
       * without saving it on a failure, so its count was lost on hang-up;
       * this port persists it, as its BBS logon does.)
       */
      if (!row) {
        // A failure to look the name up must never turn a 430 into a crash.
        await countWrongPasswordFor(() => db.getUserByUsername(username), 'FTP');
        return null;
      }
      clearWrongPasswords(row, 'FTP');

      /*
       * THE BOARD'S OWN ACCOUNT GATES, on the board's own record.
       *
       * This returned the SQL row the moment the password matched, so an
       * account the sysop had DELETED (the record's slotNumber written as 0,
       * express.e:21365 - the row stays), LOCKED (user.misc accountLocked) or
       * set to level 0 logged in over FTP and took files, while the BBS logon
       * refused it. express.e's own FTP logon loads the account off the disk
       * (28707) and refuses a deleted one (28745-28752).
       *
       * The session now runs on the record loadAccount reads, as every other
       * transport's does, and the refusals are login-post's own predicates
       * (services/logon-gates) - one rule, asked from two places.
       */
      const { user } = loadAccount(row);
      const refusal = accountRefusal(user);
      if (refusal !== null) return { refused: FTP_REFUSALS[refusal] };

      /*
       * THE FTP LOGON'S DAY RESET (express.e:28902-28925, processFtpLoggedOnUser),
       * the block the BBS logon runs too (28506-28528): a caller last on
       * yesterday gets today's allowances back, so yesterday's downloads
       * no longer count against today's limit (bytesADL, 28927-28931).
       * `lastLogin` is the record's timeLastOn, as loadAccount reads it.
       */
      applyLogonDayReset(user, isNewLogonDay(new Date(user.lastLogin ?? 0)));

      // Without the record's deleted state, as login-post keeps it off the
      // session: a `false` carried here must never be written back over a
      // DELETE the sysop makes while this caller is on.
      const { accountDeleted: _deletedOnDisk, ...account } = user;
      return { ...account, id: account.id, username: account.username } as unknown as FtpUser;
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

    /*
     * express.e's FTP logon (28733-28765), after the account load: a node
     * reserved for another caller, and an account already online on another
     * node, are refused with 420 - the BBS logon's own rules
     * (services/logon-gates), asked of the node this caller was given.
     */
    async refuseOnNode(nodeId: number, user: FtpUser) {
      if (nodeReservedForAnother(nodeId, user.username)) {
        return { refused: { code: 420, text: 'Node is currently reserved for another user.' } };
      }
      if (accountOnlineElsewhere(user.username, nodeId, socketIsAlive) !== null) {
        // express.e:28762 - its words.
        return { refused: { code: 420, text: `User ${user.username} already on another node!` } };
      }
      return null;
    },

    /*
     * express.e's logoff (8197-8207) for an FTP session: timeLastOn, the
     * conference sums and saveAccount, as for a BBS call. currentConf is 0
     * (28936): FTP joins no conference, so there is no record to put back.
     */
    async saveAccount(user: FtpUser): Promise<void> {
      await saveAccountAtLogoff({ user: user as unknown as User, currentConf: 0 });
    },

    async releaseNode(sessionId: string): Promise<void> {
      releaseFtpCaller(sessionId);
      try {
        await nodeManager.releaseSession(sessionId);
      } catch {
        /* a session that never took a node has none to give back */
      }
    },

    log(_username: string, message: string, nodeId: number): void {
      // ftpd.e's callersLog is express.e's own (express.e:28996): the line
      // as given, no name in front of it.
      void writeToCallersLog(message, nodeId);
    },

  };
}
