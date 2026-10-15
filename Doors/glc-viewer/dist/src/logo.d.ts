/** A forty-column caller reads the narrow drawing; everyone else the wide one. */
export declare const NARROW_COLUMNS = 40;
/** The section name the Studio files a setting's variants under. */
export declare const artSettingSection: (key: string) => string;
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
/** The five lines to draw above the title bar. */
export declare function logoFor(request: LogoRequest): readonly string[];
//# sourceMappingURL=logo.d.ts.map