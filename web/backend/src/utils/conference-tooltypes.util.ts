import * as fs from 'fs';

import { config } from '../config';
import { conferenceDir } from '../conferences/conference-paths';
import { readTooltypeMap } from './info-file.util';
import { SysopDebugUtil, DebugSeverity } from './sysop-debug.util';

export interface ConferenceToolFlags {
  forceNewscan: boolean;
  noNewscan: boolean;
  showNewFiles: boolean;
  noNewFiles: boolean;
  forceMenus: boolean;
  noBulls: boolean;
  noConfBulls: boolean;
  freeDownloads: boolean;
  // express.e:5028, 5093, 5121 — CUSTOM tooltype routes the conference
  // through a different message-base implementation (customMsgbaseCmd)
  // instead of the standard MailStats/HeaderFile path. When set, the
  // standard mail-stats lookup, the per-conf message-range display,
  // and the mail-scan are all skipped — express.e calls the custom
  // hook instead. Audit F-2.
  custom: boolean;
  // express.e:5013 / express.e:15269 — MENU_PROMPT tooltype overrides the standard menu prompt
  menuPrompt: string;
  // express.e:4078-4087 — CHECK_REALNAME tooltypes:
  //   USERNAME → require username on message TO: field (XIM data=2)
  //   REALNAME → require realname (XIM data=1)
  //   neither  → handle/alias OK (XIM data=0)
  // The per-msgbase form is `USERNAME.<n>` / `REALNAME.<n>`; we surface
  // those as keyed sets so the XIM handler can pick the right one for
  // the current message base.
  requireUsername: boolean;
  requireRealname: boolean;
  requireUsernameMsgBases: Set<number>;
  requireRealnameMsgBases: Set<number>;
  // express.e:5017-5024 — confNameType resolution. INTERNETNAME (or
  // INTERNETNAME.<msgBaseNum>) makes confMailName use loggedOnUserMisc
  // .internetName truncated to 10 chars; takes precedence over the default
  // NAME_TYPE_USERNAME but loses to REALNAME if both are set
  // (express.e IF/ELSEIF order).
  requireInternetname: boolean;
  requireInternetnameMsgBases: Set<number>;
  // express.e:9909-9950 checkToForward — when sysop receives mail, forward
  // to this username instead. Empty string = no forwarding.
  forwardMail: string;
  // express.e:10787-10788 EXTSEND.<n> per-msgbase tooltype.
  // When set: EALL is forbidden in this msgbase (10805-10808) and the
  // Private prompt is skipped (10860). Set holds the msgbase numbers
  // that have EXTSEND set.
  extSendMsgBases: Set<number>;
  // express.e:8618-8620 clearMsgPointers - which scans a caller's new
  // pointers for this conference start with (see defaultScanFlags).
  defaultNewscan: boolean;
  defaultNewFiles: boolean;
  defaultZoom: boolean;
}

const defaultFlags: ConferenceToolFlags = {
  forceNewscan: false,
  noNewscan: false,
  showNewFiles: false,
  noNewFiles: false,
  forceMenus: false,
  // AmiExpress defaults show bulletins unless explicitly disabled
  noBulls: false,
  noConfBulls: false,
  freeDownloads: false,
  custom: false,
  menuPrompt: '',
  requireUsername: false,
  requireRealname: false,
  requireUsernameMsgBases: new Set<number>(),
  requireRealnameMsgBases: new Set<number>(),
  requireInternetname: false,
  requireInternetnameMsgBases: new Set<number>(),
  forwardMail: '',
  extSendMsgBases: new Set<number>(),
  defaultNewscan: false,
  defaultNewFiles: false,
  defaultZoom: false,
};

/**
 * The answer per conference, kept only while its icon is unchanged: a sysop's
 * edit is read at the next call, as express.e reads the icon when it needs it.
 */
const conferenceTooltypeCache = new Map<number, { iconPath: string; stamp: number; flags: ConferenceToolFlags }>();

/** The conference's icon, beside the directory its LOCATION names. */
function conferenceIconPath(confNumber: number): string {
  return `${conferenceDir(config.getConfig().dataDir, confNumber)}.info`;
}

