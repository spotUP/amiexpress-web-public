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
  /** The rows of the screen this row shows, when that screen is a program too. */
  nested?: { file: string; items: LoginItem[] } | null;
}

/** The other rung's copy, when this one is empty and that one is not. */
interface OtherCopy {
  theme: string;
  file: string;
  items: number;
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
  /** This step RUNS things, so the board owns it and no theme can change it. */
  program: boolean;
  /** Where the content is, when it is not in the file above. */
  otherCopy?: OtherCopy | null;
  /** Where a screen would be created, for a step that has none. */
  home?: string | null;
}

interface Available {
  target: string;
  bytes: number;
}

interface ThemeChoice {
  slug: string;
  title: string;
  status: string;
  isDefault: boolean;
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

/**
 * The line the loader will read, for the row the sysop is editing.
 *
 * The board's own `lineFor` (screens/login-sequence.ts) writes this; the copy
 * here is what the page can show while a row is still being typed, before
 * anything is saved. `the-row-shows-the-line-that-gets-written` pins the two
 * against each other so the format cannot drift.
 */
export function mciLine(item: LoginItem): string {
  const code = item.code === 'SS' ? '~SS_' : item.code === 'CC' ? '~CC_' : '~SR_';
  return `${code}${item.target}${item.pause ? ' ~SP' : ''}`;
}

function describe(target: string): string | null {
  const name = target.split('/').pop()?.toLowerCase() ?? '';
  return KNOWN[name] ?? null;
}

export function LoginSequencePage() {
  const { showSuccess } = useNotification();
  /** What the sysop is typing into each step's own "anything you like" field. */
  const [typed, setTyped] = useState<Record<string, { code: LoginItem['code']; target: string }>>({});
  const [steps, setSteps] = useState<LoginStep[]>([]);
  // A debounced save fires AFTER a render, so it reads the steps through a ref
  // rather than closing over the array it was scheduled with.
  const stepsRef = useRef<LoginStep[]>([]);
  const [available, setAvailable] = useState<Available[]>([]);
  const [drafts, setDrafts] = useState<Record<string, LoginItem[]>>({});
  /*
   * WHAT THE BOARD HAS NOT BEEN TOLD YET, per step.
   *
   * Every save ends in a reload, and the reload used to reseed every draft
   * from the server - so a path being TYPED was taken back mid-word: the
   * debounce fired after 700ms of thinking, the reload answered with the
   * half-path that had just been saved, and the field snapped back under the
   * sysop's hands. A step with an edit in flight keeps its own copy until the
   * write that carries it returns.
   */
  const unsaved = useRef<Record<string, LoginItem[] | undefined>>({});
  /** Rows of included screens, keyed by the file they belong to. */
  const [nested, setNested] = useState<Record<string, LoginItem[]>>({});
  const [node, setNode] = useState(1);
  /*
   * WHICH BOARD IS BEING EDITED. A theme shadows the board's own screens, so
   * "the logon screen" is a different file for a caller wearing one - and a
   * sysop typically wears a DRAFT nobody else can see. Editing the wrong one
   * changes nothing on screen, which is how a removed logo kept appearing.
   */
  const [theme, setTheme] = useState('');
  const [themes, setThemes] = useState<ThemeChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * HOW LONG A CALLER WATCHES SKELETONS BEFORE BEING TOLD SOMETHING.
   *
   * The board builds its screen index on the first request that needs it -
   * every screen, every node directory, every theme - and on a board with
   * seventy node directories that is several seconds of synchronous work. A
   * page that only spins through it looks broken, which is how it was
   * reported: "found it on local now its stuck loading" (2026-09-16), with a
   * dead backend under it that no amount of waiting would fix.
   */
  const SLOW_LOAD_MS = 12000;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const slow = setTimeout(() => {
      setError(
        'The board has not answered yet. It builds its screen index on the first'
        + ' request after a restart, which takes a few seconds on a board with many'
        + ' nodes - or the backend is down. Retry below.'
      );
    }, SLOW_LOAD_MS);
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
      const { data: envelope } = await apiClient.get<ApiResponse<{
        steps: LoginStep[];
        available: Available[];
        theme: string;
        themes: ThemeChoice[];
      }>>(
        `/api/screens/login-sequence?node=${node}${theme ? `&theme=${encodeURIComponent(theme)}` : ''}`,
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
      setThemes(Array.isArray(payload.themes) ? payload.themes : []);
      // The board answers with the theme it RESOLVED, so a first load shows
      // the truth rather than a guess.
      if (!theme && payload.theme) setTheme(payload.theme);
      setDrafts(Object.fromEntries(loaded.map(s => [
        s.screen,
        unsaved.current[s.screen] ?? (s.items ?? []).map(i => ({ ...i })),
      ])));
      // One level down, keyed by the file rather than the step: two steps can
      // include the same screen, and it is one file either way.
      const below: Record<string, LoginItem[]> = {};
      for (const step of loaded) {
        for (const item of step.items ?? []) {
          if (item.nested) below[item.nested.file] = item.nested.items.map(i => ({ ...i }));
        }
      }
      setNested(below);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(slow);
      setLoading(false);
    }
  }, [node, theme]);

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
    unsaved.current[screen] = next;
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

  /** Write the rows of a screen a step INCLUDES - one level down. */
  const persistInclude = async (file: string, items: LoginItem[]) => {
    setSaving(file);
    setError(null);
    try {
      await apiClient.put('/api/screens/login-sequence/include', { path: file, node, theme, items });
      showSuccess(`${file} saved`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  /**
   * Give a step the screen it does not have.
   *
   * The board decides WHERE (`step.home`) - the loader's search order is the
   * only thing that makes a new file one a caller actually reads - so this
   * sends that answer back rather than a path of its own.
   */
  const createScreen = async (step: LoginStep, first: LoginItem) => {
    if (!step.home) return;
    setSaving(step.screen);
    setError(null);
    try {
      await apiClient.post('/api/screens/login-sequence', {
        screen: step.screen, path: step.home, node, theme, items: [first],
      });
      showSuccess(`${step.label} created at ${step.home}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  /** Write one step's list. The only place this page writes. */
  const persist = async (screen: string, items: LoginItem[]) => {
    const step = stepsRef.current.find(s => s.screen === screen);
    if (!step) return;
    setSaving(screen);
    setStatus(null);
    setError(null);
    try {
      await apiClient.put(`/api/screens/login-sequence`, {
        // The THEME travels with the save. Without it the board resolves the
        // step against its own default and refuses the path - or worse, writes
        // the copy nothing reads, which is how a removed logo kept appearing.
        screen: step.screen, path: step.file, node, theme, items,
      });
      // Only THIS list is written; anything typed since is still owed, and
      // the reload below must not take it back.
      if (unsaved.current[screen] === items) unsaved.current[screen] = undefined;
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

  /*
   * SKELETONS ONLY WHEN THERE IS NOTHING YET.
   *
   * Every autosave ends in a reload, and `loading` covers a reload as well as
   * the first fetch - so the whole editor was replaced by skeletons a second
   * after each edit, and the field being typed into was destroyed mid-word
   * (the row the sysop was editing came back as the board's copy). A refresh
   * of a page already on screen is not a loading state.
   */
  if (loading && steps.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-content-secondary">
          Reading the board's login sequence. The first read after a restart also
          builds the screen index, which takes a few seconds.
        </p>
        {error && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-status-danger">{error}</p>
            <button type="button" className="btn-secondary" onClick={() => { void load(); }}>
              Retry
            </button>
          </div>
        )}
        <SkeletonRows />
      </div>
    );
  }

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

        <label htmlFor="theme" className="ml-4">Theme</label>
        <select
          id="theme"
          value={theme}
          onChange={e => setTheme(e.target.value)}
          className="bg-surface-2 border border-border rounded px-2 py-1 text-content-primary"
        >
          {themes.map(t => (
            <option key={t.slug} value={t.slug}>
              {t.title}
              {t.isDefault ? ' - board default' : ''}
              {t.status !== 'live' ? ` [${t.status}]` : ''}
            </option>
          ))}
        </select>
        <span className="text-content-muted">
          - a theme's copy shadows the board's, and a draft is seen only by sysops
        </span>
      </div>

      {status && <p className="text-sm text-status-ok">{status}</p>}
      {error && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-status-danger">{error}</p>
          <button type="button" className="btn-secondary" onClick={() => { void load(); }}>
            Retry
          </button>
        </div>
      )}

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
                {step.program && (
                  <p className="text-xs text-content-secondary">
                    [BOARD] This step runs things, so it comes from the board itself -
                    changing the theme above will not change it.
                  </p>
                )}
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

            {/*
              A STEP WITH NO FILE IS NOT A DEAD LINE.
              The board says where the screen would go - the loader's search
              order decides, and a file written anywhere else is one nothing
              reads - so the sysop picks what it should show and the board
              creates it there. The pause is ticked: a first row that is also
              the last is unpaused by the writer anyway, and a second row
              inherits a sane default.
            */}
            {!step.file && step.home && (
              <div className="space-y-1">
                <p className="text-xs text-content-secondary">
                  Nothing here yet. Choose what this step should show and it will be created at{' '}
                  <span className="font-mono">{step.home}</span>.
                </p>
                <div className="flex items-center gap-2">
                  <select
                    className="bg-surface-2 border border-border rounded px-2 py-1 text-sm text-content-primary"
                    defaultValue=""
                    aria-label={`Create ${step.label} showing`}
                    onChange={e => {
                      if (!e.target.value) return;
                      void createScreen(step, { code: 'SS', target: e.target.value, pause: true });
                      e.target.value = '';
                    }}
                  >
                    <option value="">Create this screen showing...</option>
                    {available.map(a => (
                      <option key={a.target} value={a.target}>
                        {a.target}
                        {describe(a.target) ? ` - ${describe(a.target)}` : ''}
                        {a.bytes < 8 ? ' [empty]' : ''}
                      </option>
                    ))}
                  </select>
                  <Plus size={14} className="text-content-muted" />
                </div>
              </div>
            )}

            {items.length === 0 && step.otherCopy && (
              <div className="flex items-center gap-2 text-xs">
                <p className="text-content-secondary">
                  The board's own copy, <span className="font-mono">{step.otherCopy.file}</span>,
                  has {step.otherCopy.items} {step.otherCopy.items === 1 ? 'step' : 'steps'} in it.
                  A theme's copy shadows it only for callers wearing that theme.
                </p>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setTheme(step.otherCopy!.theme)}
                >
                  Show the board's own screens
                </button>
              </div>
            )}

            {items.map((item, index) => (
              <div
                /*
                 * KEYED BY POSITION, because the row is editable now. Keying
                 * by content meant every keystroke in the target field gave
                 * the row a new key: React threw the row away, built a fresh
                 * one, and the field lost focus after one character. The
                 * order IS the identity of a login sequence - the comment at
                 * the top of this file says so - so the index is the key.
                 */
                key={`${step.screen}:${index}`}
                className="flex items-start gap-2 text-sm text-content-primary border-b border-border py-1"
              >
                <select
                  className="bg-surface-2 border border-border rounded px-1 py-1 text-xs text-content-primary"
                  value={item.code}
                  aria-label={`What row ${index + 1} of ${step.label} does`}
                  onChange={e => {
                    const next = [...items];
                    next[index] = { ...item, code: e.target.value as LoginItem['code'] };
                    edit(step.screen, next);
                  }}
                >
                  <option value="SS">SS show</option>
                  <option value="CC">CC run</option>
                  <option value="SR">SR random</option>
                </select>
                <span className="flex-1 flex flex-col gap-0.5">
                  <input
                    type="text"
                    className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-sm text-content-primary"
                    value={item.target}
                    spellCheck={false}
                    aria-label={`Row ${index + 1} of ${step.label}`}
                    onChange={e => {
                      const next = [...items];
                      next[index] = { ...item, target: e.target.value };
                      edit(step.screen, next);
                    }}
                  />
                  <span className="text-xs text-content-muted font-mono">
                    {mciLine(item)}
                    {describe(item.target) && (
                      <span className="ml-2 text-content-secondary font-sans">{describe(item.target)}</span>
                    )}
                  </span>
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

            {/*
              ONE LEVEL DOWN. A screen a step shows can be a program itself -
              the board's BULL.TXT is a form feed and one `~SS_`, and the
              bulletin screens list five MultiTop pages the same way. "there
              are more stuff that launches stuff during login bulletins etc"
              (sysop, 2026-09-16). These rows belong to the INCLUDED file and
              are written to it, which is why they carry its name and its own
              Save.
            */}
            {items.map((item, index) => item.nested ? (
              <div key={`${step.screen}:${index}:nested`} className="ml-6 border-l border-border pl-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-content-secondary">
                    Inside <span className="font-mono">{item.target}</span>
                    {' '}(<span className="font-mono">{item.nested.file}</span>)
                  </p>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={saving === item.nested.file}
                    onClick={() => { void persistInclude(item.nested!.file, nested[item.nested!.file] ?? []); }}
                  >
                    <Save size={14} />
                    {saving === item.nested.file ? 'Saving' : `Save ${item.nested.file.split('/').pop()}`}
                  </button>
                </div>

                {(nested[item.nested.file] ?? []).map((sub, subIndex) => {
                  const file = item.nested!.file;
                  const rows = nested[file] ?? [];
                  const editSub = (next: LoginItem[]) => setNested(prev => ({ ...prev, [file]: next }));
                  return (
                    <div key={`${file}:${subIndex}`} className="flex items-start gap-2 text-sm py-0.5">
                      <select
                        className="bg-surface-2 border border-border rounded px-1 py-1 text-xs text-content-primary"
                        value={sub.code}
                        aria-label={`What row ${subIndex + 1} of ${file} does`}
                        onChange={e => {
                          const next = [...rows];
                          next[subIndex] = { ...sub, code: e.target.value as LoginItem['code'] };
                          editSub(next);
                        }}
                      >
                        <option value="SS">SS show</option>
                        <option value="CC">CC run</option>
                        <option value="SR">SR random</option>
                      </select>
                      <span className="flex-1 flex flex-col gap-0.5">
                        <input
                          type="text"
                          className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-sm text-content-primary"
                          value={sub.target}
                          spellCheck={false}
                          aria-label={`Row ${subIndex + 1} of ${file}`}
                          onChange={e => {
                            const next = [...rows];
                            next[subIndex] = { ...sub, target: e.target.value };
                            editSub(next);
                          }}
                        />
                        <span className="text-xs text-content-muted font-mono">{mciLine(sub)}</span>
                      </span>
                      <label className="text-xs text-content-secondary inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={sub.pause}
                          onChange={e => {
                            const next = [...rows];
                            next[subIndex] = { ...sub, pause: e.target.checked };
                            editSub(next);
                          }}
                        />
                        pause
                      </label>
                      <button
                        type="button"
                        className="btn-secondary"
                        aria-label={`Move ${sub.target} up in ${file}`}
                        onClick={() => {
                          if (subIndex === 0) return;
                          const next = [...rows];
                          [next[subIndex - 1], next[subIndex]] = [next[subIndex], next[subIndex - 1]];
                          editSub(next);
                        }}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        aria-label={`Move ${sub.target} down in ${file}`}
                        onClick={() => {
                          if (subIndex === rows.length - 1) return;
                          const next = [...rows];
                          [next[subIndex], next[subIndex + 1]] = [next[subIndex + 1], next[subIndex]];
                          editSub(next);
                        }}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        aria-label={`Remove ${sub.target} from ${file}`}
                        onClick={() => editSub(rows.filter((_, i) => i !== subIndex))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null)}

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

            {step.exists && (
              /*
                ANYTHING THE SYSOP LIKES, not only what the board already has.
                The picker lists files it found; a screen that is about to
                exist, a door, or a path only the live volume has were all
                unreachable from here - "it must be possible to add custom
                strings as well" (sysop, 2026-09-14).
              */
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={event => {
                  event.preventDefault();
                  const entry = typed[step.screen];
                  const target = entry?.target.trim();
                  if (!target) return;
                  edit(step.screen, [...items, { code: entry.code, target, pause: true }]);
                  setTyped(prev => ({ ...prev, [step.screen]: { code: entry.code, target: '' } }));
                }}
              >
                <label className="text-xs text-content-secondary" htmlFor={`code-${step.screen}`}>
                  or add your own
                </label>
                <select
                  id={`code-${step.screen}`}
                  className="bg-surface-2 border border-border rounded px-2 py-1 text-sm text-content-primary"
                  aria-label={`What to add to ${step.label}`}
                  value={typed[step.screen]?.code ?? 'SS'}
                  onChange={event => setTyped(prev => ({
                    ...prev,
                    [step.screen]: {
                      code: event.target.value as LoginItem['code'],
                      target: prev[step.screen]?.target ?? '',
                    },
                  }))}
                >
                  {/* Full English, because SS/CC/SR mean nothing until you
                      have read express.e. */}
                  <option value="SS">Show a screen</option>
                  <option value="CC">Run a command</option>
                  <option value="SR">Show a random screen</option>
                </select>
                <input
                  className="bg-surface-2 border border-border rounded px-2 py-1 text-sm text-content-primary flex-1 min-w-48"
                  aria-label={`Anything to add to ${step.label}`}
                  placeholder="BBS:Bulletins/bull6.txt"
                  value={typed[step.screen]?.target ?? ''}
                  onChange={event => setTyped(prev => ({
                    ...prev,
                    [step.screen]: {
                      code: prev[step.screen]?.code ?? 'SS',
                      target: event.target.value,
                    },
                  }))}
                />
                <button type="submit" className="btn-secondary text-sm">Add</button>
              </form>
            )}
          </section>
        );
      })}
    </div>
  );
}
