import React from 'react';
import { CrudList } from '../CrudList.js';
import { getLanguages, createLanguage, updateLanguage, deleteLanguage } from '../../api/client.js';
import type { LanguageRow } from '../../api/types.js';

export function LanguagesPage() {
  return (
    <CrudList<LanguageRow>
      title="LANGUAGES"
      columns={[
        { label: 'ID',      render: r => String(r.id),           width: 6 },
        { label: 'NAME',    render: r => r.name,                 width: 24 },
        { label: 'CODE',    render: r => r.code ?? '—',          width: 8 },
        { label: 'ENABLED', render: r => r.enabled ? 'yes' : 'no', width: 8 },
      ]}
      editFields={[
        { key: 'name',    label: 'Name',    type: 'string' },
        { key: 'code',    label: 'Code',    type: 'string' },
        { key: 'enabled', label: 'Enabled', type: 'bool'   },
      ]}
      getAll={getLanguages}
      create={createLanguage}
      update={updateLanguage}
      remove={deleteLanguage}
    />
  );
}
