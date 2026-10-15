/**
 * TIP - one tip per login.
 *
 * A display-only door: pick a tip, show it, any key (or 30 seconds for
 * unattended logins) returns to the board. Nothing is written except the
 * rotation state (seen tip ids, per caller) in door storage, so logins
 * cycle instead of repeating.
 *
 * Phase 1: fixed 80-column render, run by hand via TIP. Responsive,
 * 40-column and login-hook phases follow per the plan.
 */
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
declare const door: Door;
export default door;
//# sourceMappingURL=index.d.ts.map