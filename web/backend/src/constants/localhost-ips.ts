/**
 * The loopback addresses, in a module of their own.
 *
 * This lived in `index.ts`, and `server/telnet-server.ts` imported it from
 * there as a VALUE. index.ts starts the HTTP, telnet and SSH servers as an
 * import side effect, so that one import meant: any test that touched
 * `TelnetServer` booted the whole board. Under jest that surfaced as
 * `TypeError: initOperatorChatHandler is not a function` and as tests failing
 * in the full run while passing alone - and NOT the same test twice, which is
 * the worst shape of flake to chase, because the red test is never the guilty
 * one.
 *
 * Three strings do not need the BBS behind them. Anything else that wants a
 * plain constant from index.ts belongs here (or beside here) for the same
 * reason.
 */
export const LOCALHOST_IPS = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
