// Single source of truth for the TUI page list.
// Each entry describes a page that the Sidebar can render and that the Footer
// + HelpOverlay introspect for hotkey hints.
//
// As new pages land in Phases B–E, append entries here. The "implemented" flag
// lets us list a page in the sidebar (so the structure is visible early) before
// its component exists; Sidebar renders unimplemented pages dimmed and refuses
// selection.

export type CategoryName = 'Live' | 'Users' | 'Content' | 'Files' | 'System' | 'Comms';

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
    id: 'dashboard',
    label: 'Dashboard',
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
    footerHint: '[k]ick  [c]hat  [↑↓] select',
    helpKeys: [
      ['↑↓', 'Select a node'],
      ['k',  'Kick the selected user'],
      ['c',  'Open chat to selected node'],
      ['click', 'Click a row to select it'],
    ],
    implemented: true,
  },
  {
    id: 'callers',
    label: 'Callers',
    category: 'Live',
    footerHint: '[↑↓] scroll  auto-refresh 30s',
    helpKeys: [['—', 'Read-only — auto-refreshes every 30 s']],
    implemented: true,
  },
  {
    id: 'logs',
    label: 'Logs',
    category: 'Live',
    footerHint: '[b/p/6] source  [/] filter  [↑↓/PgUp/PgDn] scroll  [g/G] top/tail',
    helpKeys: [
      ['b',         'Backend log'],
      ['p',         'Preview log'],
      ['6',         '68K door log'],
      ['/',         'Filter (substring, case-insensitive). [enter] apply, [esc] clear'],
      ['c',         'Clear an active filter'],
      ['↑↓',        'Scroll one line at a time'],
      ['PgUp/PgDn', 'Scroll a page'],
      ['G',         'Jump to tail (resume follow)'],
      ['g',         'Jump to top'],
      ['click',     'Click Backend / Preview / 68K Door at the top to switch'],
    ],
    implemented: true,
  },
  {
    id: 'op-chat',
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

  // ─── Users ─────────────────────────────────────────────────────
  {
    id: 'users',
    label: 'Users',
    category: 'Users',
    footerHint: '[e]dit SL  [b]an  [d]el  [/]search  [↑↓] scroll',
    helpKeys: [
      ['↑↓', 'Scroll users'],
      ['e',  'Edit security level'],
      ['b',  'Ban (set SL=0)'],
      ['d',  'Delete user'],
      ['/',  'Search by username'],
      ['r',  'Refresh from server'],
      ['click', 'Click a row to select it'],
    ],
    implemented: true,
  },
  {
    id: 'security',
    label: 'Security',
    category: 'Users',
    footerHint: '[n]ew  [e]dit  [d]el  [/]search  [r]efresh  [↑↓] scroll',
    helpKeys: [
      ['↑↓', 'Scroll items'],
      ['n', 'Create a new row'],
      ['e', 'Edit the selected row'],
      ['d', 'Delete the selected row (confirms)'],
      ['/', 'Search by any column value'],
      ['r', 'Refresh from server'],
      ['click', 'Click a row to select it'],
    ],
    implemented: true,
  },
  {
    id: 'audit',
    label: 'Audit Log',
    category: 'Users',
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
    id: 'sessions',
    label: 'Session Logs',
    category: 'Users',
    footerHint: '[enter] view session log  [r]efresh  [↑↓] scroll',
    helpKeys: [
      ['↑↓', 'Select a session'],
      ['enter / click', 'Open the session log'],
      ['esc', 'Back to session list (when viewing a log)'],
      ['r',  'Refresh from server'],
    ],
    implemented: true,
  },

  // ─── Content ───────────────────────────────────────────────────
  {
    id: 'confs',
    label: 'Conferences',
    category: 'Content',
    footerHint: '[t]oggle  [h]ealth  [f]ix  [r]efresh  [↑↓] scroll',
    helpKeys: [
      ['↑↓', 'Scroll conferences'],
      ['t', 'Toggle enabled/disabled'],
      ['h', 'Health check'],
      ['f', 'Auto-fix issues'],
      ['r', 'Refresh from server'],
    ],
    implemented: true,
  },
  {
    id: 'doors',
    label: 'Doors',
    category: 'Content',
    footerHint: '[r]efresh  [R]eload all doors  [↑↓←→] navigate',
    helpKeys: [
      ['↑↓←→', 'Navigate the door grid'],
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
    id: 'global-wall',
    label: 'Global Wall',
    category: 'Content',
    footerHint: '[n]ew  [e]dit  [d]el  [/]search  [r]efresh  [↑↓] scroll',
    helpKeys: [
      ['↑↓', 'Scroll comments'],
      ['e', 'Edit the selected comment'],
      ['d', 'Delete the selected comment (confirms)'],
      ['/', 'Search by message text'],
      ['r', 'Refresh from server'],
      ['click', 'Click a row to select it'],
    ],
    implemented: true,
  },

  // ─── Files ─────────────────────────────────────────────────────
  {
    id: 'drives',
    label: 'Drives',
    category: 'Files',
    footerHint: '[n]ew  [e]dit  [d]el  [/]search  [r]efresh  [↑↓] scroll',
    helpKeys: [
      ['↑↓', 'Scroll items'],
      ['n', 'Create a new row'],
      ['e', 'Edit the selected row'],
      ['d', 'Delete the selected row (confirms)'],
      ['/', 'Search by any column value'],
      ['r', 'Refresh from server'],
      ['click', 'Click a row to select it'],
    ],
    implemented: true,
  },
  {
    id: 'file-checkers',
    label: 'File Checkers',
    category: 'Files',
    footerHint: '[n]ew  [e]dit  [d]el  [/]search  [r]efresh  [↑↓] scroll',
    helpKeys: [
      ['↑↓', 'Scroll items'],
      ['n', 'Create a new row'],
      ['e', 'Edit the selected row'],
      ['d', 'Delete the selected row (confirms)'],
      ['/', 'Search by any column value'],
      ['r', 'Refresh from server'],
      ['click', 'Click a row to select it'],
    ],
    implemented: true,
  },
  {
    id: 'import-export',
    label: 'Import / Export',
    category: 'Files',
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

  // ─── System ────────────────────────────────────────────────────
  {
    id: 'system-config',
    label: 'System Config',
    category: 'System',
    footerHint: '[e]dit  [s]ave  [r]efresh  [R]revert  [↑↓] select',
    helpKeys: [
      ['↑↓', 'Select a field'],
      ['e',  'Edit the selected field'],
      ['s',  'Save all pending changes'],
      ['R',  'Revert all pending changes'],
      ['r',  'Refresh from server (discards pending)'],
      ['Pending fields are marked with * and shown in yellow', ''],
    ],
    implemented: true,
  },
  {
    id: 'health',
    label: 'Health Check',
    category: 'System',
    footerHint: '[f]ix  [r]efresh  auto-refresh 30s',
    helpKeys: [
      ['f', 'Run auto-fix for all fixable issues'],
      ['r', 'Refresh now'],
      ['Issues in red are errors, yellow are warnings', ''],
    ],
    implemented: true,
  },
  {
    id: 'deployment',
    label: 'Deployment',
    category: 'System',
    footerHint: '[r]efresh now  auto-refresh 30s',
    helpKeys: [
      ['r', 'Refresh deployment status now'],
      ['—', 'Shows health, system info, and database statistics'],
    ],
    implemented: true,
  },
  {
    id: 'system',
    label: 'System (legacy)',
    category: 'System',
    footerHint: '[n]odes  [c]onfig  [s]tart  [x]exit  [v]reserve  [o]sysop  [Q]uiet',
    helpKeys: [
      ['n', 'Switch to Nodes panel'],
      ['c', 'Switch to Config panel'],
      ['↑↓', 'Select a node (Nodes panel)'],
      ['s', 'Start the selected node'],
      ['x', 'Exit the selected node'],
      ['v', 'Reserve the selected node'],
      ['o', 'Sysop-login on the selected node'],
      ['Q', 'Toggle quiet mode'],
    ],
    implemented: true,
  },
  {
    id: 'languages',
    label: 'Languages',
    category: 'System',
    footerHint: '[n]ew  [e]dit  [d]el  [/]search  [r]efresh  [↑↓] scroll',
    helpKeys: [
      ['↑↓', 'Scroll items'],
      ['n', 'Create a new row'],
      ['e', 'Edit the selected row'],
      ['d', 'Delete the selected row (confirms)'],
      ['/', 'Search by any column value'],
      ['r', 'Refresh from server'],
      ['click', 'Click a row to select it'],
    ],
    implemented: true,
  },
  {
    id: 'protocols',
    label: 'Protocols',
    category: 'System',
    footerHint: '[n]ew  [e]dit  [d]el  [/]search  [r]efresh  [↑↓] scroll',
    helpKeys: [
      ['↑↓', 'Scroll items'],
      ['n', 'Create a new row'],
      ['e', 'Edit the selected row'],
      ['d', 'Delete the selected row (confirms)'],
      ['/', 'Search by any column value'],
      ['r', 'Refresh from server'],
      ['click', 'Click a row to select it'],
    ],
    implemented: true,
  },
  {
    id: 'computers',
    label: 'Computers',
    category: 'System',
    footerHint: '[n]ew  [e]dit  [d]el  [/]search  [r]efresh  [↑↓] scroll',
    helpKeys: [
      ['↑↓', 'Scroll items'],
      ['n', 'Create a new row'],
      ['e', 'Edit the selected row'],
      ['d', 'Delete the selected row (confirms)'],
      ['/', 'Search by any column value'],
      ['r', 'Refresh from server'],
      ['click', 'Click a row to select it'],
    ],
    implemented: true,
  },
  {
    id: 'screen-types',
    label: 'Screen Types',
    category: 'System',
    footerHint: '[n]ew  [e]dit  [d]el  [/]search  [r]efresh  [↑↓] scroll',
    helpKeys: [
      ['↑↓', 'Scroll items'],
      ['n', 'Create a new row'],
      ['e', 'Edit the selected row'],
      ['d', 'Delete the selected row (confirms)'],
      ['/', 'Search by any column value'],
      ['r', 'Refresh from server'],
      ['click', 'Click a row to select it'],
    ],
    implemented: true,
  },

  // ─── Comms ─────────────────────────────────────────────────────
  {
    id: 'amixnet',
    label: 'AmiXnet',
    category: 'Comms',
    footerHint: '[e]dit value  [s]ave  [r]efresh  [↑↓] select',
    helpKeys: [
      ['↑↓', 'Select a setting'],
      ['e', 'Edit the selected setting value'],
      ['s', 'Save all changes'],
      ['r', 'Refresh from server'],
    ],
    implemented: true,
  },
  {
    id: 'op-chat-settings',
    label: 'Op Chat Settings',
    category: 'Comms',
    footerHint: '[e]dit  [s]ave  [r]efresh  [R]revert  [↑↓] select',
    helpKeys: [
      ['↑↓', 'Select a field'],
      ['e', 'Edit the selected field'],
      ['s', 'Save all pending changes'],
      ['R', 'Revert all pending changes'],
      ['r', 'Refresh from server (discards pending)'],
    ],
    implemented: true,
  },
  {
    id: 'batch-editor',
    label: 'Batch Editor',
    category: 'Comms',
    footerHint: '[enter] load  [e]dit  [a]ppend  [d]elete  [s]ave  [v]alidate  [esc] back',
    helpKeys: [
      ['↑↓', 'Select a batch file or scroll lines'],
      ['enter', 'Load the selected batch file'],
      ['e', 'Edit the selected line'],
      ['a', 'Append a new line after current'],
      ['d', 'Delete the current line'],
      ['s', 'Save all changes'],
      ['v', 'Validate batch syntax'],
      ['esc', 'Return to batch list or cancel edit'],
    ],
    implemented: true,
  },
  {
    id: 'info-files',
    label: 'Info Files',
    category: 'Comms',
    footerHint: '[enter] edit  [↑↓] select  [e]dit value  [t]oggle comment  [s]ave  [esc] back',
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
];

export const CATEGORIES: CategoryName[] = ['Live', 'Users', 'Content', 'Files', 'System', 'Comms'];

export function pageById(id: string): PageMeta | undefined {
  return PAGES.find(p => p.id === id);
}

export function pagesByCategory(cat: CategoryName): PageMeta[] {
  return PAGES.filter(p => p.category === cat);
}

export const DEFAULT_PAGE = 'dashboard';
