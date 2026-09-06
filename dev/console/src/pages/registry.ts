// Single source of truth for the TUI page list.
// Each entry describes a page that the Sidebar can render and that the Footer
// + HelpOverlay introspect for hotkey hints.
//
// As new pages land in Phases B–E, append entries here. The "implemented" flag
// lets us list a page in the sidebar (so the structure is visible early) before
// its component exists; Sidebar renders unimplemented pages dimmed and refuses
// selection.

export type CategoryName = 'Live' | 'People' | 'Content' | 'System' | 'Diagnostics';

export interface PageMeta {
  id: string;            // unique stable id, used for routing
  label: string;         // sidebar label
  category: CategoryName;
  // Footer hint string in the same format as before (e.g. "[k]ick  [c]hat").
  footerHint: string;
  // Per-page help: pairs of [key, description] shown in the help overlay.
  helpKeys: Array<[string, string]>;
  // false until the corresponding component file exists.
  implemented: boolean;
}

export const PAGES: PageMeta[] = [
  // ─── Live ──────────────────────────────────────────────────────
  {
    id: 'overview',
    label: 'Overview',
    category: 'Live',
    footerHint: 'live stats + 24h sparkline  auto-refresh 10s',
    helpKeys: [
      ['—', 'Live stats panel — auto-refreshes every 10 s'],
      ['—', 'Sparkline shows calls over the last 24 h'],
    ],
    implemented: true,
  },
  {
    id: 'nodes',
    label: 'Nodes',
    category: 'Live',
    footerHint: '[1]Live [2]Config  [k]ick  [v]reserve  [↑↓] select',
    helpKeys: [
      ['1', 'Live tab — status, kick, reserve'],
      ['2', 'Configuration tab — per-node settings (CrudList: [n]ew [e]dit [d]el [/]search)'],
      ['↑↓', 'Select a node'],
      ['k',  'Kick the selected user (Live tab)'],
      ['v',  'Reserve the selected node for an expected caller, or clear an existing reservation (Live tab)'],
      ['click', 'Click a row to select it'],
    ],
    implemented: true,
  },
  {
    id: 'activity',
    label: 'Activity',
    category: 'Live',
    footerHint: '[↑↓] scroll  auto-refresh 30s',
    helpKeys: [['—', 'Live feed of logons, doors and transfers']],
    implemented: true,
  },
  {
    id: 'operator-chat',
    label: 'Operator Chat',
    category: 'Live',
    footerHint: '[enter] accept  [esc] end  [1-4] quick reply',
    helpKeys: [
      ['↑↓',     'Select a pending page'],
      ['enter',  'Accept the selected page and start chat'],
      ['esc',    'End the active chat'],
      ['1-4',    'Send a canned quick reply'],
      ['type',   'Type a message and press [enter] to send'],
    ],
    implemented: true,
  },
  {
    id: 'opchat-settings',
    label: 'Chat Settings',
    category: 'System',
    footerHint: '[enter] toggle/edit  [r]efresh  [s]ave',
    helpKeys: [
      ['↑↓', 'Select a field'],
      ['enter', 'Toggle bool, cycle select, or edit value'],
      ['s', 'Save pending changes'],
      ['r', 'Refresh from server'],
      ['R', 'Revert pending changes'],
    ],
    implemented: true,
  },

  // ─── People ─────────────────────────────────────────────────────
  {
    id: 'users',
    label: 'Users',
    category: 'People',
    footerHint: '[e]dit SL  [p]assword  [a]dd  [t]oggle ban  [d]el  [/]search  [↑↓] scroll',
    helpKeys: [
      ['↑↓', 'Scroll users'],
      ['e',  'Edit security level'],
      ['p',  'Reset the selected user\'s password'],
      ['a',  'Add a new user'],
      ['t',  'Toggle ban/unban (SL=0 ↔ SL=50)'],
      ['b',  'Confirm ban (set SL=0)'],
      ['d',  'Delete user'],
      ['/',  'Search by username'],
      ['r',  'Refresh from server'],
      ['click', 'Click a row to select it'],
    ],
    implemented: true,
  },
  {
    id: 'security',
    label: 'Access Levels',
    category: 'People',
    footerHint: '[space] toggle  [s]ave  [n]ew level  [/]search  [←/→] level  [↑↓] scroll',
    helpKeys: [
      ['↑↓', 'Scroll the permission list'],
      ['←/→', 'Switch which ACS.<level>.info is open'],
      ['space/enter', 'Toggle the selected permission'],
      ['s', 'Save changes to ACS.<level>.info (confirms)'],
      ['n', 'Create a new level (copies the nearest lower one)'],
      ['/', 'Filter permissions by name'],
      ['r', 'Reload from server'],
    ],
    implemented: true,
  },

  {
    id: 'admin-roles',
    label: 'Admin Roles',
    category: 'People',
    footerHint: '[enter] edit  [s]ave  [R]eset  [r]eload  [↑↓] select',
    helpKeys: [
      ['↑↓', 'Select an admin section'],
      ['enter', 'Edit its minimum security level'],
      ['s', 'Save pending changes'],
      ['R', 'Reset all sections to their defaults (not yet saved)'],
      ['r', 'Reload from server'],
    ],
    implemented: true,
  },

  // ─── Content ───────────────────────────────────────────────────
  {
    id: 'conferences',
    label: 'Conferences',
    category: 'Content',
    footerHint: '[a]dd  [d]elete  [t]oggle  [h]ealth  [f]ix  [o]rphans  [r]efresh  [↑↓] scroll',
    helpKeys: [
      ['↑↓', 'Scroll conferences'],
      ['a', 'Add a new conference (goes on the end of the list)'],
      ['d', 'Delete the selected conference (typed confirmation, then a files prompt)'],
      ['t', 'Toggle enabled/disabled'],
      ['h', 'Health check'],
      ['f', 'Auto-fix issues'],
      ['o', 'Review orphan directories no conference points at (only shown when any exist)'],
      ['r', 'Refresh from server'],
    ],
    implemented: true,
  },
  {
    id: 'doors',
    label: 'Doors',
    category: 'Content',
    footerHint: '[r]efresh  [R]eload all  [e]dit  [d]elete  [↑↓←→] navigate',
    helpKeys: [
      ['↑↓←→', 'Navigate the door grid'],
      ['e',    'Inline edit name/command/enabled'],
      ['space','Toggle enabled in edit mode'],
      ['d',    'Delete the selected door (confirmation)'],
      ['r',    'Refresh from server'],
      ['R',    'Reload all doors (confirmation)'],
      ['click', 'Click any door cell to select'],
    ],
    implemented: true,
  },
  {
    id: 'door-install',
    label: 'Door Install',
    category: 'Content',
    footerHint: '[i]nstall path  [r]efresh',
    helpKeys: [
      ['i', 'Enter install mode — paste archive path'],
      ['enter', 'Submit path and install archive'],
      ['esc', 'Cancel install'],
      ['r', 'Refresh door list'],
    ],
    implemented: true,
  },
  {
    id: 'screen-files',
    label: 'Screen Files',
    category: 'Content',
    footerHint: '[Tab] tab  [v]iew  [d]etail  [x]delete  [p]repair  [R]epair all  [r]efresh',
    helpKeys: [
      ['Tab', 'Switch between ALL/NODE/CONF/BOARD/UNUSED/BULL'],
      ['↑↓', 'Scroll files'],
      ['v', 'Preview the selected file'],
      ['d', 'Show detail (size, SAUCE, MCI refs, problems)'],
      ['h', 'Revision history — preview or restore an earlier snapshot (from detail view)'],
      ['x', 'Delete the selected file (confirms)'],
      ['p', 'Repair the selected file (put the escape byte back in front of colour codes)'],
      ['R', 'Repair every damaged file in one pass (dry run first, then confirms)'],
      ['m', 'Toggle showing all MCI refs vs. only broken ones (from detail view)'],
      ['r', 'Refresh from server'],
    ],
    implemented: true,
  },

  // ─── System ────────────────────────────────────────────────────
  {
    id: 'configuration',
    label: 'Configuration',
    category: 'System',
    footerHint: '[enter] edit field  [r]efresh  [↑↓] select  (auto-save)',
    helpKeys: [
      ['↑↓', 'Select a field'],
      ['enter', 'Edit field (or toggle bool) — auto-saves on confirm'],
      ['r',  'Refresh from server'],
    ],
    implemented: true,
  },
  {
    id: 'config-files',
    label: 'Configuration Files',
    category: 'System',
    footerHint: '[enter] edit  [↑↓] select  [s]ave  [esc] back',
    helpKeys: [
      ['↑↓', 'Select a file (list) or tooltype (edit)'],
      ['enter', 'Open the selected file for editing'],
      ['e', 'Edit the selected tooltype value'],
      ['t', 'Toggle comment on the selected tooltype'],
      ['s', 'Save all changes to the file'],
      ['esc', 'Back to file list (from edit mode)'],
    ],
    implemented: true,
  },
  {
    id: 'lookup-tables',
    label: 'Lookup Tables',
    category: 'System',
    footerHint: '[1-5] switch tab  [n]ew  [e]dit  [d]el  [↑↓] scroll',
    helpKeys: [
      ['1-5', 'Switch between Computers / Screen types / Languages / Protocols / File checkers'],
      ['n',  'Create a new row'],
      ['e',  'Edit the selected row'],
      ['d',  'Delete the selected row (confirms)'],
    ],
    implemented: true,
  },
  {
    id: 'health',
    label: 'Health and Deployment',
    category: 'System',
    footerHint: '[f]ix  [r]efresh  auto-refresh 30s',
    helpKeys: [
      ['f', 'Run auto-fix for all fixable issues'],
      ['r', 'Refresh now'],
      ['Issues in red are errors, yellow are warnings', ''],
    ],
    implemented: true,
  },

  // ─── Diagnostics ───────────────────────────────────────────────
  {
    id: 'statistics',
    label: 'Statistics',
    category: 'Diagnostics',
    footerHint: 'all-time + session totals  auto-refresh 30s',
    helpKeys: [
      ['—', 'Read-only — auto-refreshes every 30 s'],
    ],
    implemented: true,
  },
  {
    id: 'logs',
    label: 'System Logs',
    category: 'Diagnostics',
    footerHint: '[b/p/6] source  [/] search  [L] door log file  [C]lear  [↑↓/PgUp/PgDn] scroll  [g/G] top/tail',
    helpKeys: [
      ['b',         'Backend log'],
      ['p',         'Preview log'],
      ['6',         '68K door log'],
      ['/',         'Search (server-side, case-insensitive). [enter] apply, [esc] cancel'],
      ['c',         'Clear an applied search term'],
      ['L',         'Choose a specific door-68k-*.log file (only when source is 68K Door)'],
      ['C',         'Clear the current log file on disk (confirms)'],
      ['↑↓',        'Scroll one line at a time'],
      ['PgUp/PgDn', 'Scroll a page'],
      ['G',         'Jump to tail (resume follow)'],
      ['g',         'Jump to top'],
      ['click',     'Click Backend / Preview / 68K Door at the top to switch'],
    ],
    implemented: true,
  },
  {
    id: 'session-logs',
    label: 'Session Logs',
    category: 'Diagnostics',
    footerHint: '[enter] view session log  [s]ave (in log view)  [r]efresh  [↑↓] scroll',
    helpKeys: [
      ['↑↓', 'Select a session'],
      ['enter / click', 'Open the session log (stats panel shows totals above the list)'],
      ['s', 'Save the open log to disk and show the file path (while viewing a log)'],
      ['esc', 'Back to session list (when viewing a log)'],
      ['r',  'Refresh sessions and stats from server'],
    ],
    implemented: true,
  },
  {
    id: 'audit',
    label: 'Audit Log',
    category: 'Diagnostics',
    footerHint: '[/]filter table  [c]lear  [r]efresh  [↑↓] scroll',
    helpKeys: [
      ['↑↓', 'Select an entry — its before/after diff shows below'],
      ['/',  'Filter by table name'],
      ['c',  'Clear filter'],
      ['r',  'Refresh from server'],
    ],
    implemented: true,
  },
  {
    id: 'import-export',
    label: 'Import and Export',
    category: 'Diagnostics',
    footerHint: '[1]mport  [2]xport  [v/x/c/d] (import)  [u/m/f/n] (export)',
    helpKeys: [
      ['1', 'Switch to Import tab'],
      ['2', 'Switch to Export tab'],
      ['↑↓', 'Select a session (import) or toggle checkboxes (export)'],
      ['v', 'Validate import session'],
      ['x', 'Execute import'],
      ['c', 'Cancel import'],
      ['d', 'Delete import session'],
      ['u', 'Toggle Users checkbox (export)'],
      ['m', 'Toggle Messages checkbox (export)'],
      ['f', 'Toggle Files checkbox (export)'],
      ['n', 'Create new export'],
    ],
    implemented: true,
  },
];

export const CATEGORIES: CategoryName[] = ['Live', 'People', 'Content', 'System', 'Diagnostics'];

export const CATEGORY_COLLAPSED: Partial<Record<CategoryName, boolean>> = {
  Diagnostics: true,
};

export function pageById(id: string): PageMeta | undefined {
  return PAGES.find(p => p.id === id);
}

export function pagesByCategory(cat: CategoryName): PageMeta[] {
  return PAGES.filter(p => p.category === cat);
}

export const DEFAULT_PAGE = 'overview';