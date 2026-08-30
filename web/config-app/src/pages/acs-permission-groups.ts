/**
 * What each ACS permission means, and which ones belong together.
 *
 * The Access Levels page listed all 87 flags as their raw names, in the order
 * express.e declares them (express.e:31528-31537) - which is the order the
 * bits sit in the file, not an order that means anything to a sysop. So
 * ACS.ZIPPY_TEXT_SEARCH sat between ACS.EDIT_PASSWORD and ACS.OVERRIDE_CHAT,
 * and deciding what a level could actually do meant reading all 87 and
 * knowing the codebase.
 *
 * The names still matter - they are what is written in Access/ACS.<level>.info
 * and what a sysop finds in the AmiExpress documentation - so each one is
 * shown alongside its description rather than replaced by it.
 *
 * Every permission appears in exactly one group; the test beside this file
 * fails if one is added to express.e and not placed here, so a new flag
 * cannot quietly become invisible.
 */

export interface PermissionGroup {
  /** Shown as the section heading. */
  title: string;
  /** One line on what this group of permissions covers. */
  description: string;
  /** Raw ACS names, in the order they should be shown. */
  permissions: string[];
}

/** Description for a raw ACS name. */
export const ACS_LABELS: Record<string, string> = {
  // Getting on, and staying on
  'ACS.RELOGON': 'Log on again without dropping the connection',
  'ACS.NO_TIMEOUT': 'Never disconnected for being idle',
  'ACS.OVERRIDE_TIMELIMIT': 'Ignore the daily time limit',
  'ACS.OVERRIDE_TIMES': 'Call outside the hours the board is open',
  'ACS.OVERRIDE_DEFAULTS': 'Ignore the new user defaults',
  'ACS.QUIET_NODE': 'Call without appearing on other nodes',
  'ACS.SCREEN_TO_FRONT': 'Bring the node screen to the front',
  'ACS.WHO_IS_ONLINE': 'See who else is online',
  'ACS.LIST_NODES': 'List the nodes and what they are doing',
  'ACS.TRANSLATION': 'Choose a character set translation',
  'ACS.CENSORED': 'Have their messages held for approval',

  // Messages
  'ACS.READ_MESSAGE': 'Read messages',
  'ACS.ENTER_MESSAGE': 'Post a message',
  'ACS.DELETE_MESSAGE': 'Delete a message',
  'ACS.MESSAGE_EDIT': 'Edit a message after posting it',
  'ACS.FULL_EDIT': 'Use the full screen editor',
  'ACS.EALL_MESSAGES': 'Post to everyone at once',
  'ACS.MSG_LEVEL': 'Set the access level a message needs',
  'ACS.MSG_EXPERATION': 'Set when a message expires',
  'ACS.ATTACH_FILES': 'Attach a file to a message',
  'ACS.MCI_MESSAGE': 'Use MCI codes in a message',
  'ACS.ZOOM_MAIL': 'Download the mail waiting for them',
  'ACS.READ_PRIV_EALL': 'Read private mail addressed to everyone',
  'ACS.READ_PRIV_ALL': 'Read anyone private mail',
  'ACS.PRI_MSGFILES': 'Attach files to private messages',
  'ACS.PUB_MSGFILES': 'Attach files to public messages',
  'ACS.CLEAR_SCREEN_MSG': 'Clear the screen between messages',
  'ACS.OLM': 'Send an online message to another caller',

  // Files
  'ACS.DOWNLOAD': 'Download files',
  'ACS.UPLOAD': 'Upload files',
  'ACS.FILE_LISTINGS': 'Browse the file listings',
  'ACS.NEW_FILES_SINCE': 'List files added since their last call',
  'ACS.VIEW_A_FILE': 'Look inside an archive',
  'ACS.ZIPPY_TEXT_SEARCH': 'Search file descriptions for text',
  'ACS.WILDCARDS': 'Use wildcards when naming files',
  'ACS.FILE_EXPANSION': 'Expand an archive on the board',
  'ACS.HIDE_FILES': 'See files hidden from the listings',
  'ACS.FREE_RESUMING': 'Resume a download without being charged again',
  'ACS.KEEP_UPLOAD_CREDIT': 'Keep upload credit when a file is removed',
  'ACS.DUPE_FILECHECK': 'Be checked for duplicate uploads',
  'ACS.SENTBY_FILES': 'See who sent a file',
  'ACS.ULSTATS': 'See upload statistics',
  'ACS.USER_ULSTATS': 'See their own upload statistics',
  'ACS.LOCAL_DOWNLOADS': 'Download to the local machine',
  'ACS.HOLD_ACCESS': 'Reach the hold directory',
  'ACS.EDIT_DIRS': 'Edit the file directories',
  'ACS.EDIT_FILES': 'Edit file descriptions',
  'ACS.XPR_RECEIVE': 'Receive with an external protocol',
  'ACS.XPR_SEND': 'Send with an external protocol',

  // Conferences
  'ACS.JOIN_CONFERENCE': 'Join a conference',
  'ACS.JOIN_SUB_CONFERENCE': 'Join a sub-conference',
  'ACS.CREATE_CONFERENCE': 'Create a conference',
  'ACS.CONFFLAGS': 'Change their conference flags',
  'ACS.CONFERENCE_ACCOUNTING': 'See conference accounting',

  // Talking to the sysop
  'ACS.PAGE_SYSOP': 'Page the sysop for a chat',
  'ACS.COMMENT_TO_SYSOP': 'Leave a comment for the sysop',
  'ACS.OVERRIDE_CHAT': 'Page even when chat is switched off',
  'ACS.BREAK_CHAT': 'Interrupt with a chat request',
  'ACS.DEFAULT_CHAT_ON': 'Start each call with chat available',
  'ACS.MAX_PAGES': 'Page more times than the limit allows',
  'ACS.OVERRIDE_CHATLIMIT': 'Ignore the chat time limit',

  // Their own account
  'ACS.ACCOUNT_EDITING': 'Edit their own account',
  'ACS.ACCOUNT_VIEW': 'View their own account',
  'ACS.EDIT_USER_INFO': 'Edit their own details',
  'ACS.EDIT_USER_NAME': 'Change their handle',
  'ACS.EDIT_REAL_NAME': 'Change their real name',
  'ACS.EDIT_USER_LOCATION': 'Change their location',
  'ACS.EDIT_PHONE_NUMBER': 'Change their phone number',
  'ACS.EDIT_PASSWORD': 'Change their password',
  'ACS.EDIT_EMAIL': 'Change their email address',
  'ACS.EDIT_INTERNET_NAME': 'Change their internet name',
  'ACS.DISPLAY_USER_STATS': 'See their own statistics',

  // Bulletins and voting
  'ACS.READ_BULLETINS': 'Read bulletins',
  'ACS.ONE_TIME_BULLETINS': 'See a bulletin only once',
  'ACS.VOTE': 'Vote in a poll',
  'ACS.MODIFY_VOTE': 'Create and edit polls',

  // Sysop and system
  'ACS.SYSOP_COMMANDS': 'Use the sysop commands',
  'ACS.SYSOP_DOWNLOAD': 'Download anything, anywhere',
  'ACS.SYSOP_VIEW': 'View any file on the system',
  'ACS.SYSOP_READ': 'Read any message base',
  'ACS.REMOTE_SHELL': 'Open a shell on the host machine',
  'ACS.DO_CALLERSLOG': 'Be recorded in the callers log',
  'ACS.DO_UD_LOG': 'Be recorded in the upload and download log',
  'ACS.CUSTOMCOMMANDS': 'Run the custom commands',
  'ACS.SHOW_PAYMENTS': 'See the payment information',
  'ACS.CREDIT_ACCESS': 'Change file credits',
  'ACS.UNKNOWN': 'Unused - express.e declares this slot with no meaning',
};

