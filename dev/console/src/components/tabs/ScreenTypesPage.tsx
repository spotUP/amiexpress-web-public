import React from 'react';
import { CrudList } from '../CrudList.js';
import { getScreenTypes, createScreenType, updateScreenType, deleteScreenType } from '../../api/client.js';
import type { ScreenTypeRow } from '../../api/types.js';

export function ScreenTypesPage() {
  return (
    <CrudList<ScreenTypeRow>
      title="SCREEN TYPES"
      columns={[
        { label: '#',       render: r => String(r.screen_number),    width: 5 },
        { label: 'TYPE',    render: r => r.screen_type,              width: 16 },
        { label: 'TITLE',   render: r => r.screen_title ?? '—',      width: 24 },
        { label: 'ENABLED', render: r => r.enabled ? 'yes' : 'no',   width: 8 },
      ]}
      editFields={[
        { key: 'screen_type',  label: 'Type',    type: 'string' },
        { key: 'screen_title', label: 'Title',   type: 'string' },
        { key: 'enabled',      label: 'Enabled', type: 'bool'   },
      ]}
      getAll={getScreenTypes}
      create={createScreenType}
      update={updateScreenType}
      remove={deleteScreenType}
    />
  );
}
