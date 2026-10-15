import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Crown, Plus, Search, X } from 'lucide-react';
import {
  frontLead,
  frontMove,
  frontToggle,
} from '@amiexpress/bbs-door-sdk/formats/magazine';
import { apiClient } from '../api/client';
import { useAutosave } from '../hooks/useAutosave';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { EmptyState, ErrorPanel, SkeletonRows } from '../components/ui/states';
import type { MagazineStorySummary } from '../types/magazine';
import { ALL_DESKS, deskOptions, filterCandidates, frontStories } from './magazine-front-view';

/**
 * THE UNKNOWN FREQUENCY, front page.
 *
 * Left: every article the reader would list. Right: the front page in order,
 * the first story leading. The list saves itself, like every other admin
 * editor ("no save buttons at all in the admin ui", sysop, 2026-09-14); the
 * board writes Magazine/frontpage.json and rebuilds the teletext pages, so the
 * change is on page 100 as soon as the toast says so. Drag to reorder is not
 * offered: nothing else in this admin drags, and the move buttons do the job
 * from the keyboard.
 */
export function MagazinePage() {
  const query = useQuery({
    queryKey: ['magazine-front'],
    queryFn: async () => (await apiClient.getMagazineFront()).data,
  });
  const stories = query.data?.stories;
  const [front, setFront] = useState<string[]>([]);
  const [desk, setDesk] = useState(ALL_DESKS);
  const [search, setSearch] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);

  // The board's order seeds the editor once per load; edits are local from then on.
  useEffect(() => {
    if (query.data) setFront(query.data.front);
  }, [query.data]);

  const autosave = useAutosave<string[]>({
    save: async (ids) => {
      const res = await apiClient.saveMagazineFront(ids);
      if (!res?.success) throw new Error('The board did not accept the front page');
    },
    label: () => 'Front page saved and teletext page 100 rebuilt',
  });

  const edit = (next: string[]) => {
    setFront(next);
    autosave.schedule(next);
  };

  const all = stories ?? [];
  const candidates = filterCandidates(all, { desk, query: search });
  const onFront = frontStories(front, all);
  const desks = deskOptions(all);

  const preview = useQuery({
    queryKey: ['magazine-story', previewId],
    queryFn: async () => (await apiClient.getMagazineStory(previewId as string)).data,
    enabled: previewId !== null,
  });

  const columns: DataTableColumn<MagazineStorySummary>[] = [
    { id: 'headline', header: 'Headline', value: (s) => s.headline, cell: (s) => <span className="text-content-primary">{s.headline}</span> },
    { id: 'desk', header: 'Desk', value: (s) => s.deskLabel, width: '9rem' },
    { id: 'source', header: 'Source', value: (s) => s.source, width: '10rem' },
    { id: 'date', header: 'Date', value: (s) => s.date, mono: true, width: '7rem' },
    { id: 'length', header: 'Characters', value: (s) => s.bodyLength, align: 'right', mono: true, width: '6rem' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-content-primary">Magazine</h2>
        <p className="mt-1 text-xs text-content-secondary">
          THE UNKNOWN FREQUENCY. Choose the articles on the front page and put the lead first. Only
          full articles are listed; a teaser with no text is never shown to a caller. The same list
          is editable from the MAG door.
        </p>
      </div>

      {query.isLoading && <SkeletonRows rows={8} />}
      {query.isError && (
        <ErrorPanel message={(query.error as Error)?.message ?? 'Failed to load the magazine'} onRetry={() => query.refetch()} />
      )}

      {query.data && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section aria-label="Candidate articles" className="card space-y-3">
            <h3 className="text-sm font-medium text-content-primary">Articles ({candidates.length})</h3>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-control items-center rounded border border-border bg-surface-0 px-2">
                <Search size={14} className="text-content-muted" aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search headline, site or desk"
                  aria-label="Search articles"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-64 bg-transparent px-2 text-sm text-content-primary placeholder:text-content-muted focus:outline-none"
                />
              </div>
              <select
                aria-label="Filter by desk"
                value={desk}
                onChange={(e) => setDesk(e.target.value)}
                className="input-field h-control py-0"
              >
                <option value={ALL_DESKS}>All desks</option>
                {desks.map((d) => <option key={d.desk} value={d.desk}>{d.label}</option>)}
              </select>
            </div>
            <DataTable
              columns={columns}
              rows={candidates}
              getRowId={(s) => s.id}
              initialSort={[{ id: 'date', desc: true }]}
              emptyMessage="No article matches."
              selectedRowId={previewId ?? undefined}
              onRowClick={(s) => setPreviewId(s.id)}
              rowActions={(s) => (
                <button
                  type="button"
                  className="btn-small btn-secondary"
                  disabled={front.includes(s.id)}
                  aria-label={`Add ${s.headline} to the front page`}
                  onClick={(e) => {
                    e.stopPropagation();
                    edit(frontToggle(front, s.id));
                  }}
                >
                  <Plus size={14} aria-hidden="true" />
                  <span>Add</span>
                </button>
              )}
            />
          </section>

          <section aria-label="Front page" className="card space-y-3">
            <h3 className="text-sm font-medium text-content-primary">Front page ({onFront.length})</h3>
            {onFront.length === 0 ? (
              <EmptyState message="The front page is empty. Add an article from the list." />
            ) : (
              <ol className="space-y-2">
                {onFront.map((s, i) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 rounded border border-border bg-surface-0 p-2"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setPreviewId(s.id)}
                    >
                      {i === 0 && (
                        <span className="mr-2 rounded-sm bg-accent px-1 text-xs font-medium text-content-inverse">Lead</span>
                      )}
                      <span className="text-sm text-content-primary">{s.headline}</span>
                      <span className="ml-2 text-xs text-content-muted">{s.deskLabel}</span>
                    </button>
                    <button
                      type="button"
                      className="btn-small btn-secondary"
                      aria-label={`Move ${s.headline} up`}
                      disabled={i === 0}
                      onClick={() => edit(frontMove(front, s.id, -1))}
                    >
                      <ArrowUp size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="btn-small btn-secondary"
                      aria-label={`Move ${s.headline} down`}
                      disabled={i === onFront.length - 1}
                      onClick={() => edit(frontMove(front, s.id, 1))}
                    >
                      <ArrowDown size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="btn-small btn-secondary"
                      aria-label={`Make ${s.headline} the lead`}
                      disabled={i === 0}
                      onClick={() => edit(frontLead(front, s.id))}
                    >
                      <Crown size={14} aria-hidden="true" />
                      <span>Make lead</span>
                    </button>
                    <button
                      type="button"
                      className="btn-small btn-secondary text-status-danger"
                      aria-label={`Remove ${s.headline} from the front page`}
                      onClick={() => edit(frontToggle(front, s.id))}
                    >
                      <X size={14} aria-hidden="true" />
                      <span>Remove</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}

      {previewId && (
        <section aria-label="Article preview" className="card space-y-2">
          {preview.isLoading && <SkeletonRows rows={4} />}
          {preview.isError && <ErrorPanel message="This article could not be loaded." onRetry={() => preview.refetch()} />}
          {preview.data && (
            <>
              <h3 className="text-base font-semibold text-content-primary">{preview.data.headline}</h3>
              <p className="text-xs text-content-secondary">
                {preview.data.deskLabel} - {preview.data.source} - {preview.data.date}
              </p>
              <p className="whitespace-pre-wrap text-sm text-content-primary">{preview.data.body}</p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