function readFlagsFromIcon(iconPath: string): Partial<ConferenceToolFlags> {
  try {
    if (!fs.existsSync(iconPath)) {
      return {};
    }

    // The board's one tooltype reader (info-file.util); presence is the value
    // for a flag (checkToolTypeExists, express.e:576).
    const tooltypeMap = readTooltypeMap(iconPath);
    const flagSet = new Set<string>(tooltypeMap.keys());

    const result: Partial<ConferenceToolFlags> = {};
    if (flagSet.has('FORCE_NEWSCAN')) {
      result.forceNewscan = true;
    }
    if (flagSet.has('NO_NEWSCAN')) {
      result.noNewscan = true;
    }
    if (flagSet.has('DEFAULT_NEWSCAN')) result.defaultNewscan = true;
    if (flagSet.has('DEFAULT_NEW_FILES')) result.defaultNewFiles = true;
    if (flagSet.has('DEFAULT_ZOOM')) result.defaultZoom = true;
    if (flagSet.has('SHOW_NEW_FILES')) {
      result.showNewFiles = true;
    }
    if (flagSet.has('NO_NEW_FILES')) {
      result.noNewFiles = true;
    }
    if (flagSet.has('FORCE_MENUS')) {
      result.forceMenus = true;
    }
    if (flagSet.has('NO_BULLS')) {
      result.noBulls = true;
    }
    if (flagSet.has('NO_CONF_BULLS')) {
      result.noConfBulls = true;
    }
    if (flagSet.has('FREEDOWNLOADS')) {
      result.freeDownloads = true;
    }
    // express.e:5028, 5093, 5121 — CUSTOM gates the standard mail
    // pipeline. Sysops set this on conferences that use a non-standard
    // message-base format (e.g. the old QWK-only / external-only
    // bases). Presence-only flag (no value).
    if (flagSet.has('CUSTOM')) {
      result.custom = true;
    }
    // express.e:5013 / express.e:15269 — MENU_PROMPT=<string> overrides the standard menu prompt
    if (tooltypeMap.has('MENU_PROMPT')) {
      result.menuPrompt = tooltypeMap.get('MENU_PROMPT')!;
    }

    // express.e:9915 readToolType(TOOLTYPE_CONF, currentConf, 'FORWARDMAIL', str)
    // — when set, mail addressed to sysop (slot 1) is forwarded to this user.
    if (tooltypeMap.has('FORWARDMAIL')) {
      // express.e:9916 strips trailing newline; the parser already gives us
      // a clean value, just trim trailing whitespace defensively.
      result.forwardMail = (tooltypeMap.get('FORWARDMAIL') || '').replace(/[\r\n]+$/, '').trim();
    }

    // express.e:10787-10788 — per-msgbase EXTSEND.<n> flag. Presence-only
    // (the value is ignored). When set, the msgbase is "external" — EALL
    // is forbidden and Private prompt is skipped during enterMSG.
    const extSet = new Set<number>();
    for (const key of flagSet) {
      const m = /^EXTSEND\.(\d+)$/.exec(key);
      if (m) extSet.add(parseInt(m[1]!, 10));
    }
    if (extSet.size > 0) result.extSendMsgBases = extSet;

    // express.e:4081-4084 — USERNAME / REALNAME tooltypes (conf-wide, plus
    // per-msgbase variants USERNAME.<n> / REALNAME.<n>) used by
    // captureRealAndInternetNames to gate the TO: field.
    // express.e:5017-5024 also harvests INTERNETNAME / INTERNETNAME.<n>
    // for confNameType resolution.
    if (flagSet.has('USERNAME')) result.requireUsername = true;
    if (flagSet.has('REALNAME')) result.requireRealname = true;
    if (flagSet.has('INTERNETNAME')) result.requireInternetname = true;
    const msgBaseUserSet = new Set<number>();
    const msgBaseRealSet = new Set<number>();
    const msgBaseInetSet = new Set<number>();
    for (const key of flagSet) {
      const usernameMatch = /^USERNAME\.(\d+)$/.exec(key);
      if (usernameMatch) {
        msgBaseUserSet.add(parseInt(usernameMatch[1]!, 10));
        continue;
      }
      const realnameMatch = /^REALNAME\.(\d+)$/.exec(key);
      if (realnameMatch) {
        msgBaseRealSet.add(parseInt(realnameMatch[1]!, 10));
        continue;
      }
      const internetnameMatch = /^INTERNETNAME\.(\d+)$/.exec(key);
      if (internetnameMatch) {
        msgBaseInetSet.add(parseInt(internetnameMatch[1]!, 10));
      }
    }
    if (msgBaseUserSet.size > 0) result.requireUsernameMsgBases = msgBaseUserSet;
    if (msgBaseRealSet.size > 0) result.requireRealnameMsgBases = msgBaseRealSet;
    if (msgBaseInetSet.size > 0) result.requireInternetnameMsgBases = msgBaseInetSet;

    return result;
  } catch (error) {
console.error(`[ConferenceTooltypes] Error parsing ${iconPath}:`, error);
    SysopDebugUtil.debug(
      null,
      null,
      'Conference Switching',
      `Failed to parse ${iconPath} tooltypes`,
      { error: error instanceof Error ? error.message : String(error), iconPath },
      DebugSeverity.WARNING
    );
    return {};
  }
}

export function getConferenceToolFlags(confNumber: number): ConferenceToolFlags {
  const iconPath = conferenceIconPath(confNumber);
  let stamp = -1;
  try {
    stamp = fs.statSync(iconPath).mtimeMs;
  } catch { /* no icon: every flag off */ }
  const cached = conferenceTooltypeCache.get(confNumber);
  if (cached && cached.iconPath === iconPath && cached.stamp === stamp) {
    return cached.flags;
  }

  const flags: ConferenceToolFlags = {
    ...defaultFlags,
    ...(stamp >= 0 ? readFlagsFromIcon(iconPath) : {}),
  };

  conferenceTooltypeCache.set(confNumber, { iconPath, stamp, flags });
  return flags;
}
