import React, { useState } from 'react';
import { Box, useInput } from 'ink';
import { ComputersPage } from './ComputersPage.js';
import { ScreenTypesPage } from './ScreenTypesPage.js';
import { LanguagesPage } from './LanguagesPage.js';
import { ProtocolsPage } from './ProtocolsPage.js';
import { FileCheckersPage } from './FileCheckersPage.js';
import { TabBar } from '../shared/TabBar.js';
import { isTextEntryActive } from '../../state/text-entry-lock.js';

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

  // Every one of these five tabs is a CrudList, and CrudList now locks text
  // entry during search/edit/new/delete-confirm (several of those fields are
  // digits) — without this guard, typing "1".."5" into any of them would
  // ALSO switch this wrapper's tab and unmount the form. See
  // dev/console/src/state/text-entry-lock.ts.
  useInput((input) => {
    if (isTextEntryActive()) return;
    if (input === '1') setTab('computers');
    if (input === '2') setTab('screen-types');
    if (input === '3') setTab('languages');
    if (input === '4') setTab('protocols');
    if (input === '5') setTab('file-checkers');
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      </Box>
      {tab === 'computers' && <ComputersPage />}
      {tab === 'screen-types' && <ScreenTypesPage />}
      {tab === 'languages' && <LanguagesPage />}
      {tab === 'protocols' && <ProtocolsPage />}
      {tab === 'file-checkers' && <FileCheckersPage />}
    </Box>
  );
}
