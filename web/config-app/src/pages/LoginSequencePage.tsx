/**
 * What a caller is shown on the way in, and which parts of it the sysop wants.
 *
 * "can we build an editor for all bulls etc that shows during login so i can
 * pick what i want and dont want in the admin ui?" (2026-09-14). The board was
 * showing five MultiTop-II bulletins at login because the node's bulletin
 * screen lists them - five `~SS_` includes - and the only way to see that, let
 * alone change it, was to read a file on a volume the sysop cannot reach.
 *
 * Each step names THE FILE IT ACTUALLY RESOLVES TO. That is not decoration:
 * `Themes/<id>/Node/BULL.TXT` shadows `Node<N>/BULL.TXT` shadows
 * `Screens/BULL.TXT`, and an edit to the wrong rung changes nothing on screen.
 *
 * Rows are moved and ticked by index, so this is a list of flex rows rather
 * than a DataTable: sorting a login sequence would be a corruption of it, and
 * row identity here IS the order.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { apiClient } from '../api/client';
import type { ApiResponse } from '../types';
import { SkeletonRows } from '../components/ui/states';
import { useNotification } from '../contexts/NotificationContext';

/** How long a click storm is allowed to settle before the board is written. */
const AUTOSAVE_MS = 700;

interface LoginItem {
  code: 'SS' | 'CC' | 'SR';
  target: string;
  pause: boolean;
}

interface LoginStep {
  screen: string;
  label: string;
  note: string;
  skippedByQuickFlag: boolean;
  file: string | null;
  exists: boolean;
  bytes: number;
  items: LoginItem[];
  blankPause: boolean;
}

interface Available {
  target: string;
  bytes: number;
}

/** What the board calls each MultiTop design, so a sysop picks by meaning. */
const KNOWN: Record<string, string> = {
  'bull1.txt': 'MultiTop - uploaded bytes',
  'bull2.txt': 'MultiTop - downloaded bytes',
  'bull3.txt': 'MultiTop - messages',
  'bull4.txt': 'MultiTop - upload CPS',
  'bull5.txt': 'MultiTop - download CPS',
  'bull6.txt': 'Last callers',
  'bull7.txt': 'News',
  'bull8.txt': 'Sport',
};

function describe(target: string): string | null {
  const name = target.split('/').pop()?.toLowerCase() ?? '';
  return KNOWN[name] ?? null;
}

