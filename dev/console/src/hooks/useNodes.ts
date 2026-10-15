import { useState, useEffect } from 'react';
import { getNodes } from '../api/client.js';
import type { NodeStatus } from '../api/types.js';

export function useNodes(intervalMs = 3000) {
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      try {
        const data = await getNodes();
        if (!cancelled) { setNodes(data); setError(null); }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed');
      }
    }

    fetch();
    const id = setInterval(fetch, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [intervalMs]);

  return { nodes, error };
}
