/**
 * The commands the board answers itself, as a menu shows them.
 *
 * express.e has no such table: `processInternalCommand` (express.e:28285-28398)
 * is an if/elseif chain and each `internalCommandX` checks its own ACS. A
 * menu that hides what a caller cannot run needs that gate written down once,
 * so here it is - one row per case of the board's internal switch
 * (handlers/command.handler.ts, `case 'D':` .. `case 'DOORS':`), pinned to the
 * switch and to express.e by tests/screens/internal-commands-table.test.ts.
 *
 * `gate` is the FIRST `RETURN RESULT_NOT_ALLOWED` check of the express.e
 * procedure named in `source` (an ACSPermission key), 'SYSOP' for a board
 * handler that asks PermissionsUtil.isSysop, or null when the command has no
 * gate. Descriptions are seeded from express.e and the AmiExpress 4 manual
 * (Aedoc4.guide "REGULAR USER COMMANDS"); the sysop's own text, typed in the
 * admin, always wins (menu config `descriptions`).
 *
 * Imports nothing: the admin app compiles this folder (`@bbs/screens`).
 */
export type MenuSectionId = 'messages' | 'files' | 'conferences' | 'doors' | 'account' | 'system';

export const DEFAULT_SECTIONS: ReadonlyArray<{ id: MenuSectionId; title: string }> = [
  { id: 'messages', title: 'Messages' },
  { id: 'files', title: 'Files' },
  { id: 'conferences', title: 'Conferences' },
  { id: 'doors', title: 'Doors' },
  { id: 'account', title: 'Account' },
  { id: 'system', title: 'System' },
];

export interface InternalCommandRow {
  code: string;
  label: string;
  section: MenuSectionId;
  description: string;
  gate: string | null;
  /** `express.e:<line> internalCommandX` or `board:<handler>` for a board-only command. */
  source: string;
  /** False for the menu's own `?` - a menu does not list "show this menu". */
  listed: boolean;
}

const row = (code: string, label: string, section: MenuSectionId, gate: string | null, source: string, description: string, listed = true): InternalCommandRow =>
  ({ code, label, section, gate, source, description, listed });

