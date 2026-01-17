/**
 * Pengo - Game Engine
 * Core game logic for the 1982 Sega arcade puzzle game
 */
import { PengoData, Direction } from './types';
export declare class PengoGame {
    private data;
    private renderCallback;
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