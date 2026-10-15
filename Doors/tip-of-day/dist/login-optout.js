"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHOW_AT_LOGIN_KEY = exports.LOGIN_COMMAND = void 0;
exports.loginChoice = loginChoice;
exports.answerKey = answerKey;
/**
 * A caller who does not want the tip at login.
 *
 * "a user just reported that he hates the tip door, he wants to turn it off"
 * (sysop, 2026-09-29). The board runs the tip at login from the MAILSCAN
 * screen as TIPLOGIN - the same door under a second registered command - and
 * a caller runs it himself as TIP. So the door knows which it is, and the
 * choice lives in the door's per-caller storage: no board special case.
 *
 *   at login, tips on   -> the tip, with N "never at login"
 *   at login, tips off  -> nothing at all
 *   typed TIP, tips on  -> the tip, with N "never at login"
 *   typed TIP, tips off -> the tip, with L "show at login again"
 */
exports.LOGIN_COMMAND = 'TIPLOGIN';
exports.SHOW_AT_LOGIN_KEY = 'show-at-login';
/** `stored` is what storage holds: null for a caller who never chose. */
function loginChoice(launchedAs, stored) {
    const atLogin = launchedAs.trim().toUpperCase() === exports.LOGIN_COMMAND;
    const on = stored !== false;
    if (atLogin && !on)
        return { show: false, hints: [] };
    const choice = on ? { key: 'N', does: 'never at login' } : { key: 'L', does: 'show at login again' };
    return { show: true, hints: [choice, { key: 'Any key', does: 'continues' }] };
}
/**
 * What a key press does to the choice: the new value to store, or undefined
 * for a key that only continues.
 */
function answerKey(keyName, stored) {
    const on = stored !== false;
    const k = keyName.toLowerCase();
    if (on && k === 'n')
        return false;
    if (!on && k === 'l')
        return true;
    return undefined;
}
//# sourceMappingURL=login-optout.js.map