/**
 * BBS State Machine Constants
 */

export enum BBSState {
  AWAIT = 'await',
  LOGON = 'logon',
  REGISTERING = 'registering',  // New user account creation - express.e:30003+
  LOGGEDON = 'loggedon',
  // Audit H-states — express.e tracks distinct states for the
  // disconnect / shutdown sequence. Modelled here so callers that
  // need to emit the right transition (logoff → goodbye → final
  // hangup, or a sysop-initiated server shutdown) have a typed value
  // instead of an ad-hoc string. See express.e logoff() / shutdown()
  // for the canonical flow.
  LOGGING_OFF = 'logging_off',  // user picked G/Goodbye, draining output
  HANGUP = 'hangup',            // logoff() complete; socket about to close
  SHUTDOWN = 'shutdown',        // sysop-initiated server shutdown in progress
}

export enum LoggedOnSubState {
  // Pre-login connection flow
  DISPLAY_CONNECT = 'display_connect',  // AWAITSCREEN - node list and system info
  ANSI_PROMPT = 'ansi_prompt',          // Prompt user for ANSI support (Y/N)
  SYSTEM_PASSWORD_INPUT = 'system_password_input', // express.e:29329-29356 doSystemPassword() gate
  DISPLAY_BBSTITLE = 'display_bbstitle',  // BBSTITLE screen before login

  // Post-login flow
  DISPLAY_TITLE = 'display_title',
  DISPLAY_LOGON = 'display_logon',
  DISPLAY_BULL = 'display_bull',
  DISPLAY_NODE_BULL = 'display_node_bull',
  DISPLAY_ACHIEVE_BULL = 'display_achieve_bull',  // the achievements leaderboards bulletin (achievements/bulletin.ts)
  EXEC_QUICKNEW = 'exec_quicknew',
  DISPLAY_PAGED_SCREEN = 'display_paged_screen',
  CONF_SCAN = 'conf_scan',
  DISPLAY_CONF_BULL = 'display_conf_bull',
  AUTO_REJOIN = 'auto_rejoin',  // express.e:5066-5088 - auto-rejoin with S stats
  LOGOFF = 'logoff',
  DISPLAY_MENU = 'display_menu',
  READ_COMMAND = 'read_command',
  READ_SHORTCUTS = 'read_shortcuts',
  PROCESS_COMMAND = 'process_command',  // Added for 1:1 port - express.e:28639
  WAITING = 'waiting',

  // File operations
  FILES_MAIN = 'files_main',
  FILES_LIST_AREAS = 'files_list_areas',
  FILES_SELECT_AREA = 'files_select_area',
  FILE_AREA_SELECT = 'file_area_select',  // Generic file area selection
  FILE_DIR_SELECT = 'file_dir_select',    // File directory selection
  FILE_LIST_CONTINUE = 'file_list_continue',  // Continue file listing
  FILES_SELECT_DIRECTORIES = 'files_select_directories',
  FILES_VIEW_AREA = 'files_view_area',
  FILES_DOWNLOAD = 'files_download',
  FILES_UPLOAD = 'files_upload',
  UPLOAD_FILENAME_INPUT = 'upload_filename_input',
  UPLOAD_DESC_INPUT = 'upload_desc_input',
  UPLOAD_OKAY_CONFIRM = 'upload_okay_confirm',    // express.e:17763-17796 "Okay: (Enter)/G/A"
  UPLOAD_RESUME_PROMPT = 'upload_resume_prompt',  // express.e:18119 resumeStuff() per-partial Y/N prompt
  UPLOAD_RESUME_DELETE = 'upload_resume_delete',  // express.e:18119 resumeStuff() "Delete (Y/N/All)?" follow-up
  UPLOAD_RENAME_PROMPT = 'upload_rename_prompt',  // express.e:19192 "<file> is too long a name, please rename" loop
  FILE_LIST_DIR_INPUT = 'file_list_dir_input',  // F command directory input
  FLAG_INPUT = 'flag_input',                    // A command flag input
  FLAG_CLEAR_INPUT = 'flag_clear_input',        // A command clear flag input
  FLAG_FROM_INPUT = 'flag_from_input',          // A command flag from input
  DOWNLOAD_FILENAME_INPUT = 'download_filename_input',  // D command filename input
  DOWNLOAD_CONFIRM_INPUT = 'download_confirm_input',    // D command download confirmation
  DOWNLOAD_PGOODBYE = 'download_pgoodbye',              // express.e:13750 pGoodbye() countdown after G+download
  VIEW_FILE_INPUT = 'view_file_input',                  // V command filename input
  ZIPPY_SEARCH_INPUT = 'zippy_search_input',            // Z command search string input
  ZIPPY_DIR_SPAN_INPUT = 'zippy_dir_span_input',        // Z command getDirSpan directory selection (express.e:26162-26168)
  GOODBYE_CONFIRM = 'goodbye_confirm',            // G: leave with partial uploads / flagged files? (express.e:25050-25064)
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
  FM_FILENAME_INPUT = 'fm_filename_input',            // Filename pattern input
  FM_DIRSPAN_INPUT = 'fm_dirspan_input',              // Directory span input
  FM_SCAN = 'fm_scan',                                // The scan's own keys go through utils/await-input; between prompts a key answers nothing
  CALLERSLOG_NODE_INPUT = 'callerslog_node_input',   // Which node's CallersLog (express.e:24490)

