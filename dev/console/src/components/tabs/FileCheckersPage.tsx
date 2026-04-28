import React from 'react';
import { CrudList } from '../CrudList.js';
import { getFileCheckers, createFileChecker, updateFileChecker, deleteFileChecker } from '../../api/client.js';
import type { FileCheckerRow } from '../../api/types.js';

export function FileCheckersPage() {
  return (
    <CrudList<FileCheckerRow>
      title="FILE CHECKERS"
      columns={[
        { label: 'ID',      render: r => String(r.id),               width: 5 },
        { label: 'NAME',    render: r => r.checker_name,             width: 16 },
        { label: 'PATH',    render: r => r.checker_path ?? '—',      width: 28 },
        { label: 'OPTS',    render: r => r.options ?? '—',           width: 8 },
        { label: 'ENABLED', render: r => r.enabled ? 'yes' : 'no',   width: 8 },
      ]}
      editFields={[
        { key: 'checker_name', label: 'Name',     type: 'string' },
        { key: 'checker_path', label: 'Path',     type: 'string' },
        { key: 'options',      label: 'Options',  type: 'string' },
        { key: 'priority',     label: 'Priority', type: 'number' },
        { key: 'enabled',      label: 'Enabled',  type: 'bool'   },
      ]}
      getAll={getFileCheckers}
      create={createFileChecker}
      update={updateFileChecker}
      remove={deleteFileChecker}
    />
  );
}
