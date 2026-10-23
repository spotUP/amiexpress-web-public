/**
 * log-level.util.ts
 *
 * ONE central log level for the backend console.
 *
 *   LOG_LEVEL = debug | info | warn | error   (case-insensitive; "warning" = warn)
 *   default   = debug when NODE_ENV=development, info otherwise
 *
 * Mapping: console.log and console.debug are DEBUG level, console.info is INFO
 * level, console.warn and console.error always print. The same name exists as
 * the `LOG_LEVEL` tooltype in bbsConfig.info (bbs-config-file.service.ts) ->
 * `log_level`; that field is board configuration stored in the DB, the env
 * variable is the process-level switch the gate reads.
 *
 * WHY: ~2800 console.log calls ran unconditionally and every one was also
 * appended synchronously to logs/backend.log. Operational lines a sysop needs
 * on a production board are console.info; everything chatty is console.log and
 * is dropped before it reaches stdout or the file tee.
 *
 * The gate is installed BEFORE installBackendFileLog, so a suppressed line is
 * never written to backend.log either.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function resolveLogLevel(env: NodeJS.ProcessEnv = process.env): LogLevel {
  const raw = (env.LOG_LEVEL || '').trim().toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  if (raw === 'warning') return 'warn';
  return env.NODE_ENV === 'development' ? 'debug' : 'info';
}

const NOOP = (): void => {};
let installed = false;

/**
 * Replace the console methods the level suppresses with no-ops. Idempotent.
 * Returns the level that was applied.
 */
export function installLogLevelGate(env: NodeJS.ProcessEnv = process.env): LogLevel {
  const level = resolveLogLevel(env);
  if (installed) return level;
  installed = true;
  if (level === 'debug') return level;
  console.log = NOOP;
  console.debug = NOOP;
  if (level !== 'info') console.info = NOOP;
  return level;
}

/** True when `fn` is the no-op the gate put in place of a suppressed method. */
export function isLogGateNoop(fn: unknown): boolean {
  return fn === NOOP;
}

/** Test seam: forget the installed state. */
export function __resetLogLevelGateForTests(): void {
  installed = false;
}
