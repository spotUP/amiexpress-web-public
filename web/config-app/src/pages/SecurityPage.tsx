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
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Plus, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

export function SecurityPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useNotification();

  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [newLevel, setNewLevel] = useState('');

  const levelsQuery = useQuery({
    queryKey: ['acs-levels'],
    queryFn: () => apiClient.getAcsLevels(),
  });

  const levels: number[] = levelsQuery.data?.data?.levels ?? [];
  const permissions: string[] = levelsQuery.data?.data?.permissions ?? [];

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
        <Shield className="text-bbs-accent" size={24} />
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
                ? 'bg-bbs-accent/20 border-bbs-accent text-bbs-accent'
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

      {/* Flags for the selected level */}
      {selectedLevel !== null && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              Level {selectedLevel} - {permissions.length} permissions
            </h2>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
              className={`flex items-center gap-2 px-3 py-1 rounded border ${
                dirty
                  ? 'border-bbs-accent text-bbs-accent hover:bg-bbs-accent/10'
                  : 'border-bbs-muted/30 text-bbs-muted'
              }`}
            >
              <Save size={16} /> {saveMutation.isPending ? 'Saving...' : 'Save to .info'}
            </button>
          </div>

          {flagsQuery.isLoading ? (
            <p className="text-bbs-muted">Loading flags...</p>
          ) : (
            <div className="grid gap-1 md:grid-cols-2">
              {permissions.map(name => {
                const granted = !!flags[name];
                return (
                  <button
                    key={name}
                    onClick={() => toggle(name)}
                    className="flex items-center gap-2 px-3 py-2 rounded border border-bbs-muted/20 hover:border-bbs-accent/50 text-left"
                  >
                    {granted ? (
                      <ToggleRight className="text-green-500 shrink-0" size={20} />
                    ) : (
                      <ToggleLeft className="text-bbs-muted shrink-0" size={20} />
                    )}
                    <span className={granted ? '' : 'text-bbs-muted'}>{name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
