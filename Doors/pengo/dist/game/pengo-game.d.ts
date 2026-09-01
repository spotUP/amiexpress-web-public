/**
 * Pengo - Game Engine
 * Core game logic for the 1982 Sega arcade puzzle game
 */
import { PengoData, Direction } from './types';
import { SfxCues } from '@amiexpress/bbs-door-sdk/engines/ui/arcade';
import { Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
export declare class PengoGame {
    private data;
    private renderCallback;
    private sheet;
    /**
     * What just happened, for whoever is listening.
     *
     * The game names the moment; the door decides whether anybody hears it.
     * Nothing in here touches a socket, so the sound design is assertable in
     * a test with no audio anywhere near it.
     */
    readonly cues: SfxCues;
    constructor(data: PengoData, onRender: (content: string) => void, sheet: Record<string, Sprite>);
    /**
     * Levels 1-16: the transcribed arcade originals (`levels/`, see the
     * provenance note there). Level 17 onward: the door's own procedural
     * generator, unchanged - there is no 17th original to transcribe, and
     * looping the 16 back around would make "level 17" secretly identical
     * to "level 1" with a higher number, which reads as a bug more than a
     * feature. The real arcade does loop; we don't, and this is why.
     */
    initLevel(): void;
    /** A blank grid: every cell empty except the wall border. */
    private buildWalledGrid;
    private scatterIceBlocks;
    private scatterDiamonds;
    private placePengo;
    private scatterEgg;
    private spawnEnemy;
    /** Adds to the score, capped at the arcade's five-digit display (ref1). */
    private addScore;
    private livingEnemyCount;
    handleDirection(direction: Direction): void;
    handlePush(): void;
    private tryMove;
    private pushBlock;
    private shakeWall;
    /**
     * The alignment bonus, scored exactly once. It used to re-check (and
     * re-add) on every later push that still happened to find 2+ diamonds
     * in a line - even a push unrelated to the diamonds - because only the
     * SOUND was deduped via `diamondsAligned`, never the score. Diamonds
     * are also locked from further pushing once this fires (see
     * handlePush()), so there is no way back into this function with the
     * flag still false after the first real alignment.
     */
    private checkDiamondAlignment;
    update(): void;
    private updateEnemies;
    private updateEggs;
    private checkCollisions;
    private killPengo;
    private respawnPengo;
    render(): void;
}
//# sourceMappingURL=pengo-game.d.ts.map