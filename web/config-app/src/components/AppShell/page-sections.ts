/**
 * What lives INSIDE a destination, so the sidebar filter can find it.
 *
 * The filter used to match 21 nav labels and their keywords, which is a map of
 * the admin's front doors and nothing else. A sysop who types `ftp` is not
 * looking for a page called FTP - he is looking for the four fields that
 * configure the FTP server, and they sit two thirds of the way down
 * Configuration, in a section the search had never heard of. It answered "No
 * destinations match", which is both true and useless.
 *
 * So a section is a searchable destination in its own right: its heading, the
 * configuration keys it edits (a key IS what a sysop knows the setting by -
 * `ftp_enabled`, `smtp_port`, `max_nodes`), and the words it is known by that
 * appear in neither.
 *
 * SINGLE SOURCE OF TRUTH. `SystemConfigPage` renders its category filter from
 * this table and gates every section on it, so a section cannot exist here and
 * not there. `page-section-search.test.tsx` reads the page's source and fails
 * if a `shouldShowSection(...)` or a `register('...')` is missing from the
 * table, which is what keeps the two in step as the page grows.
 */

/** The category tabs Configuration offers above its sections. */
export type SystemConfigCategory = 'General' | 'Security & Access' | 'Networking' | 'System';

export interface PageSection {
  /** The heading exactly as the page renders it - also the `?section=` value. */
  name: string;
  /**
   * Which category tab shows it, on the one page that has category tabs.
   *
   * Every other destination indexes its TABS and its section headings, and has
   * no categories - so this is optional, and only Configuration sets it.
   */
  category?: SystemConfigCategory;
  /**
   * The `system_config` keys the section edits, as `register('...')` names
   * them. These carry most of the search value: `ftp` finds four of them.
   */
  fields: string[];
  /** Vocabulary that appears in neither the heading nor the keys. */
  keywords?: string[];
}

/**
 * Configuration (`/admin/system`), section by section, in render order.
 *
 * `SSH Key Management` has no `register` fields - it is buttons over the SSH
 * host key, not form state - so its keywords carry it alone.
 */
export const SYSTEM_CONFIG_SECTIONS: PageSection[] = [
  {
    name: 'Basic Information',
    category: 'General',
    fields: ['bbs_name', 'sysop_name', 'reg_key', 'location', 'email', 'website'],
    keywords: ['board name', 'sysop', 'address', 'contact', 'registered to', 'registration name', 'regkey'],
  },
  {
    name: 'Security Settings',
    category: 'Security & Access',
    fields: [
      'min_password_length',
      'min_password_strength',
      'max_password_fails',
      'password_security',
      'strict_password_policy',
      'auto_validate',
      'confirm_deletions',
    ],
    keywords: ['password', 'validation'],
  },
  {
    name: 'Session Settings',
    category: 'Security & Access',
    fields: ['default_time_limit', 'max_session_time', 'idle_timeout'],
    keywords: ['time limit', 'timeout', 'call length'],
  },
  {
    name: 'New User Defaults',
    category: 'Security & Access',
    fields: [
      'new_user_sec_level',
      'new_user_time_limit',
      'new_user_chat_limit',
      'new_user_lines_per_screen',
      'new_user_protocol',
      'new_user_screen_type',
      'new_user_editor',
      'new_user_conf_access',
      'new_user_expert',
      'new_user_ansi',
      'new_user_available_chat',
      'new_user_quiet_node',
      'new_user_auto_rejoin',
    ],
    keywords: ['newuser', 'first call', 'signup'],
  },
  {
    name: 'Auto-Validation Settings',
    category: 'Security & Access',
    fields: ['autoval_delay', 'autoval_preset', 'autoval_password'],
    keywords: ['autoval', 'validation'],
  },
  {
    name: 'Password & Account Security',
    category: 'Security & Access',
    fields: ['password_expiry_days', 'auto_deactivate_days'],
    keywords: ['expiry', 'dormant', 'deactivate'],
  },
  {
    name: 'Display Settings',
    category: 'General',
    fields: ['ansi_enabled', 'allow_custom_screens'],
    keywords: ['ansi', 'screens', 'art'],
  },
  {
    name: 'Language Settings',
    category: 'General',
    fields: ['language_base', 'default_language'],
    keywords: ['locale', 'translation'],
  },
  {
    name: 'System Limits',
    category: 'System',
    fields: ['max_conferences', 'max_message_bases', 'max_file_areas', 'max_nodes'],
    keywords: ['limits', 'nodes', 'conferences'],
  },
  {
    name: 'File Management',
    category: 'System',
    fields: [
      'file_check_enabled',
      'upload_check_virus',
      'upload_check_dupe',
      'local_upload_path',
      'filediz_syscmd',
      'max_desclines',
      'hold_access_level',
    ],
    keywords: ['upload', 'download', 'virus', 'duplicate', 'file id diz'],
  },
  {
    name: 'Mail & SMTP Settings',
    category: 'Networking',
    fields: [
      'smtp_server',
      'smtp_port',
      'smtp_username',
      'smtp_password',
      'smtp_from_email',
      'sysop_email',
      'bbs_email',
      'allow_internet_email',
      'smtp_ssl',
    ],
    keywords: ['email', 'mail', 'relay'],
  },
  {
    name: 'Achievements',
    category: 'Networking',
    fields: ['achievements_server_url', 'achievements_board_key', 'achievements_disabled'],
    keywords: ['badges', 'trophies'],
  },
  {
    name: 'Email Notification Events',
    category: 'Networking',
    fields: [
      'mail_on_new_user',
      'mail_on_logon',
      'mail_on_logoff',
      'mail_on_upload',
      'mail_on_sysop_comment',
      'mail_on_sysop_page',
      'mail_on_pwd_fail',
    ],
    keywords: ['notify', 'alerts', 'email'],
  },
  {
    name: 'FTP Server Settings',
    category: 'Networking',
    fields: ['ftp_host', 'ftp_port', 'ftp_data_ports', 'ftp_enabled'],
    keywords: ['ftps', 'passive', 'transfers', 'file transfer'],
  },
  {
    name: 'HTTP Server Settings',
    category: 'Networking',
    fields: ['http_port', 'http_enabled'],
    keywords: ['web', 'browser'],
  },
  {
    name: 'BBS Server Ports',
    category: 'Networking',
    fields: ['telnet_port', 'ssh_port'],
    keywords: ['telnet', 'ssh', 'ports', 'listener'],
  },
  {
    name: 'SSH Key Management',
    category: 'Networking',
    fields: [],
    keywords: ['ssh', 'host key', 'fingerprint', 'regenerate'],
  },
  {
    name: 'System Behavior',
    category: 'System',
    fields: ['quiet_join', 'convert_to_mb'],
    keywords: ['quiet', 'megabytes'],
  },
  {
    name: 'Logging Settings',
    category: 'System',
    fields: ['log_level', 'log_retention_days', 'debug_mode', 'sysop_debug_enabled'],
    keywords: ['logs', 'debug', 'retention'],
  },
];

