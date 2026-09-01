/**
 * What a caller is doing RIGHT NOW, in words.
 *
 * `/api/nodes/status` reports `currentActivity` as the session's raw
 * subState - `read_command`, `files_list_areas`, `w_edit_email` - and the
 * Overview and Node Control pages printed it as-is. That is the board's own
 * shorthand, the same thing the Activity feed used to do with events.
 *
 * There are two hundred subStates and a one-to-one map would rot on contact
 * with the next one. They group by prefix instead - every `files_*` is
 * browsing files, every `post_*` is writing a message - with exact matches
 * only where the prefix would mislead. Anything unmapped is still tidied
 * rather than dumped: `some_new_state` reads as "Some new state", which is
 * wrong-ish but never looks like an enum.
 */

/** States whose group would describe them wrongly, or that deserve better words. */
const EXACT: Record<string, string> = {
  read_command: 'At the menu',
  read_shortcuts: 'At the menu',
  display_menu: 'At the menu',
  process_command: 'Running a command',
  waiting: 'Idle',
  logoff: 'Logging off',
  conf_scan: 'Scanning conferences',
  auto_rejoin: 'Rejoining their conference',
  display_connect: 'Connecting',
  ansi_prompt: 'Answering the ANSI prompt',
  system_password_input: 'At the system password',
  display_bbstitle: 'Connecting',
  display_title: 'Logging on',
  display_logon: 'Logging on',
  display_bull: 'Reading a bulletin',
  display_node_bull: 'Reading a bulletin',
  display_conf_bull: 'Reading a bulletin',
  mailscan_prompt_input: 'Scanning for mail',
  conf_scan_mail_prompt: 'Scanning for mail',

  // Connection lifecycle - the states a node sits in outside a session.
  await: 'Waiting for a caller',
  logon: 'Logging on',
  registering: 'Signing up',
  loggedon: 'Online',
  logging_off: 'Logging off',
  hangup: 'Hanging up',
  disconnected: 'Disconnected',
  shutdown: 'Shutting down',
  active: 'Online',
  idle: 'Idle',

  // The ones a sysop most wants named.
  door_select: 'Choosing a door',
  door_running: 'In a door',
  operator_chat_waiting: 'Waiting for the sysop',
  operator_chat_active: 'Chatting with the sysop',
  chat: 'In chat',

  exec_quicknew: 'Looking for new files',
  view_file_input: 'Viewing a file',
  batch_download_confirm: 'Downloading',
  command_password_input: 'At a password prompt',
  bulletin_input: 'Reading a bulletin',
  reply_delete_original: 'Writing a message',
  rl_confirm: 'Relogging on',
  conference_select: 'Changing conference',
  conference_join: 'Changing conference',
  join_conf_input: 'Changing conference',
  gdpr_backfill: 'Signing up',
  user_stats_menu: 'Checking their statistics',
  font_selection: 'Editing their settings',
};

/** A prefix, and what everything under it means. Longest prefix wins. */
const GROUPS: [string, string][] = [
  ['new_user_', 'Signing up'],
  ['msg_reader_', 'Reading messages'],
  ['files_', 'Browsing files'],
  ['file_', 'Browsing files'],
  ['fm_', 'In file maintenance'],
  ['upload_', 'Uploading'],
  ['download_', 'Downloading'],
  ['msg_', 'Reading messages'],
  ['post_', 'Writing a message'],
  ['forward_', 'Forwarding a message'],
  ['account_', 'Editing their account'],
  ['w_', 'Editing their settings'],
  ['cm_', 'In conference maintenance'],
  ['conf_', 'Changing conference'],
  ['chat_', 'In chat'],
  ['vo_', 'In the voting booth'],
  ['flag_', 'Flagging files'],
  ['new_', 'Looking for new files'],
  ['read_', 'Reading'],
  ['display_', 'Reading a screen'],
  ['zippy_', 'Searching files'],
  ['livechat_', 'In chat'],
  ['olm_', 'Sending an online message'],
  ['jm_', 'Changing message base'],
  ['nm_', 'In node management'],
  ['cf_', 'Changing conference flags'],
  ['delete_account', 'Editing their account'],
  ['user_notes', 'Editing their account'],
];

/** `some_new_state` -> `Some new state`. Never worse than the raw value. */
function tidy(subState: string): string {
  const words = subState.replace(/_/g, ' ').trim();
  if (!words) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function describeNodeActivity(
  currentActivity: string | undefined | null,
): string {
  const state = String(currentActivity ?? '').trim().toLowerCase();
  if (!state) return '';

  const exact = EXACT[state];
  if (exact) return exact;

  // Longest prefix first, so `new_user_` beats `new_` and `msg_reader_`
  // beats `msg_`.
  const matches = GROUPS
    .filter(([prefix]) => state.startsWith(prefix))
    .sort((a, b) => b[0].length - a[0].length);

  return matches.length > 0 ? matches[0][1] : tidy(state);
}
