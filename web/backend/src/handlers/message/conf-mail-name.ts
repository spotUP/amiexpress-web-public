/**
 * Who a message is from and to, as a conference names them - express.e's
 * confMailName, EXTSEND and the sysop-recipient check. Split out of
 * message-entry.handler.ts, which re-exports them.
 */
import type { BBSSession } from '../../index';
import { joinedConf } from '../../utils/joined-conf.util';

/**
 * express.e:10787-10788 — EXTSEND.<msgBase> tooltype on the conf icon marks
 * a msgbase as "external" (e.g. routed to a UUCP/FidoNet gateway). When set:
 *   - express.e:10805-10808: EALL is forbidden
 *   - express.e:10860: Private prompt is skipped
 */
export function isExtSendMsgBase(session: BBSSession): boolean {
  const { conf: confId, msgBase: msgBaseId } = joinedConf(session);
  const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
  const flags = getConferenceToolFlags(confId);
  return !!flags?.extSendMsgBases?.has?.(msgBaseId);
}

/** express.e NAME_TYPE_USERNAME / NAME_TYPE_REALNAME / NAME_TYPE_INTERNETNAME. */
export type ConfNameType = 'username' | 'realname' | 'internetname';

/**
 * express.e:5017-5024 confNameType for a conference and message base:
 *
 *   confNameType:=NAME_TYPE_USERNAME
 *   IF checkToolTypeExists(TOOLTYPE_CONF,conf,'REALNAME') OR checkToolTypeExists(TOOLTYPE_MSGBASE,conf,'REALNAME.<n>')
 *     confNameType:=NAME_TYPE_REALNAME
 *   ELSEIF checkToolTypeExists(TOOLTYPE_CONF,conf,'INTERNETNAME') OR ...'INTERNETNAME.<n>'
 *     confNameType:=NAME_TYPE_INTERNETNAME
 *   ENDIF
 */
export function getConfNameType(confId: number, msgBaseId: number): ConfNameType {
  const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
  const flags = getConferenceToolFlags(confId);
  if (flags?.requireRealname || flags?.requireRealnameMsgBases?.has?.(msgBaseId)) return 'realname';
  if (flags?.requireInternetname || flags?.requireInternetnameMsgBases?.has?.(msgBaseId)) return 'internetname';
  return 'username';
}

/**
 * Compute the user's display name FOR THIS CONFERENCE — express.e
 * confMailName (declared at express.e:237, populated at express.e:12459-
 * 12466 inside the messages PROC):
 *
 *   SELECT confNameType
 *     CASE NAME_TYPE_USERNAME    StrCopy(confMailName, userName, 31)
 *     CASE NAME_TYPE_REALNAME    StrCopy(confMailName, realName, 26)
 *     CASE NAME_TYPE_INTERNETNAME StrCopy(confMailName, internetName, 10)
 *
 * confNameType itself is resolved per express.e:5017-5024:
 *   - REALNAME (or REALNAME.<msgBaseNum>)        → NAME_TYPE_REALNAME
 *   - ELSEIF INTERNETNAME (or INTERNETNAME.<n>)  → NAME_TYPE_INTERNETNAME
 *   - ELSE                                       → NAME_TYPE_USERNAME (default)
 * REALNAME wins over INTERNETNAME if both are configured.
 *
 * Note: USERNAME / USERNAME.<n> is a SEPARATE tooltype that gates the
 * TO: field validation (captureRealAndInternetNames, express.e:4078-
 * 4087); it does NOT change confNameType. Earlier versions of this
 * helper conflated the two and used `requireUsername` to short-circuit
 * to the username branch, which is wrong but harmless because
 * USERNAME without REALNAME/INTERNETNAME yields the default
 * NAME_TYPE_USERNAME anyway.
 *
 * Express.e then uses confMailName for `mh.fromName` (10649), all
 * "is this my mail?" checks (8854, 8943, 9854, 9899, 11114, 11125,
 * 11179, 11202, 11706, 11749, 11918-11919, 12087-12089, 12345-12348).
 */
export function getConfMailName(session: BBSSession): string {
  const { conf, msgBase } = joinedConf(session);
  return getConfMailNameFor(session.user, conf, msgBase);
}

/**
 * Session-less variant of getConfMailName — pass user + conf/msgbase
 * explicitly. Used by mail-scan helpers that iterate multiple conferences
 * outside of a single session context (countNewMessages,
 * getMessagesForConfScan). Same express.e semantics as getConfMailName;
 * see that JSDoc for the full rules.
 */
export function getConfMailNameFor(user: any, confId: number, msgBaseId: number): string {
  const username = user?.username || '';
  const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
  const flags = getConferenceToolFlags(confId);
  const requireRealname = !!(flags?.requireRealname || flags?.requireRealnameMsgBases?.has?.(msgBaseId));
  const requireInternetname = !!(flags?.requireInternetname || flags?.requireInternetnameMsgBases?.has?.(msgBaseId));
  const userMisc: any = user || {};
  const realName = String(userMisc.realName || userMisc.realname || '').trim();
  const internetName = String(userMisc.internetName || userMisc.internetname || '').trim();

  // express.e:5017-5024 priority: REALNAME wins over INTERNETNAME.
  if (requireRealname && realName) {
    return realName.substring(0, 26);
  }
  if (requireInternetname && internetName) {
    return internetName.substring(0, 10);
  }
  // Default = NAME_TYPE_USERNAME (express.e:12460-12461)
  return username.substring(0, 31);
}

/**
 * Express.e:9918-9919 — `loadAccount(1, tempUser, ...)` then
 * `stringCompare(name, tempUser.name)`. The "is this the sysop?" check
 * matches the slot-1 user (the actual configured sysop), not just the
 * literal token 'SYSOP'. We accept either the literal 'SYSOP'
 * (handleMessageToInput maps that to slot 1) OR a case-insensitive
 * match against bbsConfig.sysop_name (vanilla AmiExpress sets slot 1's
 * userName from this config field).
 */
export function isSysopRecipient(name: string): boolean {
  const trimmed = (name || '').trim();
  if (trimmed.toUpperCase() === 'SYSOP') return true;
  try {
    const { loadBBSConfig } = require('../../services/bbs-config-file.service');
    const { config } = require('../../config');
    const bbsConfig = loadBBSConfig(config.get('dataDir'));
    const sysopName = String(bbsConfig?.sysop_name || '').trim();
    if (sysopName && sysopName.toLowerCase() === trimmed.toLowerCase()) return true;
  } catch { /* config load failed — fall back to literal SYSOP only */ }
  return false;
}
