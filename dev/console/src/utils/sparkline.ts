import type { CallerRecord } from '../api/types.js';

const BLOCKS = ' ▁▂▃▄▅▆▇█';

export function buildSparkline(callers: CallerRecord[], hours = 24): string {
  const now = Date.now();
  const buckets = Array(hours).fill(0) as number[];

  for (const c of callers) {
    const age = (now - new Date(c.timestamp).getTime()) / 3_600_000;
    const bucket = hours - 1 - Math.floor(age);
    if (bucket >= 0 && bucket < hours) buckets[bucket]++;
  }

  const max = Math.max(...buckets, 1);
  return buckets
    .map(n => BLOCKS[Math.round((n / max) * (BLOCKS.length - 1))])
    .join('');
}
