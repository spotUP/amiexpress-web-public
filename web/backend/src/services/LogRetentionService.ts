/**
 * Log Retention Service
 *
 * GDPR Phase 4: bounds the storage of session/caller/error log files so
 * IPs, handles, and other session metadata don't linger indefinitely.
 *
 * Strategy: size-based tail trim. On a schedule (default once per day,
 * plus once on boot), each tracked file is truncated to its last
 * `maxBytes` bytes at the nearest newline. This caps retention at
 * whatever ~10 MB of log happens to cover in this BBS's traffic
 * pattern — typically weeks for the backend log, much longer for
 * per-node files. Simple, robust, and doesn't need per-file timestamp
 * parsing.
 *
 * Plan reference: thoughts/shared/plans/2026-04-24-gdpr-hobby-baseline.md
 * Phase 4.
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { runCallersLogRetention, type FileRetentionReport } from './callers-log-retention';

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

export interface LogRetentionConfig {
  /** Absolute or dataDir-relative paths to trim. */
  filePaths: string[];
  /** Max bytes per file (default 10 MB). */
  maxBytes?: number;
  /** Schedule interval in ms (default 24h). */
  intervalMs?: number;
  /**
   * The board whose Node<n>/CallersLog address and typed-password lines go
   * after `maxAgeDays` (callers-log-retention.ts). Omitted: no such pass.
   */
  callersLog?: { dataDir: string; maxAgeDays: number };
}

export class LogRetentionService {
  private filePaths: string[] = [];
  private maxBytes: number = DEFAULT_MAX_BYTES;
  private intervalMs: number = DEFAULT_INTERVAL_MS;
  private timer?: ReturnType<typeof setInterval>;
  private callersLog?: { dataDir: string; maxAgeDays: number };
  /** What the last CallersLog pass removed, per file. */
  lastCallersLogReport: FileRetentionReport[] = [];

  configure(cfg: LogRetentionConfig): void {
    this.filePaths = [...cfg.filePaths];
    this.callersLog = cfg.callersLog;
    if (cfg.maxBytes && cfg.maxBytes > 1024) this.maxBytes = cfg.maxBytes;
    if (cfg.intervalMs && cfg.intervalMs > 1000) this.intervalMs = cfg.intervalMs;
  }

  /**
   * Run one retention pass over all configured files.
   * Returns per-file result for test observability.
   */
  async runOnce(): Promise<Array<{ path: string; beforeBytes: number; afterBytes: number; trimmed: boolean; error?: string }>> {
    const results: Array<{ path: string; beforeBytes: number; afterBytes: number; trimmed: boolean; error?: string }> = [];
    // The dated pass first: the size cap below empties a whole file, and a
    // CallersLog the age rule has thinned may no longer need it.
    if (this.callersLog) {
      this.lastCallersLogReport = runCallersLogRetention(this.callersLog.dataDir, {
        maxAgeDays: this.callersLog.maxAgeDays,
      });
      for (const r of this.lastCallersLogReport) {
        if (r.error) console.warn(`[LogRetention] ${r.path}: ${r.error}`);
        else if (r.address + r.password > 0) {
          console.log(`[LogRetention] ${r.path}: removed ${r.address} address and ${r.password} password lines older than ${this.callersLog.maxAgeDays} days`);
        }
      }
    }
    for (const filePath of this.filePaths) {
      try {
        const stat = await fsp.stat(filePath).catch(() => null);
        if (!stat || !stat.isFile()) {
          results.push({ path: filePath, beforeBytes: 0, afterBytes: 0, trimmed: false });
          continue;
        }
        const beforeBytes = stat.size;
        if (beforeBytes <= this.maxBytes) {
          results.push({ path: filePath, beforeBytes, afterBytes: beforeBytes, trimmed: false });
          continue;
        }
        const afterBytes = await this.tailTrim(filePath, beforeBytes);
        results.push({ path: filePath, beforeBytes, afterBytes, trimmed: true });
      } catch (error: any) {
        results.push({
          path: filePath,
          beforeBytes: 0,
          afterBytes: 0,
          trimmed: false,
          error: error?.message || String(error),
        });
      }
    }
    return results;
  }

  /**
   * Keep the file's last `maxBytes`, from the first line break inside them,
   * IN PLACE: the tail is written over the start of the same file and the
   * file truncated to it, so the inode - and every open descriptor writing to
   * it - survives (bb394a9f0). This emptied the whole file, so a CallersLog
   * past the cap lost every call, not just the oldest.
   */
  private async tailTrim(filePath: string, currentSize: number): Promise<number> {
    const start = currentSize - this.maxBytes;
    const fh = await fsp.open(filePath, 'r+');
    try {
      const tail = Buffer.alloc(this.maxBytes);
      const { bytesRead } = await fh.read(tail, 0, this.maxBytes, start);
      const kept = tail.subarray(0, bytesRead);
      const firstBreak = kept.indexOf(0x0a);
      const body = firstBreak >= 0 ? kept.subarray(firstBreak + 1) : kept;
      await fh.write(body, 0, body.length, 0);
      await fh.truncate(body.length);
      return body.length;
    } finally {
      await fh.close();
    }
  }

  /**
   * Run once now, then schedule recurring passes. Returns a stop handle.
   */
  start(): () => void {
    // Fire-and-forget boot pass; errors are logged per-file inside runOnce.
    this.runOnce().catch((err) => {
      console.warn('[LogRetention] boot pass failed:', err);
    });
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => {
        console.warn('[LogRetention] scheduled pass failed:', err);
      });
    }, this.intervalMs);
    if (typeof (this.timer as any).unref === 'function') {
      (this.timer as any).unref();
    }
    return () => this.stop();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

/** Singleton, used by server/initialization.ts at boot. */
export const logRetentionService = new LogRetentionService();

/**
 * Walk the BBS data dir for likely log files to enrol in retention.
 * Covers per-node CallersLog / ErrorLog / StartUpLog plus logs/*.log.
 */
export function defaultRetentionTargets(dataDir: string): string[] {
  const targets: string[] = [];
  const logsDir = path.join(dataDir, 'logs');
  // Always-on backend logs (fs.existsSync is safe here — runs in process,
  // no user input).
  for (const name of ['backend.log', 'frontend.log', 'errors.log']) {
    targets.push(path.join(logsDir, name));
  }
  // Per-node logs. Scan the dataDir for NodeN/ directories.
  try {
    for (const entry of fs.readdirSync(dataDir)) {
      if (!/^Node\d+$/i.test(entry)) continue;
      const nodeDir = path.join(dataDir, entry);
      for (const name of ['CallersLog', 'callerslog', 'ErrorLog', 'StartUpLog']) {
        targets.push(path.join(nodeDir, name));
      }
    }
  } catch {
    // Best-effort: if the data dir isn't readable yet, caller will retry.
  }
  return targets;
}
