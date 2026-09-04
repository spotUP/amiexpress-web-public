import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { ConfsTab } from './ConfsTab.js';
import { DrivesPage } from './DrivesPage.js';

type Tab = 'conferences' | 'file-areas';

const TABS: Array<{ id: Tab; label: string; hotkey: string }> = [
  { id: 'conferences', label: 'Conferences', hotkey: '1' },
  { id: 'file-areas', label: 'File areas',   hotkey: '2' },
];

export function ConferencesPage() {
  const [tab, setTab] = useState<Tab>('conferences');

  useInput((input) => {
    if (input === '1') setTab('conferences');
    if (input === '2') setTab('file-areas');
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        {TABS.map((t, i) => (
          <Text key={t.id} bold={tab === t.id} color={tab === t.id ? 'cyan' : 'white'}>
            {i > 0 ? '  ' : ''}[{t.hotkey}] {t.label}
          </Text>
        ))}
      </Box>
      {tab === 'conferences' ? <ConfsTab /> : <DrivesPage />}
    </Box>
  );
}