/**
 * Every destination that has searchable sections, keyed by its nav path.
 *
 * Configuration is the only one today, and it is the one that needed it:
 * nineteen sections and eighty-one fields behind a single nav label. A page
 * added here becomes searchable with no change to the sidebar.
 */
/**
 * What every OTHER destination contains, so the sidebar filter can reach it.
 *
 * Configuration was the only page indexed, so a search for anything that lives
 * on another page answered "No destinations match" - which is how a sysop came
 * to conclude the settings he wanted did not exist: "the menu search still
 * sucks and returns nothing from all pages".
 *
 * A destination's sections are its TABS and the headings inside them. Tabs are
 * taken from `workspaces.tsx`, which is the authority on what each destination
 * holds; a tab renamed there and not here loses only its search terms, never a
 * page. `fields` carries the config keys a section writes, because a key is
 * what a sysop knows a setting by.
 */
const NOTIFICATION_SECTIONS: PageSection[] = [
  {
    name: 'Desktop notifications on this browser',
    fields: [],
    keywords: ['push', 'browser', 'desktop', 'subscribe', 'unsubscribe', 'service worker',
      'chrome', 'permission', 'alerts', 'notify me', 'test notification'],
  },
  {
    name: 'Notification Settings',
    fields: ['notifyOnPage', 'notifySound', 'browserPush', 'emailNotifications'],
    keywords: ['page', 'paged', 'sound', 'email', 'alerts', 'when a caller pages'],
  },
  {
    name: 'Push Notification Server Configuration',
    fields: ['vapid_public_key', 'vapid_private_key', 'vapid_contact_email'],
    keywords: ['VAPID', 'keys', 'web push', 'server keys', 'generate'],
  },
  {
    name: 'Phone/Desktop Push Channels',
    fields: ['pushoverUserKey', 'pushoverAppToken', 'ntfyTopic', 'ntfyUrl'],
    keywords: ['pushover', 'ntfy', 'ntfy.sh', 'phone', 'mobile', 'third party', 'channel'],
  },
];

const OPERATOR_CHAT_SECTIONS: PageSection[] = [
  { name: 'Chat', fields: [], keywords: ['operator', 'page', 'paging', 'answer', 'caller waiting'] },
  { name: 'General Settings', fields: ['enabled', 'awayMessage', 'welcomeMessage'], keywords: ['away', 'welcome'] },
  { name: 'Security Settings', fields: ['requireAuth', 'blockedUsers'], keywords: ['block', 'ban'] },
  { name: 'Quiet Hours', fields: ['quietHoursStart', 'quietHoursEnd'], keywords: ['paging hours', 'do not disturb', 'night'] },
  { name: 'AI Bot Settings', fields: ['aiEnabled', 'aiModel'], keywords: ['bot', 'assistant', 'auto reply', 'AI'] },
  { name: 'Quick Replies', fields: [], keywords: ['canned', 'macro', 'shortcut'] },
];

