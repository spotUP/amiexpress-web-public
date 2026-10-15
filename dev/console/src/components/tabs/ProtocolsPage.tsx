import React from 'react';
import { CrudList } from '../CrudList.js';
import { getProtocols, createProtocol, updateProtocol, deleteProtocol } from '../../api/client.js';
import type { ProtocolRow } from '../../api/types.js';

export function ProtocolsPage() {
  return (
    <CrudList<ProtocolRow>
      title="PROTOCOLS"
      columns={[
        { label: 'ID',      render: r => String(r.id),                width: 5 },
        { label: 'NAME',    render: r => r.protocol_name,             width: 22 },
        { label: 'CODE',    render: r => r.protocol_code ?? '—',      width: 22 },
        { label: 'DEFAULT', render: r => r.is_default ? 'yes' : 'no', width: 8 },
        { label: 'ENABLED', render: r => r.enabled ? 'yes' : 'no',    width: 8 },
      ]}
      editFields={[
        { key: 'protocol_name', label: 'Name',     type: 'string' },
        { key: 'protocol_code', label: 'Code',     type: 'string' },
        { key: 'command',       label: 'Command',  type: 'string' },
        { key: 'is_default',    label: 'Default?', type: 'bool'   },
        { key: 'enabled',       label: 'Enabled',  type: 'bool'   },
      ]}
      getAll={getProtocols}
      create={createProtocol}
      update={updateProtocol}
      remove={deleteProtocol}
    />
  );
}
