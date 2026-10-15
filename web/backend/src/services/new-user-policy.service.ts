/**
 * Whether a stranger may open an account here, and on what terms.
 *
 * express has no "policy" setting. It has three gates, and a board's policy is
 * whichever of them the sysop has armed (express.e:30003-30070):
 *
 *   CLOSED           a `NoNewUsers` screen exists, so `newUserAccount` shows
 *                    it and hangs up before anything else happens
 *   BY APPLICATION   `NEWUSER_PASSWORD` is set on the board's icon
 *                    (ACP.e:2632 -> `cmds.newUserPw`), and express.e:30013
 *                    asks for it, three tries, then `NUPFAIL`
 *   OPEN             neither, and registration begins
 *
 * ...with `AUTOVAL_PASSWORD` on top: a second, optional password that promotes
 * the new account straight to a validated level (express.e:30062-30065, node
 * icon first and the board's second).
 *
 * WHAT WAS ACTUALLY WRONG. The two screens worked; both passwords were read
 * from ENVIRONMENT VARIABLES and nowhere else, so `NEWUSER_PASSWORD` in
 * `bbsConfig.info` did nothing at all and `AUTOVAL_PASSWORD` did nothing
 * either, even though the config-file service parses it. A sysop who closed
 * his board to applications through the icon - the only place express looks -
 * had an open board. (The audit row for this said "missing entirely - no code
 * anywhere", which is not what was there; the gates existed and were fed from
 * the wrong place.)
 *
 * READ AT USE, NOT AT BOOT. These are resolved when the caller is standing at
 * the prompt, so a sysop who sets a new-user password does not have to restart
 * the board for it to take - the same promise the rest of `bbsConfig.info`
 * makes.
 */
import { config } from '../config';
import { getBoardConfig } from './bbs-config-file.service';
import { nodeTooltype } from '../utils/node-tooltypes.util';

/** A trimmed string, or '' - never undefined, so callers can just compare. */
function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function boardConfig(): Record<string, unknown> {
  try {
    return (getBoardConfig(config.get('dataDir')) ?? {}) as Record<string, unknown>;
  } catch (error) {
    console.error('[new-user-policy] could not read bbsConfig.info:', error);
    return {};
  }
}

/**
 * The password a stranger must type before he may register, or '' for a board
 * that lets anyone in.
 *
 * `bbsConfig.info` first, because that is where express reads it. The
 * environment variable stays as a fallback: it is what this port has been
 * using, and a board configured that way must not lose its gate the day this
 * lands.
 */
export function newUserAccessPassword(): string {
  return clean(boardConfig().new_user_password) || clean(config.get('newUserPassword'));
}

/**
 * The auto-validation password, in express's own order: the NODE's icon
 * (express.e:30062), then the board's (:30063), then this port's environment
 * variable.
 */
export function autoValidationPassword(nodeId?: number): string {
  if (nodeId !== undefined) {
    const perNode = clean(nodeTooltype(nodeId, 'AUTOVAL_PASSWORD'));
    if (perNode) return perNode;
  }
  return clean(boardConfig().autoval_password) || clean(config.get('autoValidationPassword'));
}

/** What a board is doing about strangers, for a log line or an admin badge. */
export type NewUserPolicy = 'open' | 'by-application';

/**
 * The policy the passwords describe.
 *
 * CLOSED is deliberately not here: it is the presence of a `NoNewUsers`
 * screen, which `new-user.handler.ts` already answers by showing the screen
 * itself. A policy function that guessed at it from somewhere else would be a
 * second source of truth for the same question.
 */
export function newUserPolicy(): NewUserPolicy {
  return newUserAccessPassword() === '' ? 'open' : 'by-application';
}
