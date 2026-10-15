import React from 'react';
import { CrudList } from '../CrudList.js';
import { getDrives, createDrive, updateDrive, deleteDrive } from '../../api/client.js';
import type { DriveRow } from '../../api/types.js';

export function DrivesPage() {
  return (
    <CrudList<DriveRow>
      title="DRIVES"
      columns={[
        { label: '#',       render: r => String(r.drive_number),     width: 5 },
        { label: 'PATH',    render: r => r.drive_path,               width: 32 },
        { label: 'ENABLED', render: r => r.enabled ? 'yes' : 'no',   width: 8 },
      ]}
      editFields={[
        { key: 'drive_path', label: 'Path',    type: 'string' },
        { key: 'enabled',    label: 'Enabled', type: 'bool'   },
      ]}
      getAll={getDrives}
      create={createDrive}
      update={updateDrive}
      remove={deleteDrive}
    />
  );
}
