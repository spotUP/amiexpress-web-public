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
import { AccessAreasPage } from './AccessAreasPage';
import { DrivesPage } from './DrivesPage';
import { ComputersPage } from './ComputersPage';
import { ScreenTypesPage } from './ScreenTypesPage';
import { useAuth } from '../contexts/AuthContext';
import { ScreenFilesPage } from './ScreenFilesPage';
import { ArtistStudioPage } from './ArtistStudioPage';
import { ScreenThemesPage } from './ScreenThemesPage';
import { QuestionnairePage } from './QuestionnairePage';
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
  // Who may JOIN which conference, which is a different question from what the
  // conference is - and one nothing in the admin could answer before.
  { id: 'access-areas', label: 'Access areas', render: () => <AccessAreasPage /> },
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
  // The chat half. The three notification sections moved to their own
  // destination - same form, gated - because they were unfindable here:
  // "i think all notification settings deserves its own menu entry".
  { id: 'settings', label: 'Settings', render: () => <OperatorChatSettingsPage only="chat" /> },
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
/**
 * The screens, and the themes that are sets of them.
 *
 * One page because they are one subject: a theme IS a set of screen files, an
 * artist moves between "which themes exist" and "the files in mine" constantly,
 * and two nav entries made that a navigation problem.
 */
/** The board's own rule for who configures it, as theme-sandbox spells it. */
const SYSOP_LEVEL = 255;

const SCREEN_TABS: TabDefinition[] = [
  { id: 'files', label: 'Screen files', render: () => <ScreenFilesPage /> },
  { id: 'themes', label: 'Themes', render: () => <ScreenThemesPage /> },
  // The artist's own view of any theme. "as a sysop i need to be able to
  // personate a user/artist in the ansi studio to audit and fix issues in
  // their themes" - so a sysop gets the SAME page an artist gets, with every
  // theme in its picker, rather than a second tool that could disagree with it.
  { id: 'studio', label: 'Artist studio', render: () => <ArtistStudioPage /> },
  { id: 'questionnaire', label: 'Questionnaire', render: () => <QuestionnairePage /> },
];

/**
 * Two audiences, two views of one subject.
 *
 * A sysop configures the board's screens: the tables, the door art, the codes,
 * the duplicates, the list of what nothing reads. An artist redraws a theme,
 * and the sandbox already refuses them everything else - so the tabs were a
 * menu of 403s wrapped around the handful of files they may touch. The sysop,
 * 2026-09-08: "only sysops should see files with no art in them etc".
 */
export function ScreensWorkspace() {
  const { secLevel } = useAuth();
  if (secLevel < SYSOP_LEVEL) return <ArtistStudioPage />;
  return <TabbedWorkspace tabs={SCREEN_TABS} defaultTab="files" />;
}

export const WORKSPACE_TABS: Record<string, string[]> = {
  screens: SCREEN_TABS.map((tab) => tab.id),
  nodes: NODE_TABS.map((tab) => tab.id),
  conferences: CONFERENCE_TABS.map((tab) => tab.id),
  'lookup-tables': LOOKUP_TABS.map((tab) => tab.id),
  'config-files': CONFIG_FILE_TABS.map((tab) => tab.id),
  health: HEALTH_TABS.map((tab) => tab.id),
  'operator-chat': OPERATOR_CHAT_TABS.map((tab) => tab.id),
};
