import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, Send, Eye, Palette, Copy, Monitor, ShieldCheck, AlertTriangle, UserCog, Archive } from 'lucide-react';

import { apiClient } from '../api/client';
import { Modal } from '../components/ui/Modal';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { ScreenPreviewPanel } from '../components/ScreenPreviewPanel';
import { SkeletonRows } from '../components/ui/states';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';

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
  /**
   * Set when a LIVE theme has stopped passing the rules it was published
   * under - the board gained a security variant this theme now shadows, or a
   * door one of its screens calls was removed. Null when there is nothing
   * wrong, and absent for a theme that is not live.
   */
  regressed: { blocking: number; advisory: number; first: string } | null;
}

/**
 * One thing wrong with a theme, as the server's validator names it.
 *
 * `blocking` stops publication; `advisory` never does. The page shows both and
 * decides nothing: which is which, and whether the theme may go live, is the
 * server's answer, because the server is what refuses.
 */
interface ThemeFinding {
  rule: string;
  severity: 'blocking' | 'advisory';
  file?: string;
  message: string;
}

interface ThemeValidation {
  slug: string;
  blocking: ThemeFinding[];
  advisory: ThemeFinding[];
  publishable: boolean;
  coverage: { provided: number; total: number };
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
  // Who is filling this in decides what the form asks for. A sysop assigns a
  // theme to somebody; an artist only ever makes their own, so asking them who
  // owns it is a question with one answer and a way to get it wrong - the
  // server forces it to their own account regardless.
  const { user, secLevel } = useAuth();
  const isSysop = secLevel >= 255;
  const myName = String((user as { username?: string } | null)?.username ?? '').trim();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  /** The theme a board screen is being copied into, and the screen to copy. */
  const [copyInto, setCopyInto] = useState<ScreenTheme | null>(null);
  const [copyPath, setCopyPath] = useState('');
  const [form, setForm] = useState({ slug: '', title: '', author: '', owner: '', widths: [80] as number[] });

