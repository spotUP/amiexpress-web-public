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
    footerHint: '[b]ackend  [p]review  [d]oor-watcher  [6]8k',
    helpKeys: [
      ['b', 'Backend log'],
      ['p', 'Preview log'],
      ['6', '68K door log'],
      ['click', 'Click Backend / Preview / 68K Door at the top to switch'],
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
  { id: 'global-wall', label: 'Global Wall', category: 'Content', footerHint: '(coming in phase D)', helpKeys: [], implemented: false },

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
  { id: 'import-export',  label: 'Import / Export', category: 'Files', footerHint: '(coming in phase D)', helpKeys: [], implemented: false },

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
  { id: 'deployment',     label: 'Deployment',      category: 'System', footerHint: '(coming in phase E)', helpKeys: [], implemented: false },
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
  { id: 'amixnet',           label: 'AmiXnet',          category: 'Comms', footerHint: '(coming in phase E)', helpKeys: [], implemented: false },
  { id: 'op-chat-settings',  label: 'Op Chat Settings', category: 'Comms', footerHint: '(coming in phase E)', helpKeys: [], implemented: false },
  { id: 'batch-editor',      label: 'Batch Editor',     category: 'Comms', footerHint: '(coming in phase D)', helpKeys: [], implemented: false },
  { id: 'info-files',        label: 'Info Files',       category: 'Comms', footerHint: '(coming in phase E)', helpKeys: [], implemented: false },
];

export const CATEGORIES: CategoryName[] = ['Live', 'Users', 'Content', 'Files', 'System', 'Comms'];

export function pageById(id: string): PageMeta | undefined {
  return PAGES.find(p => p.id === id);
}

export function pagesByCategory(cat: CategoryName): PageMeta[] {
  return PAGES.filter(p => p.category === cat);
}

export const DEFAULT_PAGE = 'dashboard';
