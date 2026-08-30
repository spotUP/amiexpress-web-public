/**
 * Every path that used to be its own destination, and where it goes now.
 *
 * These redirects are permanent, not a migration step. A sysop's bookmark, a
 * link in a runbook and anything written down over the years all keep
 * resolving, and a test walks this table so a merge can never quietly take a
 * path away.
 *
 * Declared as data rather than as JSX so both the router and the test read
 * the same list.
 */

export interface LegacyRoute {
  /** The old path, relative to /admin. */
  from: string;
  /** Where it lands, relative to /admin, tab parameter included. */
  to: string;
  /** The capability that must stay reachable, for the test's failure message. */
  capability: string;
}

export const LEGACY_ROUTES: LegacyRoute[] = [
  { from: 'node-control', to: 'nodes?tab=live', capability: 'Live node control and supervisor commands' },
  { from: 'drives', to: 'conferences?tab=file-areas', capability: 'DLPATH.n and ULPATH.n per conference' },
  { from: 'computers', to: 'lookup-tables?tab=computers', capability: 'ComputerList.info' },
  { from: 'screen-types', to: 'lookup-tables?tab=screen-types', capability: 'Screen types offered at login' },
  { from: 'languages', to: 'lookup-tables?tab=languages', capability: 'Language sets' },
  { from: 'protocols', to: 'lookup-tables?tab=protocols', capability: 'Protocols/XprTypes.info' },
  { from: 'file-checkers', to: 'lookup-tables?tab=file-checkers', capability: 'Archive validation commands' },
  { from: 'system-files', to: 'config-files?tab=system', capability: 'System .info tooltype editor' },
  { from: 'amixnet', to: 'config-files?tab=amixnet', capability: 'AmiXnet network files' },
  { from: 'batches', to: 'config-files?tab=batch', capability: 'batch*.info scripts' },
  { from: 'tooltypes', to: 'config-files?tab=tooltypes', capability: 'Comment, add and remove a tooltype in any .info file' },
  { from: 'deployment', to: 'health?tab=deployment', capability: 'Build, version and container state' },
  { from: 'operator-chat-settings', to: 'operator-chat?tab=settings', capability: 'Paging hours and away messages' },
];
