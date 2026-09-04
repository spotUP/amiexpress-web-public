import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { InfoFilesPage } from './InfoFilesPage.js';
import { BatchEditorPage } from './BatchEditorPage.js';

type Tab = 'system' | 'batch';

const TABS: Array<{ id: Tab; label: string; hotkey: string }> = [
  { id: 'system', label: 'All .info files', hotkey: '1' },
  { id: 'batch',  label: 'Batch scripts',  hotkey: '2' },
];

export function ConfigFilesPage() {
  const [tab, setTab] = useState<Tab>('system');

  useInput((input) => {
    if (input === '1') setTab('system');
    if (input === '2') setTab('batch');
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
      {tab === 'system' ? <InfoFilesPage /> : <BatchEditorPage />}
    </Box>
  );
}
