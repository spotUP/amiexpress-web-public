/**
 * Which drawing goes above the title bar.
 *
 * The sysop, 2026-09-16: "i would love to take control of the logo". So the
 * five lines are a FILE now - one per style, shipped in `art/` and declared
 * as drawable slots in `door.settings.json`, which is what puts them in the
 * ANSI Studio for the artists at level 100.
 *
 * Three places are tried, in this order:
 *
 *  (The reading itself now lives in the SDK's `utils/door-logo`, shared with the
 * arcade doors; this file only maps a GLC style onto it and owns the compiled-in
 * original.)
 *
 *  1. THE C64 VARIANT, for a caller on forty columns. The Studio stores those
 *     outside the door - `Screens/doors/GLC/setting:logo3.c64.ans` - because
 *     the drawing is the BOARD'S and has to survive a door re-install
 *     (`web/backend/src/doors/door-art-variants.ts`). A door reads it the same
 *     way the board writes it; nothing here reaches into the backend.
 *  2. THE ART FILE the setting names, for everyone else.
 *  3. THE ORIGINAL, compiled in from `GLCViewer.e`. A board that has never
 *     opened the Studio, and a door folder with no `art/` at all, both draw
 *     exactly what the 68K viewer drew - which is what keeps the parity test
 *     meaningful after this file exists.
 */
import { NARROW_COLUMNS, artSettingSection } from '@amiexpress/bbs-door-sdk/utils/door-logo';
export { NARROW_COLUMNS, artSettingSection };
/** What the original ships for this style, and the last word if nothing else answers. */
export declare function originalLogo(style: number): readonly string[];
export interface LogoRequest {
    /** 1-4, already clamped by the caller. */
    style: number;
    /** The door's own directory, for the art file the setting names. */
    doorDir: string;
    /** The board root, for the Studio's variant store. Null when unknown. */
    bbsRoot: string | null;
    /** The caller's width: 40 takes the narrow drawing. */
    columns: number;
    /** The setting values, so `logo3` can name something other than the default. */
    values: Record<string, unknown>;
    /** The command the variants are filed under. */
    command: string;
    /**
     * A teletext caller: forty columns too, but his drawing is a teletext page -
     * double-height rows and mosaic blocks - not the C64's reverse-video one.
     */
    teletext?: boolean;
}
/**
 * The five lines to draw above the title bar. A narrow caller with no
 * drawing gets none (its title bar is the header); a wide caller with no
 * artist file gets the compiled-in original.
 */
export declare function logoFor(request: LogoRequest): readonly string[];
//# sourceMappingURL=logo.d.ts.map