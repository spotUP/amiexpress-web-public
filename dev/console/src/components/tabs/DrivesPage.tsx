import React from 'react';
import { CrudList } from '../CrudList.js';
import { getDrives, createDrive, updateDrive, deleteDrive } from '../../api/client.js';
import type { DriveRow } from '../../api/types.js';

export function DrivesPage() {
  return (
    <CrudList<DriveRow>
      title="DRIVES"
      columns={[
        { label: 'ID',    render: r => String(r.id), width: 6 },
        { label: 'PATH',  render: r => r.path,       width: 32 },
        { label: 'LABEL', render: r => r.label ?? '—', width: 20 },
      ]}
      editFields={[
        { key: 'path',  label: 'Path',  type: 'string' },
        { key: 'label', label: 'Label', type: 'string' },
      ]}
      getAll={getDrives}
      create={createDrive}
      update={updateDrive}
      remove={deleteDrive}
    />
  );
}
