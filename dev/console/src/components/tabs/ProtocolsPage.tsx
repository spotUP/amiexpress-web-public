import React from 'react';
import { CrudList } from '../CrudList.js';
import { getProtocols, createProtocol, updateProtocol, deleteProtocol } from '../../api/client.js';
import type { ProtocolRow } from '../../api/types.js';

export function ProtocolsPage() {
  return (
    <CrudList<ProtocolRow>
      title="PROTOCOLS"
      columns={[
        { label: 'ID',      render: r => String(r.id),           width: 6 },
        { label: 'NAME',    render: r => r.name,                 width: 20 },
        { label: 'CMD',     render: r => r.command ?? '—',       width: 16 },
        { label: 'DEFAULT', render: r => r.default_for ?? '—',   width: 12 },
        { label: 'ENABLED', render: r => r.enabled ? 'yes' : 'no', width: 8 },
      ]}
      editFields={[
        { key: 'name',       label: 'Name',       type: 'string' },
        { key: 'command',    label: 'Command',    type: 'string' },
        { key: 'default_for', label: 'Default For', type: 'string' },
        { key: 'enabled',    label: 'Enabled',    type: 'bool'   },
      ]}
      getAll={getProtocols}
      create={createProtocol}
      update={updateProtocol}
      remove={deleteProtocol}
    />
  );
}