  // Command execution
  COMMAND_PASSWORD_INPUT = 'command_password_input',      // Command password input (express.e:4716-4730)

  // Message operations
  READ_MESSAGES = 'read_messages',
  MSG_READER_NAV = 'msg_reader_nav',                    // Message reader navigation
  POST_MESSAGE = 'post_message',
  BULLETIN_INPUT = 'bulletin_input',                    // Bulletin reading input
  POST_MESSAGE_TO = 'post_message_to',
  POST_MESSAGE_SUBJECT = 'post_message_subject',
  POST_MESSAGE_PRIVATE = 'post_message_private',
  POST_MESSAGE_BODY = 'post_message_body',
  POST_MESSAGE_OPTIONS = 'post_message_options',        // express.e edit() Msg. Options loop (10373-10578) and its prompts
  POST_MESSAGE_QUOTE_REPLY_CONFIRM = 'post_message_quote_reply_confirm', // "Quote in Reply (y/N)?" — express.e:10878
  POST_MESSAGE_FULLEDIT_CONFIRM = 'post_message_fulledit_confirm', // "FullScreen Editor (y/N)?" — express.e:10098-10100
  POST_MESSAGE_QUOTE_RANGE = 'post_message_quote_range',        // Quote message line range input

  JM_INPUT = 'jm_input',                                // Jump to message number input
  NM_INPUT = 'nm_input',                                // Node Management input - express.e:25294-25366
  NM_CONFIRM = 'nm_confirm',                            // Node Management confirmation
  RL_CONFIRM = 'rl_confirm',                            // Read last message confirmation

  // Door operations
  DOOR_SELECT = 'door_select',
  DOOR_RUNNING = 'door_running',

  // Operator chat operations
  OPERATOR_CHAT_WAITING = 'operator_chat_waiting',      // Waiting for sysop to accept page
  OPERATOR_CHAT_ACTIVE = 'operator_chat_active',        // Active chat session

  // Account operations
  ACCOUNT_MENU = 'account_menu',
  ACCOUNT_CHANGE_PASSWORD = 'account_change_password',
  ACCOUNT_CHANGE_PASSWORD_NEW = 'account_change_password_new',
  ACCOUNT_CHANGE_PASSWORD_CONFIRM = 'account_change_password_confirm',
  ACCOUNT_EDIT_SETTINGS = 'account_edit_settings',
  ACCOUNT_VIEW_STATS = 'account_view_stats',

  // Account Editor (Command 1) - express.e:22400-22460
  ACCOUNT_EDITOR_MENU = 'account_editor_menu',              // Main menu input
  ACCOUNT_EDITOR_SEARCH_NAME = 'account_editor_search_name', // Search by name input
  ACCOUNT_EDITOR_EDIT = 'account_editor_edit',              // Single-char editing (editInfo)
  ACCOUNT_EDITOR_BULK = 'account_editor_bulk',              // Bulk account editor input
  USER_NOTES_VIEW = 'user_notes_view',                      // User notes view/edit - express.e:21679-21739
  CONF_ACCOUNTING_VIEW = 'conf_accounting_view',            // Conference accounting - express.e:22045-22250
  CREDIT_MAINTENANCE_VIEW = 'credit_maintenance_view',      // Credit maintenance - express.e:21884-22042
  USER_ANSWERS_VIEW = 'user_answers_view',                  // New-user questionnaire answers (read-only) - express.e:21319-21326

  // Chat operations
  CHAT_PAGE_SYSOP = 'chat_page_sysop',
  CHAT_SESSION = 'chat_session',
  CHAT = 'chat',  // Internode chat (user-to-user chat mode)
  CHAT_ROOM = 'chat_room',  // Group chat room mode
  LIVECHAT_SELECT_USER = 'livechat_select_user',  // Selecting user from numbered list
  LIVECHAT_INVITATION_RESPONSE = 'livechat_invitation_response',  // Responding to Y/n invitation prompt

  // OLM (Online Message) operations - express.e:25406-25515
  OLM_NODE_INPUT = 'olm_node_input',        // Waiting for node number input

