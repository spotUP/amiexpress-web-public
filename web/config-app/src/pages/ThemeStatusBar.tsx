/**
 * Where an artist's theme stands, and the three things they can do about it.
 *
 * The artist's studio is one gallery and nothing else, so the theme's own
 * lifecycle lives here: what it is called, whether it is a draft, how much of
 * the board it covers, and - Check, Preview, Send for review. Publishing is
 * not offered: the server refuses it for a non-sysop, and a button that
 * always fails is worse than no button.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Monitor, Send, Eye } from 'lucide-react';

import { apiClient } from '../api/client';
import { artistThemeSlug, artistThemeTitle, nextFreeSlug } from './artist-theme';
import { Modal } from '../components/ui/Modal';
import { SkeletonRows } from '../components/ui/states';
import { ScreenPreviewPanel } from '../components/ScreenPreviewPanel';
import { useNotification } from '../contexts/NotificationContext';
import type { ArtistTheme } from './use-my-theme';

interface ThemeFinding {
  rule: string;
  severity: 'blocking' | 'advisory';
  file?: string;
  message: string;
}

interface ThemeValidation {
  blocking: ThemeFinding[];
  advisory: ThemeFinding[];
  publishable: boolean;
  coverage: { provided: number; total: number };
}

const STATUS_LABEL: Record<ArtistTheme['status'], string> = {
  draft: 'Draft',
  review: 'In review',
  live: 'Live',
};

export interface ThemeStatusBarProps {
  theme: ArtistTheme;
  /**
   * The themes this account may work in - an artist's own, every one for a
   * sysop. A switcher appears only when there are two.
   */
  choices: ArtistTheme[];
  onSelect: (slug: string) => void;
  /** The screens the board can display, for the preview picker. */
  screenNames: string[];
  /** Sysop only: the accounts that could own a theme and do not yet. */
  artistsWithoutATheme?: string[];
  /**
   * The open theme belongs to somebody else, so this is an audit.
   *
   * "Send for review" is the ARTIST's move - it hands their draft to the
   * sysop. A sysop standing in the artist's studio publishes from the Themes
   * tab instead, and sending their own theme to themselves is not a thing.
   */
  auditing?: boolean;
}

