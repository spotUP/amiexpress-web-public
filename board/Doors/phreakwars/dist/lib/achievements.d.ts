/**
 * PhreakWars' own achievement events (achievements SP3).
 *
 * The door's handlers take `(socket, gameState, input)` and never see the
 * `DoorContext`, so the reporter the SDK hands `onStart` is parked here once
 * and the game code calls `award()` wherever something worth recording
 * happens. One holder, set at the top of a session and cleared at the end of
 * it - a door serves one caller at a time.
 *
 * Every id is `door.phreakwars.<slug>`; the board refuses anything else, and
 * the definitions those events unlock live in this door's `package.json`
 * under `amiexpress.achievements`.
 */
type Reporter = (type: string, opts?: {
    value?: number;
    key?: string;
}) => boolean;
/** Called from `onStart` with `ctx.achievement`, and with null when the door closes. */
export declare function setAchievementReporter(fn: Reporter | null | undefined): void;
/**
 * Record one event. Never throws and never blocks the game: a board with no
 * achievements server, or a caller who is not a player, is the normal case.
 */
export declare function award(type: string, opts?: {
    value?: number;
    key?: string;
}): boolean;
export {};
