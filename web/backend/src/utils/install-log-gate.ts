/**
 * Side-effect import: applies the central LOG_LEVEL gate (log-level.util.ts).
 * Imported near the top of index.ts so it runs before the modules that log at
 * import time, and before installBackendFileLog wraps the console.
 */
import { installLogLevelGate } from './log-level.util';

installLogLevelGate();