  // New User Registration - express.e:30003-30310 (doNewUser)
  NEW_USER_GDPR_CONSENT = 'new_user_gdpr_consent', // WEB_: privacy notice accept/decline gate
  NEW_USER_NAME = 'new_user_name',          // Entering name with duplicate check
  NEW_USER_LOCATION = 'new_user_location',  // City, State
  NEW_USER_PHONE = 'new_user_phone',        // Phone number
  NEW_USER_EMAIL = 'new_user_email',        // E-Mail address
  NEW_USER_ACCESS_PASSWORD = 'new_user_access_password', // Pre-registration password
  NEW_USER_AUTOVAL = 'new_user_autoval',    // Auto-validation password
  NEW_USER_PASSWORD = 'new_user_password',  // Password entry
  NEW_USER_PASSWORD_CONFIRM = 'new_user_password_confirm', // Password confirmation
  NEW_USER_LINES = 'new_user_lines',        // Lines per screen
  NEW_USER_COMPUTER = 'new_user_computer',  // Computer type
  NEW_USER_SCREEN_CLEAR = 'new_user_screen_clear', // Screen clear preference
  NEW_USER_CONFIRM = 'new_user_confirm',    // Confirm all details
  NEW_USER_SCRIPT = 'new_user_script',      // Node questionnaire prompts
  NEW_USER_SCRIPT_CONFIRM = 'new_user_script_confirm', // Confirm questionnaire answers

  // Conference operations
  CONFERENCE_JOIN = 'conference_join',
  JOIN_CONF_INPUT = 'join_conf_input',                  // Conference join input
  CM_DISPLAY_MENU = 'cm_display_menu',                  // Conference mail display menu
  CM_INPUT_HIGH_MSG = 'cm_input_high_msg',              // Conference mail high message input
  CM_INPUT_LOW_MSG = 'cm_input_low_msg',                // Conference mail low message input
  CM_INPUT_RATIO = 'cm_input_ratio',                    // Conference mail ratio input
  CM_INPUT_RATIO_TYPE = 'cm_input_ratio_type',          // Conference mail ratio type input
  CM_INPUT_CAPACITY = 'cm_input_capacity',              // Conference mail capacity input

  // Conference Flags (CF command) - express.e:24672-24841
  CF_FLAG_SELECT_INPUT = 'cf_flag_select_input',      // M/A/F/Z flag type selection
  CF_CONF_SELECT_INPUT = 'cf_conf_select_input',      // Conference numbers input

  // Write User Parameters (W command) - express.e:25712-26092
  W_OPTION_SELECT = 'w_option_select',                // Option selection (0-16 or CR)
  W_EDIT_EMAIL = 'w_edit_email',                      // Edit email (option 1)
  W_EDIT_LOCATION = 'w_edit_location',                // Edit location (option 4)
  W_EDIT_PHONE = 'w_edit_phone',                      // Edit phone (option 5)
  W_EDIT_PASSWORD = 'w_edit_password',                // Edit password (option 6)
  W_EDIT_PASSWORD_CONFIRM = 'w_edit_password_confirm',// Confirm password (option 6)
  W_EDIT_LINES = 'w_edit_lines',                      // Edit lines per screen (option 7)
  W_EDIT_COMPUTER = 'w_edit_computer',                // Edit computer (option 8)
  W_EDIT_SCREENTYPE = 'w_edit_screentype',            // Edit screen type (option 9)
  W_EDIT_PROTOCOL = 'w_edit_protocol',                // Edit transfer protocol (option 11)
  W_EDIT_TRANSLATOR = 'w_edit_translator',            // Edit translator (option 15)
  W_EDIT_MODEM_SPEED = 'w_edit_modem_speed',          // Edit modem emulation speed (web extension)
  W_EDIT_FONT = 'w_edit_font',                        // Edit terminal font (web extension)
  // WEB_: GDPR self-service options under W (see Phase 3 plan).
  W_VIEW_MY_DATA_PAUSE = 'w_view_my_data_pause',      // Paused mid-dump of user record (option 19)
  W_FORGETME_CONFIRM = 'w_forgetme_confirm',          // Erasure step 1: type 'YES ERASE' (option 20)
  W_FORGETME_PASSWORD = 'w_forgetme_password',        // Erasure step 2: re-enter password
  W_FORGETME_USERNAME = 'w_forgetme_username',        // Erasure step 3: type username verbatim
  // WEB_: GDPR Phase 2 — one-shot consent prompt for pre-GDPR users on next login
  GDPR_BACKFILL = 'gdpr_backfill',

  // User Stats (S command) - Web-specific font selection
  FONT_SELECTION = 'font_selection',                  // Font selection menu

  // Voting Booth operations
  AG_VIEW = 'ag_view',                                // AmigaGuide viewer has the keyboard
  VO_TOPIC_SELECT = 'vo_topic_select',                // Vote topic selection
}

export enum SessionStatus {
  ACTIVE = 'active',
  IDLE = 'idle',
  DISCONNECTED = 'disconnected'
}
