/**
 * Shared types for the door lifecycle modules.
 *
 * Extracted from DoorLifecycleManager so that the helpers in this directory
 * (DoorExecutionLogger, DoorTrapDispatcher, DoorExitDetector, ...) can import
 * the types without forming an import cycle through DoorLifecycleManager.ts,
 * and so the manager itself stays under the project's 2000-line per-file limit.
 *
 * Backwards-compat: DoorLifecycleManager.ts re-exports these names so the
 * existing `from "../DoorLifecycleManager.js"` imports keep working.
 */

export interface ExecutionState {
  iterationCount: number;
  totalCycles: number;
  cycleCount: number;
  isRunning: boolean;
  startupMessageSent: boolean;
  trapVerified: boolean;
  mainExecutionReached: boolean;
  initializationComplete: boolean;
  romReturnAttempts: number;
  lastSignificantPC: number;
  progressCheckCount: number;
  stuckInLoop: boolean;
  loopDetectionCount: number;
  writeCallCount: number;
  aedoorCallCount: number;
  libraryCallsInLoop: number;
  lastInterceptedTrap: number;
  lastInterceptedIteration: number;
  loggedMoveaStack: boolean;
  startTime: number | null;
  progressCheckCountGlobal: number;
  loopStartPC: number;
  lastProgressIteration: number;
  lastProgressTime: number;
  gapJumpLogged: boolean;
  stuckLoopCount: number;
  lastJumpSize: number;
  lastAedoorTracePc: number;
  lastJumpSizes: number[];
  sameJumpCount: number;
}

export interface LifecycleConfig {
  timeout: number;
  loopGuardLimit: number;
  cycleTarget: number;
  debugLevel: 'minimal' | 'normal' | 'verbose' | 'comprehensive';
  disableGuard?: boolean;
  disableInputWaitExtension?: boolean;
  progressTimeoutMs: number;
  pcProbeRanges?: Array<{ start: number; end: number }>;
  pcProbeMaxHits?: number;
}
