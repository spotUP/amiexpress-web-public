import { useCallback, useEffect, useState } from 'react';
import { MENU_KINDS, type MenuKind } from '@bbs/screens/menu-config/menu-config';
import { apiClient, type MenuEntryRow } from '../api/client';
import { TabbedWorkspace, type TabDefinition } from '../components/ui/Tabs';
import { SkeletonRows } from '../components/ui/states';
import { useMenuConfig } from '../components/menus/useMenuConfig';
import { MenuEntriesEditor } from '../components/menus/MenuEntriesEditor';
import { MenuSectionsEditor } from '../components/menus/MenuSectionsEditor';
import { MenuLevelsEditor } from '../components/menus/MenuLevelsEditor';
import { MenuWipesCard } from '../components/menus/MenuWipesCard';
import { MenuOverflowCard } from '../components/menus/MenuOverflowCard';
import { MenuC64Builder } from '../components/menus/MenuC64Builder';
import { MenuPreview } from '../components/menus/MenuPreview';

const KIND_LABEL: Record<MenuKind, string> = { MAIN: 'Main menu', BULLETINS: 'Bulletins' };

function MenuKindPanel({ kind }: { kind: MenuKind }) {
  const { config, problems, update, status, saves } = useMenuConfig(kind);
  const [rows, setRows] = useState<MenuEntryRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [rowsError, setRowsError] = useState<Error | null>(null);

  const loadRows = useCallback(() => {
    setRowsLoading(true);
    setRowsError(null);
    apiClient.menuEntries(kind).then(setRows, (e: unknown) => setRowsError(e instanceof Error ? e : new Error('Failed to list the menu entries'))).finally(() => setRowsLoading(false));
  }, [kind]);
  useEffect(loadRows, [loadRows]);

  if (!config) return status ? <p className="text-sm text-status-danger">{status}</p> : <SkeletonRows rows={6} />;

  const parts: TabDefinition[] = [
    { id: 'entries', label: kind === 'BULLETINS' ? 'Bulletins' : 'Entries', render: () => <MenuEntriesEditor kind={kind} config={config} rows={rows} loading={rowsLoading} error={rowsError} onRetry={loadRows} update={update} /> },
    { id: 'sections', label: 'Sections', render: () => <MenuSectionsEditor config={config} rows={rows} rowsReady={!rowsLoading && !rowsError} update={update} /> },
    { id: 'levels', label: 'Levels', render: () => <MenuLevelsEditor config={config} rows={rows} update={update} /> },
    { id: 'c64', label: 'C64 menu', render: () => <MenuC64Builder config={config} rows={rows} update={update} /> },
    { id: 'wipes', label: 'Wipes', render: () => <MenuWipesCard config={config} update={update} /> },
    { id: 'overflow', label: 'Overflow', render: () => <MenuOverflowCard config={config} update={update} /> },
  ];

  return (
    <div className="space-y-3">
      {status && <p className="text-sm text-status-danger">{status}</p>}
      {problems.length > 0 && (
        <ul className="text-sm text-status-danger space-y-1">
          {problems.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <TabbedWorkspace tabs={parts} param="part" />
        <MenuPreview kind={kind} saves={saves} />
      </div>
    </div>
  );
}

export function MenusPage() {
  const kinds: TabDefinition[] = MENU_KINDS.map(kind => ({ id: kind.toLowerCase(), label: KIND_LABEL[kind], render: () => <MenuKindPanel kind={kind} /> }));
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-content-primary">Main Menu and Bulletins</h2>
        <p className="text-xs text-content-secondary mt-1">
          The main menu and the bulletins menu the caller sees as doors: what they list, how it is grouped, who sees what, and how it changes screen. Changes save themselves.
        </p>
      </div>
      <TabbedWorkspace tabs={kinds} />
    </div>
  );
}
