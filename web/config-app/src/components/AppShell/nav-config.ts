/**
 * The sidebar, as data.
 *
 * The old sidebar was 27 flat entries in the order they happened to be built,
 * with a 1 729-line configuration form as the home page. These are the same
 * destinations, grouped by what a sysop is actually doing, and landing on the
 * Overview instead.
 *
 * Pages are NOT merged here. The plan merges Nodes with Node Control, the four
 * tooltype editors into one file tree, and the five lookup tables into tabs -
 * each of those is its own phase with its own verification, because every one
 * of them is the only route to a piece of BBS configuration. Grouping first
 * means navigation improves without a single data path moving.
 */

import {
  Activity,
  ArrowUpDown,
  Boxes,
  DoorOpen,
  Download,
  Eye,
  FileCheck,
  FileText,
  FolderOpen,
  Gauge,
  Globe,
  HardDrive,
  History,
  Languages,
  LayoutDashboard,
  MessageSquare,
  Monitor,
  Network,
  Rocket,
  Server,
  Settings,
  Shield,
  SlidersHorizontal,
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
      { path: 'node-control', label: 'Node Control', icon: Monitor, description: 'Live nodes and supervisor commands' },
      { path: 'nodes', label: 'Node Configuration', icon: Server, description: 'Per-node settings written to disk' },
      { path: 'operator-chat', label: 'Operator Chat', icon: MessageSquare, description: 'Answer a caller paging the sysop' },
      { path: 'operator-chat-settings', label: 'Chat Settings', icon: Settings, description: 'Paging hours, alerts and away messages' },
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
      { path: 'conferences', label: 'Conferences', icon: MessageSquare, description: 'Message and file areas' },
      { path: 'drives', label: 'File Areas', icon: HardDrive, description: 'Upload and download paths per conference' },
      { path: 'doors', label: 'Doors', icon: DoorOpen, description: 'External programs on the command menu' },
      { path: 'globalwall', label: 'Global Wall', icon: Globe, description: 'Messages left for everyone' },
    ],
  },
  {
    title: 'System',
    items: [
      { path: 'system', label: 'Configuration', icon: Settings, description: 'bbsConfig.info, section by section' },
      { path: 'system-files', label: 'Configuration Files', icon: FolderOpen, description: 'Tooltype editor over the system .info files' },
      { path: 'tooltypes', label: 'Tooltype Editor', icon: SlidersHorizontal, description: 'Any .info file, tooltype by tooltype, with comment toggles' },
      { path: 'amixnet', label: 'AmiXnet Network', icon: Network, description: 'Network node and routing files' },
      { path: 'batches', label: 'Batch Editor', icon: FileText, description: 'batch*.info command scripts' },
      { path: 'health', label: 'Health Check', icon: Gauge, description: 'Filesystem and configuration audit' },
      { path: 'deployment', label: 'Deployment', icon: Rocket, description: 'Build, version and container state' },
    ],
  },
  {
    title: 'Lookup Tables',
    collapsedByDefault: true,
    items: [
      { path: 'computers', label: 'Computers', icon: Boxes, description: 'ComputerList.info' },
      { path: 'screen-types', label: 'Screen Types', icon: Eye, description: 'Terminal capabilities offered at login' },
      { path: 'languages', label: 'Languages', icon: Languages, description: 'Language sets available to callers' },
      { path: 'protocols', label: 'Transfer Protocols', icon: Download, description: 'Protocols/ transfer definitions' },
      { path: 'file-checkers', label: 'File Checkers', icon: FileCheck, description: 'Archive validation commands' },
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
