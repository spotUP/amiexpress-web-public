import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import { SkeletonRows } from '../components/ui/states';
import { Modal } from '../components/ui/Modal';
import { BullsMasksMatrix } from '../components/BullsMasksMatrix';
import { ScreenEditor } from '../components/ScreenEditor';
import { AnsiCanvas } from '../components/AnsiCanvas';
import { createSurface, type EditorSurface } from './screen-editor-state';
import { screenToCanvas, base64ToLatin1, latin1ToBase64 } from './screen-bytes';
import type { Cell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';

interface BullsEntry {
  line: number;
  title: string;
  file: string;
}

interface BullsProblem {
  line: number;
  kind: string;
  message: string;
}

const KIND_LABEL: Record<string, string> = {
  'duplicate-file': '[DUP]',
  'missing-file': '[MISSING]',
  'missing-conference': '[NO CONF]',
  'bad-mask': '[MASK]',
  'format': '[FORMAT]',
};

export function BullsInfoPage() {
  const [entries, setEntries] = useState<BullsEntry[]>([]);
  const [draft, setDraft] = useState<Array<{ title: string; file: string }>>([]);
  const [problems, setProblems] = useState<BullsProblem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [modalFile, setModalFile] = useState<string | null>(null);
  const [browserKey, setBrowserKey] = useState(0);

  const applyData = (data: any) => {
    setEntries(data.entries);
    setDraft(data.entries.map((e: BullsEntry) => ({ title: e.title, file: e.file })));
    setProblems(Array.isArray(data.problems) ? data.problems : []);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      // The client returns the raw envelope ({success, data}); sibling
      // pages read handler-style raw bodies, so tolerate both shapes -
      // an unshaped error body crashed this page on first open (2026-09-10).
      const res: any = await apiClient.getBullsConfig();
      const data = res?.data ?? res;
      if (data && Array.isArray(data.entries)) {
        applyData(data);
      } else {
        setStatus(`Error: ${res?.message ?? 'unexpected response'}`);
      }
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const problemsFor = (line: number) => problems.filter((p) => p.line === line);
  const globalProblems = problems.filter((p) => p.line === 0);

  const setRow = (i: number, patch: Partial<{ title: string; file: string }>) => {
    const next = draft.slice();
    next[i] = { title: next[i]?.title ?? '', file: next[i]?.file ?? '', ...patch };
    setDraft(next);
  };

  const handleSaveEntries = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res: any = await apiClient.saveBullsEntries(draft);
      const data = res?.data ?? res;
      if (data && Array.isArray(data.entries)) {
        applyData(data);
        const left = (Array.isArray(data.problems) ? data.problems : []).length;
        setStatus(left ? `Saved with ${left} problem${left === 1 ? '' : 's'} flagged.` : 'Saved, no problems.');
      } else {
        setStatus(`Error: ${res?.message ?? 'unexpected response'}`);
      }
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Save failed'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-content-primary">Bulls Menu (Bulls.CFG)</h2>
        <p className="text-xs text-content-secondary mt-1">
          The menu of the 68K Bulls door: title to bulletin file, conference masks, title art.
          Edit the text exactly (a real Amiga binary reads it), Save writes the bytes back with one .bak kept.
          Missing files and double mappings are flagged, never silently fixed.
        </p>
      </div>

      {status && <p className="text-sm text-content-primary">{status}</p>}
      {globalProblems.length > 0 && (
        <ul className="text-sm text-status-danger space-y-1">
          {globalProblems.map((p, i) => <li key={i}>{KIND_LABEL[p.kind] ?? '[?]'} {p.message}</li>)}
        </ul>
      )}

      {loading ? <SkeletonRows rows={8} /> : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-content-secondary border-b border-border">
              <th className="py-1 pr-2 font-medium">No.</th>
              <th className="py-1 pr-2 font-medium">Title</th>
              <th className="py-1 pr-2 font-medium">File</th>
              <th className="py-1 pr-2 font-medium">Status</th>
              <th className="py-1 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {draft.map((row, i) => {
              const ps = problemsFor(entries[i]?.line ?? -1);
              return (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1 pr-2 font-mono text-content-secondary">{i + 1}</td>
                  <td className="py-1 pr-2">
                    <input
                      value={row.title}
                      onChange={(ev) => setRow(i, { title: ev.target.value })}
                      className="w-full px-2 py-1 bg-surface-0 border border-border text-content-primary rounded text-sm"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      value={row.file}
                      onChange={(ev) => setRow(i, { file: ev.target.value })}
                      className="w-full px-2 py-1 bg-surface-0 border border-border text-content-primary rounded text-sm font-mono"
                    />
                  </td>
                  <td className="py-1 pr-2 whitespace-nowrap">
                    {!ps.length
                      ? <span className="text-status-ok">[OK]</span>
                      : <span className="text-status-danger" title={ps.map((p) => p.message).join('; ')}>{ps.map((p) => KIND_LABEL[p.kind] ?? '[?]').join(' ')}</span>}
                  </td>
                  <td className="py-1 whitespace-nowrap">
                    <button onClick={() => setModalFile(row.file.trim())} disabled={!row.file.trim()} className="px-2 py-1 text-accent hover:underline text-sm disabled:opacity-50">
                      Open
                    </button>
                    <button onClick={() => setDraft(draft.filter((_, j) => j !== i))} className="px-2 py-1 text-status-danger hover:underline text-sm">
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="flex gap-2">
        <button onClick={() => setDraft([...draft, { title: '', file: '' }])} className="px-4 py-2 bg-surface-0 border border-border text-content-primary rounded disabled:opacity-50">
          Add row
        </button>
        <button onClick={handleSaveEntries} disabled={saving} className="px-4 py-2 bg-accent text-white rounded disabled:opacity-50">
          {saving ? 'Saving...' : 'Save menu entries'}
        </button>
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-surface-0 border border-border text-content-primary rounded disabled:opacity-50">
          Reload
        </button>
      </div>

      <BullsMasksMatrix titles={draft.map(row => row.title)} />

      <BulletinBrowser key={browserKey} onOpen={setModalFile} />

      {modalFile && (
        <BulletinModal name={modalFile} onClose={() => setModalFile(null)} onSaved={() => setBrowserKey((k) => k + 1)} />
      )}
    </div>
  );
}

interface BulletinInfo {
  name: string;
  size: number;
  mtimeMs: number;
  generated: boolean;
  generator?: string;
}

const PREVIEW_ROWS = 25;

interface BulletinPreview extends BulletinInfo {
  text: string | null;
  canvas: Cell[][] | null;
}

/** All bulletins, contents inline for review: ANSI art rendered, text as
 *  text, capped at PREVIEW_ROWS with an Open button for the full read or
 *  edit. Small files (bulletins are KBs), fetched in parallel once. */
function BulletinBrowser({ onOpen }: { onOpen: (name: string) => void }) {
  const [list, setList] = useState<BulletinPreview[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res: any = await apiClient.listBulletins();
        const data = res?.data ?? res;
        if (!data || !Array.isArray(data.bulletins)) return;
        const previews = await Promise.all((data.bulletins as BulletinInfo[]).map(async (b) => {
          const preview: BulletinPreview = { ...b, text: null, canvas: null };
          try {
            const r: any = await apiClient.getBulletin(b.name);
            const text = (r?.data ?? r)?.content;
            if (typeof text !== 'string') return preview;
            preview.text = text;
            if (/\x1b\[/.test(text)) {
              try {
                preview.canvas = await screenToCanvas(latin1ToBase64(text), PREVIEW_ROWS);
              } catch {
                /* falls back to text below */
              }
            }
          } catch {
            /* unreadable file shows its header with no body */
          }
          return preview;
        }));
        if (live) setList(previews);
      } catch (e: unknown) {
        if (live) setStatus(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
      }
    })();
    return () => { live = false; };
  }, []);

  return (
    <div className="space-y-4 pt-4 border-t border-border">
      <div>
        <h3 className="text-lg font-semibold text-content-primary">Bulletins</h3>
        <p className="text-xs text-content-secondary mt-1">
          Everything the door can show, contents inline. Generated bulletins (batches own 1-6, the news
          service owns 7-8) edit at their source; static ones open editable with Open.
        </p>
      </div>
      {status && <p className="text-sm text-content-primary">{status}</p>}
      {list.map((b) => (
        <div key={b.name} className="border border-border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-mono text-sm text-content-primary">
              {b.name}
              <span className="text-content-secondary"> ({b.size.toLocaleString()} bytes{b.generated ? `, generated by ${b.generator}` : ', static'})</span>
            </p>
            <button onClick={() => onOpen(b.name)} className="px-3 py-1 text-sm text-accent hover:underline">
              Open{b.generated ? '' : ' to edit'}
            </button>
          </div>
          {b.canvas ? (
            <div className="overflow-x-auto"><AnsiCanvas canvas={b.canvas} /></div>
          ) : b.text !== null ? (
            <pre className="font-mono text-xs text-content-secondary whitespace-pre-wrap">{b.text.split('\n').slice(0, PREVIEW_ROWS).join('\n')}</pre>
          ) : (
            <p className="text-sm text-status-danger">Unreadable.</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Read/edit one bulletin in a modal. Missing files show the miss plainly. */
function BulletinModal({ name, onClose, onSaved }: { name: string; onClose: () => void; onSaved?: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [editable, setEditable] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ansiMode, setAnsiMode] = useState(false);
  const [surface, setSurface] = useState<EditorSurface | null>(null);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    let live = true;
    setContent(null);    setEditable(false);
    setStatus(null);
    setSurface(null);
    setAnsiMode(false);
    apiClient.listBulletins().then((res: any) => {
      const data = res?.data ?? res;
      const info = data?.bulletins?.find((b: BulletinInfo) => b.name.toLowerCase() === name.toLowerCase());
      if (live) setEditable(!!info && !info.generated);
    }).catch(() => {});
    apiClient.getBulletin(name).then(async (res: any) => {
      const data = res?.data ?? res;
      const text = typeof data?.content === 'string' ? data.content : '';
      if (!live) return;
      setContent(text);
      // ANSI art opens in the ANSI editor - the same ScreenEditor the
      // screens use, over the same SDK canvas. Plain text keeps the box.
      if (/\x1b\[/.test(text)) {
        setBuilding(true);
        try {
          const canvas = await screenToCanvas(latin1ToBase64(text));
          if (live) {
            setSurface(createSurface(canvas));
            setAnsiMode(true);
          }
        } catch (e: unknown) {
          if (live) setStatus(`Art preview failed, text follows: ${e instanceof Error ? e.message : 'parse error'}`);
        } finally {
          if (live) setBuilding(false);
        }
      }
    }).catch((e: unknown) => {
      if (live) setStatus(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
    });
    return () => { live = false; };
  }, [name]);

  const saveContent = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await apiClient.saveBulletin(name, content ?? '');
      setStatus(`Saved ${name}.`);
      onSaved?.();
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Save failed'}`);
    } finally {
      setSaving(false);
    }
  };

  const saveSurface = async (base64: string) => {
    // Base64 bytes to latin1: measured 2026-09-10, spacing/line-endings
    // normalize and bold flattens, but no byte means another. Said below
    // so the sysop is never surprised by the diff.
    setSaving(true);
    setStatus(null);
    try {
      const text = base64ToLatin1(base64);
      await apiClient.saveBulletin(name, text);
      setContent(text);
      setStatus(`Saved ${name} (editor canvas format).`);
      onSaved?.();
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Save failed'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    // The shared Modal owns the backdrop, Escape and the accessible name; this
    // kept its own header, so it takes the visually hidden title instead.
    <Modal open onClose={onClose} title={name} showHeader={false} maxWidth="max-w-3xl">
      {/* A header-less Modal draws no padding of its own, so the shell keeps
          the inset the hand-rolled panel had. */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-content-primary font-mono">{name}</h3>
          <button onClick={onClose} className="px-3 py-1 text-content-secondary hover:text-content-primary text-sm">
            Close (ESC)
          </button>
        </div>
        {status && <p className="text-sm text-content-primary">{status}</p>}
        {content === null && !status ? (
          <p className="text-sm text-content-secondary">Loading...</p>
        ) : content !== null && (
          <>
            {editable && surface && (
              <div className="flex gap-2 text-sm">
                <button
                  onClick={() => setAnsiMode(false)}
                  className={`px-3 py-1 rounded border ${!ansiMode ? 'border-accent text-content-primary' : 'border-border text-content-secondary'}`}
                >
                  Text
                </button>
                <button
                  onClick={() => setAnsiMode(true)}
                  className={`px-3 py-1 rounded border ${ansiMode ? 'border-accent text-content-primary' : 'border-border text-content-secondary'}`}
                >
                  ANSI editor
                </button>
              </div>
            )}
            {building ? (
              <p className="text-sm text-content-secondary">Building canvas...</p>
            ) : ansiMode && surface ? (
              editable ? (
                <>
                  <ScreenEditor
                    surface={surface}
                    mci={[]}
                    filePath={name}
                    onChange={setSurface}
                    onSave={saveSurface}
                    onCancel={onClose}
                  />
                  <p className="text-xs text-content-secondary">Saving rewrites spacing and line endings to canvas format and flattens bold; bytes otherwise survive.</p>
                </>
              ) : (
                <AnsiCanvas canvas={surface.canvas} />
              )
            ) : (
              <>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  readOnly={!editable}
                  rows={18}
                  spellCheck={false}
                  className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded font-mono text-xs whitespace-pre"
                />
                {editable ? (
                  <button onClick={saveContent} disabled={saving} className="px-4 py-2 bg-accent text-white rounded disabled:opacity-50">
                    {saving ? 'Saving...' : `Save ${name}`}
                  </button>
                ) : (
                  <p className="text-xs text-content-secondary">Generated bulletin - read-only, edit at its source.</p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
