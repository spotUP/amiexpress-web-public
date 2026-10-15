/**
 * The ports a door-probe run binds. Importing the backend outside jest starts the whole board (src/index.ts), and its
 * defaults (3001 / 2323 / 2222) are the sysop's local board: a probe that took them collides with it. A harness claims
 * these instead, unless the caller already chose its own.
 */
export const HARNESS_PORTS: Readonly<Record<string, string>> = {
  PORT: '3101',
  TELNET_PORT: '64228',
  SSH_PORT: '2322',
  TELNET_PETSCII_PORT: '64229',
};

/** The four port variables as the run will see them: the caller's where set (non-empty), the harness's where not. */
export function harnessPortEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, port] of Object.entries(HARNESS_PORTS)) out[name] = env[name] ? env[name]! : port;
  return out;
}

/** Writes harnessPortEnv into `env` (process.env by default) and returns it, for the line the script prints. */
export function claimHarnessPorts(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const ports = harnessPortEnv(env);
  Object.assign(env, ports);
  return ports;
}
