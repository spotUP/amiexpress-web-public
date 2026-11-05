/**
 * Donkey Kong - Game Engine
 * 1981 Nintendo arcade classic
 */
import { DonkeyKongData, Direction } from './types';
import { SfxCues } from '@amiexpress/bbs-door-sdk/engines/ui/arcade';
export declare class DonkeyKongGame {
    private data;
    private renderCallback;
    private onGameOver;
    private onStageComplete;
    /**
     * What just happened, for whoever is listening.
     *
     * The game names the moment; the door decides whether anybody hears it.
     * Nothing in here touches a socket, so the sound design is assertable in
     * a test with no audio anywhere near it.
     */
    readonly cues: SfxCues;
    constructor(data: DonkeyKongData, renderCallback: (content: string) => void, onGameOver: () => void, onStageComplete: () => void);
    initStage(): void;
    update(): void;
    private updateDK;
    private spawnBarrel;
    private spawnFireball;
    private updatePlayer;
    private handleGirderCollision;
    private isOnLadder;
    private updateBarrels;
    private checkBarrelOnLadder;
    private updateFireballs;
    private updateElevators;
    /**
     * Public because the door's own tests drive it, the way Frogger's do: a
     * collision is a step a test needs to take on its own without letting a
     * whole update() move everything it just placed.
     */
    checkCollisions(): void;
    private checkStageComplete;
    private killPlayer;
    handleMove(direction: Direction): void;
    handleClimb(direction: 'up' | 'down'): void;
    handleJump(): void;
    render(): void;
}