export const INTERNAL_COMMANDS: readonly InternalCommandRow[] = [
  // Messages
  row('R', 'Read Mail', 'messages', 'READ_MESSAGE', 'express.e:25518 internalCommandR', 'Read the messages in this conference'),
  row('E', 'Enter Message', 'messages', 'ENTER_MESSAGE', 'express.e:24860 internalCommandE', 'Write a new message in this conference'),
  row('EALL', 'Enter Message to All', 'messages', 'ENTER_MESSAGE', 'board:command.handler.ts EALL (E EALL, express.e:10800-10816)', 'Write a message addressed to everyone'),
  row('C', 'Comment to Sysop', 'messages', 'COMMENT_TO_SYSOP', 'express.e:24658 internalCommandC', 'Leave a private message for the sysop'),
  row('MS', 'Mail Scan', 'messages', null, 'express.e:25250 internalCommandMS', 'Scan every conference for mail addressed to you'),
  row('ZOOM', 'Zoom Mail', 'messages', 'ZOOM_MAIL', 'express.e:26215 internalCommandZOOM', 'Download your new mail as one packet to read offline'),
  row('OLM', 'Online Message', 'messages', 'OLM', 'express.e:25406 internalCommandOLM', 'Send a short message to a caller on another node'),
  row('LIVECHAT', 'Live Chat', 'messages', null, 'board:chat/chat-commands.handler.ts handleLiveChatCommand', 'Chat live with callers on the other nodes'),
  row('ROOM', 'Chat Rooms', 'messages', null, 'board:chat/room-commands.handler.ts handleRoomCommand', 'Join a group chat room'),
  row('O', 'Page Sysop', 'messages', 'PAGE_SYSOP', 'express.e:25372 internalCommandO', 'Ask the sysop for a chat'),
  row('B', 'Bulletins', 'messages', 'READ_BULLETINS', 'express.e:24607 internalCommandB', 'Read the board bulletins'),
  // Files
  row('F', 'File Listings', 'files', 'FILE_LISTINGS', 'express.e:24877 internalCommandF', 'List the files in this conference'),
  row('FR', 'File Listings Reversed', 'files', 'FILE_LISTINGS', 'express.e:24883 internalCommandFR', 'List the files in this conference, newest first'),
  row('FI', 'File Information', 'files', null, 'board:command.handler.ts FI', 'Show one file from the last listing in full'),
  row('N', 'New Files', 'files', 'FILE_LISTINGS', 'express.e:25275 internalCommandN', 'List the files uploaded since a date'),
  row('Z', 'Zippy Text Search', 'files', 'ZIPPY_TEXT_SEARCH', 'express.e:26123 internalCommandZ', 'Search the file descriptions for a word'),
  row('A', 'Alter File Flags', 'files', 'DOWNLOAD', 'express.e:24601 internalCommandA', 'Change the list of files flagged for download'),
  row('D', 'Download', 'files', 'DOWNLOAD', 'express.e:24853 internalCommandD', 'Download files'),
  row('DS', 'Download with Status', 'files', 'DOWNLOAD', 'express.e:24853 internalCommandD', 'Download files and show the transfer status'),
  row('U', 'Upload', 'files', 'UPLOAD', 'express.e:25646 internalCommandU', 'Upload files'),
  row('RZ', 'Zmodem Upload', 'files', 'UPLOAD', 'express.e:25608 internalCommandRZ', 'Upload files with Zmodem, started from your terminal'),
  row('V', 'View a Text File', 'files', 'VIEW_A_FILE', 'express.e:25675 internalCommandV', 'Show the text inside a file'),
  row('VS', 'View a Text File Nonstop', 'files', 'VIEW_A_FILE', 'express.e:25675 internalCommandV', 'Show the text inside a file without pauses'),
  // Conferences
  row('J', 'Join Conference', 'conferences', 'JOIN_CONFERENCE', 'express.e:25113 internalCommandJ', 'Move to another conference'),
  row('JM', 'Join Message Base', 'conferences', 'JOIN_CONFERENCE', 'express.e:25185 internalCommandJM', 'Move to another message base in this conference'),
  row('<', 'Previous Conference', 'conferences', 'JOIN_CONFERENCE', 'express.e:24529 internalCommandLT', 'Join the previous conference you have access to'),
  row('>', 'Next Conference', 'conferences', 'JOIN_CONFERENCE', 'express.e:24548 internalCommandGT', 'Join the next conference you have access to'),
  row('<<', 'Previous Message Base', 'conferences', null, 'express.e:24566 internalCommandLT2', 'Join the previous message base'),
  row('>>', 'Next Message Base', 'conferences', null, 'express.e:24580 internalCommandGT2', 'Join the next message base'),
  row('CF', 'Conference Flags', 'conferences', 'CONFFLAGS', 'express.e:24672 internalCommandCF', 'Choose which conferences are scanned for mail and files'),
  // Account
  row('W', 'User Settings', 'account', 'EDIT_USER_INFO', 'express.e:25712 internalCommandW', 'Change your name, location, password and screen settings'),
  row('S', 'Your Status', 'account', 'DISPLAY_USER_STATS', 'express.e:25540 internalCommandS', 'Show your account statistics'),
  row('FS', 'Full Status', 'account', 'CONFERENCE_ACCOUNTING', 'express.e:24872 internalCommandFS', 'Show your upload and download totals in every conference'),
  row('T', 'Time', 'account', null, 'express.e:25622 internalCommandT', 'Show the time and how long you have left today'),
  row('X', 'Expert Mode', 'account', null, 'express.e:26113 internalCommandX', 'Switch between this menu and the plain prompt'),
  row('M', 'Colour Mode', 'account', null, 'express.e:25239 internalCommandM', 'Turn ANSI colour on or off'),
  row('Q', 'Quiet Node', 'account', 'QUIET_NODE', 'express.e:25504 internalCommandQ', 'Hide your node from the who-is-online lists'),
  row('COLOURS', 'PETSCII Colours', 'account', null, 'board:commands/user-commands.handler.ts handlePetsciiPaletteCommand', 'Choose the sixteen colours of your PETSCII screen'),
  row('LINKDISCORD', 'Link Discord', 'account', null, 'board:commands DiscordLinkCommandsHandler', "Get a code that links your account to the board's Discord"),
  row('H', 'Help', 'account', null, 'express.e:25071 internalCommandH', "Show the board's help page"),
  row('^', 'Help Files', 'account', null, 'express.e:25089 internalCommandUpHat', 'Read a help file by name'),
  row('TTX', 'Teletext Help', 'account', null, 'board:command.handler.ts TTX (handleHelpFilesCommand)', 'Read the help files as teletext pages'),
  row('RL', 'Relogon', 'account', 'RELOGON', 'express.e:25534 internalCommandRL', 'Log off and log on again'),
  row('G', 'Goodbye', 'account', null, 'express.e:25047 internalCommandG', 'Log off'),
  // Doors
  row('DOORS', 'Door Games', 'doors', null, 'board:door.handler.ts displayDoorMenu', 'Browse and start the door games'),
  row('AG', 'Door Documentation', 'doors', null, 'board:commands/amigaguide-commands.handler.ts handleAmigaGuideCommand', "Read a door's own documentation"),
  row('VO', 'Voting Booth', 'doors', 'VOTE', 'express.e:25700 internalCommandVO', "Vote on the board's topics"),
  // System
  row('WHO', 'Who Is Online', 'system', 'WHO_IS_ONLINE', 'express.e:26094 internalCommandWHO', 'Show who is on the other nodes'),
  row('WHD', 'Who Is Online in Detail', 'system', 'WHO_IS_ONLINE', 'express.e:26104 internalCommandWHD', 'Show who is on the other nodes, and what they are doing'),
  row('UP', 'Node Uptime', 'system', null, 'express.e:25667 internalCommandUP', 'Show when this node was started'),
  row('VER', 'Version', 'system', null, 'express.e:25688 internalCommandVER', 'Show the AmiExpress version'),
  row('GR', 'Greetings', 'system', null, 'express.e:24411 internalCommandGreets', 'In memory of those who came before us'),
  row('0', 'Remote Shell', 'system', 'REMOTE_SHELL', 'express.e:24424 internalCommand0', 'Open a shell on the board'),
  row('1', 'Account Editing', 'system', 'ACCOUNT_EDITING', 'express.e:24453 internalCommand1', 'Edit the callers accounts'),
  row('2', 'Callers Log', 'system', 'LIST_NODES', 'express.e:24461 internalCommand2', 'Read the callers log of a node'),
  row('3', 'Edit Directory Files', 'system', 'EDIT_DIRS', 'express.e:24511 internalCommand3', 'Edit the file directory of a conference'),
  row('4', 'Edit Any File', 'system', 'EDIT_FILES', 'express.e:24517 internalCommand4', 'Edit any text file on the board'),
  row('5', 'Browse Directories', 'system', 'SYSOP_COMMANDS', 'express.e:24523 internalCommand5', 'List any directory on the board'),
  row('FM', 'File Maintenance', 'system', 'EDIT_FILES', 'express.e:24889 internalCommandFM', 'Move, delete and edit the files of a conference'),
  row('US', 'Sysop Upload', 'system', 'SYSOP_COMMANDS', 'express.e:25660 internalCommandUS', 'Upload files as the sysop'),
  row('NM', 'Node Management', 'system', 'SYSOP_COMMANDS', 'express.e:25281 internalCommandNM', 'Watch and control the nodes'),
  row('CM', 'Conference Maintenance', 'system', 'SYSOP_COMMANDS', 'express.e:24843 internalCommandCM', 'Change the settings of a conference'),
  row('WEBHOOK', 'Webhooks', 'system', 'SYSOP', 'board:commands/webhook-commands.handler.ts:20', 'Manage the web hooks the board calls'),
  // The menu itself
  row('?', 'Menu', 'account', null, 'express.e:24594 internalCommandQuestionMark', 'Show this menu', false),
];

const BY_CODE = new Map(INTERNAL_COMMANDS.map(r => [r.code, r]));
export function internalCommandRow(code: string): InternalCommandRow | undefined {
  return BY_CODE.get(code.toUpperCase());
}
