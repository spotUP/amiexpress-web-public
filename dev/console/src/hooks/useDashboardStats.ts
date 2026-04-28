import { useState, useEffect } from 'react';
import { getSystemStats, getNodes, getLastCallers } from '../api/client.js';
import type { SystemStats, NodeStatus, CallerRecord } from '../api/types.js';

export interface DashboardData {
  stats: SystemStats | null;
  nodes: NodeStatus[];
  recentCallers: CallerRecord[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export function useDashboardStats(intervalMs = 10_000): DashboardData {
  const [data, setData] = useState<DashboardData>({
    stats: null,
    nodes: [],
    recentCallers: [],
    loading: true,
    error: null,
    lastUpdated: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [stats, nodes, recentCallers] = await Promise.all([
          getSystemStats(),
          getNodes(),
          getLastCallers(100),
        ]);
        if (!cancelled) {
          setData({
            stats: stats ?? null,
            nodes,
            recentCallers,
            loading: false,
            error: null,
            lastUpdated: new Date(),
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setData(d => ({
            ...d,
            loading: false,
            error: err instanceof Error ? err.message : 'Failed',
          }));
        }
      }
    }

    poll();
    const id = setInterval(poll, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [intervalMs]);

  return data;
}
