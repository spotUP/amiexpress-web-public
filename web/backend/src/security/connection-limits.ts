/**
 * Whether the board limits how often one address may connect.
 *
 * Three limiters guard admission - the per-IP rate limit (30 a minute, every
 * transport) and, on telnet and SSH, the IP ban (8 connects in 10 seconds
 * bans an address for 15 minutes). The web's rate limit was already off
 * outside production and the telnet/SSH ones never were, so a developer
 * reconnecting a telnet client in a loop locked himself out of his own board.
 * One switch now, for all of them (the sysop, 2026-09-28: "remove it while
 * deving with a switch"):
 *
 *   BBS_CONNECTION_LIMITS=on   limit, wherever this runs (to test a limiter)
 *   BBS_CONNECTION_LIMITS=off  never limit
 *   unset                      limit in production only
 */
export function connectionLimitsApply(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = String(env.BBS_CONNECTION_LIMITS ?? '').toLowerCase();
  if (flag === 'on') return true;
  if (flag === 'off') return false;
  return env.NODE_ENV === 'production';
}
