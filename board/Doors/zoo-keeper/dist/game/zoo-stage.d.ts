/**
 * Zoo Keeper - Zoo Stage Game Logic
 * The main gameplay where Zeke runs around the perimeter building walls
 */
import { ZooKeeperData, Direction } from './types';
import { SfxCues } from '@amiexpress/bbs-door-sdk/engines/ui/arcade';
type RenderCallback = (content: string) => void;
/**
 * Main game engine class
 */
export declare class ZooKeeperGame {
    private data;
    private renderCallback;
    private moveTimer;
    private animalMoveTimer;
    private lastExtraLifeScore;
    /**
     * What just happened, for whoever is listening.
     *
     * The game names the moment; the door decides whether anybody hears it.
     * Nothing in here touches a socket, so the sound design is assertable in
     * a test with no audio anywhere near it.
     */
    readonly cues: SfxCues;
    constructor(data: ZooKeeperData, renderCallback: RenderCallback);
    /**
     * Initialize a new zoo stage
     */
    initZooStage(): void;
    /**
     * Create initial wall with given starting thickness
     */
    private createInitialWall;
    /**
     * Spawn a new animal inside the zoo
     */
    private spawnAnimal;
    /**
     * Create bonus items for the timer fuse
     */
    private createBonusItems;
    /**
     * Main update loop
     */
    update(): void;
    /**
     * Handle direction input
     */
    handleDirection(dir: Direction): void;
    /**
     * Get valid direction for perimeter movement
     */
    private getValidDirection;
    /**
     * Move Zeke in current direction
     */
    private moveZeke;
    /**
     * Build wall at Zeke's position
     */
    private buildWallAt;
    /**
     * Handle jump
     */
    handleJump(): void;
    /**
     * Update jump animation
     */
    private updateJump;
    /**
     * Update all animals
     */
    private updateAnimals;
    /**
     * Update animal inside the zoo
     */
    private updateCagedAnimal;
    /**
     * Animal attacks nearest wall
     */
    private animalAttackWall;
    /**
     * Check if animal escapes through gap
     */
    private checkAnimalEscape;
    /**
     * Update escaped animal (chases Zeke)
     */
    private updateEscapedAnimal;
    /**
     * Check collisions between Zeke and animals
     */
    /**
     * Public because the door's own tests drive them, the way Frogger's do:
     * a test needs to take one step without letting a whole update() move
     * everything it just placed.
     */
    checkCollisions(): void;
    /**
     * Capture escaped animal with net
     */
    private captureAnimal;
    /**
     * Check bonus item collection
     */
    /**
     * Public because the door's own tests drive them, the way Frogger's do:
     * a test needs to take one step without letting a whole update() move
     * everything it just placed.
     */
    checkBonusItems(): void;
    /**
     * Check for extra life
     */
    /**
     * Public because the door's own tests drive them, the way Frogger's do:
     * a test needs to take one step without letting a whole update() move
     * everything it just placed.
     */
    checkExtraLife(): void;
    /**
     * Level complete
     */
    private levelComplete;
    /**
     * Lose a life
     */
    private loseLife;
    /**
     * Show game over screen
     */
    private showGameOver;
    /**
     * Main render function
     */
    render(): void;
    /**
     * Render zoo stage
     */
    private renderZooStage;
    /**
     * Render game over screen
     */
    private renderGameOver;
    /**
     * Render stage transition
     */
    private renderTransition;
}
export {};
//# sourceMappingURL=zoo-stage.d.ts.map