/**
 * password-strength.util.ts
 *
 * Extracted from `auth-socket-handlers.ts:51-70` so both web's forced-
 * password-change handler and the new line-buffered telnet/SSH adapter
 * can call the same primitive.
 *
 * 1:1 port of the express.e:910-932 logic — do not change semantics.
 */

/**
 * Check whether `newPass` meets the configured minimum length and
 * character-class minimums.
 *
 * @returns
 *   `true` — password meets all criteria
 *   `1`    — too short (fails MIN_PASSWORD_LENGTH)
 *   `2`    — too weak  (fails MIN_PASSWORD_STRENGTH)
 */
export function checkPasswordStrength(
  newPass: string,
  minLength: number,
  minStrength: number,
): true | 1 | 2 {
  // express.e:910-912 — MIN_PASSWORD_LENGTH check
  if (minLength > 0 && newPass.length < minLength) return 1;

  // express.e:915-932 — MIN_PASSWORD_STRENGTH check (count distinct
  // character classes: lower / upper / digit / symbol).
  if (minStrength > 0) {
    const cap = Math.min(minStrength, 4);
    let lower = 0,
      upper = 0,
      num = 0,
      sym = 0;
    for (let i = 0; i < newPass.length; i++) {
      const c = newPass.charCodeAt(i);
      if (c >= 48 && c <= 57) num = 1;
      else if (c >= 65 && c <= 90) upper = 1;
      else if (c >= 97 && c <= 122) lower = 1;
      else sym = 1;
    }
    if (lower + upper + num + sym < cap) return 2;
  }

  return true;
}
