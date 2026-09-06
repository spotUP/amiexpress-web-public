/**
 * Two boards side by side, with the HUD between them.
 *
 * This is the layout the SNES uses and the one its VS. CPU MODE sprite sheet is
 * drawn for: your board on the left, a narrow column of POINT / LEVEL / TIME in
 * the middle, the opponent on the right.
 *
 * IT FITS FORTY COLUMNS, which is the surprising part and the reason this door
 * can offer versus play on a C64 at all. Two 12-character boards and a
 * 10-character centre is 34, inside 40 with room to spare. No other door on
 * this board could show two live playfields at that width; a panel game can
 * only because a panel is two characters.
 *
 * An opponent WITHOUT a board - Challenge Mode's health model - takes the same
 * slot and draws a danger bar in it instead, so the two modes share one layout.
 */
/** Characters the centre column needs when it can spell things out. */
export declare const CENTRE_WIDE = 14;
export interface VersusPanelLayout {
    compact: boolean;
    effects: boolean;
    player: {
        top: number;
        left: number;
        width: number;
        height: number;
    };
    centre: {
        top: number;
        left: number;
        width: number;
        height: number;
    };
    opponent: {
        top: number;
        left: number;
        width: number;
        height: number;
    };
    /** True when the centre column spells its labels out. */
    spelledOut: boolean;
    /** True when there is not room for both boards and the centre column. */
    cramped: boolean;
}
/**
 * How big a tile the two boards and the centre column can afford.
 *
 * The versus view never scaled at all: at forty columns it drew two 6-column
 * boards and an 8-column strip of initials, using half the screen and leaving
 * the rest black - "this is also weirdly minumal why????? rework all views
 * give them proper huds again" (2026-09-06). Same arithmetic as the solo
 * board: fit what the room allows, and keep the tile square on the glass -
 * a PETSCII cell is square, so x may not exceed y there.
 */
export declare function versusScale(screenWidth: number, screenHeight: number, boardCols: number, boardRows: number, cellAspect: number, centreWidth: number): {
    x: number;
    y: number;
};
export declare function versusLayout(screenWidth: number, screenHeight: number, boardCols: number, boardRows: number): VersusPanelLayout;
/**
 * The centre column.
 *
 * At forty columns the labels go and the numbers stay - the same trade the solo
 * HUD makes, and for the same reason: mid-match you read the numbers.
 */
export declare function versusCentreLines(layout: VersusPanelLayout, values: {
    score: number;
    speed: number;
    timeText: string;
    chain: number;
    stopped: boolean;
    /** Pieces of garbage the player has coming. */
    incoming: number;
}): string[];
/**
 * A boardless opponent's danger bar, drawn bottom-up in its board slot.
 *
 * Challenge Mode's opponent has no panels to show - it is one number - so this
 * is genuinely all there is to draw, exactly as panel-attack draws it.
 */
export declare function dangerBarRows(layout: VersusPanelLayout, topOutPercentage: number): string[];
//# sourceMappingURL=versus-layout.d.ts.map