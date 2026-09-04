import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { ComputersPage } from './ComputersPage.js';
import { ScreenTypesPage } from './ScreenTypesPage.js';
import { LanguagesPage } from './LanguagesPage.js';
import { ProtocolsPage } from './ProtocolsPage.js';
import { FileCheckersPage } from './FileCheckersPage.js';

type Tab = 'computers' | 'screen-types' | 'languages' | 'protocols' | 'file-checkers';

const TABS: Array<{ id: Tab; label: string; hotkey: string }> = [
  { id: 'computers',     label: 'Computers',         hotkey: '1' },
  { id: 'screen-types',  label: 'Screen types',      hotkey: '2' },
  { id: 'languages',     label: 'Languages',         hotkey: '3' },
  { id: 'protocols',     label: 'Transfer protocols', hotkey: '4' },
  { id: 'file-checkers', label: 'File checkers',     hotkey: '5' },
];

export function LookupTablesPage() {
  const [tab, setTab] = useState<Tab>('computers');

  useInput((input) => {
    if (input === '1') setTab('computers');
    if (input === '2') setTab('screen-types');
    if (input === '3') setTab('languages');
    if (input === '4') setTab('protocols');
    if (input === '5') setTab('file-checkers');
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} flexWrap="wrap">
        {TABS.map((t, i) => (
          <Text key={t.id} bold={tab === t.id} color={tab === t.id ? 'cyan' : 'white'}>
            {i > 0 ? '  ' : ''}[{t.hotkey}] {t.label}
          </Text>
        ))}
      </Box>
      {tab === 'computers' && <ComputersPage />}
      {tab === 'screen-types' && <ScreenTypesPage />}
      {tab === 'languages' && <LanguagesPage />}
      {tab === 'protocols' && <ProtocolsPage />}
      {tab === 'file-checkers' && <FileCheckersPage />}
    </Box>
  );
}
