/**
 * The sidebar, as data.
 *
 * The old sidebar was 27 flat entries in the order they happened to be built,
 * with a 1 729-line configuration form as the home page. These are the same
 * destinations, grouped by what a sysop is actually doing, and landing on the
 * Overview instead.
 *
 * Several destinations are merges: Nodes carries the live view and the
 * configuration, Conferences carries the file areas, Configuration Files
 * carries all four tooltype editors, Lookup Tables carries five small lists.
 * Each merged screen puts the original pages behind tabs without touching
 * what they write, and every path they used to live at still resolves - see
 * routes/legacy-routes.ts.
 */

import {
  Activity,
  ArrowUpDown,
  Boxes,
  DoorOpen,
  FileText,
  FolderOpen,
  Gauge,
  Globe,
  History,
  LayoutDashboard,
  MessageSquare,
  Monitor,
  Settings,
  Shield,
  Users,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const ADMIN_BASE = '/admin';

export interface NavItem {
  /** Path relative to /admin, or '' for the Overview itself. */
  path: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the header under the page title. */
  description?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  /** Secondary groups start collapsed; they are read, not worked in. */
  collapsedByDefault?: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Live',
    items: [
      { path: '', label: 'Overview', icon: LayoutDashboard, description: 'The state of the board at a glance' },
      { path: 'activity', label: 'Activity', icon: Zap, description: 'Live feed of logons, doors and transfers' },
      { path: 'nodes', label: 'Nodes', icon: Monitor, description: 'Live nodes, supervisor commands and per-node settings' },
      { path: 'operator-chat', label: 'Operator Chat', icon: MessageSquare, description: 'Answer a caller paging the sysop' },
    ],
  },
  {
    title: 'People',
    items: [
      { path: 'users', label: 'Users', icon: Users, description: 'Accounts, levels and flags' },
      { path: 'security', label: 'Access Levels', icon: Shield, description: 'Access/ACS.<level>.info permission sets' },
    ],
  },
  {
    title: 'Content',
    items: [
      { path: 'conferences', label: 'Conferences', icon: MessageSquare, description: 'Message areas, and the file paths that belong to them' },
      { path: 'doors', label: 'Doors', icon: DoorOpen, description: 'External programs on the command menu' },
      { path: 'globalwall', label: 'Global Wall', icon: Globe, description: 'Messages left for everyone' },
    ],
  },
  {
    title: 'System',
    items: [
      { path: 'system', label: 'Configuration', icon: Settings, description: 'bbsConfig.info, section by section' },
      { path: 'config-files', label: 'Configuration Files', icon: FolderOpen, description: 'System, AmiXnet, batch and any other .info file' },
      { path: 'lookup-tables', label: 'Lookup Tables', icon: Boxes, description: 'Computers, screen types, languages, protocols and file checkers' },
      { path: 'health', label: 'Health and Deployment', icon: Gauge, description: 'Filesystem audit, build and container state' },
    ],
  },
  {
    title: 'Diagnostics',
    collapsedByDefault: true,
    items: [
      { path: 'statistics', label: 'Statistics', icon: Activity, description: 'All-time and session totals' },
      { path: 'logs', label: 'System Logs', icon: FileText, description: 'Backend and BBS log files' },
      { path: 'session-logs', label: 'Session Logs', icon: History, description: 'Replay a caller session' },
      { path: 'audit', label: 'Audit Log', icon: History, description: 'Who changed what, and when' },
      { path: 'import-export', label: 'Import and Export', icon: ArrowUpDown, description: 'Move configuration in and out' },
    ],
  },
];

/** Flat view, for the header title and the breadcrumb. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export function navItemForPath(pathname: string): NavItem | undefined {
  const relative = pathname.replace(/^\/admin\/?/, '').replace(/\/$/, '');
  return NAV_ITEMS.find((item) => item.path === relative);
}

export function groupForPath(pathname: string): NavGroup | undefined {
  const item = navItemForPath(pathname);
  if (!item) return undefined;
  return NAV_GROUPS.find((group) => group.items.includes(item));
}
