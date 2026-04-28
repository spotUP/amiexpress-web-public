import React from 'react';
import { CrudList } from '../CrudList.js';
import { getSecurity, createSecurity, updateSecurity, deleteSecurity } from '../../api/client.js';
import type { SecurityRow } from '../../api/types.js';

export function SecurityPage() {
  return (
    <CrudList<SecurityRow>
      title="SECURITY"
      columns={[
        { label: 'ID',      render: r => String(r.id),            width: 6 },
        { label: 'LEVEL',   render: r => String(r.level),         width: 8 },
        { label: 'FLAG',    render: r => r.flag,                  width: 24 },
        { label: 'GRANTED', render: r => r.granted ? 'yes' : 'no', width: 10 },
      ]}
      editFields={[
        { key: 'level',   label: 'Level',   type: 'number' },
        { key: 'flag',    label: 'Flag',    type: 'string' },
        { key: 'granted', label: 'Granted', type: 'bool'   },
      ]}
      getAll={() => getSecurity(0)}
      create={createSecurity}
      update={updateSecurity}
      remove={deleteSecurity}
    />
  );
}
