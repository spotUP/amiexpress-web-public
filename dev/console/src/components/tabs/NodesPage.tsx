import React, { useState } from 'react';
import { Box, useInput } from 'ink';
import { NodesTab } from './NodesTab.js';
import { NodeConfigPage } from './NodeConfigPage.js';
import { TabBar } from '../shared/TabBar.js';
import { isTextEntryActive } from '../../state/text-entry-lock.js';

type Tab = 'live' | 'configuration';

const TABS: Array<{ id: Tab; label: string; hotkey: string }> = [
  { id: 'live',          label: 'Live',          hotkey: '1' },
  { id: 'configuration', label: 'Configuration', hotkey: '2' },
];

export function NodesPage() {
  const [tab, setTab] = useState<Tab>('live');

  // NodeConfigPage's CrudList collects digits for node_number/priority/chat
  // colours; NodesTab collects a username for reservation. Without this
  // guard, typing "1" or "2" into either field would ALSO switch this
  // wrapper's tab and unmount the form underneath it — the exact defect
  // class wave 1 fixed for the sidebar and App.tsx's global hotkeys. See
  // dev/console/src/state/text-entry-lock.ts.
  useInput((input) => {
    if (isTextEntryActive()) return;
    if (input === '1') setTab('live');
    if (input === '2') setTab('configuration');
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      </Box>
      {tab === 'live' ? <NodesTab /> : <NodeConfigPage />}
    </Box>
  );
}
