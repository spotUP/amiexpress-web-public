/**
 * The board is not allowed to wrap.
 *
 * Reported live: "the lines in zookeeper are too long, every second one is
 * black". Every arcade door here was built from the same template, and the
 * template omits two options on the boxes that matter:
 *
 *   - blessed.box() returns a Panel, and a Panel INJECTS a line border
 *     whenever `border` is absent from the options. That steals two columns
 *     and two rows. A row drawn to the full field width then overflows the
 *     box by two columns, wraps, and the wrapped remainder paints as a black
 *     line - so the board appears on every other row.
 *
 *   - a one-row HUD is worse: the injected border IS the whole box, so the
 *     score line never appears at all.
 *
 * There was a sweep for exactly this ("sweep ghost-border fix to all blessed
 * doors") and it missed six doors, so this test exists per door rather than
 * as one shared check somebody can forget to extend.
 */
/** The playfield must not draw its own border, and must not wrap. */
export declare function theGameAreaHasNoGhostBorderAndDoesNotWrap(): Promise<void>;
/** A one-row HUD must not draw a border, or it has no room for content. */
export declare function theHudHasNoGhostBorder(): Promise<void>;
