import { useState, useEffect, useCallback } from 'react';
import { useAutosave } from '../hooks/useAutosave';
import { apiClient } from '../api/client';
import { SkeletonRows } from '../components/ui/states';

interface SectionInfo {
  key: string;
  label: string;
  defaultMinLevel: number;
}

export function AdminRolesPage() {
  const [perms, setPerms] = useState<Record<string, number> | null>(null);
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.getAdminPermissions();
      if (data) {
        setPerms(data.perms);
        setSections(data.sections ?? []);
        setDraft({ ...data.perms });
      }
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * Every change writes itself. No Save button - "i want no save buttons at
   * all in the admin ui everything should auto save" (sysop, 2026-09-14).
   *
   * A level typed into a row is the edit; `useAutosave` debounces the burst
   * and writes once it stops, which also keeps a run of arrow-key nudges from
   * becoming a run of requests.
   */
  const autosave = useAutosave<Record<string, number>>({
    save: async next => {
      const result = await apiClient.setAdminPermissions(next);
      if (result) setPerms(result.perms);
    },
    label: () => 'Access levels saved',
  });

  /** The one way a level changes: edit the draft AND schedule the write. */
  const edit = (next: Record<string, number>) => {
    setDraft(next);
    autosave.schedule(next);
  };

  const handleReset = () => {
    const defaults: Record<string, number> = {};
    for (const s of sections) defaults[s.key] = s.defaultMinLevel;
    edit(defaults);
  };

  const startEdit = (key: string, val: number) => {
    setEditingKey(key);
    setEditValue(String(val));
  };

  const commitEdit = (key: string) => {
    const n = parseInt(editValue, 10);
    if (!isNaN(n) && n >= 0 && n <= 255) {
      edit({ ...draft, [key]: n });
    }
    setEditingKey(null);
  };

  const dirty = JSON.stringify(perms) !== JSON.stringify(draft);

  if (loading) return <div className="p-5"><SkeletonRows rows={12} /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content-primary">Admin Roles</h1>
        <p className="text-content-secondary mt-1">
          Configure the minimum security level required for each section of the admin panel.
          Users with a level below the threshold cannot see or navigate to that section.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-2xs font-semibold uppercase tracking-widest text-content-muted">
              <th className="px-4 py-2 text-left">Section</th>
              <th className="px-4 py-2 text-left w-48">Minimum Level</th>
              <th className="px-4 py-2 text-left w-24">Default</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => {
              const val = draft[sec.key] ?? sec.defaultMinLevel;
              const isEditing = editingKey === sec.key;
              return (
                <tr key={sec.key} className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2 text-sm text-content-primary">{sec.label}</td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={255}
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') commitEdit(sec.key); if (e.key === 'Escape') setEditingKey(null); }}
                          className="input-field w-20"
                          autoFocus
                        />
                        <button onClick={() => commitEdit(sec.key)} className="text-xs text-accent hover:underline">save</button>
                        <button onClick={() => setEditingKey(null)} className="text-xs text-content-muted hover:underline">cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(sec.key, val)}
                        className={`px-3 py-1 rounded text-sm font-mono transition-colors ${
                          val >= 255
                            ? 'bg-alert/10 text-alert'
                            : val >= 100
                            ? 'bg-warn/10 text-warn'
                            : 'bg-ok/10 text-ok'
                        }`}
                      >
                        {val === 0 ? 'Public' : `SL ${val}`}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-content-muted font-mono">{sec.defaultMinLevel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        {/* No Save button: a change is written as soon as the typing stops. */}
        <span className="text-sm text-content-secondary">
          {autosave.saving ? 'Saving...' : 'Changes save themselves'}
        </span>
        <button onClick={handleReset} disabled={!dirty} className="btn-secondary">
          Reset to Defaults
        </button>
        {autosave.error && <span className="text-sm text-alert">{autosave.error}</span>}
        {status && (
          <span className={`text-sm ${status.startsWith('Error') ? 'text-alert' : 'text-ok'}`}>{status}</span>
        )}
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-content-primary mb-2">How this works</h3>
        <ul className="space-y-1 text-xs text-content-secondary list-disc pl-4">
          <li>Security levels range from 0 (new user) to 255 (full sysop).</li>
          <li>Set a section to <strong>SL 255</strong> to restrict it to full sysops only.</li>
          <li>Set a section to <strong>SL 100</strong> to allow ANSI artists and editors.</li>
          <li>Set a section to <strong>SL 0</strong> to make it accessible to every authenticated user.</li>
          <li>Changes take effect immediately — no restart required.</li>
        </ul>
      </div>
    </div>
  );
}