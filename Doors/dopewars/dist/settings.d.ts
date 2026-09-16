/**
 * What the sysop can set on GANJA WARS, and what the door does with it.
 *
 * The declaration is `door.settings.json` at the door root; the values are
 * `settings.json` beside it, written by the admin. Both are read through the
 * SDK, which resolves the door root itself - `__dirname` is `src/` in
 * development and `dist/` in production, and the walk lands on the door
 * either way.
 *
 * Read once per door launch (`loadSettings` in `onStart`), which is what makes
 * a change in the admin reach the next player without a backend restart.
 */
export interface DopewarsSettings {
    /** Turns (days) a game lasts before it ends and scores. */
    numTurns: number;
    startCash: number;
    startDebt: number;
    /** Percent the loan shark debt grows each turn. */
    debtInterest: number;
    /** Percent cash in the bank earns each turn. */
    bankInterest: number;
    /** Whether busts, deals and high scores go out through the announcer. */
    notifyLivechat: boolean;
}
/**
 * What GANJA WARS ran with before it declared anything. A board that sets
 * nothing must play exactly the game it played yesterday.
 */
export declare const DEFAULT_SETTINGS: DopewarsSettings;
/**
 * The declared values, made safe to use.
 *
 * The SDK has already applied the manifest's types; this is the door's own
 * floor - a game of 0 turns is not a setting, it is a door that ends before it
 * starts, and a hand-edited settings.json can carry one.
 */
export declare function applySettings(raw: Record<string, string | number | boolean>): DopewarsSettings;
/**
 * Read what the sysop set. Called once, when a player opens the door.
 *
 * `from` is the directory the SDK resolves the door root out of, and is only
 * ever passed by a test standing up a board of its own.
 */
export declare function loadSettings(from?: string): DopewarsSettings;
/**
 * The settings, shaped the way `DopewarsConfig` wants them.
 *
 * Every field here comes from a setting and nothing else does: the Discord
 * webhook is an environment variable and the theme is a constant, so both stay
 * at the call site in `index.ts`. Extracted 2026-09-16 because the mapping was
 * written inline in `onStart`, where the only way to check it was to read the
 * source and look for the word `settings.` once per key - which cannot tell a
 * forwarded value from a mentioned one.
 *
 * A key that stops being forwarded now fails a test that compares VALUES.
 */
export declare function configFieldsFrom(settings: DopewarsSettings): DopewarsSettings;
//# sourceMappingURL=settings.d.ts.map