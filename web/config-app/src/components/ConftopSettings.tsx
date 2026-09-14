/**
 * ConfTop's settings for one conference.
 *
 * ConfTop is a 68K door we do not build ("Conference Top Uploaders" v2.3),
 * and its only lever is the tooltypes in `<confdir>/Conftop.info`. Nothing in
 * the admin could touch that, so `ROWS=20` sat on every conference here
 * printing a 26-line bulletin at a 25-line caller: the top of the uploader
 * list scrolled away before anyone read it ("more screens are cutt off in the
 * bbs", the sysop, 2026-09-14). Setting it meant editing binary icons on the
 * live volume by hand.
 *
 * ROWS LEADS AND SAYS WHAT IT COSTS. The height is arithmetic - six rows of
 * chrome plus one per entry - so the form can show the total against the 25 a
 * caller has rather than leaving a sysop to discover it from a screenshot.
 *
 * Its own Save, deliberately: this writes an icon belonging to a door, over a
 * different endpoint from the conference's own config, and one button that
 * quietly wrote both files would hide which one failed.
 */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

interface ConftopView {
  present: boolean;
  rows: number | null;
  days: string | null;
  mailUser: string | null;
  bullFile: string | null;
  minLimit: number | null;
  skipEmptyLines: boolean;
  showResetDate: boolean;
  height: number | null;
  fits: boolean;
  maxFittingRows: number;
  chromeRows: number;
}

/** What a caller's terminal shows without scrolling. */
const SCREEN_ROWS = 25;

export function ConftopSettings({ conferenceId }: { conferenceId: number }) {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useNotification();

  const settingsQuery = useQuery({
    queryKey: ['conftop-settings', conferenceId],
    queryFn: () => apiClient.getConftopSettings(conferenceId),
  });
  const view = settingsQuery.data?.data as ConftopView | undefined;

  const [form, setForm] = useState<Partial<ConftopView>>({});

  // Seeded from the server once it answers, and again if the conference under
  // the dialog changes - the form is a draft of what is on disk, not a
  // second source of truth for it.
  useEffect(() => {
    if (view) setForm({ ...view });
  }, [view, conferenceId]);

  const save = useMutation({
    mutationFn: () =>
      apiClient.saveConftopSettings(conferenceId, {
        rows: form.rows ?? null,
        days: form.days ?? null,
        mailUser: form.mailUser ?? null,
        bullFile: form.bullFile ?? null,
        minLimit: form.minLimit ?? null,
        skipEmptyLines: !!form.skipEmptyLines,
        showResetDate: !!form.showResetDate,
      }),
    onSuccess: () => {
      showSuccess('Top-uploaders settings saved');
      queryClient.invalidateQueries({ queryKey: ['conftop-settings', conferenceId] });
    },
    onError: (error: Error) => showError(error.message),
  });

  if (settingsQuery.isLoading) {
    return <p className="text-sm text-content-secondary">Reading the conference's ConfTop icon…</p>;
  }

  if (!view?.present) {
    return (
      <p className="text-sm text-content-secondary">
        This conference does not run ConfTop. Creating its
        <span className="mx-1 font-mono">Conftop.info</span>
        is how the door is installed into a conference, which is more than a
        settings form should do on its own.
      </p>
    );
  }

  const rows = form.rows ?? null;
  const height = rows === null ? null : view.chromeRows + rows;
  // Over budget is about the ROWS the sysop chose, not the total: the chrome
  // is the door's and not theirs to shrink.
  const overBudget = rows !== null && rows > view.maxFittingRows;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="conftop-rows" className="label">Uploaders listed</label>
          <input
            id="conftop-rows"
            type="number"
            min={1}
            max={view.maxFittingRows}
            className="input-field w-full"
            value={rows ?? ''}
            onChange={(e) =>
              setForm({ ...form, rows: e.target.value === '' ? null : Number(e.target.value) })}
          />
          {/*
            The arithmetic, in the open. A sysop setting this number is
            choosing a screen height whether they know it or not.
          */}
          <p className={`mt-1 text-xs ${overBudget ? 'text-status-warn' : 'text-content-secondary'}`}>
            {height === null
              ? `Unset - ConfTop uses its own default. At most ${view.maxFittingRows} fits.`
              : `Prints ${height} lines of the caller's ${SCREEN_ROWS}: `
                + `${view.chromeRows} of heading and totals plus ${rows} of uploaders. `
                + `The conference join needs the rest, so ${view.maxFittingRows} is the most that fits.`}
          </p>
        </div>

        <div>
          <label htmlFor="conftop-days" className="label">Period</label>
          <input
            id="conftop-days"
            className="input-field w-full"
            placeholder="WEEKLY, or a number of days"
            value={form.days ?? ''}
            onChange={(e) => setForm({ ...form, days: e.target.value })}
          />
          <p className="mt-1 text-xs text-content-secondary">
            How long a scoring period runs before it resets.
          </p>
        </div>

        <div>
          <label htmlFor="conftop-mailuser" className="label">Results sent to</label>
          <input
            id="conftop-mailuser"
            className="input-field w-full"
            placeholder="Sysop"
            value={form.mailUser ?? ''}
            onChange={(e) => setForm({ ...form, mailUser: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="conftop-bullfile" className="label">Bulletin written to</label>
          <input
            id="conftop-bullfile"
            className="input-field w-full font-mono"
            placeholder="BBS:Bulletins/conftop.txt"
            value={form.bullFile ?? ''}
            onChange={(e) => setForm({ ...form, bullFile: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="conftop-minlimit" className="label">Ignore uploads under (bytes)</label>
          <input
            id="conftop-minlimit"
            type="number"
            min={0}
            className="input-field w-full"
            value={form.minLimit ?? ''}
            onChange={(e) =>
              setForm({ ...form, minLimit: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={!!form.skipEmptyLines}
          onChange={(e) => setForm({ ...form, skipEmptyLines: e.target.checked })}
        />
        <span>
          Skip empty slots
          <span className="block text-xs text-content-secondary">
            Without this an empty conference prints a numbered blank row for every
            slot - most of a screen saying nothing.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={!!form.showResetDate}
          onChange={(e) => setForm({ ...form, showResetDate: e.target.checked })}
        />
        <span>Show the date the period resets</span>
      </label>

      <div>
        <button
          type="button"
          className="btn-secondary"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : 'Save top-uploaders settings'}
        </button>
      </div>
    </div>
  );
}
