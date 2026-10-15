import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../api/client';
import { useAutosave } from '../../hooks/useAutosave';
import type { MenuConfig, MenuKind } from '@bbs/screens/menu-config/menu-config';

export interface MenuConfigState {
  config: MenuConfig | null;
  /** What the board repaired or dropped in the last save, or when it loaded the file. */
  problems: string[];
  /** Apply a change locally and schedule the write of the whole config. */
  update(change: (c: MenuConfig) => MenuConfig): void;
  status: string | null;
  /** Counts the writes that landed; the preview reads the stored config, so it refreshes on this. */
  saves: number;
}

/**
 * Loads a kind's config once. Edits apply to the local copy at once and the
 * whole config goes to the autosave; the board's repaired answer supplies the
 * problems only - replacing the local copy would overwrite what the sysop
 * typed while the write was in flight.
 */
export function useMenuConfig(kind: MenuKind): MenuConfigState {
  const [config, setConfig] = useState<MenuConfig | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [saves, setSaves] = useState(0);
  const latest = useRef<MenuConfig | null>(null);

  useEffect(() => {
    let live = true;
    setConfig(null);
    latest.current = null;
    setStatus(null);
    apiClient.getMenuConfig(kind).then(
      answer => {
        if (!live) return;
        latest.current = answer.config;
        setConfig(answer.config);
        setProblems(answer.problems);
      },
      (e: unknown) => { if (live) setStatus(`Error: ${e instanceof Error ? e.message : 'Failed to load the menu settings'}`); },
    );
    return () => { live = false; };
  }, [kind]);

  const autosave = useAutosave<MenuConfig>({
    save: async next => {
      const answer = await apiClient.saveMenuConfig(kind, next);
      setProblems(answer.problems);
      setSaves(n => n + 1);
    },
    label: () => 'Menu settings saved',
  });

  const update = (change: (c: MenuConfig) => MenuConfig) => {
    if (!latest.current) return;
    const next = change(latest.current);
    if (next === latest.current) return;
    latest.current = next;
    setConfig(next);
    autosave.schedule(next, kind);
  };

  return { config, problems, update, status: status ?? (autosave.error ? `Error: ${autosave.error}` : null), saves };
}
