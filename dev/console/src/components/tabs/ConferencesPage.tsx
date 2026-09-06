import React, { useState } from 'react';
import { Box, useInput } from 'ink';
import { ConfsTab } from './ConfsTab.js';
import { DrivesPage } from './DrivesPage.js';
import { TabBar } from '../shared/TabBar.js';
import { isTextEntryActive } from '../../state/text-entry-lock.js';

type Tab = 'conferences' | 'file-areas';

const TABS: Array<{ id: Tab; label: string; hotkey: string }> = [
  { id: 'conferences', label: 'Conferences', hotkey: '1' },
  { id: 'file-areas',  label: 'File areas',  hotkey: '2' },
];

export function ConferencesPage() {
  const [tab, setTab] = useState<Tab>('conferences');

  // ConfsTab's create form and its orphan-directory typed confirmation both
  // collect digits and letters — without this guard, typing "1"/"2" into
  // either would ALSO switch this wrapper's tab and unmount the form. See
  // dev/console/src/state/text-entry-lock.ts.
  useInput((input) => {
    if (isTextEntryActive()) return;
    if (input === '1') setTab('conferences');
    if (input === '2') setTab('file-areas');
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      </Box>
      {tab === 'conferences' ? <ConfsTab /> : <DrivesPage />}
    </Box>
  );
}