export function ThemeStatusBar({
  theme, choices, onSelect, screenNames, auditing, artistsWithoutATheme = [],
}: ThemeStatusBarProps) {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useNotification();
  const [checking, setChecking] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // The envelope, the same key and shape the themes page caches under.
  // Never asked of `default`: it is the board's own screens, not a registry
  // theme, so the server answers 404 - and the query plus its retry put two
  // of those onto the console for it.
  const { data, isLoading } = useQuery({
    queryKey: ['screen-theme-validation', theme.slug],
    queryFn: () => apiClient.getScreenThemeValidation(theme.slug),
    enabled: theme.slug !== 'default',
  });
  const report = (data as { data?: ThemeValidation } | undefined)?.data;

  /*
   * A THEME AN ARTIST HAS NOT ASKED FOR YET.
   *
   * One is made the first time that account opens the studio - so an artist
   * who never has cannot be audited, and the sysop found exactly that:
   * "all level 100 users should have a copy of the default theme to start
   * from. but they dont, i can't impersonate jucke for example". The server
   * lets a sysop name the owner, so the sysop can start it for them; it is
   * seeded from the board like any other.
   */
  const startForArtist = useMutation({
    retry: false,
    mutationFn: async (username: string) => {
      const taken = new Set(choices.map(entry => entry.slug));
      return apiClient.createScreenTheme({
        slug: nextFreeSlug(artistThemeSlug(username), taken),
        title: artistThemeTitle(username),
        author: username,
        owner: username,
        widths: [80],
      });
    },
    onSuccess: async (_answer, username) => {
      showSuccess(`${username} has a theme to draw in`);
      await queryClient.invalidateQueries({ queryKey: ['screen-themes'] });
    },
    onError: (error: Error) => showError(error.message),
  });

  const sendForReview = useMutation({
    mutationFn: () => apiClient.updateScreenTheme(theme.slug, { status: 'review' }),
    onSuccess: async () => {
      showSuccess(`${theme.title} is with the sysop`);
      await queryClient.invalidateQueries({ queryKey: ['screen-themes'] });
    },
    onError: (error: Error) => showError(error.message),
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border p-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {choices.length > 1 ? (
              <>
                <label htmlFor="artist-theme" className="sr-only">Theme</label>
                <select
                  id="artist-theme"
                  className="input-field"
                  value={theme.slug}
                  onChange={event => onSelect(event.target.value)}
                >
                  {choices.map(entry => (
                    <option key={entry.slug} value={entry.slug}>
                      {/* Whose theme it is, for the sysop picking one to audit. */}
                      {entry.mine || !entry.owner ? entry.title : `${entry.title} - ${entry.owner}`}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <h2 className="text-content-primary">{theme.title}</h2>
            )}
            <span className="px-1 rounded-sm bg-surface-3 text-content-secondary text-sm">
              {STATUS_LABEL[theme.status]}
            </span>
            {auditing && (
              <span
                data-testid="auditing-banner"
                className="inline-flex items-center gap-1 px-1 rounded-sm border border-dashed border-accent text-accent text-sm"
              >
                <Eye size={14} /> {theme.owner ? `${theme.owner}'s theme` : 'Somebody else\u2019s theme'} - you are editing their files
              </span>
            )}
          </div>
          <p className="text-sm text-content-secondary">
            {report
              // The board's own count, not a tally of files: coverage is
              // "screens the board can display", and only the validator knows
              // how many that is.
              ? `${report.coverage.provided} of ${report.coverage.total} screens redrawn`
              : 'Counting what you have redrawn'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {artistsWithoutATheme.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="start-for-artist" className="sr-only">Artist with no theme</label>
              <select
                id="start-for-artist"
                className="input-field"
                defaultValue=""
                disabled={startForArtist.isPending}
                onChange={event => {
                  const username = event.target.value;
                  event.target.value = '';
                  if (username) startForArtist.mutate(username);
                }}
              >
                <option value="">Start a theme for...</option>
                {artistsWithoutATheme.map(username => (
                  <option key={username} value={username}>{username}</option>
                ))}
              </select>
            </div>
          )}

          <button type="button" className="btn-secondary inline-flex items-center gap-1"
            onClick={() => setChecking(true)}>
            <ShieldCheck size={16} /> Check
          </button>
          <button type="button" className="btn-secondary inline-flex items-center gap-1"
            onClick={() => setPreviewing(true)}>
            <Monitor size={16} /> Preview
          </button>
          {theme.status === 'draft' && !auditing && (
            <button type="button" className="btn-primary inline-flex items-center gap-1"
              disabled={sendForReview.isPending}
              onClick={() => sendForReview.mutate()}>
              <Send size={16} /> Send for review
            </button>
          )}
        </div>
      </div>

      <Modal open={checking} title={`Can "${theme.title}" be published?`} onClose={() => setChecking(false)} maxWidth="max-w-2xl">
        {isLoading && <SkeletonRows rows={4} />}
        {report && (
          <div className="space-y-4" data-testid="theme-validation">
            <p className="text-sm">
              {report.publishable
                ? 'Nothing blocks this theme. A sysop can make it live.'
                : `${report.blocking.length} ${report.blocking.length === 1 ? 'problem has' : 'problems have'} to be fixed before this theme can go live.`}
            </p>
            {report.blocking.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-status-danger">Blocks publication</h3>
                <ul className="space-y-2 mt-2">
                  {report.blocking.map((finding, index) => (
                    <li key={`${finding.rule}-${index}`} className="text-sm">
                      {finding.file && <code className="text-xs text-content-muted block">{finding.file}</code>}
                      {finding.message}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {report.advisory.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-status-warn">Worth knowing</h3>
                <ul className="space-y-2 mt-2">
                  {report.advisory.map((finding, index) => (
                    <li key={`${finding.rule}-${index}`} className="text-sm">
                      {finding.file && <code className="text-xs text-content-muted block">{finding.file}</code>}
                      {finding.message}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </Modal>

      <Modal open={previewing} title={`${theme.title}, as a caller meets it`} onClose={() => setPreviewing(false)} maxWidth="max-w-4xl">
        {previewing && (
          <ScreenPreviewPanel theme={theme.slug} themeTitle={theme.title} screenNames={screenNames} />
        )}
      </Modal>
    </>
  );
}
