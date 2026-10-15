/**
 * Permissions Access/ACS.<level>.info does not actually decide.
 *
 * express.e:8466-8485 resolves eighteen flags BEFORE it ever opens the ACS
 * file: eight come from the node icon or the caller's own record, four
 * always answer TRUE, and six are declared and never checked anywhere -
 * express.e's own header says FREE_RESUMING is "not implemented in /X3 or
 * 4". Toggling one of these in the file changes nothing on the running
 * board; the file still HAS the flag (and a sysop reading the AmiExpress
 * documentation will look for it there), so it stays in the list rather
 * than being hidden - it is annotated instead, so the switch does not read
 * as a live control it is not.
 *
 * Copied from web/config-app/src/pages/acs-permission-groups.ts's
 * ACS_NOT_FROM_THIS_FILE (same 19 keys, same wording). There is no shared
 * package between dev/console and web/config-app to import this from
 * instead - if express.e's resolution order changes, both copies need the
 * same edit.
 */
export const ACS_NOT_FROM_THIS_FILE: Record<string, string> = {
  // Resolved from the node icon (ACP.e reads these into cmds.acLvl).
  'ACS.SENTBY_FILES': "Set by the node's SENTBY_FILES tooltype, not here",
  'ACS.DEFAULT_CHAT_ON': "Set by the node's CHAT_ON tooltype, not here",
  'ACS.KEEP_UPLOAD_CREDIT': "Set by the node's KEEP_UPLOAD_CREDIT tooltype, not here",
  'ACS.DO_CALLERSLOG': "Set by the node's CALLERS_LOG tooltype, not here",
  'ACS.DO_UD_LOG': "Set by the node's UD_LOG tooltype, not here",
  'ACS.SCREEN_TO_FRONT': "Set by the node's WINDOW.TO_FRONT tooltype, not here",
  'ACS.WILDCARDS': "Set by the node's wildcard toggle, not here",

  // Resolved from the caller's own record.
  'ACS.CLEAR_SCREEN_MSG': "Comes from the caller's own screen-clear flag, not from this file",

  // Always granted, whatever the file says.
  'ACS.MSG_LEVEL': 'Always granted, whatever this file says',
  'ACS.MSG_EXPERATION': 'Always granted, whatever this file says',
  'ACS.CUSTOMCOMMANDS': 'Always granted, whatever this file says',
  'ACS.JOIN_SUB_CONFERENCE': 'Always granted, whatever this file says',

  // Declared in the enum and never checked anywhere in express.e.
  'ACS.ACCOUNT_VIEW': 'Declared by AmiExpress and never checked - nothing reads it',
  'ACS.CREATE_CONFERENCE': 'Declared by AmiExpress and never checked - nothing reads it',
  'ACS.DUPE_FILECHECK': 'Declared by AmiExpress and never checked - nothing reads it',
  'ACS.FREE_RESUMING': 'Not implemented in AmiExpress - nothing reads it',
  'ACS.MAX_PAGES': 'Declared by AmiExpress and never checked - nothing reads it',
  'ACS.ONE_TIME_BULLETINS': 'Declared by AmiExpress and never checked - nothing reads it',
  'ACS.UNKNOWN': 'A spare slot in the enum, with no meaning of its own',
};
