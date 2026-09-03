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
    /** True when there is not room for both boards and the centre column. */
    cramped: boolean;
}
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