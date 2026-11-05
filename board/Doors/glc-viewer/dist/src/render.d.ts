/** One caller, with the server's own field names. */
export interface GlcCall {
    Username: string;
    Location: string;
    Bbsname: string;
    Dateon: string;
    Timeon: string;
    Timeoff: string;
    Actions: string;
    /** Kilobytes, as a decimal string - `upkb` in the E source. See transferField. */
    Upload: string;
    Download: string;
}
/** A day's totals, as `yesterdayStats` / `previousDayStats` carry them. */
export interface GlcDayStats {
    statdate: string;
    calls: string;
    topcps: string;
    uploads: string;
    downloads: string;
}
/** The all-time block. */
export interface GlcRecords {
    allcalls: string;
    recordcalls: string;
    calls: string;
    mostcalled: string;
    calls2: string;
    secondmostcalled: string;
    calls3: string;
    thirdmostcalled: string;
}
export interface GlcScreen {
    /** 1-4. Anything else is 1, as `GLCViewer.e:862` decides. */
    style: number;
    /** SCREENCLEAR=YES. The form feed rides on the first logo line, as in E. */
    screenClear: boolean;
    /** A location column instead of the BBS name - true when a BBS name was given. */
    showLocation: boolean;
    /** CENTRENAME=YES: pad the name column out to 21 and re-centre it. */
    centreName: boolean;
    /**
     * The five lines above the title bar.
     *
     * Absent means the original's, which is what a board that has never opened
     * the Studio draws. `logo.ts` decides which file answers; this stays a list
     * of lines so the renderer has no idea a file exists.
     */
    logo?: readonly string[];
    calls: readonly GlcCall[];
    yesterday: GlcDayStats;
    previousDay: GlcDayStats;
    records: GlcRecords;
}
/**
 * The screen in three pieces, so the door can draw the top of it before the
 * network has answered.
 *
 * A caller used to look at nothing until the scenewall replied. The logo,
 * the title bar and the column rule depend on no data at all, so they go out
 * first and the rows land underneath them when they arrive. Composed back
 * into one list by `renderGlcScreen`, which is what the parity tests read.
 */
export declare function renderGlcHeader(screen: GlcScreen): string[];
/** One line per call, in the order the server sent them. */
export declare function renderGlcRows(screen: GlcScreen): string[];
/** The rule under the calls, the action legend, and the day totals. */
export declare function renderGlcFooter(screen: GlcScreen): string[];
/** Every line of the screen, in order, without their line terminators. */
export declare function renderGlcScreen(screen: GlcScreen): string[];
//# sourceMappingURL=render.d.ts.map