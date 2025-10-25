/**
 * BBS State Machine Constants
 */

export enum BBSState {
  AWAIT = 'await',
  LOGON = 'logon',
  REGISTERING = 'registering',  // New user account creation - express.e:30003+
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
  UPLOAD_FILENAME_INPUT = 'upload_filename_input',
  UPLOAD_DESC_INPUT = 'upload_desc_input',
  FILE_LIST_DIR_INPUT = 'file_list_dir_input',  // F command directory input
  FLAG_INPUT = 'flag_input',                    // A command flag input
  FLAG_CLEAR_INPUT = 'flag_clear_input',        // A command clear flag input
  FLAG_FROM_INPUT = 'flag_from_input',          // A command flag from input
  DOWNLOAD_FILENAME_INPUT = 'download_filename_input',  // D command filename input
  DOWNLOAD_CONFIRM_INPUT = 'download_confirm_input',    // D command download confirmation
  VIEW_FILE_INPUT = 'view_file_input',                  // V command filename input
  ZIPPY_SEARCH_INPUT = 'zippy_search_input',            // Z command search string input
  BATCH_DOWNLOAD_CONFIRM = 'batch_download_confirm',    // Batch download confirmation
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

  // File Maintenance (FM command) - express.e:24889-25045
  FM_YESNO_INPUT = 'fm_yesno_input',                  // Y/n prompt for using flagged files
  FM_FILENAME_INPUT = 'fm_filename_input',            // Filename pattern input
  FM_DIRSPAN_INPUT = 'fm_dirspan_input',              // Directory span input
  FM_ACTION_INPUT = 'fm_action_input',                // D/M/V/Q action input
  FM_REMOVE_FLAG_INPUT = 'fm_remove_flag_input',      // Remove from flagged list Y/n
  FM_CONFIRM_DELETE = 'fm_confirm_delete',            // Confirm file deletion
  FM_MOVE_DEST_INPUT = 'fm_move_dest_input',          // Move destination directory input

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
  CHAT = 'chat',  // Internode chat (user-to-user chat mode)
  CHAT_ROOM = 'chat_room',  // Group chat room mode
  LIVECHAT_SELECT_USER = 'livechat_select_user',  // Selecting user from numbered list
  LIVECHAT_INVITATION_RESPONSE = 'livechat_invitation_response',  // Responding to Y/n invitation prompt

  // OLM (Online Message) operations - express.e:25406-25515
  OLM_NODE_INPUT = 'olm_node_input',        // Waiting for node number input
  OLM_COMPOSE = 'olm_compose',              // Composing OLM message (line editor)

  // New User Registration - express.e:30003-30310 (doNewUser)
  NEW_USER_NAME = 'new_user_name',          // Entering name with duplicate check
  NEW_USER_LOCATION = 'new_user_location',  // City, State
  NEW_USER_PHONE = 'new_user_phone',        // Phone number
  NEW_USER_EMAIL = 'new_user_email',        // E-Mail address
  NEW_USER_PASSWORD = 'new_user_password',  // Password entry
  NEW_USER_PASSWORD_CONFIRM = 'new_user_password_confirm', // Password confirmation
  NEW_USER_LINES = 'new_user_lines',        // Lines per screen
  NEW_USER_COMPUTER = 'new_user_computer',  // Computer type
  NEW_USER_SCREEN_CLEAR = 'new_user_screen_clear', // Screen clear preference
  NEW_USER_CONFIRM = 'new_user_confirm',    // Confirm all details

  // Conference operations
  CONFERENCE_SELECT = 'conference_select',
  CONFERENCE_JOIN = 'conference_join',

  // Conference Flags (CF command) - express.e:24672-24841
  CF_FLAG_SELECT_INPUT = 'cf_flag_select_input',      // M/A/F/Z flag type selection
  CF_CONF_SELECT_INPUT = 'cf_conf_select_input',      // Conference numbers input
}

export enum SessionStatus {
  ACTIVE = 'active',
  IDLE = 'idle',
  DISCONNECTED = 'disconnected'
}
