import React from 'react';
import { CrudList } from '../CrudList.js';
import { getComputers, createComputer, updateComputer, deleteComputer } from '../../api/client.js';
import type { ComputerRow } from '../../api/types.js';

export function ComputersPage() {
  return (
    <CrudList<ComputerRow>
      title="COMPUTERS"
      columns={[
        { label: '#',       render: r => String(r.computer_number),  width: 5 },
        { label: 'NAME',    render: r => r.computer_name,            width: 32 },
        { label: 'ENABLED', render: r => r.enabled ? 'yes' : 'no',   width: 8 },
      ]}
      editFields={[
        { key: 'computer_name', label: 'Name',    type: 'string' },
        { key: 'enabled',       label: 'Enabled', type: 'bool'   },
      ]}
      getAll={getComputers}
      create={createComputer}
      update={updateComputer}
      remove={deleteComputer}
    />
  );
}