export const ACS_GROUPS: PermissionGroup[] = [
  {
    title: 'Getting on',
    description: 'Reaching the board, and how long they may stay.',
    permissions: [
      'ACS.RELOGON', 'ACS.NO_TIMEOUT', 'ACS.OVERRIDE_TIMELIMIT', 'ACS.OVERRIDE_TIMES',
      'ACS.OVERRIDE_DEFAULTS', 'ACS.QUIET_NODE', 'ACS.SCREEN_TO_FRONT', 'ACS.WHO_IS_ONLINE',
      'ACS.LIST_NODES', 'ACS.TRANSLATION', 'ACS.CENSORED',
    ],
  },
  {
    title: 'Messages',
    description: 'Reading, writing and managing mail.',
    permissions: [
      'ACS.READ_MESSAGE', 'ACS.ENTER_MESSAGE', 'ACS.DELETE_MESSAGE', 'ACS.MESSAGE_EDIT',
      'ACS.FULL_EDIT', 'ACS.EALL_MESSAGES', 'ACS.MSG_LEVEL', 'ACS.MSG_EXPERATION',
      'ACS.ATTACH_FILES', 'ACS.MCI_MESSAGE', 'ACS.ZOOM_MAIL', 'ACS.READ_PRIV_EALL',
      'ACS.READ_PRIV_ALL', 'ACS.PRI_MSGFILES', 'ACS.PUB_MSGFILES', 'ACS.CLEAR_SCREEN_MSG',
      'ACS.OLM',
    ],
  },
  {
    title: 'Files',
    description: 'Transfers, listings and what they may see.',
    permissions: [
      'ACS.DOWNLOAD', 'ACS.UPLOAD', 'ACS.FILE_LISTINGS', 'ACS.NEW_FILES_SINCE',
      'ACS.VIEW_A_FILE', 'ACS.ZIPPY_TEXT_SEARCH', 'ACS.WILDCARDS', 'ACS.FILE_EXPANSION',
      'ACS.HIDE_FILES', 'ACS.FREE_RESUMING', 'ACS.KEEP_UPLOAD_CREDIT', 'ACS.DUPE_FILECHECK',
      'ACS.SENTBY_FILES', 'ACS.ULSTATS', 'ACS.USER_ULSTATS', 'ACS.LOCAL_DOWNLOADS',
      'ACS.HOLD_ACCESS', 'ACS.EDIT_DIRS', 'ACS.EDIT_FILES', 'ACS.XPR_RECEIVE', 'ACS.XPR_SEND',
    ],
  },
  {
    title: 'Conferences',
    description: 'Which conferences they may enter, and create.',
    permissions: [
      'ACS.JOIN_CONFERENCE', 'ACS.JOIN_SUB_CONFERENCE', 'ACS.CREATE_CONFERENCE',
      'ACS.CONFFLAGS', 'ACS.CONFERENCE_ACCOUNTING',
    ],
  },
  {
    title: 'Talking to the sysop',
    description: 'Paging, chatting and leaving comments.',
    permissions: [
      'ACS.PAGE_SYSOP', 'ACS.COMMENT_TO_SYSOP', 'ACS.OVERRIDE_CHAT', 'ACS.BREAK_CHAT',
      'ACS.DEFAULT_CHAT_ON', 'ACS.MAX_PAGES', 'ACS.OVERRIDE_CHATLIMIT',
    ],
  },
  {
    title: 'Their own account',
    description: 'What a caller may change about themselves.',
    permissions: [
      'ACS.ACCOUNT_EDITING', 'ACS.ACCOUNT_VIEW', 'ACS.EDIT_USER_INFO', 'ACS.EDIT_USER_NAME',
      'ACS.EDIT_REAL_NAME', 'ACS.EDIT_USER_LOCATION', 'ACS.EDIT_PHONE_NUMBER',
      'ACS.EDIT_PASSWORD', 'ACS.EDIT_EMAIL', 'ACS.EDIT_INTERNET_NAME',
      'ACS.DISPLAY_USER_STATS',
    ],
  },
  {
    title: 'Bulletins and voting',
    description: 'What they see on the way in, and polls.',
    permissions: [
      'ACS.READ_BULLETINS', 'ACS.ONE_TIME_BULLETINS', 'ACS.VOTE', 'ACS.MODIFY_VOTE',
    ],
  },
  {
    title: 'Sysop and system',
    description: 'Powerful permissions. A caller with these can run the board.',
    permissions: [
      'ACS.SYSOP_COMMANDS', 'ACS.SYSOP_DOWNLOAD', 'ACS.SYSOP_VIEW', 'ACS.SYSOP_READ',
      'ACS.REMOTE_SHELL', 'ACS.CUSTOMCOMMANDS', 'ACS.CREDIT_ACCESS', 'ACS.SHOW_PAYMENTS',
      'ACS.DO_CALLERSLOG', 'ACS.DO_UD_LOG', 'ACS.UNKNOWN',
    ],
  },
];

