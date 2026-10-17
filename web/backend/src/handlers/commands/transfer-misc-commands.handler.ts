/**
 * Transfer & Miscellaneous Commands Handler
 * Handles file transfer variants and miscellaneous commands
 * 1:1 port from AmiExpress express.e commands
 */

import type { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { negotiateBinaryForTransfer } from '../file/file-delivery';
import { checkSecurity, setEnvStat } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { EnvStat } from '../../constants/env-codes';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { BBSPaths } from '../../utils/bbs-paths.util';
import type { TransferTransport } from '../../services/zmodem-transfer.service';
import { endUpload } from '../../services/upload-end.service';
import * as path from 'path';
import { formatLongDateTime } from '../../utils/date-time.util';
import { report } from '../../achievements/reporter';
import { endRawTransfer } from '../../utils/raw-transfer-teardown.util';
import { joinedConf } from '../../utils/joined-conf.util';
import type { InternalCommandResult } from '../../constants/command-results';

// Dependencies (injected)
let _displayUploadInterface: any;
let _fileAreas: any[] = [];
let _getActiveVoteTopics: any;
let _getVoteTopic: any;
let _getVoteQuestions: any;
let _getVoteAnswers: any;
let _hasUserVoted: any;
let _submitVote: any;
let _getVoteStatistics: any;
let _createVoteTopic: any;
let _createVoteQuestion: any;
let _createVoteAnswer: any;
let _deleteVoteTopic: any;
let _getNextTopicNumber: any;

/**
 * Dependency injection setter
 */
export function setTransferMiscCommandsDependencies(deps: {
  /** Unused: setEnvStat is imported from acs.util; initialization.ts still passes it. */
  setEnvStat?: unknown;
  displayUploadInterface: any;
  fileAreas: any[];
  getActiveVoteTopics: any;
  getVoteTopic: any;
  getVoteQuestions: any;
  getVoteAnswers: any;
  hasUserVoted: any;
  submitVote: any;
  getVoteStatistics: any;
  createVoteTopic: any;
  createVoteQuestion: any;
  createVoteAnswer: any;
  deleteVoteTopic: any;
  getNextTopicNumber: any;
}) {
  _displayUploadInterface = deps.displayUploadInterface;
  _fileAreas = deps.fileAreas;
  _getActiveVoteTopics = deps.getActiveVoteTopics;
  _getVoteTopic = deps.getVoteTopic;
  _getVoteQuestions = deps.getVoteQuestions;
  _getVoteAnswers = deps.getVoteAnswers;
  _hasUserVoted = deps.hasUserVoted;
  _submitVote = deps.submitVote;
  _getVoteStatistics = deps.getVoteStatistics;
  _createVoteTopic = deps.createVoteTopic;
  _createVoteQuestion = deps.createVoteQuestion;
  _createVoteAnswer = deps.createVoteAnswer;
  _deleteVoteTopic = deps.deleteVoteTopic;
  _getNextTopicNumber = deps.getNextTopicNumber;
}

/**
 * RZ Command: Zmodem Upload (internalCommandRZ)
 * Original: express.e:25608-25621
 *
 * Immediate Zmodem upload protocol initiation.
 * In AmiExpress, this called uploadaFile(1, cmdcode, FALSE) for Zmodem.
 * Web version: Shows file area selection for upload target.
 */
export async function handleZmodemUploadCommand(socket: any, session: BBSSession): Promise<void> {
  // Check security - express.e:25609
  if (!checkSecurity(session.user, ACSPermission.UPLOAD)) {
    ErrorHandler.permissionDenied(socket, 'upload files', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // Set environment status - express.e:25610
  setEnvStat(session, EnvStat.UPLOADING);

  // express.e:25608-25619 internalCommandRZ - no header, directly starts upload
  socket.emit('ansi-output', '\r\n');
  // 25613-25617: the node's BGFILECHECK decides whether this upload is checked
  // in the background (every web / telnet / SSH caller is a remote logon).
  require('../../services/background-file-check.service').raiseBackgroundFileCheck(session);

  // Start ZMODEM receive directly into the node playpen (matches express.e uploadaFile -> fileReceive path).
  const bbsRoot =
    (session as any).bbsPath ||
    process.env.BBS_DATA_DIR ||
    path.resolve(process.cwd());
  const paths = new BBSPaths(bbsRoot);
  const playpen = paths.node(session.nodeId || 0).playpen();
  try {
    const fs = require('fs');
    fs.mkdirSync(playpen, { recursive: true });
  } catch (err) {
console.error('[ZMODEM] Failed to ensure playpen:', err);
  }

  const transportType: TransferTransport['type'] =
    (session as any).connectionType === 'ssh'
      ? 'ssh'
      : (session as any).connectionType === 'telnet'
        ? 'telnet'
        : 'web';

  // Diagnostic — when uploads fall through to the wrong transport path
  // (e.g. JS fallback that lacks the MuffinTerm CRC/ZCRCE patches),
  // the silent fallthrough makes it impossible to tell why from logs.
  console.log(`[ZMODEM-UL-RZ] transportType=${transportType} (session.connectionType=${(session as any).connectionType}) hasTransferRawSend=${!!(session as any).transferRawSend}`);

  const sender =
    (session as any).transferRawSend ||
    ((buf: Buffer) => socket.emit('transfer-raw:data', buf));

  const ulStartTime = Date.now();
  // Every way out of the upload: uploadaFile returns (upload-end.service).
  const toMenu = () => {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.menuPause = true;
  };

  // All transports — including web — go through lrzsz (canonical
  // Forsberg/Ohse). For web, the browser arms zmodem.js Sentry on
  // `transfer-raw:init`; lrzsz output is bridged through the
  // existing `transfer-raw:data` socket channel. Two zmodem
  // implementations talking over the socket interop the same way
  // lrzsz interops with any other ZMODEM client over a serial wire.
  //
  // The historical "Unhandled header: ZRINIT" Sentry crash was caused
  // by IAC double-escape on telnet (commit b1e0b8f9b removed) +
  // ANSI cooking pre-Sentry; both are fixed now. The web branch that
  // previously routed to HTTP `/api/upload` is gone — uniform pipeline.
  {
    const { isLrzszAvailable, LrzszTransferManager } = require('../../services/lrzsz-transfer.service');
    const lrzAvailable = isLrzszAvailable();
    console.log(`[ZMODEM-UL-RZ] lrzsz check: ${lrzAvailable}`);
    if (!lrzAvailable) {
      // WEB_: a missing host tool (lrzsz); express.e has its own xpr libraries.
      socket.emit('ansi-output', '\r\n\x1b[31mZMODEM unavailable: lrzsz (sz/rz) not installed on this BBS host.\x1b[0m\r\n');
      socket.emit('ansi-output', '\x1b[31mAsk the sysop to install lrzsz (brew install lrzsz / apk add lrzsz).\x1b[0m\r\n\r\n');
      endUpload(session, 'failure', toMenu);
      return;
    }
    // express.e:19018-19023 — resumeStuff() runs BEFORE the receive.
    // For our RZ command path (uLFType=1 in express.e) the call is
    // technically a divergence from the original (express skips it
    // for raw RZ), but RZ in the TS port is the de-facto upload
    // entry point on telnet/SSH because the U command is wrapped by
    // BBSCmd doors. Offering partials here gives users the same
    // recovery UX they'd get from internal U on the original Amiga.
    const { startResumeStuff } = require('../../services/resume-stuff.service');
    const { config: appConfigForResume } = require('../../config');
    console.log(`[ZMODEM-UL-RZ] startResumeStuff entry slot=${session.user?.slotNumber} conf=${session.currentConf}`);
    startResumeStuff(socket, session, playpen, appConfigForResume, (resumeResult: any) => {
      console.log(`[ZMODEM-UL-RZ] startResumeStuff onComplete resumed=${resumeResult.resumed} aborted=${resumeResult.aborted}`);
      // express.e resumeStuff (18119-18257) prints no count of restored files.
      spawnLrzszForUpload();
    });
    function spawnLrzszForUpload() {
      // express.e:17279-17283 fileReceive: the background check starts with the receive.
      const { startBackgroundFileCheck } = require('../../services/background-file-check.service');
      const background = startBackgroundFileCheck(session);
      const lrzManager = new LrzszTransferManager({
        session,
        onFileReceived: background?.onFileReceived,
        transport: { type: transportType, send: sender },
        direction: 'upload',
        paths: [playpen],
        // express.e:16831 zmdupecheck - asked at the ZFILE header, so a file
      // the board already has is answered with ZSKIP instead of being
      // received and then rejected. A rule that cannot answer takes the
      // file: the post-transfer filing still catches it.
      isDuplicate: (name: string) => {
        const { uploadIsDuplicate } = require('../../services/upload-duplicate.service');
        const { config: appCfg } = require('../../config');
        return uploadIsDuplicate({
          filename: name,
          conferenceId: joinedConf(session).conf,
          bbsRoot: appCfg.get('dataDir'),
          nodeId: session.nodeId || 0,
        });
      },
        // internalCommandRZ is uploadaFile(1,...) (express.e:25618), the U
        // command's procedure: what rz received is filed through the same
        // path (user-commands fileReceivedUploads -> upload-filing), and the
        // upload ends through endUpload like every other upload.
        onComplete: async (ok: boolean, detail: any) => {
          endRawTransfer(session);
          // express.e:19051-19053: whatever fileReceive delivered, "File Uploading
          // Complete..." and the stats follow; a failed receive only logs "Upload
          // Failed.." (19093-19096). runPostUpload does both for an empty list.
          const { fileReceivedUploads } = require('./user-commands.handler');
          await fileReceivedUploads(socket, session, detail?.received || [], detail?.skipped || [], ulStartTime);
        },
      });
      (session as any).transferRawActive = true;
      (session as any).transferRawSink = (buf: Buffer) => lrzManager.handleInput(buf);
      (session as any).transferRawSend = sender;
      (session as any).transferManager = lrzManager;
      // Park the session in FILES_UPLOAD so the post-command flow
      // does NOT re-render the menu prompt while rz is still
      // negotiating ZMODEM with the peer. The menu prompt bytes
      // mid-transfer corrupted the wire and rz aborted with code 128.
      // onComplete restores subState=DISPLAY_MENU when rz exits.
      session.subState = LoggedOnSubState.FILES_UPLOAD;
      // express.e:17795 prints `\b\n\b\n` after the Okay prompt and
      // nothing else - command.handler.ts:3050 already emits those two
      // newlines. A "Ready to receive" banner was ours, not express's.
      // express.e:15891-15896 — negotiate IAC BINARY before ZMODEM so
      // the client doesn't apply NVT rules to file data. Without this,
      // outbound CR / NUL / 0xFF bytes get transformed, causing CRC
      // errors on every subpacket containing such bytes.
      //   IAC WILL BINARY  = 255 251 0
      //   IAC DO   BINARY  = 255 253 0
      // Use transferRawSendUnescaped to bypass the 0xFF-doubler in
      // sender — IAC negotiation must reach the wire byte-for-byte.
      negotiateBinaryForTransfer(session);
      // Web: arm browser Sentry before lrzsz writes its first byte.
      // Frontend `transfer-raw:init` handler calls beginZmodem() which
      // constructs the Sentry and (for upload) sends ZRQINIT back via
      // `transfer-raw:data` — that ZRQINIT becomes rz's first stdin
      // byte. Wait for the client to emit `transfer-raw:start` as
      // confirmation; fall back to a 1500 ms timer if the client
      // never acks (e.g. zmodem.js failed to load).
      if (transportType === 'web') {
        // Wait for the browser to ack `transfer-raw:start` before
        // spawning rz. The browser defers that ack until the user has
        // picked a file (otherwise rz times out waiting for ZFILE).
        // No short fallback timer here — a premature spawn races the
        // file picker; rz would exit before ZRQINIT arrives. A long
        // safety timer cleans up if the user abandons the picker
        // entirely.
        const handshakeStart = Date.now();
        const fireOnce = (reason: string) => {
          if ((fireOnce as any)._fired) return;
          (fireOnce as any)._fired = true;
          console.log(`[ZMODEM-UL-RZ] handshake done via ${reason} after ${Date.now() - handshakeStart}ms — spawning rz`);
          lrzManager.start();
        };
        socket.once('transfer-raw:start', () => fireOnce('client-start'));
        // WEB_: the browser's file picker - cancelled or never answered - has no
        // express.e counterpart; both texts below are the port's own.
        socket.once('transfer-raw:cancel', () => {
          if ((fireOnce as any)._fired) return;
          (fireOnce as any)._fired = true;
          console.log('[ZMODEM-UL-RZ] client cancelled before pick — aborting');
          socket.emit('ansi-output', '\r\nUpload cancelled.\r\n\r\n');
          endUpload(session, 'failure', toMenu);
        });
        setTimeout(() => {
          if (!(fireOnce as any)._fired) {
            (fireOnce as any)._fired = true;
            console.log('[ZMODEM-UL-RZ] handshake timeout (120s) — abandoning rz spawn');
            // WEB_: no express.e equivalent. This is the 120 s timeout on the browser file picker.
            socket.emit('ansi-output', '\r\nUpload timed out (no file picked).\r\n\r\n');
            endUpload(session, 'failure', toMenu);
          }
        }, 120000);
        console.log('[ZMODEM-UL-RZ] emitting transfer-raw:init { direction: upload }');
        socket.emit('transfer-raw:init', { direction: 'upload', paths: [playpen] });
      } else {
        lrzManager.start();
      }
    }
  }
}

/**
 * US Command: Sysop Upload (internalCommandUS)
 * Original: express.e:25660-25665
 *
 * Special upload mode for sysops that bypasses ratio checks.
 * In AmiExpress, this called sysopUpload() with no restrictions.
 * Web version: Shows upload interface with sysop privileges.
 */
export function handleSysopUploadCommand(socket: any, session: BBSSession, params: string = ''): void {
  // Check security - express.e:25661
  if (!checkSecurity(session.user, ACSPermission.SYSOP_COMMANDS)) {
    ErrorHandler.permissionDenied(socket, 'use sysop upload', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // Set environment status - express.e:25662
  setEnvStat(session, EnvStat.UPLOADING);

  // express.e:25660-25664 internalCommandUS - no header, calls sysopUpload()
  socket.emit('ansi-output', '\r\n');

  _displayUploadInterface(socket, session, params);
}

/**
 * UP Command: Node Uptime (internalCommandUP)
 * Original: express.e:25667-25673
 *
 * Displays when the node was started and current uptime.
 * In AmiExpress, this showed nodeStart time formatted.
 * Web version: Shows when the node started and total uptime.
 */
export function handleNodeUptimeCommand(socket: any, session: BBSSession): void {
  // express.e:25667-25672: '\b\nNode \d was started at \s.\b\n' with formatLongDateTime(nodeStart)
  const nodeStartTime = session.nodeStartTime || Date.now();
  const startTime = formatLongDateTime(new Date(nodeStartTime));
  // express.e:25667-25673 ENDPROC RESULT_SUCCESS — no press-key; main loop sets menuPause:=TRUE
  socket.emit('ansi-output', `\r\nNode ${session.nodeId || 1} was started at ${startTime}.\r\n`);
  session.menuPause = true;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * VO - the voting booth (internalCommandVO, express.e:25700-25710). The
 * booth itself is handlers/commands/vote-booth.ts.
 */
export async function handleVotingBoothCommand(socket: any, session: BBSSession): Promise<InternalCommandResult> {
  // express.e:25703 setEnvStat(ENV_DOORS)
  if (checkSecurity(session.user, ACSPermission.VOTE)) setEnvStat(session, EnvStat.DOORS);
  const { handleVotingBoothCommand: voteBooth } = require('./vote-booth');
  return await voteBooth(socket, session);
}

/**
 * DS: Sysop Download - express.e:28302-28303 `internalCommandD(cmdcode,...)`
 * with the code typed. downloadAFile (20040) makes it a sysop download for a
 * caller with ACS_SYSOP_DOWNLOAD - any path, logged as `SYSOP DOWNLOAD:` -
 * and a plain D for anyone else. One handler; the code is the difference.
 */
export async function handleDownloadWithStatusCommand(socket: any, session: BBSSession, params: string = ''): Promise<InternalCommandResult | void> {
  const { DownloadHandler } = require('../file/download.handler');
  return await DownloadHandler.handleDownloadCommand(socket, session, params, 'DS');
}
