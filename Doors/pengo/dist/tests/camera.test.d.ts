/**
 * The camera that scrolls the 13x15 world through the 11-row window the
 * terminal can show.
 *
 * `buildBoard` used to return the world buffer directly - grid coordinates
 * and board coordinates were the same thing, because the world always fit
 * the screen. Once the world (15 rows) outgrew the view (11 rows) that
 * stopped being true: a grid cell's row in the returned buffer depends on
 * where the camera is currently looking, and something below the window
 * has to say so in the HUD rather than vanish. This is what pins both.
 */
/** cameraWindowCells centres on Pengo, clamped so it never runs off the maze. */
export declare function theCameraCentresOnPengoAndClampsToTheMaze(): Promise<void>;
/** The camera never scrolls horizontally - the world is exactly as wide as the view. */
export declare function theCameraDoesNotScrollHorizontally(): Promise<void>;
/**
 * A diamond near the bottom of the maze is invisible while Pengo (and so
 * the camera) is near the top, and visible once the camera scrolls down
 * to it - proof buildBoard actually crops, not just resizes the buffer.
 */
export declare function theWorldScrollsIntoAndOutOfView(): Promise<void>;
/** An enemy outside the camera window is reported, with which way it lies. */
export declare function anEnemyBelowTheWindowIsReportedOffscreen(): Promise<void>;
/** The same enemy stops being offscreen once the camera has scrolled to it. */
export declare function anEnemyInsideTheWindowIsNotReportedOffscreen(): Promise<void>;
/** A dead Sno-Bee is not something to warn about - it cannot reach anyone. */
export declare function aDeadEnemyIsNeverReportedOffscreen(): Promise<void>;
//# sourceMappingURL=camera.test.d.ts.map