/** Every permission this file places, for the coverage test and the page. */
export const GROUPED_PERMISSIONS: string[] = ACS_GROUPS.flatMap((g) => g.permissions);

/** The description for a permission, or its raw name when there is none. */
export function acsLabel(name: string): string {
  return ACS_LABELS[name] ?? name;
}

/**
 * The groups, holding only the permissions this level actually has.
 *
 * A level's file may not carry every flag, and a filter narrows further, so
 * a group with nothing left is dropped rather than shown empty. Anything the
 * server sends that this file does not place lands in a final group, so a
 * permission can never disappear from the page by being unknown to it.
 */
export function groupPermissions(
  available: string[],
  matches: (name: string) => boolean
): PermissionGroup[] {
  const present = new Set(available);
  const groups: PermissionGroup[] = [];

  for (const group of ACS_GROUPS) {
    const permissions = group.permissions.filter((p) => present.has(p) && matches(p));
    if (permissions.length > 0) groups.push({ ...group, permissions });
  }

  const placed = new Set(GROUPED_PERMISSIONS);
  const rest = available.filter((p) => !placed.has(p) && matches(p));
  if (rest.length > 0) {
    groups.push({
      title: 'Everything else',
      description: 'Permissions this page has no description for yet.',
      permissions: rest,
    });
  }

  return groups;
}
