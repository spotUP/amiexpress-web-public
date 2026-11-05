import type { AnsiCellGrid, PaletteName } from '@amiexpress/bbs-door-sdk/media/ascii';
export interface PlayerRequest {
    url: string;
    kind: 'video' | 'embed';
    cols: number;
    rows: number;
    palette: PaletteName;
    /** Frames per second until the clip's own header says (10, 5 on a C64). */
    fps: number;
}
export interface Player {
    stop(): void;
}
export interface PlayerHooks {
    onFrame(cells: AnsiCellGrid): void;
    /** The clip played out, failed, or there is no service. Not called after stop(). */
    onEnd(): void;
    /** True while the output is backed up: the player drops frames instead of queueing them. */
    backedUp?(): boolean;
}
export declare function startPlayer(req: PlayerRequest, hooks: PlayerHooks): Player | null;
//# sourceMappingURL=player.d.ts.map