  /**
   * The artist and the owner an artist gets: their own BBS name, both of them.
   *
   * The owner IS a BBS account - it is the account the sandbox lets write - and
   * the artist is how they are credited. For an artist creating their own
   * theme those are the same person, so neither is worth asking for.
   */
  const openCreate = () => {
    setForm({
      slug: '',
      title: '',
      author: isSysop ? '' : myName,
      owner: isSysop ? '' : myName,
      widths: [80],
    });
    setIsCreateOpen(true);
  };
  /*
   * The accounts a theme can be owned by.
   *
   * Ownership is not a label: the sandbox grants write access by matching this
   * name against the caller's account, so a typed name with a typo makes a
   * theme its artist cannot open. Only a sysop assigns it, so only a sysop
   * fetches the list.
   */
  const { data: userData } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.getUsers(),
    enabled: isSysop,
  });
  const usernames: string[] = (() => {
    const payload = (userData as { data?: unknown } | undefined)?.data;
    const list = (Array.isArray(payload) ? payload : (payload as { users?: unknown[] } | undefined)?.users) ?? [];
    return (list as Array<{ username?: string }>)
      .map(user => String(user?.username ?? '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  })();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['screen-themes'],
    queryFn: () => apiClient.getScreenThemes(),
  });

  /** The theme whose validation report is open. */
  const [checking, setChecking] = useState<ScreenTheme | null>(null);
  /** The theme being previewed; the caller to preview it as lives in the panel. */
  const [previewing, setPreviewing] = useState<ScreenTheme | null>(null);

  const payload = (data as { data?: { themes?: ScreenTheme[]; defaultSlug?: string; canCreate?: boolean } } | undefined)?.data;
  const themes = payload?.themes ?? EMPTY_THEMES;
  const defaultSlug = payload?.defaultSlug ?? 'default';
  const canCreate = payload?.canCreate ?? false;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['screen-themes'] });

  const { data: checkData, isLoading: isChecking } = useQuery({
    queryKey: ['screen-theme-validation', checking?.slug],
    queryFn: () => apiClient.getScreenThemeValidation(checking!.slug),
    enabled: checking !== null,
  });
  const report = (checkData as { data?: ThemeValidation } | undefined)?.data;


  /** The screens the board can display, for the preview's own picker. */
  const { data: indexData } = useQuery({
    queryKey: ['screen-index'],
    queryFn: () => apiClient.getScreenIndex(),
    enabled: previewing !== null,
  });
  const screenNames: string[] =
    ((indexData as { data?: { screens?: { screen: string }[] } } | undefined)?.data?.screens ?? [])
      .map(entry => entry.screen);

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

  /*
   * WHO MAY DRAW A THEME - including the board's own screens.
   *
   * The owner was settable only while CREATING a theme, so a theme created
   * without one (this board's `tango` has `OWNER.0` empty) could never be
   * handed to anybody, and the board's own screens - `default`, the entry that
   * has no directory - could not be handed to the artist drawing them: "also
   * tango needs to be able to do it as he will make it". The server has always
   * allowed a sysop to set an owner; there was no way to ask.
   */
  const ownerMutation = useMutation({
    mutationFn: ({ slug, owner }: { slug: string; owner: string }) =>
      apiClient.updateScreenTheme(slug, { owner }),
    onSuccess: (_result, variables) => {
      invalidate();
      showSuccess(variables.owner
        ? `"${variables.slug}" is ${variables.owner}'s to draw`
        : `"${variables.slug}" has no owner now`);
    },
    onError: (err: Error) => showError(`Could not change the owner: ${err.message}`),
  });

  async function handOver(theme: ScreenTheme) {
    const owner = window.prompt(
      theme.dir === ''
        ? "Which account may draw the board's own screens? (empty for nobody but sysops)"
        : `Which account owns "${theme.title}"? (empty for nobody)`,
      theme.owner,
    );
    if (owner === null) return;
    ownerMutation.mutate({ slug: theme.slug, owner: owner.trim() });
  }

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
    /*
     * Ask the server whether this theme can go live BEFORE offering to publish
     * it. The server refuses either way - the gate is on `PUT /api/themes` -
     * but a sysop who confirms a publish and then gets a 400 has been asked a
     * question the answer to which was already known.
     */
    try {
      const checked = await apiClient.getScreenThemeValidation(theme.slug);
      const verdict = (checked as { data?: ThemeValidation }).data;
      if (verdict && !verdict.publishable) {
        setChecking(theme);
        showError(
          `${theme.title} cannot go live yet: ${verdict.blocking.length} ${verdict.blocking.length === 1 ? 'problem' : 'problems'} to fix`,
        );
        return;
      }
    } catch (err) {
      showError(`Could not check the theme: ${(err as Error).message}`);
      return;
    }

    const answer = await confirm({
      title: `Publish "${theme.title}"?`,
      message: theme.screens === 0
        ? `${theme.title} carries no screens yet. Every screen a theme does not have falls back to the board's own art, so publishing it now changes nothing a caller sees.`
        : `Any caller will be able to wear ${theme.title}. Its ${theme.screens} screens replace the board's for anyone who selects it; everything else falls back to the board.`,
      confirmText: 'Publish',
    });
    if (answer) statusMutation.mutate({ slug: theme.slug, status: 'live' });
  }

  const retireMutation = useMutation({
    mutationFn: (slug: string) => apiClient.deleteScreenTheme(slug),
    onSuccess: (result: unknown) => {
      invalidate();
      const moved = (result as { data?: { movedTo?: string | null } })?.data?.movedTo;
      showSuccess(moved
        ? `Retired - its art is in Themes/${moved} and one move brings it back`
        : 'Retired');
    },
    onError: (err: Error) => showError(`Could not retire that theme: ${err.message}`),
  });

  /**
   * RETIRE, not delete - and the confirm says which.
   *
   * The board already tells an artist at five themes to "retire one before
   * starting another", so this is the thing it was asking for. The art is
   * moved aside rather than removed: a theme directory is somebody's drawings
   * and this is one click.
   */
  async function retire(theme: ScreenTheme) {
    const answer = await confirm({
      title: `Retire "${theme.title}"?`,
      message: theme.screens === 0
        ? `${theme.title} carries no screens, so nothing a caller sees changes. It comes off the list of themes.`
        : `${theme.title} comes off the list of themes. Its ${theme.screens} screens are MOVED ASIDE, not deleted - callers wearing it fall back to the board's own art, and the drawings can be put back.`,
      confirmText: 'Retire',
    });
    if (answer) retireMutation.mutate(theme.slug);
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
          <div className="text-xs text-content-secondary font-mono">{row.slug}</div>
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
    {
      id: 'status',
      header: 'Status',
      value: row => STATUS_LABEL[row.status],
      // A live theme that has gone wrong says so HERE, beside the word "Live"
      // that is no longer the whole truth. The board changes after a theme is
      // published and nothing used to look again.
      cell: row => (
        <span className="flex items-center gap-2">
          {STATUS_LABEL[row.status]}
          {row.regressed && row.regressed.blocking > 0 && (
            <span
              className="inline-flex items-center gap-1 text-status-warn"
              title={row.regressed.first}
            >
              <AlertTriangle size={14} />
              {row.regressed.blocking} to fix
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: row => (
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => setPreviewing(row)}
            title="Preview as a caller"
          >
            <Monitor size={16} />
          </button>
          {row.dir !== '' && (
            <button type="button" onClick={() => setChecking(row)} className="p-1 rounded hover:bg-surface-3 text-content-secondary hover:text-content-primary transition-colors" title="Check this theme">
              <ShieldCheck size={16} />
            </button>
          )}
          {row.writable && row.dir !== '' && (
            <button type="button" onClick={() => setCopyInto(row)} className="p-1 rounded hover:bg-surface-3 text-content-secondary hover:text-content-primary transition-colors" title="Start a screen from the board's">
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
            <button type="button" onClick={() => makeLive(row)} className="p-1 rounded hover:bg-surface-3 text-content-secondary hover:text-content-primary transition-colors" title="Publish">
              <Check size={16} />
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              onClick={() => handOver(row)}
              className="p-1 rounded hover:bg-surface-3 text-content-secondary hover:text-content-primary transition-colors"
              title={row.dir === ''
                ? "Choose who may draw the board's own screens"
                : 'Choose who owns this theme'}
            >
              <UserCog size={16} />
            </button>
          )}
          {canCreate && row.status === 'live' && row.slug !== defaultSlug && (
            <button type="button" onClick={() => makeDefault(row)} className="p-1 rounded hover:bg-surface-3 text-content-secondary hover:text-content-primary transition-colors" title="Make the board default">
              <Eye size={16} />
            </button>
          )}
          {/* RETIRE. Offered on a theme this account may WRITE and that is not
              the board default - the two the server refuses anyway, kept off
              the screen so nobody is invited to press something that answers
              409. An archive box rather than a bin, because the art is moved
              aside and not destroyed. */}
          {row.writable && row.dir !== '' && row.slug !== defaultSlug && (
            <button
              type="button"
              onClick={() => retire(row)}
              className="p-1 rounded hover:bg-surface-3 text-content-secondary hover:text-content-primary transition-colors"
              title="Retire this theme - its art is moved aside, not deleted"
            >
              <Archive size={16} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <header className="mb-4 flex items-start justify-between gap-4">
        {/* min-w-0 so the paragraph WRAPS instead of pushing the button; a flex
            child defaults to min-width:auto and refuses to shrink below its
            content, which squeezed the button until its own label broke over
            two lines. */}
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-content-primary"><Palette size={20} /> Screen Themes</h1>
          <p className="mt-1 text-sm text-content-secondary">
            A theme is a whole set of the board&apos;s art. A caller wears one; every screen it does
            not carry falls back to the board&apos;s own. Draw a theme&apos;s screens in the screen editor.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="btn-primary flex shrink-0 items-center space-x-2 whitespace-nowrap"
          >
            <Plus size={16} />
            <span>New theme</span>
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
        open={checking !== null}
        onClose={() => setChecking(null)}
        title={checking ? `Can "${checking.title}" be published?` : 'Theme check'}
        maxWidth="max-w-2xl"
      >
        {isChecking && <SkeletonRows rows={4} />}
        {report && (
          <div className="space-y-4" data-testid="theme-validation">
            <p className="text-sm">
              {report.publishable
                ? 'Nothing blocks this theme. A sysop can make it live.'
                : `${report.blocking.length} ${report.blocking.length === 1 ? 'problem has' : 'problems have'} to be fixed before this theme can go live.`}
            </p>

            {report.blocking.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-status-danger">Blocks publication</h2>
                <ul className="space-y-2 mt-2">
                  {report.blocking.map((finding, index) => (
                    <li key={`${finding.rule}-${index}`} className="text-sm">
                      {finding.file && <code className="text-xs text-ink-muted block">{finding.file}</code>}
                      {finding.message}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {report.advisory.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-status-warn">Worth knowing</h2>
                <ul className="space-y-2 mt-2">
                  {report.advisory.map((finding, index) => (
                    <li key={`${finding.rule}-${index}`} className="text-sm">
                      {finding.file && <code className="text-xs text-ink-muted block">{finding.file}</code>}
                      {finding.message}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end mt-4">
          <button type="button" onClick={() => setChecking(null)}>Close</button>
        </div>
      </Modal>

      <Modal
        open={previewing !== null}
        onClose={() => setPreviewing(null)}
        title={previewing ? `${previewing.title}, as a caller meets it` : 'Preview'}
        maxWidth="max-w-4xl"
      >
        {previewing && (
          <ScreenPreviewPanel
            theme={previewing.slug}
            themeTitle={previewing.title}
            screenNames={screenNames}
          />
        )}

        <div className="flex gap-2 justify-end mt-4">
          <button type="button" onClick={() => setPreviewing(null)}>Close</button>
        </div>
      </Modal>

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
          className="space-y-4"
        >
          <div>
            <label htmlFor="copy-path" className="label">The board screen to start from</label>
            <input
              id="copy-path"
              value={copyPath}
              onChange={event => setCopyPath(event.target.value)}
              placeholder="Screens/BULL.TXT"
              className="input-field w-full"
              required
            />
            <p className="mt-1 text-xs text-content-secondary">
              Its bytes are copied into the theme, where the screen editor can open them.
              <br />
              <code>Screens/BULL.TXT</code> becomes <code>Board/BULL.TXT</code>,{' '}
              <code>Conf1/MENU250.TXT</code> becomes <code>Conf/1/MENU250.TXT</code>, and a
              node&apos;s screen becomes <code>Node/&lt;name&gt;</code> - one Node directory serves
              every node.
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button type="button" onClick={() => setCopyInto(null)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={copyMutation.isPending}>
              {copyMutation.isPending ? 'Copying...' : 'Copy in'}
            </button>
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
          className="space-y-4"
        >
          <div>
            <label htmlFor="theme-slug" className="label">Slug</label>
            <input
              id="theme-slug"
              value={form.slug}
              onChange={event => setForm({ ...form, slug: event.target.value })}
              placeholder="neon"
              className="input-field w-full"
              required
            />
            <p className="mt-1 text-xs text-content-secondary">
              Lowercase letters, digits and hyphens. It becomes the directory name and never changes.
            </p>
          </div>

          <div className={isSysop ? 'grid grid-cols-2 gap-4' : ''}>
            <div>
              <label htmlFor="theme-title" className="label">Title</label>
              <input
                id="theme-title"
                value={form.title}
                onChange={event => setForm({ ...form, title: event.target.value })}
                placeholder="Neon"
                className="input-field w-full"
                required
              />
            </div>
            {isSysop && (
              <div>
                <label htmlFor="theme-author" className="label">Artist</label>
                <input
                  id="theme-author"
                  value={form.author}
                  onChange={event => setForm({ ...form, author: event.target.value })}
                  placeholder="How they want to be credited"
                  className="input-field w-full"
                />
              </div>
            )}
          </div>

          {isSysop ? (
            <div>
              <label htmlFor="theme-owner" className="label">Owned by</label>
              <select
                id="theme-owner"
                value={form.owner}
                onChange={event => setForm({ ...form, owner: event.target.value })}
                className="input-field w-full"
              >
                <option value="">Sysops only</option>
                {usernames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-content-secondary">
                That account may edit this theme&apos;s screens in the editor, and nothing else on
                the board. Leave it empty and only sysops can draw it.
              </p>
            </div>
          ) : (
            <p className="text-xs text-content-secondary">
              This theme will be yours, credited to <span className="font-mono">{myName}</span>. Only
              a sysop can make a theme for somebody else.
            </p>
          )}

          <div className="flex justify-end space-x-2 pt-2">
            <button type="button" onClick={() => setIsCreateOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
