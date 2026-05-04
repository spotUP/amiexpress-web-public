/**
 * AREXX engine selector — picks native vs TS interpreter per-call.
 *
 * #78 Phase 1: this is the routing point that lets later phases swap in
 * the real native engine without touching the call sites in
 * handlers/door.handler.ts, server/socket-handlers.ts, or index.ts.
 * In Phase 1 the native engine always reports unavailable, so 'auto'
 * resolves to TS and behaviour is unchanged.
 *
 * Resolution order (matches what we tell sysops in handoff.md):
 *   bbsConfig.info AREXX_ENGINE=ts      → force TS
 *   bbsConfig.info AREXX_ENGINE=native  → force native (errors loudly
 *                                          if RexxMast missing)
 *   bbsConfig.info AREXX_ENGINE=auto    → native if available, else TS
 *   (unset)                              → auto
 */

import { config } from '../../config';
import { detectNativeAREXX, NativeAREXXEngine } from './native-engine';

export type AREXXEngineChoice = 'native' | 'ts';

/** Cached parse of the AREXX_ENGINE tooltype, refreshed on first read. */
let cachedTooltype: 'native' | 'ts' | 'auto' | null = null;

function readEngineTooltype(): 'native' | 'ts' | 'auto' {
  if (cachedTooltype) return cachedTooltype;
  try {
    const { loadBBSConfig } = require('../bbs-config-file.service');
    const cfg = loadBBSConfig(config.get('dataDir'));
    const raw = String(cfg?.arexx_engine || 'auto').toLowerCase().trim();
    if (raw === 'native' || raw === 'ts' || raw === 'auto') {
      cachedTooltype = raw;
    } else {
      cachedTooltype = 'auto';
    }
  } catch {
    cachedTooltype = 'auto';
  }
  return cachedTooltype;
}

/**
 * Test-only: clear the cached AREXX_ENGINE tooltype reading so the
 * next call re-loads bbsConfig.info. Production code never needs this.
 */
export function _resetAREXXEngineSelectorCache(): void {
  cachedTooltype = null;
}

/**
 * Decide which engine should run a given AREXX script. Stateless —
 * the caller dispatches to the chosen engine themselves.
 *
 * Returns `{ choice, reason }` rather than a bare enum so the caller
 * can include the explanation in logs (especially valuable when 'auto'
 * silently falls back due to a missing RexxMast).
 */
export function selectAREXXEngine(): { choice: AREXXEngineChoice; reason: string } {
  const tooltype = readEngineTooltype();
  if (tooltype === 'ts') {
    return { choice: 'ts', reason: 'AREXX_ENGINE=ts (sysop override)' };
  }
  const detection = detectNativeAREXX();
  if (tooltype === 'native') {
    if (!detection.available) {
      // Forced native but missing — fail noisily so the sysop notices.
      // We still return 'ts' so scripts execute; the BBS shouldn't go
      // dark over a config typo.
      return {
        choice: 'ts',
        reason: `AREXX_ENGINE=native but ${detection.reason}; falling back to TS`,
      };
    }
    return { choice: 'native', reason: 'AREXX_ENGINE=native (sysop override)' };
  }
  // auto
  if (detection.available) {
    return { choice: 'native', reason: 'auto: native available' };
  }
  return { choice: 'ts', reason: `auto: ${detection.reason}` };
}

/**
 * Logged once at startup so the sysop sees which engine the BBS picked
 * and why — even if it's unsurprising. Log line is parseable: prefix
 * `[AREXX]`, structured suffix.
 */
export function logEngineSelectionAtStartup(): void {
  const { choice, reason } = selectAREXXEngine();
  console.log(`[AREXX] engine=${choice} (${reason})`);
}

// Phase 1 sanity export so callers can hold a typed reference even
// though the native engine is dormant. Phase 5 swaps the dispatcher
// at the executeScript boundary.
export const nativeEngineRef = new NativeAREXXEngine();
