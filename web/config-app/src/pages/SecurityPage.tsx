/**
 * Security levels, edited where the BBS actually reads them.
 *
 * This page used to write a `security_level_access` database table while the
 * BBS read Access/ACS.<level>.info from disk, so nothing configured here ever
 * took effect. It also offered a hardcoded [10, 20, 50, 100, 200, 255], which
 * matched neither the files on disk nor the users - level 30, where 30
 * accounts sit, could not be chosen at all, and picking a level was really
 * picking from that list.
 *
 * Now: the levels come from the files that exist, every ACS permission is
 * listed with its true state, saving writes the .info file (backing it up
 * first), and a level that does not exist yet can be created from an existing
 * one - a .info is a binary Amiga icon, so a new level starts as a copy.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Plus, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { acsLabel, groupPermissions, ACS_NOT_FROM_THIS_FILE } from './acs-permission-groups';

export function SecurityPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useNotification();

  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [newLevel, setNewLevel] = useState('');
  const [permissionFilter, setPermissionFilter] = useState('');

  const levelsQuery = useQuery({
    queryKey: ['acs-levels'],
    queryFn: () => apiClient.getAcsLevels(),
  });

  // Memoised: the effect below depends on it, and a fresh [] each render
  // would re-run it every time.
  const levels: number[] = useMemo(() => levelsQuery.data?.data?.levels ?? [], [levelsQuery.data]);
  /** The levels users actually hold, and which ACS file serves each. */
  const inUse: Array<{ level: number; users: number; servedBy: number | null }> = useMemo(
    () => levelsQuery.data?.data?.inUse ?? [],
    [levelsQuery.data]
  );

  /**
   * The levels this file answers for besides its own.
   *
   * A board whose users are level 30 with no ACS.30.info has them served by
   * ACS.20.info, so opening "level 30" shows level 20 - correct, and baffling
   * without this line.
   */
  const servedLevels = useMemo(
    () => inUse.filter(row => row.servedBy === selectedLevel && row.level !== selectedLevel),
    [inUse, selectedLevel]
  );
  // Memoised for the same reason as `levels`: a fresh [] each render would
  // re-run the filter below on every render.
  const permissions: string[] = useMemo(
    () => levelsQuery.data?.data?.permissions ?? [],
    [levelsQuery.data]
  );

  // 87 permissions, in the order the bits sit in the file. Grouped by what
  // they are for, and filtered on the description as well as the raw name -
  // a sysop looking for "download" should not have to know it is spelled
  // ACS.DOWNLOAD, or that ACS.ZOOM_MAIL is about mail.
  const visibleGroups = useMemo(() => {
    const needle = permissionFilter.trim().toLowerCase();
    const matches = (name: string) =>
      !needle ||
      name.toLowerCase().includes(needle) ||
      acsLabel(name).toLowerCase().includes(needle);
    return groupPermissions(permissions, matches);
  }, [permissions, permissionFilter]);

  const visibleCount = useMemo(
    () => visibleGroups.reduce((total, group) => total + group.permissions.length, 0),
    [visibleGroups]
  );

  // Select the first real level once we know what exists, rather than
  // defaulting to a number that may have no file at all.
  useEffect(() => {
    if (selectedLevel === null && levels.length > 0) setSelectedLevel(levels[0]);
  }, [levels, selectedLevel]);

  const flagsQuery = useQuery({
    queryKey: ['acs-flags', selectedLevel],
    queryFn: () => apiClient.getAcsLevelFlags(selectedLevel as number),
    enabled: selectedLevel !== null,
  });

  useEffect(() => {
    if (flagsQuery.data?.data?.flags) {
      setFlags(flagsQuery.data.data.flags);
      setDirty(false);
    }
  }, [flagsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => apiClient.saveAcsLevelFlags(selectedLevel as number, flags),
    onSuccess: () => {
      showSuccess(`Level ${selectedLevel} saved to its .info file`);
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['acs-flags', selectedLevel] });
    },
    onError: (error: Error) => showError(`Failed to save: ${error.message}`),
  });

  const createMutation = useMutation({
    mutationFn: (level: number) => apiClient.createAcsLevel(level),
    onSuccess: (res: any, level: number) => {
      showSuccess(res?.message ?? `Level ${level} created`);
      setNewLevel('');
      queryClient.invalidateQueries({ queryKey: ['acs-levels'] });
      setSelectedLevel(level);
    },
    onError: (error: Error) => showError(`Failed to create level: ${error.message}`),
  });

  const toggle = (name: string) => {
    setFlags(prev => ({ ...prev, [name]: !prev[name] }));
    setDirty(true);
  };

  const handleCreate = () => {
    const level = parseInt(newLevel, 10);
    if (!Number.isFinite(level) || level < 1 || level > 255) {
      showError('Security level must be a number between 1 and 255');
      return;
    }
    createMutation.mutate(level);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="text-accent" size={24} />
        <div>
          <h1 className="text-xl font-semibold">Security Levels</h1>
          <p className="text-sm text-bbs-muted">
            Read and written as Access/ACS.&lt;level&gt;.info, the files the BBS reads.
          </p>
        </div>
      </div>

      {/* Levels that exist, plus a way to add one */}
      <div className="flex flex-wrap items-center gap-2">
        {levelsQuery.isLoading && <span className="text-bbs-muted">Loading levels...</span>}
        {levels.map(level => (
          <button
            key={level}
            onClick={() => setSelectedLevel(level)}
            className={`px-3 py-1 rounded border ${
              level === selectedLevel
                ? 'bg-bbs-accent/20 border-bbs-accent text-accent'
                : 'border-bbs-muted/40 text-bbs-muted hover:border-bbs-accent/60'
            }`}
          >
            Level {level}
          </button>
        ))}

        <div className="flex items-center gap-1 ml-2">
          <input
            value={newLevel}
            onChange={e => setNewLevel(e.target.value)}
            placeholder="new level"
            className="w-24 px-2 py-1 bg-transparent border border-bbs-muted/40 rounded text-sm"
          />
          <button
            onClick={handleCreate}
            disabled={createMutation.isPending}
            className="flex items-center gap-1 px-2 py-1 rounded border border-bbs-muted/40 hover:border-bbs-accent/60 text-sm"
            title="Creates ACS.<level>.info by copying the nearest lower level"
          >
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      {levels.length === 0 && !levelsQuery.isLoading && (
        <p className="text-bbs-muted">
          No ACS level files found in the Access directory.
        </p>
      )}

      {/* The levels USERS hold, and which file each is served from.
          Listing only the files made this page look invented: a board whose
          new users are level 30 saw 10/20/50/255 and no way to tell that a
          level-30 caller is served out of ACS.20 (express.e:3025 rounds down
          to a multiple of five, then walks down). */}
      {inUse.length > 0 && (
        <div className="p-3 rounded border border-bbs-muted/30 text-sm">
          <p className="mb-2 text-content-secondary">
            The levels your users hold, and the file that serves each. A level
            with no file of its own is served by the nearest lower one.
          </p>
          <div className="flex flex-wrap gap-2">
            {inUse.map(row => {
              const exact = row.servedBy === row.level;
              return (
                <button
                  key={row.level}
                  onClick={() => row.servedBy !== null && setSelectedLevel(row.servedBy)}
                  className={`px-2 py-1 rounded border text-left ${
                    exact ? 'border-status-ok/50' : 'border-status-warn/50'
                  }`}
                  title={
                    row.servedBy === null
                      ? 'No ACS file matches - this level gets nothing'
                      : exact
                        ? `Served by its own ACS.${row.level}.info`
                        : `Served by ACS.${row.servedBy}.info - there is no ACS.${row.level}.info`
                  }
                >
                  <span className="text-content-primary">Level {row.level}</span>
                  <span className="ml-2 text-content-muted">
                    {row.users} user{row.users === 1 ? '' : 's'}
                  </span>
                  <span className="ml-2 text-content-muted">
                    {row.servedBy === null
                      ? '-> nothing'
                      : exact
                        ? '-> its own file'
                        : `-> ACS.${row.servedBy}.info`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Flags for the selected level */}
      {selectedLevel !== null && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">
                Level {selectedLevel} - {visibleCount === permissions.length
                  ? `${permissions.length} permissions`
                  : `${visibleCount} of ${permissions.length} permissions`}
              </h2>
              {/*
                Clicking a level that has no file of its own opens the file
                that SERVES it - ACS.20.info for a board full of level-30
                users - and the heading then says 20 with nothing to say where
                you came from. Reported as "level 30 is labeled as level 20".
                express.e:3025 rounds a level down to a multiple of five and
                walks down, so the mapping is right; only the silence was
                wrong.
              */}
              {servedLevels.length > 0 && (
                <p className="text-sm text-content-muted">
                  Also serves {servedLevels.map(l => `level ${l.level} (${l.users} user${l.users === 1 ? '' : 's'})`).join(', ')}
                  {' '}- {servedLevels.length === 1 ? 'that level has' : 'those levels have'} no ACS file of their own
                </p>
              )}
            </div>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
              className={`flex items-center gap-2 px-3 py-1 rounded border ${
                dirty
                  ? 'border-bbs-accent text-accent hover:bg-bbs-accent/10'
                  : 'border-bbs-muted/30 text-bbs-muted'
              }`}
            >
              <Save size={16} /> {saveMutation.isPending ? 'Saving...' : 'Save to .info'}
            </button>
          </div>

          <input
            type="search"
            value={permissionFilter}
            onChange={e => setPermissionFilter(e.target.value)}
            placeholder="Filter permissions"
            aria-label="Filter permissions"
            className="w-full max-w-xs px-2 py-1 bg-transparent border border-bbs-muted/40 rounded text-sm"
          />

          {(flagsQuery.data?.data?.ambiguous?.length ?? 0) > 0 && (
            <div className="px-3 py-2 rounded border border-status-warn/50 text-sm text-content-primary">
              <p className="font-semibold">
                {flagsQuery.data!.data!.ambiguous!.length} permission(s) written =NO in this
                file mean opposite things on the two systems.
              </p>
              <p className="text-content-muted">
                A real AmiExpress board grants a permission because the tooltype
                is there at all, whatever it is set to, so ACS.DOWNLOAD=NO grants
                download there and denies it here. Saving this level rewrites
                them in the disabled form, which denies on both:{' '}
                {flagsQuery.data!.data!.ambiguous!.join(', ')}
              </p>
            </div>
          )}

          {flagsQuery.isLoading ? (
            <p className="text-bbs-muted">Loading flags...</p>
          ) : visibleCount === 0 ? (
            <p className="text-bbs-muted">No permission matches "{permissionFilter}".</p>
          ) : (
            <div className="space-y-5">
              {visibleGroups.map(group => (
                <section key={group.title}>
                  <h3 className="text-sm font-semibold text-content-primary">
                    {group.title}
                    <span className="ml-2 font-normal text-content-muted">
                      {group.permissions.length}
                    </span>
                  </h3>
                  <p className="mb-2 text-xs text-content-muted">{group.description}</p>

                  <div className="grid gap-1 md:grid-cols-2">
                    {group.permissions.map(name => {
                      const granted = !!flags[name];
                      return (
                        <button
                          key={name}
                          onClick={() => toggle(name)}
                          aria-pressed={granted}
                          className="flex items-start gap-2 px-3 py-2 rounded border border-bbs-muted/20 hover:border-bbs-accent/50 text-left"
                        >
                          {granted ? (
                            <ToggleRight className="mt-0.5 text-status-ok shrink-0" size={20} />
                          ) : (
                            <ToggleLeft className="mt-0.5 text-bbs-muted shrink-0" size={20} />
                          )}
                          <span className="min-w-0">
                            <span className={`block ${granted ? 'text-content-primary' : 'text-bbs-muted'}`}>
                              {acsLabel(name)}
                            </span>
                            {/* The raw flag is what is written in the .info
                                file and what the AmiExpress documentation
                                calls it, so it stays on screen. */}
                            <span className="block font-mono text-xs text-content-muted">{name}</span>
                            {/* express.e:8466-8485 resolves eighteen of these
                                before it ever opens this file. A switch that
                                cannot do anything must not read as a live
                                control. */}
                            {ACS_NOT_FROM_THIS_FILE[name] && (
                              <span className="block text-xs text-status-warn">
                                {ACS_NOT_FROM_THIS_FILE[name]}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
