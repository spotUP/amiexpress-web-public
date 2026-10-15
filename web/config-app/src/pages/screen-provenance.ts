/**
 * Where express.e displays each screen. GENERATED - do not edit.
 *
 * Source: AmiExpress-Sources/express.e
 * Regenerate: npx tsx dev/scripts/generate-screen-provenance.ts
 *
 * The admin says when a caller meets a screen; this is where that claim comes
 * from, so it cites express.e rather than somebody's memory of AmiExpress.
 */

export interface ScreenCallSite {
  /** The express.e procedure that displays it. */
  proc: string;
  /** Its line in express.e. */
  line: number;
}

export const SCREEN_CALL_SITES: Record<string, ScreenCallSite[]> = {
  AWAIT: [{ proc: 'processAwait', line: 29926 }],
  BBSTITLE: [{ proc: 'processLogon', line: 29552 }],
  BULL: [{ proc: 'processLoggedOnUser', line: 28556 }],
  CONF_BULL: [{ proc: 'joinConf', line: 5058 }],
  CONF_JOINMSGBASE: [{ proc: 'internalCommandJ', line: 25170 }, { proc: 'internalCommandJM', line: 25221 }],
  DOWNLOAD: [{ proc: 'downloadAFile', line: 19967 }],
  FILEHELP: [{ proc: 'displayFileList', line: 27646 }],
  GUESTLOGON: [{ proc: 'newUserAccount', line: 30049 }],
  INTERNETNAMES: [{ proc: 'captureRealAndInternetNames', line: 28199 }],
  JOIN: [{ proc: 'newUserAccount', line: 30057 }],
  JOINCONF: [{ proc: 'internalCommandJ', line: 25143 }],
  JOINED: [{ proc: 'newUserAccount', line: 30125 }],
  JOINMSGBASE: [{ proc: 'internalCommandJ', line: 25171 }, { proc: 'internalCommandJM', line: 25222 }],
  LANGUAGES: [{ proc: 'chooseTranslator', line: 11395 }],
  LOCKOUT0: [{ proc: 'processLogon', line: 29770 }],
  LOCKOUT1: [{ proc: 'processLogon', line: 29770 }],
  LOGOFF: [{ proc: 'processLoggingOff', line: 8187 }],
  LOGON: [{ proc: 'processLogon', line: 29854 }],
  LOGON24: [{ proc: 'checkTimeUsed', line: 558 }],
  MAILSCAN: [{ proc: 'confScan', line: 28073 }],
  MENU: [{ proc: 'internalCommandQuestionMark', line: 24597 }, { proc: 'processLoggedOnUser', line: 28586 }],
  NEWUSERPW: [{ proc: 'newUserAccount', line: 30014 }],
  NOCALLERSATBAUD: [{ proc: 'processLogon', line: 29486 }],
  NODE_BULL: [{ proc: 'processLoggedOnUser', line: 28557 }],
  NONEWATBAUD: [{ proc: 'newUserAccount', line: 30010 }],
  NONEWUSERS: [{ proc: 'newUserAccount', line: 30008 }],
  NOT_TIME: [{ proc: 'baudTime', line: 29301 }],
  NOUPLOADS: [{ proc: 'uploadaFile', line: 18981 }],
  ONENODE: [{ proc: 'processLogon', line: 29719 }],
  PRIVATE: [{ proc: 'doSystemPassword', line: 29336 }],
  REALNAMES: [{ proc: 'captureRealAndInternetNames', line: 28169 }],
  UPLOAD: [{ proc: 'uploadaFile', line: 18986 }],
};

/** Every place express.e shows this screen, or an empty list. */
export function callSitesFor(screen: string): ScreenCallSite[] {
  return SCREEN_CALL_SITES[screen] ?? [];
}
