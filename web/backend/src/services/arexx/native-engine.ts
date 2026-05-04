/**
 * Native AREXX engine — runs scripts via real RexxMast under MOIRA.
 *
 * #78 Phase 1 (no-op shim): the class is wired so the engine selector
 * can dispatch through it, but `available()` always reports false. The
 * TS interpreter (`EnhancedAREXXEngine` in arexx.service.ts) handles
 * every script unchanged. Subsequent phases fill in real behaviour:
 *
 *   Phase 2 — rexxsyslib.library LVO traps
 *   Phase 3 — RexxMast lifecycle (per-node spawn under MOIRA)
 *   Phase 4 — Host port + dispatch table
 *   Phase 5 — Wire executeScript through native when available
 *
 * Lifecycle decision: WARM SINGLETON. One RexxMast process per BBS
 * (matches the real-Amiga AmiExpress model). Concurrent scripts on
 * different nodes run in parallel because RexxMast spawns one
 * interpreter task per inbound RexxMsg internally — that's its job
 * since AmigaOS 1.3 (1987). Each task carries its own host-port reply
 * address so the BBS dispatches function callbacks per-script. Trade
 * vs per-node was: 1× RAM/cold-start, real-Amiga-faithful, vs N×
 * isolation. Crash-isolation was the only honest per-node win and
 * RexxMast itself is famously stable.
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from '../../config';

/**
 * Detection probe result. Cached after the first successful run so
 * subsequent script invocations don't re-stat the filesystem.
 */
export interface NativeAREXXDetection {
  available: boolean;
  /** Why native is/isn't available — surfaced in logs and admin output. */
  reason: string;
  /** Resolved absolute path to System/RexxMast (or '' when missing). */
  rexxMastPath: string;
  /** Resolved absolute path to Libs/rexxsyslib.library (or ''). */
  rexxsysLibPath: string;
}

let cachedDetection: NativeAREXXDetection | null = null;

/**
 * Probe whether the native AREXX path can be used.
 *
 * Checks (in order):
 *   1. System/RexxMast file exists and is non-empty (binary present)
 *   2. Libs/rexxsyslib.library exists and is non-empty
 *   3. Phase 3+ will additionally verify both load under MOIRA without
 *      faulting.
 *
 * Returns a structured result rather than a bare bool so the caller can
 * surface the missing-component message verbatim. Result is cached;
 * pass `force=true` to re-probe (e.g. after sysop drops the binary
 * without restarting the BBS).
 */
export function detectNativeAREXX(force = false): NativeAREXXDetection {
  if (!force && cachedDetection) return cachedDetection;

  const dataDir = config.get('dataDir');
  const rexxMastPath = path.join(dataDir, 'System', 'RexxMast');
  const rexxsysLibPath = path.join(dataDir, 'Libs', 'rexxsyslib.library');

  if (!fs.existsSync(rexxMastPath)) {
    cachedDetection = {
      available: false,
      reason: `RexxMast binary not found at ${rexxMastPath}`,
      rexxMastPath: '',
      rexxsysLibPath: '',
    };
    return cachedDetection;
  }
  const rexxMastStat = fs.statSync(rexxMastPath);
  if (rexxMastStat.size === 0) {
    cachedDetection = {
      available: false,
      reason: `RexxMast at ${rexxMastPath} is empty`,
      rexxMastPath: '',
      rexxsysLibPath: '',
    };
    return cachedDetection;
  }

  if (!fs.existsSync(rexxsysLibPath)) {
    cachedDetection = {
      available: false,
      reason: `rexxsyslib.library not found at ${rexxsysLibPath}`,
      rexxMastPath: '',
      rexxsysLibPath: '',
    };
    return cachedDetection;
  }
  const rexxsysLibStat = fs.statSync(rexxsysLibPath);
  if (rexxsysLibStat.size === 0) {
    cachedDetection = {
      available: false,
      reason: `rexxsyslib.library at ${rexxsysLibPath} is empty`,
      rexxMastPath: '',
      rexxsysLibPath: '',
    };
    return cachedDetection;
  }

  // #78 Phase 3a — parse-time validation. We attempt to parse both
  // binaries as Amiga hunk files BEFORE Phase 5 wires the runtime
  // dispatch. This catches "sysop dropped a corrupt RexxMast" early
  // (engine line in backend.log says exactly which binary failed)
  // without committing any 68K resources. The result is still
  // available=false because the executeScript path isn't wired yet —
  // that lands in Phase 5. The new contract: file present + parseable
  // → reason 'binaries parsed successfully, awaiting Phase 5 wire-up'.
  let parseError: string | null = null;
  try {
    const { HunkLoader } = require('../../amiga-emulation/loader/HunkLoader');
    const loader = new HunkLoader();
    try {
      loader.parse(fs.readFileSync(rexxMastPath));
    } catch (err: any) {
      parseError = `RexxMast hunk parse failed at ${rexxMastPath}: ${err?.message || err}`;
    }
    if (!parseError) {
      try {
        loader.parse(fs.readFileSync(rexxsysLibPath));
      } catch (err: any) {
        parseError = `rexxsyslib.library hunk parse failed at ${rexxsysLibPath}: ${err?.message || err}`;
      }
    }
  } catch (err: any) {
    // HunkLoader import failure — would block any 68K work, so report
    // it loudly rather than letting the BBS silently fall back to TS.
    parseError = `HunkLoader unavailable: ${err?.message || err}`;
  }

  if (parseError) {
    cachedDetection = {
      available: false,
      reason: parseError,
      rexxMastPath: '',
      rexxsysLibPath: '',
    };
    return cachedDetection;
  }

  cachedDetection = {
    available: false, // Phase 5 flips this once executeScript is wired
    reason: 'binaries parsed successfully, awaiting Phase 5 wire-up',
    rexxMastPath,
    rexxsysLibPath,
  };
  return cachedDetection;
}

/**
 * Reset the cached detection result. Test-only; production code should
 * pass force=true to detectNativeAREXX() instead.
 */
export function _resetNativeAREXXDetectionCache(): void {
  cachedDetection = null;
}

/**
 * Stub for the future native engine. Real implementation lands in
 * Phase 3 (lifecycle) + Phase 4 (host port). For now exposes the same
 * minimal surface the selector needs so the rest of Phase 1 can wire
 * routing without committing to an interface that'll change.
 */
export class NativeAREXXEngine {
  available(): boolean {
    return detectNativeAREXX().available;
  }

  detectionReason(): string {
    return detectNativeAREXX().reason;
  }
}

export const nativeAREXXEngine = new NativeAREXXEngine();
