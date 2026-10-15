import React, { useState } from 'react';
import { Box, useInput } from 'ink';
import { HealthCheckPage } from './HealthCheckPage.js';
import { DeploymentPage } from './DeploymentPage.js';
import { TabBar } from '../shared/TabBar.js';

type Tab = 'health' | 'deployment';

const TABS: Array<{ id: Tab; label: string; hotkey: string }> = [
  { id: 'health',     label: 'Health Check', hotkey: '1' },
  { id: 'deployment', label: 'Deployment',   hotkey: '2' },
];

export function HealthDeploymentPage() {
  const [tab, setTab] = useState<Tab>('health');

  useInput((input) => {
    if (input === '1') setTab('health');
    if (input === '2') setTab('deployment');
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      </Box>
      {tab === 'health' ? <HealthCheckPage /> : <DeploymentPage />}
    </Box>
  );
}
