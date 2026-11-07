import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import type { ChatRole, ChatRolePerms, ChatRoleAssignment } from '../api/client';
import { SkeletonRows } from '../components/ui/states';

/** The 16 ANSI palette colours, index = SGR offset (0-7 normal, 8-15 bright). */
const ANSI_COLOURS: Array<{ name: string; hex: string }> = [
  { name: 'Black', hex: '#000000' }, { name: 'Red', hex: '#aa0000' },
  { name: 'Green', hex: '#00aa00' }, { name: 'Yellow', hex: '#aa5500' },
  { name: 'Blue', hex: '#0000aa' }, { name: 'Magenta', hex: '#aa00aa' },
  { name: 'Cyan', hex: '#00aaaa' }, { name: 'White', hex: '#aaaaaa' },
  { name: 'Bright Black', hex: '#555555' }, { name: 'Bright Red', hex: '#ff5555' },
  { name: 'Bright Green', hex: '#55ff55' }, { name: 'Bright Yellow', hex: '#ffff55' },
  { name: 'Bright Blue', hex: '#5555ff' }, { name: 'Bright Magenta', hex: '#ff55ff' },
  { name: 'Bright Cyan', hex: '#55ffff' }, { name: 'Bright White', hex: '#ffffff' },
];

const PERM_LABELS: Array<[keyof ChatRolePerms, string]> = [
  ['kick', 'Kick'], ['ban', 'Ban'], ['mute', 'Mute'], ['topic', 'Set Topic'], ['createPrivate', 'Create Private Rooms'],
];

export function ChatRolesPage() {
  const [roles, setRoles] = useState<ChatRole[]>([]);
  const [assignments, setAssignments] = useState<ChatRoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [handle, setHandle] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRoles((await apiClient.getChatRoles()) ?? []);
      setAssignments((await apiClient.getChatRoleAssignments()) ?? []);
      setStatus(null);
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Every change writes itself: no Save button in the admin UI. */
  const save = async (role: ChatRole) => {
    try {
      const { id, ...input } = role;
      await apiClient.saveChatRole(input, id);
      setStatus('Role saved');
      await load();
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
    }
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await apiClient.saveChatRole({
        name, colorHex: ANSI_COLOURS[7].hex, colorAnsi: 7, position: roles.length,
        perms: { kick: false, ban: false, mute: false, topic: false, createPrivate: false },
      });
      setNewName('');
      await load();
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
    }
  };

  const remove = async (id: string) => {
    try {
      await apiClient.deleteChatRole(id);
      await load();
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
    }
  };

  const rolesOf = (h: string) => assignments.filter(a => a.handle === h).map(a => a.roleId);
  const handles = Array.from(new Set(assignments.map(a => a.handle)));

  const toggleAssignment = async (h: string, roleId: string) => {
    const current = rolesOf(h);
    const next = current.includes(roleId) ? current.filter(r => r !== roleId) : [...current, roleId];
    try {
      await apiClient.setChatRoleAssignments(h, next);
      await load();
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
    }
  };

  if (loading) return <div className="p-5"><SkeletonRows rows={8} /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content-primary">Chat Roles</h1>
        <p className="text-content-secondary mt-1">
          Roles and colours your callers wear in livechat. The colour shows on the web, and as the nearest
          of the 16 ANSI colours on telnet and SSH.
        </p>
      </div>

      {status && (
        <span className={`text-sm ${status.startsWith('Error') ? 'text-alert' : 'text-ok'}`}>{status}</span>
      )}

      <div className="card space-y-4">
        {roles.length === 0 && <p className="text-sm text-content-muted">No roles yet.</p>}
        {roles.map(role => (
          <div key={role.id} className="border-b border-border last:border-0 pb-4 last:pb-0 space-y-2">
            <div className="flex items-center gap-3">
              <input
                className="input-field w-56"
                aria-label={`Name of role ${role.name}`}
                defaultValue={role.name}
                onBlur={e => { if (e.target.value.trim() && e.target.value !== role.name) save({ ...role, name: e.target.value.trim() }); }}
              />
              <input
                className="input-field w-28"
                aria-label={`Hex colour of role ${role.name}`}
                defaultValue={role.colorHex}
                onBlur={e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value) && e.target.value !== role.colorHex) save({ ...role, colorHex: e.target.value }); }}
              />
              <button className="btn-small btn-secondary" onClick={() => remove(role.id)}>Delete</button>
            </div>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Terminal colour of role ${role.name}`}>
              {ANSI_COLOURS.map((c, i) => (
                <button
                  key={c.name}
                  role="radio"
                  aria-checked={role.colorAnsi === i}
                  aria-label={c.name}
                  title={c.name}
                  onClick={() => save({ ...role, colorAnsi: i })}
                  className={`w-6 h-6 rounded border ${role.colorAnsi === i ? 'border-content-primary' : 'border-border'}`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-4">
              {PERM_LABELS.map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-content-secondary">
                  <input
                    type="checkbox"
                    checked={role.perms[key]}
                    onChange={e => save({ ...role, perms: { ...role.perms, [key]: e.target.checked } })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            className="input-field w-56"
            placeholder="New role name"
            aria-label="New role name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
          />
          <button className="btn-small btn-primary" onClick={add}>Add Role</button>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-content-primary">Who Wears Which Role</h2>
        {handles.map(h => (
          <div key={h} className="flex flex-wrap items-center gap-4">
            <span className="w-48 text-sm text-content-primary">{h}</span>
            {roles.map(r => (
              <label key={r.id} className="flex items-center gap-2 text-sm text-content-secondary">
                <input type="checkbox" checked={rolesOf(h).includes(r.id)} onChange={() => toggleAssignment(h, r.id)} />
                {r.name}
              </label>
            ))}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            className="input-field w-56"
            placeholder="handle@BOARD"
            aria-label="Caller handle"
            value={handle}
            onChange={e => setHandle(e.target.value)}
          />
          <button
            className="btn-small btn-secondary"
            disabled={!handle.trim() || roles.length === 0}
            onClick={async () => { await toggleAssignment(handle.trim(), roles[0].id); setHandle(''); }}
          >
            Give First Role
          </button>
        </div>
      </div>
    </div>
  );
}
