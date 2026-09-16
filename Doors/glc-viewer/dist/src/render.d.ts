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
/** Every line of the screen, in order, without their line terminators. */
export declare function renderGlcScreen(screen: GlcScreen): string[];
//# sourceMappingURL=render.d.ts.map