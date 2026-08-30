/**
 * The merged screens.
 *
 * Each one puts existing pages behind tabs and changes nothing inside them.
 * That is deliberate: several of these pages are the ONLY route to a piece of
 * BBS configuration - Access Levels is the only editor of
 * Access/ACS.<level>.info, Batch Editor the only editor of batch*.info, File
 * Areas the only editor of DLPATH.n and ULPATH.n - so the merge moves where a
 * screen lives without touching what it writes.
 *
 * Every path that used to reach one of these directly still resolves, as a
 * redirect carrying the right tab. See the legacy table in App.tsx and the
 * test that walks it.
 */

import { Suspense, lazy } from 'react';
import { TabbedWorkspace } from '../components/ui/Tabs';
import { SkeletonRows } from '../components/ui/states';
import type { TabDefinition } from '../components/ui/Tabs';
import { NodeControlPage } from './NodeControlPage';
import { NodesPage } from './NodesPage';
import { ConferencesPage } from './ConferencesPage';
import { DrivesPage } from './DrivesPage';
import { ComputersPage } from './ComputersPage';
import { ScreenTypesPage } from './ScreenTypesPage';
import { LanguagesPage } from './LanguagesPage';
import { ProtocolsPage } from './ProtocolsPage';
import { FileCheckersPage } from './FileCheckersPage';
import { SystemFilesPage } from './SystemFilesPage';
import { BatchEditorPage } from './BatchEditorPage';
import { HealthCheckPage } from './HealthCheckPage';
import { DeploymentPage } from './DeploymentPage';
import { OperatorChatSettingsPage } from './OperatorChatSettingsPage';

/** Operator Chat carries xterm; it stays out of the entry bundle. */
const OperatorChatPage = lazy(() =>
  import('./OperatorChatPage').then((module) => ({ default: module.OperatorChatPage }))
);

/** Nodes: the live view and the configuration of the same object. */
const NODE_TABS: TabDefinition[] = [
  { id: 'live', label: 'Live', render: () => <NodeControlPage /> },
  { id: 'configuration', label: 'Configuration', render: () => <NodesPage /> },
];

export function NodesWorkspace() {
  return <TabbedWorkspace tabs={NODE_TABS} defaultTab="live" />;
}

/**
 * Conferences and file areas both write Conf<N>.info - Drives edits DLPATH.n
 * and ULPATH.n on the same file the conference form already edits.
 */
const CONFERENCE_TABS: TabDefinition[] = [
  { id: 'conferences', label: 'Conferences', render: () => <ConferencesPage /> },
  { id: 'file-areas', label: 'File areas', render: () => <DrivesPage /> },
];

export function ConferencesWorkspace() {
  return <TabbedWorkspace tabs={CONFERENCE_TABS} defaultTab="conferences" />;
}

/** Five small lists of the same shape that nobody edits twice a year. */
const LOOKUP_TABS: TabDefinition[] = [
  { id: 'computers', label: 'Computers', render: () => <ComputersPage /> },
  { id: 'screen-types', label: 'Screen types', render: () => <ScreenTypesPage /> },
  { id: 'languages', label: 'Languages', render: () => <LanguagesPage /> },
  { id: 'protocols', label: 'Transfer protocols', render: () => <ProtocolsPage /> },
  { id: 'file-checkers', label: 'File checkers', render: () => <FileCheckersPage /> },
];

export function LookupTablesWorkspace() {
  return <TabbedWorkspace tabs={LOOKUP_TABS} defaultTab="computers" />;
}

/**
 * One tree over every .info file, and the one editor that is not a tooltype
 * editor at all.
 *
 * There used to be four tabs here, three of which were the same editor over
 * the same two endpoints - getInfoFile and updateInfoFile - differing only in
 * which files they chose to show. System Files already walks the whole BBS
 * root and groups what it finds by scope, so it was the tree the plan asked
 * for; AmiXnet was fourteen of those same files listed by hand, and "Any
 * .info file" was a third copy whose only distinctive feature was adding a
 * tooltype through a browser prompt().
 *
 * Both folded into the tree. The AmiXnet descriptions were the one thing
 * neither of the others had, so they moved to info-file-notes.ts and are
 * shown against those files wherever they appear.
 *
 * Batch scripts stays: batch*.info is edited as text, not as tooltypes, so
 * it is a different editor rather than a different scope.
 */
const CONFIG_FILE_TABS: TabDefinition[] = [
  { id: 'system', label: 'All .info files', render: () => <SystemFilesPage /> },
  { id: 'batch', label: 'Batch scripts', render: () => <BatchEditorPage /> },
];

export function ConfigFilesWorkspace() {
  return <TabbedWorkspace tabs={CONFIG_FILE_TABS} defaultTab="system" />;
}

/** What is wrong with the board, and what is running it. */
const HEALTH_TABS: TabDefinition[] = [
  { id: 'check', label: 'Health check', render: () => <HealthCheckPage /> },
  { id: 'deployment', label: 'Deployment', render: () => <DeploymentPage /> },
];

export function HealthWorkspace() {
  return <TabbedWorkspace tabs={HEALTH_TABS} defaultTab="check" />;
}

/** Answering a caller, and the rules for when they can page you. */
const OPERATOR_CHAT_TABS: TabDefinition[] = [
  {
    id: 'chat',
    label: 'Chat',
    // Stays mounted: a sysop opening Settings in the middle of a conversation
    // must not drop the conversation.
    keepMounted: true,
    render: () => (
      <Suspense fallback={<SkeletonRows rows={6} />}>
        <OperatorChatPage />
      </Suspense>
    ),
  },
  { id: 'settings', label: 'Settings', render: () => <OperatorChatSettingsPage /> },
];

export function OperatorChatWorkspace() {
  return <TabbedWorkspace tabs={OPERATOR_CHAT_TABS} defaultTab="chat" />;
}

/**
 * The tabs each workspace actually has, by the nav path that reaches it.
 *
 * LEGACY_ROUTES sends old paths to `destination?tab=<id>`, and nothing used
 * to check that the id existed - so collapsing two tabs into one would have
 * left two redirects pointing at tabs that were gone, landing the sysop on
 * the default tab with no indication anything had moved.
 */
export const WORKSPACE_TABS: Record<string, string[]> = {
  nodes: NODE_TABS.map((tab) => tab.id),
  conferences: CONFERENCE_TABS.map((tab) => tab.id),
  'lookup-tables': LOOKUP_TABS.map((tab) => tab.id),
  'config-files': CONFIG_FILE_TABS.map((tab) => tab.id),
  health: HEALTH_TABS.map((tab) => tab.id),
  'operator-chat': OPERATOR_CHAT_TABS.map((tab) => tab.id),
};
