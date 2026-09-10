import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import { SkeletonRows } from '../components/ui/states';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';

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
  const [problems, setProblems] = useState<BullsProblem[]>([]);
  const [raw, setRaw] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

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
        setEntries(data.entries);
        setProblems(Array.isArray(data.problems) ? data.problems : []);
        setRaw(typeof data.raw === 'string' ? data.raw : '');
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

  const columns: DataTableColumn<BullsEntry>[] = [
    { id: 'line', header: 'Line', value: (e) => e.line, mono: true },
    { id: 'title', header: 'Title', value: (e) => e.title },
    { id: 'file', header: 'File', value: (e) => e.file, mono: true },
    {
      id: 'status', header: 'Status', sortable: false,
      cell: (e) => {
        const ps = problemsFor(e.line);
        if (!ps.length) return <span className="text-status-ok">[OK]</span>;
        return <span className="text-status-error" title={ps.map((p) => p.message).join('; ')}>{ps.map((p) => KIND_LABEL[p.kind] ?? '[?]').join(' ')}</span>;
      },
    },
  ];

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res: any = await apiClient.saveBullsConfig(raw);
      const data = res?.data ?? res;
      if (data && Array.isArray(data.entries)) {
        setEntries(data.entries);
        setProblems(Array.isArray(data.problems) ? data.problems : []);
        const left = (Array.isArray(data.problems) ? data.problems : []).length;
        setStatus(left ? `Saved with ${left} problem${left === 1 ? '' : 's'} flagged below.` : 'Saved, no problems.');
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
        <DataTable columns={columns} rows={entries} getRowId={(e) => `${e.line}`} emptyMessage="No bull entries." />
      )}

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">Bulls.CFG text</label>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={24}
          spellCheck={false}
          className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded font-mono text-xs whitespace-pre"
        />
      </div>

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-accent text-white rounded disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Bulls.CFG'}
        </button>
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-surface-0 border border-border text-content-primary rounded disabled:opacity-50">
          Reload
        </button>
      </div>
    </div>
  );
}
