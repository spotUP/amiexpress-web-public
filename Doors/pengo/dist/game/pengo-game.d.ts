/**
 * Pengo - Game Engine
 * Core game logic for the 1982 Sega arcade puzzle game
 */
import { PengoData, Direction } from './types';
import { SfxCues } from '@amiexpress/bbs-door-sdk/engines/ui/arcade';
export declare class PengoGame {
    private data;
    private renderCallback;
    /**
     * What just happened, for whoever is listening.
     *
     * The game names the moment; the door decides whether anybody hears it.
     * Nothing in here touches a socket, so the sound design is assertable in
     * a test with no audio anywhere near it.
     */
    readonly cues: SfxCues;
    constructor(data: PengoData, onRender: (content: string) => void);
    initLevel(): void;
    private spawnEnemy;
    handleDirection(direction: Direction): void;
    handlePush(): void;
    private tryMove;
    private pushBlock;
    private shakeWall;
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