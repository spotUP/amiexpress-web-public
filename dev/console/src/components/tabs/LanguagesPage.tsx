import React from 'react';
import { CrudList } from '../CrudList.js';
import { getLanguages, createLanguage, updateLanguage, deleteLanguage } from '../../api/client.js';
import type { LanguageRow } from '../../api/types.js';

export function LanguagesPage() {
  return (
    <CrudList<LanguageRow>
      title="LANGUAGES"
      columns={[
        { label: '#',       render: r => String(r.language_number),   width: 4 },
        { label: 'TITLE',   render: r => r.title ?? '—',              width: 28 },
        { label: 'CODE',    render: r => r.language_code ?? '—',      width: 6 },
        { label: 'ENABLED', render: r => r.enabled ? 'yes' : 'no',    width: 8 },
      ]}
      editFields={[
        { key: 'title',         label: 'Title',         type: 'string' },
        { key: 'language_code', label: 'Code',          type: 'string' },
        { key: 'file_path',     label: 'File path',     type: 'string' },
        { key: 'enabled',       label: 'Enabled',       type: 'bool'   },
      ]}
      getAll={getLanguages}
      create={createLanguage}
      update={updateLanguage}
      remove={deleteLanguage}
    />
  );
}
