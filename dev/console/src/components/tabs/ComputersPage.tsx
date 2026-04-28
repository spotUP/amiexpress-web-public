import React from 'react';
import { CrudList } from '../CrudList.js';
import { getComputers, createComputer, updateComputer, deleteComputer } from '../../api/client.js';
import type { ComputerRow } from '../../api/types.js';

export function ComputersPage() {
  return (
    <CrudList<ComputerRow>
      title="COMPUTERS"
      columns={[
        { label: 'ID',   render: r => String(r.id), width: 6 },
        { label: 'NAME', render: r => r.name,       width: 40 },
      ]}
      editFields={[
        { key: 'name', label: 'Name', type: 'string' },
      ]}
      getAll={getComputers}
      create={createComputer}
      update={updateComputer}
      remove={deleteComputer}
    />
  );
}