export function LoginSequencePage() {
  const { showSuccess } = useNotification();
  const [steps, setSteps] = useState<LoginStep[]>([]);
  // A debounced save fires AFTER a render, so it reads the steps through a ref
  // rather than closing over the array it was scheduled with.
  const stepsRef = useRef<LoginStep[]>([]);
  const [available, setAvailable] = useState<Available[]>([]);
  const [drafts, setDrafts] = useState<Record<string, LoginItem[]>>({});
  const [node, setNode] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      /*
       * `request()` returns the WHOLE envelope, so `apiClient.get<T>` answers
       * `{ data: ApiResponse<T> }` and the payload is one level further in.
       * Typed as the payload instead, `data.steps` was undefined, `setSteps`
       * put undefined into state, and the next render died on `steps.map` -
       * a white page with "Cannot read properties of undefined (reading
       * 'map')" (sysop, 2026-09-14). The generic ASSERTS the shape, so
       * TypeScript could not see it. Every other caller in this admin types
       * the envelope; this one did not.
       */
      const { data: envelope } = await apiClient.get<ApiResponse<{ steps: LoginStep[]; available: Available[] }>>(
        `/api/screens/login-sequence?node=${node}`,
      );
      const payload = envelope?.data;
      // A response that does not carry what this page needs is an ERROR, not
      // an empty page pretending the board has no login sequence.
      if (!payload || !Array.isArray(payload.steps)) {
        throw new Error('The board did not return a login sequence for this node.');
      }
      const loaded = payload.steps;
      setSteps(loaded);
      stepsRef.current = loaded;
      setAvailable(Array.isArray(payload.available) ? payload.available : []);
      setDrafts(Object.fromEntries(loaded.map(s => [s.screen, (s.items ?? []).map(i => ({ ...i }))])));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [node]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Every edit SAVES. The sysop removed an include, got no confirmation and
   * asked why - because nothing had happened: the trash button edited a draft
   * and the board was only written when Save was pressed. "the admin ui should
   * auto save when possible" (2026-09-14).
   *
   * DEBOUNCED, and not only for politeness: every write to a screen file
   * invalidates the board's screen index, whose rebuild is ~2s of synchronous
   * filesystem work on the backend's single event loop. Saving on each of four
   * clicks while reordering a list would freeze the board four times.
   */
  const edit = (screen: string, next: LoginItem[]) => {
    setDrafts(prev => ({ ...prev, [screen]: next }));
    scheduleSave(screen, next);
  };

  const move = (screen: string, index: number, by: number) => {
    const items = [...(drafts[screen] ?? [])];
    const to = index + by;
    if (to < 0 || to >= items.length) return;
    [items[index], items[to]] = [items[to], items[index]];
    edit(screen, items);
  };

  /** Pending debounce timers, one per step, so two steps do not cancel each other. */
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const scheduleSave = (screen: string, next: LoginItem[]) => {
    clearTimeout(saveTimers.current[screen]);
    saveTimers.current[screen] = setTimeout(() => { void persist(screen, next); }, AUTOSAVE_MS);
  };

  // Nothing half-written on the way out: a pending edit is flushed when the
  // page unmounts, so leaving the tab does not quietly discard it.
  useEffect(() => {
    const timers = saveTimers.current;
    return () => { for (const id of Object.values(timers)) clearTimeout(id); };
  }, []);

  /** Write one step's list. The only place this page writes. */
  const persist = async (screen: string, items: LoginItem[]) => {
    const step = stepsRef.current.find(s => s.screen === screen);
    if (!step) return;
    setSaving(screen);
    setStatus(null);
    setError(null);
    try {
      await apiClient.put(`/api/screens/login-sequence`, {
        screen: step.screen, path: step.file, node, items,
      });
      setStatus(`${step.label} saved to ${step.file}`);
      // The sysop removed an include and asked where his toast was. An edit
      // that reaches the board says so out loud, not only in a line of text
      // at the top of a long page.
      showSuccess(`${step.label} saved`);
      await load();
    } catch (err) {
      // The two refusals worth reading in full: emptying a screen (which would
      // cost the caller a keypress on a blank screen) and a path that no longer
      // resolves because the theme changed under the tab.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  const save = async (step: LoginStep) => {
    clearTimeout(saveTimers.current[step.screen]);
    await persist(step.screen, drafts[step.screen] ?? []);
  };

  const dirty = (step: LoginStep) =>
    JSON.stringify(drafts[step.screen] ?? []) !== JSON.stringify(step.items);

  if (loading) return <SkeletonRows />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-content-primary">Login sequence</h1>
        <p className="text-xs text-content-secondary mt-1">
          Every screen a caller is shown on the way in, in the order the board shows them.
          Each step names the file it actually resolves to - a theme's copy shadows the node's,
          which shadows the board's, so this is the file an edit has to land in.
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm text-content-secondary">
        <label htmlFor="node">Node</label>
        <input
          id="node"
          type="number"
          min={0}
          value={node}
          onChange={e => {
            // An empty field parses to NaN, and NaN in state renders the page
            // blank on the next fetch - the admin pins this rule in
            // number-inputs-never-go-nan.test.ts.
            const parsed = parseInt(e.target.value, 10);
            setNode(Number.isNaN(parsed) ? 1 : Math.max(0, parsed));
          }}
          className="w-16 bg-surface-2 border border-border rounded px-2 py-1 text-content-primary"
        />
        <span className="text-content-muted">- nodes can serve different screens</span>
      </div>

      {status && <p className="text-sm text-status-ok">{status}</p>}
      {error && <p className="text-sm text-status-danger">{error}</p>}

      {steps.map((step, position) => {
        const items = drafts[step.screen] ?? [];
        return (
          <section key={step.screen} className="border border-border rounded p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-content-primary">
                  {position + 1}. {step.label}
                  {step.skippedByQuickFlag && (
                    <span className="ml-2 text-xs text-content-muted">[skipped in quick mode]</span>
                  )}
                </h2>
                <p className="text-xs text-content-secondary">{step.note}</p>
                <p className="text-xs text-content-muted">
                  {step.file
                    ? `${step.file}${step.exists ? '' : ' [not on disk]'}`
                    : '[no file on this board - the step is skipped in silence]'}
                </p>
                {step.blankPause && (
                  <p className="text-xs text-status-warn">
                    [WARNING] This file draws nothing and still costs the caller a keypress.
                    Remove it in the screen manager.
                  </p>
                )}
              </div>
              {step.exists && (
                <button
                  type="button"
                  className="btn-primary inline-flex items-center gap-1"
                  disabled={!dirty(step) || saving === step.screen}
                  onClick={() => void save(step)}
                >
                  <Save size={14} />
                  {saving === step.screen ? 'Saving' : 'Save'}
                </button>
              )}
            </div>

            {step.exists && items.length === 0 && (
              <p className="text-xs text-content-muted">
                Nothing included. This screen is its own art, or it is empty.
              </p>
            )}

            {items.map((item, index) => (
              <div
                key={`${item.code}:${item.target}:${index}`}
                className="flex items-center gap-2 text-sm text-content-primary border-b border-border py-1"
              >
                <span className="text-content-muted w-8">{item.code}</span>
                <span className="flex-1">
                  {item.target}
                  {describe(item.target) && (
                    <span className="ml-2 text-xs text-content-secondary">{describe(item.target)}</span>
                  )}
                </span>
                <label className="text-xs text-content-secondary inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={item.pause}
                    disabled={index === items.length - 1}
                    onChange={e => {
                      const next = [...items];
                      next[index] = { ...item, pause: e.target.checked };
                      edit(step.screen, next);
                    }}
                  />
                  pause
                </label>
                <button
                  type="button"
                  className="btn-secondary"
                  aria-label={`Move ${item.target} up`}
                  onClick={() => move(step.screen, index, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  aria-label={`Move ${item.target} down`}
                  onClick={() => move(step.screen, index, 1)}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  aria-label={`Remove ${item.target}`}
                  onClick={() => edit(step.screen, items.filter((_, i) => i !== index))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            {step.exists && (
              <div className="flex items-center gap-2">
                <select
                  className="bg-surface-2 border border-border rounded px-2 py-1 text-sm text-content-primary"
                  defaultValue=""
                  aria-label={`Add a screen to ${step.label}`}
                  onChange={e => {
                    if (!e.target.value) return;
                    edit(step.screen, [...items, { code: 'SS', target: e.target.value, pause: true }]);
                    e.target.value = '';
                  }}
                >
                  <option value="">Add a screen...</option>
                  {available
                    .filter(a => !items.some(i => i.target === a.target))
                    .map(a => (
                      <option key={a.target} value={a.target}>
                        {a.target}
                        {describe(a.target) ? ` - ${describe(a.target)}` : ''}
                        {a.bytes < 8 ? ' [empty]' : ''}
                      </option>
                    ))}
                </select>
                <Plus size={14} className="text-content-muted" />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
