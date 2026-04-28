import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { CrudList } from '../CrudList.js';
import { getSecurity, createSecurity, updateSecurity, deleteSecurity } from '../../api/client.js';
import type { SecurityRow } from '../../api/types.js';

// The security endpoint takes a level (1-255). Default to 255 (sysop).
// `[<]` and `[>]` step through 1-255 in increments of 5.
export function SecurityPage() {
  const [level, setLevel] = useState(255);

  useInput((input) => {
    if (input === '<') setLevel(l => Math.max(1, l - 5));
    if (input === '>') setLevel(l => Math.min(255, l + 5));
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">Security ACS · level {level}</Text>
        <Text dimColor>  [&lt;] [&gt;] step level by 5</Text>
      </Box>
      <CrudList<SecurityRow>
        title=""
        columns={[
          { label: 'ID',          render: r => String(r.id),               width: 5 },
          { label: 'LVL',         render: r => String(r.security_level),   width: 5 },
          { label: 'FLAG',        render: r => r.acs_flag,                 width: 24 },
          { label: 'ENABLED',     render: r => r.enabled ? 'yes' : 'no',   width: 8 },
          { label: 'DESCRIPTION', render: r => r.description ?? '—',       width: 32 },
        ]}
        editFields={[
          { key: 'security_level', label: 'Level',       type: 'number' },
          { key: 'acs_flag',       label: 'ACS flag',    type: 'string' },
          { key: 'enabled',        label: 'Enabled',     type: 'bool'   },
          { key: 'description',    label: 'Description', type: 'string' },
        ]}
        getAll={() => getSecurity(level)}
        create={createSecurity}
        update={updateSecurity}
        remove={deleteSecurity}
      />
    </Box>
  );
}
