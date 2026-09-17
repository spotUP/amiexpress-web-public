/**
 * May this account open this destination, and if not, what happens instead.
 *
 * The guard in `App.tsx` used to answer only "allow or send them to Screens",
 * which works for every destination EXCEPT Screens itself. Screens is the
 * fallback, so guarding it with that rule sends a refused account to the place
 * that just refused them, for ever. That is why `screens` was the one Content
 * route left unguarded - and leaving it unguarded is what let the page decide
 * its own access, which is the thing the screens rework is removing.
 *
 * A pure function because the decision is the interesting part and rendering
 * a whole router to test three integers is not.
 */

import { hardcodedMinLevel } from './nav-config';

/** Where a refused account is sent, when there is somewhere to send them. */
export const FALLBACK_ROUTE = 'screens';

export type RouteAccess =
  /** Open it. */
  | { kind: 'allow' }
  /** Not for them, but somewhere else is. */
  | { kind: 'redirect'; to: string }
  /**
   * Not for them, and neither is the fallback.
   *
   * The caller renders an explanation. Redirecting here is the loop: the
   * fallback IS this route, or their level is under every destination's floor.
   */
  | { kind: 'refuse'; reason: string };

/**
 * The level a route needs: the board's live permission table first, the
 * compiled-in nav floor second.
 *
 * The live table is what the Admin Roles page writes, so a sysop who moves a
 * slider changes this without a deploy. It is absent for an account the table
 * itself refuses to show, which is every non-sysop - hence the fallback.
 */
export function levelRequired(
  routeKey: string,
  adminPerms: Record<string, number>,
): number {
  return routeKey in adminPerms ? adminPerms[routeKey] : hardcodedMinLevel(routeKey);
}

export function routeAccess(
  routeKey: string,
  secLevel: number,
  adminPerms: Record<string, number>,
): RouteAccess {
  if (secLevel >= levelRequired(routeKey, adminPerms)) return { kind: 'allow' };

  // Refused, and the fallback is this very route: an account below Screens'
  // own floor has nowhere in the admin to be sent.
  if (routeKey === FALLBACK_ROUTE) {
    return {
      kind: 'refuse',
      reason: 'This account is not allowed to work on the board’s screens.',
    };
  }

  // Refused, and the fallback would refuse them too - so say so once rather
  // than bouncing them into a second refusal.
  if (secLevel < levelRequired(FALLBACK_ROUTE, adminPerms)) {
    return {
      kind: 'refuse',
      reason: 'This account has no part of the admin it may open.',
    };
  }

  return { kind: 'redirect', to: `/admin/${FALLBACK_ROUTE}` };
}

/**
 * The route key `App.tsx` looks a path up by: the segment after `/admin/`.
 *
 * The index route is the empty string, which `hardcodedMinLevel` answers for
 * deliberately - the Overview is sysop-only and an artist typing `/admin` used
 * to land on panels that 403'd behind every one of them.
 */
export function routeKeyOf(pathname: string): string {
  return pathname.replace(/^\/admin\/?/, '').split('/')[0] ?? '';
}
