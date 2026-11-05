/**
 * The lists TETRIS ATTACK asks its questions with.
 *
 * Split out of app.ts because all four of them - mode, puzzle set, replay,
 * and anything added later - had the same defect for the same reason: a box
 * fifty-six columns wide, written while looking at an eighty-column terminal,
 * on a door that is marked for forty. On a C64 that box is wider than the
 * screen.
 *
 * So the width comes from the screen, and the labels come in two lengths. The
 * long one explains; the short one names. Neither is truncated at paint time,
 * because a truncated row of a menu is how a caller ends up choosing the wrong
 * mode.
 */
/** A row: what it says on a wide screen, and what it says on a C64. */
export interface ChooserRow {
    wide: string;
    compact: string;
}
export interface ChooserLayout {
    /** Width of the surrounding box. */
    width: number;
    /** Width of the list inside it. */
    innerWidth: number;
    /** Height of the box, including its border. */
    height: number;
    /** Height of the list inside it. */
    innerHeight: number;
    compact: boolean;
}
export declare function chooserLayout(screenWidth: number, screenHeight: number, rowCount: number): ChooserLayout;
/** The labels to show, at the length this screen has room for. */
export declare function chooserLabels(rows: ChooserRow[], layout: ChooserLayout): string[];
//# sourceMappingURL=chooser.d.ts.map