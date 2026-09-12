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
 * carries all four tooltype editors, Lookup Tables carries five small lists,
 * Health carries deployment, Operator Chat carries its settings, and Doors
 * carries what Global Wall used to configure. Each merged screen puts the
 * original pages behind tabs without touching what they write, and every path
 * they used to live at still resolves - routes/legacy-routes.ts is the
 * authority on what got folded where; this paragraph is a description of it,
 * not the other way around.
 */

import {
  Activity,
  Bell,
  ArrowUpDown,
  Boxes,
  Bot,
  DoorOpen,
  FileText,
  FolderOpen,
  Gauge,
  History,
  LayoutDashboard,
  MessageSquare,
  Monitor,
  Settings,
  Shield,
  Users,
  Zap,
  FileImage,
  Newspaper,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { sectionsMatching } from './page-sections';

export const ADMIN_BASE = '/admin';

export interface NavItem {
  /** Path relative to /admin, or '' for the Overview itself. */
  path: string;
  label: string;
  icon: LucideIcon;
  /** Minimum security level required to see this item. 255 = sysop. 100 = screen editor. */
  minLevel?: number;
  /** Shown in the header under the page title. */
  description?: string;
  /**
   * Vocabulary the sidebar filter also matches against, without showing it.
   * For a merged destination this is the names of what it absorbed - see
   * routes/legacy-routes.ts - so a sysop hunting the old name still finds it.
   */
  keywords?: string[];
  /**
   * Bot plugin id that owns this destination (bots/<id>/bot.json). The
   * Sidebar hides plugin destinations whose plugin is not installed - a
   * sysop who runs no bots never sees them, while the static route stays
   * so nav-routes.test.ts keeps passing.
   */
  plugin?: string;
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
      { path: '', label: 'Overview', icon: LayoutDashboard, minLevel: 100, description: 'The state of the board at a glance' },
      { path: 'activity', label: 'Activity', icon: Zap, minLevel: 255, description: 'Live feed of logons, doors and transfers' },
      { path: 'nodes', label: 'Nodes', icon: Monitor, minLevel: 255, description: 'Live nodes, supervisor commands and per-node settings', keywords: ['Node Control'] },
      { path: 'operator-chat', label: 'Operator Chat', icon: MessageSquare, minLevel: 255, description: 'Answer a caller paging the sysop', keywords: ['Operator Chat Settings', 'Paging Hours', 'Away Messages', 'Quiet Hours', 'AI Bot', 'Quick Replies', 'Page Sysop'] },
      { path: 'operator-chat/personas', label: 'Co-Sysop Personas', icon: Bot, minLevel: 255, description: 'Who answers a page — the cast and the builder', keywords: ['personas', 'co-sysop', 'builder'] },
      // Its own destination since 2026-09-08. The switches were spread over a
      // header badge and three sections two thirds of the way down operator
      // chat settings: "i think all notification settings deserves its own
      // menu entry its to spread out now hard to find".
      { path: 'notifications', label: 'Notifications', icon: Bell, minLevel: 255, description: 'How the board reaches you when you are away from the admin', keywords: ['Notification', 'Notifications', 'Notification Settings', 'Push', 'Push Notifications', 'Desktop Notifications', 'Browser Notifications', 'Web Push', 'Alerts', 'Sound', 'Email', 'Webhook', 'VAPID', 'Subscribe', 'Unsubscribe', 'Service Worker', 'Pushover', 'ntfy', 'ntfy.sh', 'Phone', 'Mobile'] },
    ],
  },
  {
    title: 'People',
    items: [
      { path: 'users', label: 'Users', icon: Users, minLevel: 255, description: 'Accounts, levels and flags' },
      { path: 'security', label: 'Access Levels', icon: Shield, minLevel: 255, description: 'Access/ACS.<level>.info permission sets' },
      { path: 'admin-roles', label: 'Admin Roles', icon: Shield, minLevel: 255, description: 'Configure which security levels can access admin sections' },
    ],
  },
  {
    title: 'Content',
    items: [
      { path: 'conferences', label: 'Conferences', icon: MessageSquare, minLevel: 255, description: 'Message areas, and the file paths that belong to them', keywords: ['Drives', 'Drive Setup', 'File Areas', 'DLPATH', 'ULPATH', 'Storage', 'S3', 'Bucket', 'Pooled Storage', 'QUOTA', 'Cloud'] },
      { path: 'doors', label: 'Doors', icon: DoorOpen, minLevel: 255, description: 'External programs on the command menu', keywords: ['Global Wall'] },
      { path: 'screens', label: 'Screens', icon: FileImage, minLevel: 100, description: "Every screen the board can display, and the themes that are sets of them", keywords: ['Screen Files', 'Screen Themes', 'Theme', 'Themes', 'Artist', 'ANSI', 'PETSCII', 'RIP', 'Art'] },
      { path: 'sprite-manager', label: 'Sprite Manager', icon: FileImage, minLevel: 255, description: 'Upload and manage sprite sheets for installed doors' },
      { path: 'bulls', label: 'Bulls Menu', icon: Newspaper, minLevel: 255, description: 'Bulls.CFG: the bulletin menu of the 68K Bulls door' },
    ],
  },
  {
    title: 'System',
    items: [
      { path: 'system', label: 'Configuration', icon: Settings, minLevel: 255, description: 'bbsConfig.info, section by section' },
      { path: 'config-files', label: 'Configuration Files', icon: FolderOpen, minLevel: 255, description: 'Every .info file on the board, and the batch scripts', keywords: ['System Files', 'AmiXnet', 'Batches', 'Tooltypes'] },
      { path: 'lookup-tables', label: 'Lookup Tables', icon: Boxes, minLevel: 255, description: 'Computers, screen types, languages, protocols and file checkers', keywords: ['Computers', 'Screen Types', 'Languages', 'Protocols', 'File Checkers'] },
      { path: 'health', label: 'Health and Deployment', icon: Gauge, minLevel: 255, description: 'Filesystem audit, build and container state', keywords: ['Deployment'] },
    ],
  },
  {
    title: 'Diagnostics',
    collapsedByDefault: true,
    items: [
      { path: 'statistics', label: 'Statistics', icon: Activity, minLevel: 255, description: 'All-time and session totals' },
      { path: 'logs', label: 'System Logs', icon: FileText, minLevel: 255, description: 'Backend and BBS log files' },
      { path: 'session-logs', label: 'Session Logs', icon: History, minLevel: 255, description: 'Replay a caller session' },
      { path: 'audit', label: 'Audit Log', icon: History, minLevel: 255, description: 'Who changed what, and when' },
      { path: 'import-export', label: 'Import and Export', icon: ArrowUpDown, minLevel: 255, description: 'Move configuration in and out' },
    ],
  },
  {
    title: 'Bots',
    items: [
      { path: 'bots/whip', label: 'WHIP Bot', icon: Bot, minLevel: 255, plugin: 'whip', description: 'WHIP Discord mirror: status, logs and configuration', keywords: ['Discord', 'WHIP', 'Bot', 'Mirror', 'Link'] },
    ],
  },
];

