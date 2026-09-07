import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, Send, Eye, Palette, Copy } from 'lucide-react';

import { apiClient } from '../api/client';
import { Modal } from '../components/ui/Modal';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { useNotification } from '../contexts/NotificationContext';

/**
 * Screen themes - a full set of the board's art, drawn by one artist, that a
 * caller can choose to wear.
 *
 * Not the door theme picker: that paints the inside of doors and is a separate
 * preference. This page names the SETS; the screen editor draws their files.
 *
 * Every permission shown here is the server's answer, carried on each row
 * (`mine`, `writable`, `wearable`) plus `canCreate`. A page that worked them
 * out for itself would be a second copy of the rules, and the copy drifts.
 */

interface ScreenTheme extends Record<string, unknown> {
  slug: string;
  title: string;
  author: string;
  owner: string;
  dir: string;
  widths: number[];
  doorTheme: string;
  status: 'draft' | 'review' | 'live';
  screens: number | null;
  exists: boolean;
  mine: boolean;
  wearable: boolean;
  writable: boolean;
}

const EMPTY_THEMES: ScreenTheme[] = [];

const STATUS_LABEL: Record<ScreenTheme['status'], string> = {
  draft: 'Draft',
  review: 'In review',
  live: 'Live',
};

export function ScreenThemesPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  /** The theme a board screen is being copied into, and the screen to copy. */
  const [copyInto, setCopyInto] = useState<ScreenTheme | null>(null);
  const [copyPath, setCopyPath] = useState('');
  const [form, setForm] = useState({ slug: '', title: '', author: '', owner: '', widths: [80] as number[] });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['screen-themes'],
    queryFn: () => apiClient.getScreenThemes(),
  });

  const payload = (data as { data?: { themes?: ScreenTheme[]; defaultSlug?: string; canCreate?: boolean } } | undefined)?.data;
  const themes = payload?.themes ?? EMPTY_THEMES;
  const defaultSlug = payload?.defaultSlug ?? 'default';
  const canCreate = payload?.canCreate ?? false;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['screen-themes'] });

  const createMutation = useMutation({
    mutationFn: () => apiClient.createScreenTheme(form),
    onSuccess: () => {
      invalidate();
      showSuccess(`Theme "${form.slug}" created - draw its screens in the screen editor`);
      setIsCreateOpen(false);
      setForm({ slug: '', title: '', author: '', owner: '', widths: [80] });
    },
    onError: (err: Error) => showError(`Could not create the theme: ${err.message}`),
  });

  const statusMutation = useMutation({
    mutationFn: ({ slug, status }: { slug: string; status: ScreenTheme['status'] }) =>
      apiClient.updateScreenTheme(slug, { status }),
    onSuccess: (_result, variables) => {
      invalidate();
      showSuccess(`"${variables.slug}" is now ${STATUS_LABEL[variables.status].toLowerCase()}`);
    },
    onError: (err: Error) => showError(`Could not change the status: ${err.message}`),
  });

  const copyMutation = useMutation({
    mutationFn: ({ slug, boardPath }: { slug: string; boardPath: string }) =>
      apiClient.copyScreenIntoTheme(slug, boardPath),
    onSuccess: () => {
      invalidate();
      showSuccess('Copied in - open it in the screen editor to redraw it');
      setCopyInto(null);
      setCopyPath('');
    },
    onError: (err: Error) => showError(`Could not copy that screen: ${err.message}`),
  });

  const defaultMutation = useMutation({
    mutationFn: (slug: string) => apiClient.setDefaultScreenTheme(slug),
    onSuccess: () => {
      invalidate();
      showSuccess('The board default is set - callers with no preference of their own wear it');
    },
    onError: (err: Error) => showError(`Could not set the board default: ${err.message}`),
  });

  async function makeLive(theme: ScreenTheme) {
    const answer = await confirm({
      title: `Publish "${theme.title}"?`,
      message: theme.screens === 0
        ? `${theme.title} carries no screens yet. Every screen a theme does not have falls back to the board's own art, so publishing it now changes nothing a caller sees.`
        : `Any caller will be able to wear ${theme.title}. Its ${theme.screens} screens replace the board's for anyone who selects it; everything else falls back to the board.`,
      confirmText: 'Publish',
    });
    if (answer) statusMutation.mutate({ slug: theme.slug, status: 'live' });
  }

  async function makeDefault(theme: ScreenTheme) {
    const answer = await confirm({
      title: `Make "${theme.title}" the board default?`,
      message: 'Every caller who has not chosen a theme of their own will wear this one. Callers who have chosen keep their choice.',
      confirmText: 'Set as default',
    });
    if (answer) defaultMutation.mutate(theme.slug);
  }

  const columns: DataTableColumn<ScreenTheme>[] = [
    {
      id: 'title',
      header: 'Theme',
      value: row => row.title,
      cell: row => (
        <div>
          <div>{row.title}{row.slug === defaultSlug ? ' (board default)' : ''}</div>
          <div className="text-xs text-ink-muted font-mono">{row.slug}</div>
        </div>
      ),
    },
    { id: 'author', header: 'Artist', value: row => row.author || '-' },
    { id: 'owner', header: 'Owned by', value: row => row.owner || '-', mono: true },
    {
      id: 'screens',
      header: 'Screens',
      align: 'right',
      mono: true,
      value: row => row.screens ?? 0,
      cell: row => (row.screens === null ? "the board's own" : String(row.screens)),
    },
    { id: 'widths', header: 'Widths', value: row => row.widths.join(', ') || '-' },
    { id: 'status', header: 'Status', value: row => STATUS_LABEL[row.status] },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: row => (
        <div className="flex gap-2 justify-end">
          {row.writable && row.dir !== '' && (
            <button type="button" onClick={() => setCopyInto(row)} title="Start a screen from the board's">
              <Copy size={16} />
            </button>
          )}
          {row.mine && row.status === 'draft' && (
            <button
              type="button"
              onClick={() => statusMutation.mutate({ slug: row.slug, status: 'review' })}
              title="Send for review"
            >
              <Send size={16} />
            </button>
          )}
          {canCreate && row.status !== 'live' && row.dir !== '' && (
            <button type="button" onClick={() => makeLive(row)} title="Publish">
              <Check size={16} />
            </button>
          )}
          {canCreate && row.status === 'live' && row.slug !== defaultSlug && (
            <button type="button" onClick={() => makeDefault(row)} title="Make the board default">
              <Eye size={16} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="flex items-center gap-2"><Palette size={20} /> Screen Themes</h1>
          <p className="text-sm text-ink-muted">
            A theme is a whole set of the board&apos;s art. A caller wears one; every screen it does
            not carry falls back to the board&apos;s own. Draw a theme&apos;s screens in the screen editor.
          </p>
        </div>
        {canCreate && (
          <button type="button" onClick={() => setIsCreateOpen(true)}>
            <Plus size={16} /> New theme
          </button>
        )}
      </header>

      <DataTable
        rows={themes}
        columns={columns}
        getRowId={row => row.slug}
        isLoading={isLoading}
        error={error instanceof Error ? error : null}
        onRetry={() => refetch()}
        emptyMessage="No themes yet. The board wears its own screens."
      />

      <Modal
        open={copyInto !== null}
        onClose={() => setCopyInto(null)}
        title={copyInto ? `Start a screen in ${copyInto.title}` : 'Start a screen'}
      >
        <form
          onSubmit={event => {
            event.preventDefault();
            if (copyInto) copyMutation.mutate({ slug: copyInto.slug, boardPath: copyPath });
          }}
        >
          <label htmlFor="copy-path">The board screen to start from</label>
          <input
            id="copy-path"
            value={copyPath}
            onChange={event => setCopyPath(event.target.value)}
            placeholder="Screens/BULL.TXT"
            required
          />
          <p className="text-xs text-ink-muted">
            Its bytes are copied into the theme, where the screen editor can open them.
            <br />
            <code>Screens/BULL.TXT</code> becomes <code>Board/BULL.TXT</code>,{' '}
            <code>Conf1/MENU250.TXT</code> becomes <code>Conf/1/MENU250.TXT</code>, and a node&apos;s
            screen becomes <code>Node/&lt;name&gt;</code> - one Node directory serves every node.
          </p>

          <div className="flex gap-2 justify-end mt-4">
            <button type="button" onClick={() => setCopyInto(null)}>Cancel</button>
            <button type="submit" disabled={copyMutation.isPending}>Copy in</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="New screen theme"
      >
        <form
          onSubmit={event => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <label htmlFor="theme-slug">Slug</label>
          <input
            id="theme-slug"
            value={form.slug}
            onChange={event => setForm({ ...form, slug: event.target.value })}
            placeholder="neon"
            required
          />
          <p className="text-xs text-ink-muted">
            Lowercase letters, digits and hyphens. It becomes the directory name and never changes.
          </p>

          <label htmlFor="theme-title">Title</label>
          <input
            id="theme-title"
            value={form.title}
            onChange={event => setForm({ ...form, title: event.target.value })}
            placeholder="Neon"
            required
          />

          <label htmlFor="theme-author">Artist</label>
          <input
            id="theme-author"
            value={form.author}
            onChange={event => setForm({ ...form, author: event.target.value })}
            placeholder="How they want to be credited"
          />

          <label htmlFor="theme-owner">Owned by</label>
          <input
            id="theme-owner"
            value={form.owner}
            onChange={event => setForm({ ...form, owner: event.target.value })}
            placeholder="Their BBS username"
          />
          <p className="text-xs text-ink-muted">
            That account may edit this theme&apos;s screens in the editor, and nothing else on the board.
            Leave it empty and only sysops can draw it.
          </p>

          <div className="flex gap-2 justify-end mt-4">
            <button type="button" onClick={() => setIsCreateOpen(false)}>Cancel</button>
            <button type="submit" disabled={createMutation.isPending}>Create</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
