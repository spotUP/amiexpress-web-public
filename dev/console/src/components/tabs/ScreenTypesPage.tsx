import React from 'react';
import { CrudList } from '../CrudList.js';
import { getScreenTypes, createScreenType, updateScreenType, deleteScreenType } from '../../api/client.js';
import type { ScreenTypeRow } from '../../api/types.js';

export function ScreenTypesPage() {
  return (
    <CrudList<ScreenTypeRow>
      title="SCREEN TYPES"
      columns={[
        { label: 'ID',    render: r => String(r.id), width: 6 },
        { label: 'NAME',  render: r => r.name,       width: 24 },
        { label: 'TITLE', render: r => r.title ?? '—', width: 28 },
      ]}
      editFields={[
        { key: 'name',  label: 'Name',  type: 'string' },
        { key: 'title', label: 'Title', type: 'string' },
      ]}
      getAll={getScreenTypes}
      create={createScreenType}
      update={updateScreenType}
      remove={deleteScreenType}
    />
  );
}
