/**
 * XIM User Info Handlers
 *
 * Extracted helpers for PG_UD (User Data) and PG_US (User String) query handlers,
 * and the buildGFileCandidates pure utility.  The XIMIOHandler delegates to these
 * functions passing `this` as `self` so no public API surface changes.
 */

import * as path from 'path';
import { XIMMessage } from './types';
import { getSystemTime } from '../../utils/date-time.util';
import { debugLog } from '../../utils/debug-log';

/**
 * Handle PG_UD (User Data)
 * From E sources (express.e:4444-4463)
 * Returns numeric user information based on msg.data field
 */
export function handleUserData(self: any, msg: XIMMessage, bbsSession: any): void {
  let resultData = 0;

debugLog(`[XIMIOHandler] PG_UD: Request type ${msg.data}`);

  // express.e:4445-4463 - Map data field to user info
  switch (msg.data) {
    case 1: // Security level (divided by 10)
      resultData = Math.floor((bbsSession.user?.secLevel || 0) / 10);
      break;
    case 2: // Expert mode flag ('X' = expert)
      resultData = (bbsSession.user?.expert === 'X') ? 1 : 0;
      break;
    case 3: // Reserved
      resultData = 0;
      break;
    case 4: // Times called
    case 5: // Times called (duplicate in original)
      resultData = bbsSession.user?.timesCalled || 0;
      break;
    case 6: // Node number (always 1 for web version)
      resultData = 1;
      break;
    case 7: // Time limit in minutes
      resultData = Math.floor((bbsSession.timeLimit || 3600) / 60);
      break;
    case 8: // Screen width
      resultData = 80;
      break;
    case 9: // User line length (screen height in lines, NOT character width)
      // express.e:4462: doormsg.data:=userLineLen
      // userLineLen = number of lines on screen for pagination
      resultData = bbsSession.pauseLines || bbsSession.user?.linesPerScreen || bbsSession.user?.pageLength || 24;
      break;
    default:
      resultData = 0;
  }

debugLog(`[XIMIOHandler] PG_UD: Returning ${resultData}`);
  self.reply(msg, resultData);
}

/**
 * Handle PG_US (User String)
 * From E sources (express.e:4464-4494)
 * Returns string user information based on msg.data field
 */
export function handleUserString(self: any, msg: XIMMessage, bbsSession: any): void {
  let resultString = '';

debugLog(`[XIMIOHandler] PG_US: Request type ${msg.data}`);

  // express.e:4465-4494 - Map data field to user string
  switch (msg.data) {
    case 1: // Username (max 21 chars)
      resultString = (bbsSession.user?.name || '').substring(0, 21);
      break;
    case 2: // Empty string
      resultString = '';
      break;
    case 3: // Location (max 39 chars)
      resultString = (bbsSession.user?.location || '').substring(0, 39);
      break;
    case 4: // Location (max 29 chars)
      resultString = (bbsSession.user?.location || '').substring(0, 29);
      break;
    case 5: // State code (max 2 chars)
      resultString = (bbsSession.user?.location || '').substring(0, 2);
      break;
    case 6: // Zip code (max 7 chars)
      resultString = (bbsSession.user?.location || '').substring(0, 7);
      break;
    case 7: // Door path
      resultString = 'PGDOORS:';
      break;
    case 8: // BBS location path
      resultString = bbsSession.bbsPath || process.env.BBS_DATA_DIR || process.cwd();
      break;
    case 9: // Long date format
      const date = getSystemTime();
      resultString = date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      break;
    case 10: // Long time format
      const time = getSystemTime();
      resultString = time.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
      break;
    default:
      resultString = '';
  }

debugLog(`[XIMIOHandler] PG_US: Returning "${resultString}"`);

  self.messageParser.writeMessageString(
    msg.msgAddr,
    resultString.substring(0, 80)
  );

  self.reply(msg, 1);
}

/**
 * Build candidate list for showgfile ACS/language search
 * Pure function — no reference to XIMIOHandler instance state.
 */
export function buildGFileCandidates(
  basePath: string,
  explicitExt: string,
  language: string,
  secLevel: number
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (p: string) => {
    const normalized = path.normalize(p);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      candidates.push(normalized);
    }
  };

  const lang = language?.trim();
  const langExts =
    lang && lang.toLowerCase() !== 'txt'
      ? [`.${lang}`, `.${lang}.gr`]
      : [];

  const baseExts =
    explicitExt && explicitExt.length > 0
      ? [explicitExt]
      : ['.txt', '.txt.gr', '.GR1'];

  const exts = [...langExts, ...baseExts];

  const rounded =
    secLevel >= 5 ? secLevel - (secLevel % 5) : Math.max(secLevel, 0);
  for (let level = rounded; level >= 5; level -= 5) {
    for (const ext of exts) {
      add(`${basePath}${level}${ext}`);
    }
  }

  for (const ext of exts) {
    add(`${basePath}${ext}`);
  }

  return candidates;
}
