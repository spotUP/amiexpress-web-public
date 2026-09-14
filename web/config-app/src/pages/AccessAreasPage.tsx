/**
 * Who may join which conference.
 *
 * AmiExpress decides conference access two ways, and `checkConfAccess`
 * (express.e:8499-8512) picks per user by the SHAPE of their access field:
 * `X`/`_` is one character per conference, anything else is the NAME of an
 * area whose icon carries a `Conf.<n>` per conference it grants. There is no
 * flag for it, and the two cannot be mixed on one account.
 *
 * Neither could be edited here until now - the user form has no conference
 * field and nothing wrote `Access/AREA.*.info` - so a private conference's
 * membership had to be set by editing binary icons on the volume.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

interface AccessArea {
  name: string;
  conferences: number[];
  users: number;
}

interface Conference {
  conference_id?: number;
  id: number;
  name: string;
}

export function AccessAreasPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useNotification();
  const [newName, setNewName] = useState('');

  const areasQuery = useQuery({
    queryKey: ['access-areas'],
    queryFn: () => apiClient.getAccessAreas(),
  });
  const areas: AccessArea[] = areasQuery.data?.data?.areas ?? [];
  const onFlags: number = areasQuery.data?.data?.usersOnFlagStrings ?? 0;
  const dangling: { name: string; users: number }[] =
    areasQuery.data?.data?.danglingAreas ?? [];

  const confQuery = useQuery({
    queryKey: ['conference-configs'],
    queryFn: () => apiClient.getConferenceConfigs(),
  });
  const conferences: Conference[] = confQuery.data?.data ?? [];

  const save = useMutation({
    mutationFn: ({ name, conferences: confs }: { name: string; conferences: number[] }) =>
      apiClient.saveAccessArea(name, confs),
    onSuccess: (_r, vars) => {
      showSuccess(`${vars.name} saved`);
      queryClient.invalidateQueries({ queryKey: ['access-areas'] });
    },
    onError: (e: Error) => showError(e.message),
  });

  const remove = useMutation({
    mutationFn: (name: string) => apiClient.deleteAccessArea(name),
    onSuccess: (_r, name) => {
      showSuccess(`${name} removed`);
      queryClient.invalidateQueries({ queryKey: ['access-areas'] });
    },
    onError: (e: Error) => showError(e.message),
  });

  /** Tick or untick one conference for one area, and write it straight away. */
  const toggle = (area: AccessArea, confId: number) => {
    const next = area.conferences.includes(confId)
      ? area.conferences.filter((n) => n !== confId)
      : [...area.conferences, confId].sort((a, b) => a - b);
    save.mutate({ name: area.name, conferences: next });
  };

  if (areasQuery.isLoading) return <div className="p-4">Loading access areas…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Conference access areas</h2>
        <p className="text-sm text-content-secondary mt-1">
          An area names a set of conferences. A user whose access field holds the
          area's name may join exactly those. Untick a conference to take it away.
        </p>
      </div>

      {dangling.length > 0 && (
        <div className="card p-4" data-testid="dangling-areas">
          <h3 className="font-semibold">Users pointing at an area that does not exist</h3>
          <p className="text-sm text-content-secondary mt-1">
            These accounts can join <strong>no conference at all</strong> — the board
            looks for a grant in a file that is not there. Create the area, or move
            them to one that exists.
          </p>
          <ul className="mt-2 text-sm">
            {dangling.map((d) => (
              <li key={d.name}>
                <span className="font-mono">{d.name}</span> — {d.users} user(s)
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2">Area</th>
              <th className="text-right p-2">Users</th>
              {conferences.map((c) => (
                <th key={c.id} className="p-2 text-left whitespace-nowrap">
                  {c.id}. {c.name}
                </th>
              ))}
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => (
              <tr key={area.name} data-testid={`area-${area.name}`}>
                <td className="p-2 font-mono">{area.name}</td>
                <td className="p-2 text-right">{area.users}</td>
                {conferences.map((c) => (
                  <td key={c.id} className="p-2">
                    <input
                      type="checkbox"
                      aria-label={`${area.name} may join ${c.name}`}
                      checked={area.conferences.includes(c.id)}
                      onChange={() => toggle(area, c.id)}
                    />
                  </td>
                ))}
                <td className="p-2 text-right">
                  <button
                    className="btn-secondary"
                    // An area in use cannot be deleted - the server refuses,
                    // because its members would lose every conference - so the
                    // button says so before it is pressed.
                    disabled={area.users > 0 || remove.isPending}
                    title={area.users > 0 ? `${area.users} user(s) still use this area` : 'Remove'}
                    onClick={() => remove.mutate(area.name)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold">New area</h3>
        <div className="flex gap-2 mt-2">
          <input
            className="input-field"
            aria-label="New area name"
            placeholder="e.g. Internal"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            className="btn-primary"
            disabled={!newName.trim() || save.isPending}
            onClick={() => {
              // Created empty: granting a conference is the same tick as any
              // other change, so there is one path that writes a grant.
              save.mutate({ name: newName.trim(), conferences: [] });
              setNewName('');
            }}
          >
            Create
          </button>
        </div>
        <p className="text-xs text-content-secondary mt-2">
          Letters, digits, dash or underscore. A name made only of X and _ is
          refused: the board would read it back as a conference flag string
          rather than as a name.
        </p>
      </div>

      {onFlags > 0 && (
        <div className="card p-4" data-testid="users-on-flags">
          <h3 className="font-semibold">{onFlags} user(s) still on flag strings</h3>
          <p className="text-sm text-content-secondary mt-1">
            Their access is an <span className="font-mono">X</span>/
            <span className="font-mono">_</span> string rather than an area, so it is
            set per user and not here. Flag strings also stop at nine conferences.
          </p>
        </div>
      )}
    </div>
  );
}
