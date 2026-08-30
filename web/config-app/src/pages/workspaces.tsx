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
import { AmiXnetPage } from './AmiXnetPage';
import { BatchEditorPage } from './BatchEditorPage';
import { InfoEditorPage } from './InfoEditorPage';
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
 * Four editors over the same kind of file. System Files, AmiXnet and the
 * Tooltype editor all declare the identical Tooltype shape and all call
 * updateInfoFile; Batch Editor is a text editor over batch*.info. One
 * destination, four scopes.
 */
const CONFIG_FILE_TABS: TabDefinition[] = [
  { id: 'system', label: 'System files', render: () => <SystemFilesPage /> },
  { id: 'amixnet', label: 'AmiXnet', render: () => <AmiXnetPage /> },
  { id: 'batch', label: 'Batch scripts', render: () => <BatchEditorPage /> },
  { id: 'tooltypes', label: 'Any .info file', render: () => <InfoEditorPage /> },
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
