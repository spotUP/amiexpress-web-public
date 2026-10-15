import { DESCRIPTION_MAX, type MenuConfig, type MenuKind } from '@bbs/screens/menu-config/menu-config';
import { DataTable, type DataTableColumn } from '../ui/DataTable';
import type { MenuEntryRow } from '../../api/client';
import { setDescription, setLabel, setPlacement } from './menu-edit';
import { INPUT_CLASS } from './menu-styles';

interface Props {
  kind: MenuKind;
  config: MenuConfig;
  rows: MenuEntryRow[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  update: (change: (c: MenuConfig) => MenuConfig) => void;
}

const SOURCE_WORDS: Record<MenuEntryRow['source'], string> = {
  internal: 'Board command', door: 'Door', syscmd: 'System command', bulletin: 'Bulletin',
};

/** One row per command the kind can list. Empty text means "use the default shown as the placeholder". */
export function MenuEntriesEditor({ kind, config, rows, loading, error, onRetry, update }: Props) {
  // A bulletin has a title, not a label; the board's default comes from Bulls.CFG.
  const word = kind === 'BULLETINS' ? 'Title' : 'Label';
  const columns: DataTableColumn<MenuEntryRow>[] = [
    { id: 'key', header: 'Key', value: r => r.key, mono: true },
    {
      id: 'label', header: word, sortable: false,
      cell: r => (
        <input
          aria-label={`${word} for ${r.key}`}
          className={INPUT_CLASS}
          value={config.labels[r.key] ?? ''}
          placeholder={r.label}
          onChange={e => update(c => setLabel(c, r.key, e.target.value))}
        />
      ),
    },
    {
      id: 'section', header: 'Section', sortable: false,
      cell: r => (
        <select
          aria-label={`Section for ${r.key}`}
          className={INPUT_CLASS}
          value={config.placement[r.key] ?? ''}
          onChange={e => update(c => setPlacement(c, r.key, e.target.value))}
        >
          <option value="">{config.sections.find(s => s.id === r.section)?.title ?? 'Default'} (default)</option>
          {config.sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      ),
    },
    {
      id: 'description', header: 'Description', sortable: false,
      cell: r => {
        const text = config.descriptions[r.key] ?? '';
        return (
          <div className="flex items-center gap-2">
            <input
              aria-label={`Description for ${r.key}`}
              className={INPUT_CLASS}
              maxLength={DESCRIPTION_MAX}
              value={text}
              placeholder={r.description}
              onChange={e => update(c => setDescription(c, r.key, e.target.value))}
            />
            <span className="text-xs text-content-secondary whitespace-nowrap">{text.length} / {DESCRIPTION_MAX}</span>
          </div>
        );
      },
    },
    { id: 'source', header: 'Source', value: r => SOURCE_WORDS[r.source] },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={r => r.key}
      isLoading={loading}
      error={error}
      onRetry={onRetry}
      emptyMessage="This menu lists nothing for the widest caller."
    />
  );
}
