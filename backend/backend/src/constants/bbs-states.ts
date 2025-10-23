/**
 * BBS State Machine Constants
 */

export enum BBSState {
  AWAIT = 'await',
  LOGON = 'logon',
  LOGGEDON = 'loggedon'
}

export enum LoggedOnSubState {
  // Pre-login connection flow
  DISPLAY_CONNECT = 'display_connect',  // AWAITSCREEN - node list and system info
  ANSI_PROMPT = 'ansi_prompt',          // Prompt user for ANSI support (Y/N)
  DISPLAY_BBSTITLE = 'display_bbstitle',  // BBSTITLE screen before login

  // Post-login flow
  DISPLAY_TITLE = 'display_title',
  DISPLAY_LOGON = 'display_logon',
  DISPLAY_BULL = 'display_bull',
  DISPLAY_NODE_BULL = 'display_node_bull',
  CONF_SCAN = 'conf_scan',
  DISPLAY_CONF_BULL = 'display_conf_bull',
  DISPLAY_MENU = 'display_menu',
  READ_COMMAND = 'read_command',
  READ_SHORTCUTS = 'read_shortcuts',
  PROCESS_COMMAND = 'process_command',  // Added for 1:1 port - express.e:28639
  WAITING = 'waiting',

  // File operations
  FILES_MAIN = 'files_main',
  FILES_LIST_AREAS = 'files_list_areas',
  FILES_SELECT_AREA = 'files_select_area',
  FILES_SELECT_DIRECTORIES = 'files_select_directories',
  FILES_VIEW_AREA = 'files_view_area',
  FILES_DOWNLOAD = 'files_download',
  FILES_UPLOAD = 'files_upload',
  FILES_MAINTENANCE = 'files_maintenance',
  FILES_MAINT_SELECT = 'files_maint_select',
  FILES_MAINT_AREA_SELECT = 'files_maint_area_select',
  FILES_DELETE = 'files_delete',
  FILES_DELETE_CONFIRM = 'files_delete_confirm',
  FILES_MOVE = 'files_move',
  FILES_MOVE_DEST = 'files_move_dest',
  FILES_MOVE_CONFIRM = 'files_move_confirm',
  FILES_EDIT = 'files_edit',
  FILES_EDIT_SELECT = 'files_edit_select',

  // Message operations
  READ_MESSAGES = 'read_messages',
  POST_MESSAGE = 'post_message',
  POST_MESSAGE_TO = 'post_message_to',
  POST_MESSAGE_SUBJECT = 'post_message_subject',
  POST_MESSAGE_PRIVATE = 'post_message_private',
  POST_MESSAGE_BODY = 'post_message_body',
  POST_MESSAGE_SAVE = 'post_message_save',

  // Door operations
  DOOR_SELECT = 'door_select',
  DOOR_RUNNING = 'door_running',

  // Account operations
  ACCOUNT_MENU = 'account_menu',
  ACCOUNT_CHANGE_PASSWORD = 'account_change_password',
  ACCOUNT_CHANGE_PASSWORD_NEW = 'account_change_password_new',
  ACCOUNT_CHANGE_PASSWORD_CONFIRM = 'account_change_password_confirm',
  ACCOUNT_EDIT_SETTINGS = 'account_edit_settings',
  ACCOUNT_VIEW_STATS = 'account_view_stats',

  // Chat operations
  CHAT_PAGE_SYSOP = 'chat_page_sysop',
  CHAT_SESSION = 'chat_session',

  // Conference operations
  CONFERENCE_SELECT = 'conference_select',
  CONFERENCE_JOIN = 'conference_join',
}

export enum SessionStatus {
  ACTIVE = 'active',
  IDLE = 'idle',
  DISCONNECTED = 'disconnected'
}
