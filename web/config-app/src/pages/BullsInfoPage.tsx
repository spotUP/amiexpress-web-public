import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import { SkeletonRows } from '../components/ui/states';

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
        <ul className="text-sm text-status-error space-y-1">
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
                      : <span className="text-status-error" title={ps.map((p) => p.message).join('; ')}>{ps.map((p) => KIND_LABEL[p.kind] ?? '[?]').join(' ')}</span>}
                  </td>
                  <td className="py-1">
                    <button onClick={() => setDraft(draft.filter((_, j) => j !== i))} className="px-2 py-1 text-status-error hover:underline text-sm">
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

      <BulletinBrowser />
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

function BulletinBrowser() {
  const [list, setList] = useState<BulletinInfo[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [editable, setEditable] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.listBulletins().then((res: any) => {
      const data = res?.data ?? res;
      if (data && Array.isArray(data.bulletins)) setList(data.bulletins);
    }).catch((e: unknown) => setStatus(`Error: ${e instanceof Error ? e.message : 'Failed'}`));
  }, []);

  const openBulletin = async (name: string) => {
    setStatus(null);
    setOpen(name);
    setEditable(false);
    setContent('');
    try {
      const res: any = await apiClient.getBulletin(name);
      const data = res?.data ?? res;
      setContent(typeof data?.content === 'string' ? data.content : '');
      const info = list.find((b) => b.name === name);
      setEditable(!!info && !info.generated);
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
    }
  };

  const saveContent = async () => {
    if (!open) return;
    setSaving(true);
    setStatus(null);
    try {
      await apiClient.saveBulletin(open, content);
      setStatus(`Saved ${open}.`);
      const res: any = await apiClient.listBulletins();
      const data = res?.data ?? res;
      if (data && Array.isArray(data.bulletins)) setList(data.bulletins);
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Save failed'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 pt-4 border-t border-border">
      <div>
        <h3 className="text-lg font-semibold text-content-primary">Bulletins</h3>
        <p className="text-xs text-content-secondary mt-1">
          Generated bulletins (batches own 1-6, the news service owns 7-8) read here but edit at their source.
          Static ones edit below; one .bak is kept per save.
        </p>
      </div>
      {status && <p className="text-sm text-content-primary">{status}</p>}
      <div className="flex flex-wrap gap-2">
        {list.map((b) => (
          <button
            key={b.name}
            onClick={() => openBulletin(b.name)}
            title={b.generated ? `Generated by ${b.generator}` : 'Static - editable'}
            className={`px-3 py-1 rounded border text-sm font-mono ${open === b.name ? 'border-accent text-content-primary' : 'border-border text-content-secondary'} ${b.generated ? '' : 'underline'}`}
          >
            {b.name}{b.generated ? '' : ' *'}
          </button>
        ))}
      </div>
      {open && (
        <div className="space-y-2">
          <p className="text-sm text-content-secondary">
            {open} ({(list.find((b) => b.name === open)?.size ?? 0).toLocaleString()} bytes)
            {editable ? '' : ' - generated, read-only'}
          </p>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            readOnly={!editable}
            rows={16}
            spellCheck={false}
            className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded font-mono text-xs whitespace-pre"
          />
          {editable && (
            <button onClick={saveContent} disabled={saving} className="px-4 py-2 bg-accent text-white rounded disabled:opacity-50">
              {saving ? 'Saving...' : `Save ${open}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