const SCREEN_SECTIONS: PageSection[] = [
  { name: 'Screen files', fields: [], keywords: ['gallery', 'codes', 'duplicates', 'door art', 'MCI', 'revisions'] },
  { name: 'Themes', fields: [], keywords: ['theme', 'publish', 'wearable', 'validate', 'coverage'] },
  { name: 'Artist studio', fields: [], keywords: ['artist', 'redraw', 'ANSI', 'PETSCII', 'RIP', 'SEQ', 'logo', 'checklist', 'progress'] },
  { name: 'Questionnaire', fields: [], keywords: ['new user', 'signup questions'] },
];

const NODE_SECTIONS: PageSection[] = [
  { name: 'Live', fields: [], keywords: ['who is online', 'supervisor', 'chat', 'kick', 'node control'] },
  { name: 'Configuration', fields: [], keywords: ['tooltype', 'SCREENS', 'per-node', 'node settings'] },
];

const CONFERENCE_SECTIONS: PageSection[] = [
  { name: 'Conferences', fields: [], keywords: ['message base', 'join', 'ACS', 'LOCATION'] },
  { name: 'File areas', fields: [], keywords: ['DLPATH', 'ULPATH', 'drives', 'storage', 'S3', 'quota'] },
];

const LOOKUP_SECTIONS: PageSection[] = [
  { name: 'Computers', fields: [], keywords: ['computer types'] },
  { name: 'Screen types', fields: [], keywords: ['ANSI', 'ASCII', 'RIP', 'terminal type'] },
  { name: 'Languages', fields: [], keywords: ['language'] },
  { name: 'Transfer protocols', fields: [], keywords: ['zmodem', 'xmodem', 'protocol'] },
  { name: 'File checkers', fields: [], keywords: ['archive', 'lha', 'zip', 'checker'] },
];

const CONFIG_FILE_SECTIONS: PageSection[] = [
  { name: 'All .info files', fields: [], keywords: ['tooltype', 'icon', 'bbsConfig', 'AmiXnet'] },
  { name: 'Batch scripts', fields: [], keywords: ['batch', 'script', 'quicknew'] },
];

const HEALTH_SECTIONS: PageSection[] = [
  { name: 'Health check', fields: [], keywords: ['filesystem', 'audit', 'missing', 'permissions'] },
  { name: 'Deployment', fields: [], keywords: ['deploy', 'container', 'image', 'build', 'version'] },
];

const BOT_SECTIONS: PageSection[] = [
  { name: 'Status', fields: [], keywords: ['start', 'stop', 'restart', 'running', 'health', 'uptime'] },
  { name: 'Configuration', fields: [], keywords: ['token', 'guild', 'channel', 'bridge', 'secret', 'link'] },
  { name: 'Logs', fields: [], keywords: ['log', 'tail', 'error', 'output'] },
];

export const PAGE_SECTIONS: Record<string, PageSection[]> = {
  system: SYSTEM_CONFIG_SECTIONS,
  notifications: NOTIFICATION_SECTIONS,
  'operator-chat': OPERATOR_CHAT_SECTIONS,
  screens: SCREEN_SECTIONS,
  nodes: NODE_SECTIONS,
  conferences: CONFERENCE_SECTIONS,
  'lookup-tables': LOOKUP_SECTIONS,
  'config-files': CONFIG_FILE_SECTIONS,
  health: HEALTH_SECTIONS,
  'bots/whip': BOT_SECTIONS,
};

/** The query parameter a search result uses to open one section on its page. */
export const SECTION_PARAM = 'section';

/** Case-insensitive substring match against heading, keys and keywords. */
export function sectionMatchesQuery(section: PageSection, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;

  const haystacks = [section.name, ...section.fields, ...(section.keywords ?? [])];
  return haystacks.some((text) => text.toLowerCase().includes(needle));
}

/** The sections of one destination that match, in render order. Empty when none do. */
export function sectionsMatching(path: string, query: string): PageSection[] {
  const sections = PAGE_SECTIONS[path];
  if (!sections || !query.trim()) return [];
  return sections.filter((section) => sectionMatchesQuery(section, query));
}

/** Which category tab holds a section, for the page's own filter. */
export function categoryOfSection(
  sections: PageSection[],
  name: string
): SystemConfigCategory | undefined {
  return sections.find((section) => section.name === name)?.category;
}
