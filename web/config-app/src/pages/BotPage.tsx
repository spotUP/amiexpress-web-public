/**
 * One page for every bot plugin (WHIP mirror first).
 *
 * Status, start/stop/restart, log tail, and a config form generated from
 * the manifest's configSchema - so the next bot needs a nav entry and a
 * route, not a new page. Unknown plugin id renders the not-installed
 * state, which is also what guards-non-installed sidebar entries land on.
 */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Play, Square, RotateCcw } from 'lucide-react';

import { apiClient } from '../api/client';
import { SkeletonRows } from '../components/ui/states';

interface ConfigField {
  key: string;
  label: string;
  secret: boolean;
  default?: string;
  value: string;
  set: boolean;
}

function unwrapList(res: any): any[] {
  const data = res?.data ?? res;
  return Array.isArray(data) ? data : [];
}

export function BotPage({ pluginId }: { pluginId: string }) {
  const queryClient = useQueryClient();
  const [logSearch, setLogSearch] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const pluginsQuery = useQuery({
    queryKey: ['bot-plugins'],
    queryFn: () => apiClient.getBotPlugins(),
    staleTime: 60000,
    retry: false,
  });
  const plugins = unwrapList(pluginsQuery.data);
  const manifest = plugins.find((p: any) => p.id === pluginId);

  const statusQuery = useQuery({
    queryKey: ['bot-status', pluginId],
    queryFn: () => apiClient.getBotStatus(pluginId),
    enabled: !!manifest,
    refetchInterval: 15000,
    retry: false,
  });
  const status = (statusQuery.data as any)?.data ?? (statusQuery.data as any);

  const logsQuery = useQuery({
    queryKey: ['bot-logs', pluginId, logSearch],
    queryFn: () => apiClient.getBotLogs(pluginId, 200, logSearch),
    enabled: !!manifest,
    retry: false,
  });
  const logLines: string[] = (logsQuery.data as any)?.data?.lines ?? [];

  const configQuery = useQuery({
    queryKey: ['bot-config', pluginId],
    queryFn: () => apiClient.getBotConfig(pluginId),
    enabled: !!manifest,
    retry: false,
  });
  const fields: ConfigField[] = (configQuery.data as any)?.data ?? [];

  // Pre-fill what the backend echoes (non-secrets); secrets stay blank and
  // untouched fields merge server-side, so saving never wipes them.
  useEffect(() => {
    setDraft((current) => {
      if (Object.keys(current).length > 0) return current;
      const next: Record<string, string> = {};
      for (const field of fields) {
        if (!field.secret && field.value) next[field.key] = field.value;
      }
      return next;
    });
  }, [fields]);

  const actionMutation = useMutation({
    mutationFn: (action: 'start' | 'stop' | 'restart') => apiClient.botAction(pluginId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-status', pluginId] });
      queryClient.invalidateQueries({ queryKey: ['bot-logs', pluginId] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, string>) => apiClient.setBotConfig(pluginId, values),
    onSuccess: (res: any) => {
      setDirty(false);
      setNotice((res as any)?.message ?? 'Saved. Restart the bot to apply.');
      queryClient.invalidateQueries({ queryKey: ['bot-config', pluginId] });
    },
  });

  if (pluginsQuery.isLoading) {
    return (
      <div className="p-5">
        <SkeletonRows rows={8} />
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="space-y-4 p-1">
        <h1 className="text-2xl font-bold text-content-primary">Bot not installed</h1>
        <p className="text-content-secondary">
          No <span className="font-mono">{pluginId}</span> plugin is registered on this board
          (no <span className="font-mono">bots/{pluginId}/bot.json</span> was found). Install the
          bot first — then this page manages it.
        </p>
      </div>
    );
  }

  const state: string = status?.state ?? 'unknown';
  const stateColor =
    state === 'running' ? 'text-green-600' : state === 'stopped' ? 'text-content-muted' : 'text-amber-600';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-content-primary">
          <Bot size={22} aria-hidden="true" /> {manifest.name}
        </h1>
        <p className="mt-1 text-content-secondary">
          {manifest.description} (v{manifest.version})
        </p>
      </div>

      <section className="rounded border border-border bg-surface-1 p-4">
        <h2 className="mb-2 text-lg font-semibold text-content-primary">Status</h2>
        <p className="text-content-secondary">
          State: <span className={`font-semibold ${stateColor}`}>{state}</span>
          {status?.detail ? ` — ${status.detail}` : ''}
        </p>
        {status?.botHealth ? (
          <p className="mt-1 text-sm text-content-secondary">
            Discord: {status.botHealth.discordReady ? 'connected' : 'not connected'} · Feed:{' '}
            {status.botHealth.feed?.enabled ? 'on' : 'off'}
            {status.botHealth.feed?.lastEventAt ? ` · last event ${status.botHealth.feed.lastEventAt}` : ''}
            {typeof status.botHealth.uptimeSec === 'number' ? ` · up ${status.botHealth.uptimeSec}s` : ''}
          </p>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => actionMutation.mutate('start')}
            disabled={actionMutation.isPending}
            className="flex items-center gap-1 rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            <Play size={14} aria-hidden="true" /> Start
          </button>
          <button
            type="button"
            onClick={() => actionMutation.mutate('stop')}
            disabled={actionMutation.isPending}
            className="flex items-center gap-1 rounded border border-border-strong px-3 py-1.5 text-sm text-content-primary disabled:opacity-50"
          >
            <Square size={14} aria-hidden="true" /> Stop
          </button>
          <button
            type="button"
            onClick={() => actionMutation.mutate('restart')}
            disabled={actionMutation.isPending}
            className="flex items-center gap-1 rounded border border-border-strong px-3 py-1.5 text-sm text-content-primary disabled:opacity-50"
          >
            <RotateCcw size={14} aria-hidden="true" /> Restart
          </button>
        </div>
        {actionMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">Action failed. See logs below.</p>
        ) : null}
      </section>

      <section className="rounded border border-border bg-surface-1 p-4">
        <h2 className="mb-2 text-lg font-semibold text-content-primary">Configuration</h2>
        {fields.map((field) => (
          <label key={field.key} className="mb-3 block">
            <span className="mb-1 block text-sm text-content-secondary">
              {field.label} {field.secret && field.set ? '(set — entering a value replaces it)' : ''}
            </span>
            <input
              type={field.secret ? 'password' : 'text'}
              value={draft[field.key] ?? ''}
              placeholder={field.secret ? (field.set ? '••••••••' : '') : (field.default ?? '')}
              onChange={(e) => {
                setDraft((d) => ({ ...d, [field.key]: e.target.value }));
                setDirty(true);
                setNotice(null);
              }}
              className="w-full max-w-xl rounded border border-border-strong bg-surface-0 px-2 py-1.5 text-sm text-content-primary"
            />
          </label>
        ))}
        <button
          type="button"
          onClick={() => saveMutation.mutate(draft)}
          disabled={!dirty || saveMutation.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Save
        </button>
        {notice ? <p className="mt-2 text-sm text-content-secondary">{notice}</p> : null}
      </section>

      <section className="rounded border border-border bg-surface-1 p-4">
        <h2 className="mb-2 text-lg font-semibold text-content-primary">Logs</h2>
        <input
          type="text"
          value={logSearch}
          onChange={(e) => setLogSearch(e.target.value)}
          placeholder="Filter logs"
          aria-label="Filter bot logs"
          className="mb-2 w-full max-w-xl rounded border border-border-strong bg-surface-0 px-2 py-1.5 text-sm text-content-primary"
        />
        <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded bg-surface-0 p-2 font-mono text-xs text-content-primary">
          {logLines.length > 0 ? logLines.join('\n') : 'No log lines.'}
        </pre>
      </section>
    </div>
  );
}