/** Flat view, for the header title and the breadcrumb. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/**
 * The hardcoded minimum security level for a given admin path.
 * Used as fallback when live perms are unavailable (non-sysop users get 403).
 */
export function hardcodedMinLevel(path: string): number {
  const item = NAV_ITEMS.find((i) => i.path === path);
  return item?.minLevel ?? 255;
}

/**
 * Filter nav items/groups to only those the given security level can see.
 * Uses live permissions when available, otherwise falls back to hardcoded minLevel.
 * A missing minLevel defaults to 255 (sysop-only).
 *
 * Plugin destinations additionally need their plugin installed: pass the ids
 * from GET /api/config/bots, and anything whose plugin is absent is hidden.
 * Omitted (undefined) means "unknown, show" - the page itself renders the
 * not-installed state, so a backend hiccup never strands a setup flow.
 *
 * Live perms are keyed by first path segment (SysopRoute looks up 'bots' for
 * 'bots/whip'), so nested destinations check their own path first, then the
 * segment the guard will actually enforce.
 */
export function navItemsForLevel(
  secLevel: number,
  perms?: Record<string, number>,
  installedPlugins?: Set<string>
): NavGroup[] {
  return NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.plugin && installedPlugins && !installedPlugins.has(item.plugin)) return false;
        const segment = item.path.split('/')[0];
        const minLevel = perms?.[item.path] ?? (segment !== item.path ? perms?.[segment] : undefined) ?? item.minLevel ?? 255;
        return secLevel >= minLevel;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

export function navItemForPath(pathname: string): NavItem | undefined {
  const relative = pathname.replace(/^\/admin\/?/, '').replace(/\/$/, '');
  return NAV_ITEMS.find((item) => item.path === relative);
}

export function groupForPath(pathname: string): NavGroup | undefined {
  const item = navItemForPath(pathname);
  if (!item) return undefined;
  return NAV_GROUPS.find((group) => group.items.includes(item));
}

/**
 * Case-insensitive substring match against label, description and keywords -
 * and against what the destination CONTAINS.
 *
 * The second half is the whole point: `ftp` names no page, so the filter used
 * to answer "No destinations match" while four FTP fields sat inside
 * Configuration. A destination whose sections match is a destination the sysop
 * was looking for. See `page-sections.ts`.
 */
export function navItemMatchesQuery(item: NavItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const haystacks = [item.label, item.description, ...(item.keywords ?? [])];
  if (haystacks.some((text) => text?.toLowerCase().includes(needle))) return true;
  return sectionsMatching(item.path, query).length > 0;
}

/**
 * Filters groups down to the items matching the query, dropping any group
 * left with none. Pass groups already narrowed by navItemsForLevel so the
 * filter can never surface a destination the caller's level would hide.
 *
 * An empty (or whitespace-only) query returns the groups unchanged.
 */
export function filterNavGroups(groups: NavGroup[], query: string): NavGroup[] {
  if (!query.trim()) return groups;

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => navItemMatchesQuery(item, query)),
    }))
    .filter((group) => group.items.length > 0);
}
