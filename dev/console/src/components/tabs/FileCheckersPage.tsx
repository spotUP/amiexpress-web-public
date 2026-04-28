import React from 'react';
import { CrudList } from '../CrudList.js';
import { getFileCheckers, createFileChecker, updateFileChecker, deleteFileChecker } from '../../api/client.js';
import type { FileCheckerRow } from '../../api/types.js';

export function FileCheckersPage() {
  return (
    <CrudList<FileCheckerRow>
      title="FILE CHECKERS"
      columns={[
        { label: 'ID',      render: r => String(r.id),           width: 6 },
        { label: 'NAME',    render: r => r.name,                 width: 24 },
        { label: 'COMMAND', render: r => r.command ?? '—',       width: 28 },
        { label: 'ENABLED', render: r => r.enabled ? 'yes' : 'no', width: 8 },
      ]}
      editFields={[
        { key: 'name',    label: 'Name',    type: 'string' },
        { key: 'command', label: 'Command', type: 'string' },
        { key: 'enabled', label: 'Enabled', type: 'bool'   },
      ]}
      getAll={getFileCheckers}
      create={createFileChecker}
      update={updateFileChecker}
      remove={deleteFileChecker}
    />
  );
}
