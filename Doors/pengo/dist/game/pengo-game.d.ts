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
    /**
     * Is a block in flight standing in this cell?
     *
     * A pushed block leaves the grid for the duration of its slide (see
     * pushBlock) and lives in `slidingBlocks` until it settles, so the grid
     * alone reports its cells as empty floor. Every walkability question has
     * to ask this too, or the block is a hole in the world: Pengo walks a
     * cell per 90ms against the block's one per SLIDE_TICKS_PER_CELL, so
     * holding the direction key used to walk him through the block he had
     * just pushed and into whatever stood behind it - reported in play,
     * "the penguin flies with the block and dies on the enemy". Sno-Bees
     * read the same grid and could step into one instead of being squashed.
     */
    private slidingBlockAt;
    /**
     * Can an actor step into this cell? The one answer to that question -
     * the grid says what terrain is there, `slidingBlocks` says what is in
     * the air above it, and neither alone is the truth.
     */
    private canEnter;
    private tryMove;
    /**
     * Start a block sliding. The push RESOLVES over the next few ticks.
     *
     * This used to run the whole slide in one synchronous loop, so a block
     * left its cell and arrived at the far wall inside a single frame - the
     * player never saw it travel, which read as the block disappearing.
     * Diagnosed exactly in play: "they move too fast making it a 1 frame
     * animation". The block is now an entity in flight; `advanceSlidingBlocks`
     * moves it a cell at a time and decides where it stops.
     */
    private pushBlock;
    /**
     * Move every block in flight, and settle the ones that have arrived.
     *
     * A block travels one cell per SLIDE_TICKS_PER_CELL. It squashes any
     * Sno-Bee it reaches and carries on only while the next cell holds
     * another one, so a push resolves where it did its damage rather than
     * running on to the far wall.
     */
    private advanceSlidingBlocks;
    /** A block stops: back into the grid, and pay out what it caught. */
    private settleBlock;
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