/**
 * The queries the Overview dashboard and the app header share.
 *
 * Polling intervals are deliberate, and are the ones the redesign plan
 * settled on:
 *
 * - Node status has no push source; it is read from the in-memory session map
 *   on each request. Ten seconds while a node surface is mounted.
 * - Statistics are COUNT(*) queries. Thirty seconds.
 * - The health check walks the filesystem. On mount and on demand only -
 *   polling it would be a self-inflicted load.
 *
 * When the realtime layer lands these keys are what the socket invalidates,
 * which is why they are named here rather than inline in a page.
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useRealtime } from '../realtime/RealtimeProvider';
import type {
  ApiResponse,
  BBSHealthReport,
  Caller,
  FileActivity,
  NodeStatusResponse,
  SessionStats,
  SystemStats,
} from '../types/bbs';

export const NODE_STATUS_KEY = ['nodes', 'status'] as const;
export const SYSTEM_STATS_KEY = ['stats', 'system'] as const;
export const SESSION_STATS_KEY = ['stats', 'session'] as const;
export const HEALTH_KEY = ['health'] as const;

const NODE_POLL_MS = 10_000;
const STATS_POLL_MS = 30_000;

/**
 * With the socket live, an event invalidates these the instant something
 * happens, so the poll is only a safety net and can be slow. With the socket
 * down it is the only thing keeping the screen honest, so it speeds up.
 */
const DEGRADED_NODE_POLL_MS = 3_000;
const DEGRADED_STATS_POLL_MS = 15_000;

function usePollInterval(liveRate: number, degradedRate: number): number {
  const { status } = useRealtime();
  return status === 'live' ? liveRate : degradedRate;
}

/**
 * Node status. The interval is per observer and they share one cache entry,
 * so the header can watch slowly in the background while a node surface that
 * is actually on screen watches at the foreground rate.
 */
export function useNodeStatus(liveInterval: number = NODE_POLL_MS) {
  const refetchInterval = usePollInterval(liveInterval, DEGRADED_NODE_POLL_MS);

  return useQuery<NodeStatusResponse>({
    queryKey: NODE_STATUS_KEY,
    queryFn: async () => {
      const response = await apiClient.get<NodeStatusResponse>('/api/nodes/status');
      return response.data;
    },
    refetchInterval,
  });
}

export const NODE_BACKGROUND_POLL_MS = 60_000;

export function useSystemStats() {
  const refetchInterval = usePollInterval(STATS_POLL_MS, DEGRADED_STATS_POLL_MS);

  return useQuery<ApiResponse<SystemStats>>({
    queryKey: SYSTEM_STATS_KEY,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SystemStats>>('/api/stats/system');
      return response.data;
    },
    refetchInterval,
  });
}

export function useSessionStats() {
  const refetchInterval = usePollInterval(STATS_POLL_MS, DEGRADED_STATS_POLL_MS);

  return useQuery<ApiResponse<SessionStats>>({
    queryKey: SESSION_STATS_KEY,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SessionStats>>('/api/stats/session');
      return response.data;
    },
    refetchInterval,
  });
}

export function useLastCallers(limit = 8) {
  const refetchInterval = usePollInterval(STATS_POLL_MS, DEGRADED_STATS_POLL_MS);

  return useQuery<ApiResponse<Caller[]>>({
    queryKey: ['stats', 'last-callers', limit],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Caller[]>>(`/api/stats/last-callers?limit=${limit}`);
      return response.data;
    },
    refetchInterval,
  });
}

export function useLastUploads(limit = 5) {
  const refetchInterval = usePollInterval(STATS_POLL_MS, DEGRADED_STATS_POLL_MS);

  return useQuery<ApiResponse<FileActivity[]>>({
    queryKey: ['stats', 'last-uploads', limit],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FileActivity[]>>(`/api/stats/last-uploads?limit=${limit}`);
      return response.data;
    },
    refetchInterval,
  });
}

export function useLastDownloads(limit = 5) {
  const refetchInterval = usePollInterval(STATS_POLL_MS, DEGRADED_STATS_POLL_MS);

  return useQuery<ApiResponse<FileActivity[]>>({
    queryKey: ['stats', 'last-downloads', limit],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FileActivity[]>>(`/api/stats/last-downloads?limit=${limit}`);
      return response.data;
    },
    refetchInterval,
  });
}

/** No interval: runFullHealthCheck walks the filesystem. */
export function useHealthReport() {
  return useQuery({
    queryKey: HEALTH_KEY,
    queryFn: async () => {
      const response = await apiClient.getHealthCheck();
      return response.data as BBSHealthReport;
    },
    staleTime: Infinity,
  });
}
