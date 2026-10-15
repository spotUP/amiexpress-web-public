/**
 * Galaga - Game Types
 * 1981 Namco space shooter arcade game port
 */
export type GameState = "menu" | "playing" | "dying" | "stageIntro" | "challengingStage" | "stageComplete" | "gameover" | "highscores" | "enterName" | "paused";
export type AlienType = "bee" | "butterfly" | "boss" | "captured";
export type AlienState = "formation" | "diving" | "returning" | "capturing" | "dead";
export interface Position {
    x: number;
    y: number;
}
export interface Velocity {
    dx: number;
    dy: number;
}
export interface Player {
    x: number;
    y: number;
    isDead: boolean;
    deathFrame: number;
    hasDualFighter: boolean;
    isCaptured: boolean;
}
export interface Bullet {
    id: number;
    x: number;
    y: number;
    dy: number;
    isEnemy: boolean;
}
export interface Alien {
    id: number;
    type: AlienType;
    state: AlienState;
    x: number;
    y: number;
    formationX: number;
    formationY: number;
    health: number;
    diveProgress: number;
    divePath: Position[];
    divePathIndex: number;
    capturedFighter: boolean;
    tractorBeamActive: boolean;
}
export interface FormationSlot {
    x: number;
    y: number;
    occupied: boolean;
    alienId: number | null;
}
export interface Explosion {
    id: number;
    x: number;
    y: number;
    frame: number;
    maxFrames: number;
}
export interface Star {
    x: number;
    y: number;
    speed: number;
    brightness: number;
}
export interface HighScore {
    name: string;
    score: number;
    stage: number;
    date: string;
}
export interface GalagaData {
    state: GameState;
    score: number;
    lives: number;
    stage: number;
    shotsHit: number;
    shotsFired: number;
    player: Player;
    aliens: Alien[];
    bullets: Bullet[];
    explosions: Explosion[];
    stars: Star[];
    formation: FormationSlot[][];
    formationOffset: number;
    formationDirection: 1 | -1;
    alienIdCounter: number;
    bulletIdCounter: number;
    explosionIdCounter: number;
    spawnPhase: number;
    aliensToSpawn: AlienType[];
    isChallengingStage: boolean;
    challengingKills: number;
    challengingTotal: number;
    capturedFighterAlienId: number | null;
    tractorBeamTimer: number;
    highscores: HighScore[];
    menuSelection: number;
    playerName: string;
    lastUpdateTime: number;
    frameCount: number;
    stageIntroTimer: number;
}
export type InputKey = "left" | "right" | "fire" | "space" | "enter" | "escape" | "p" | "q" | "backspace" | string;
export interface StageConfig {
    bees: number;
    butterflies: number;
    bosses: number;
    diveFrequency: number;
    alienSpeed: number;
    bulletSpeed: number;
    isChallengingStage: boolean;
}
export type SoundEffect = "shoot" | "explosion" | "alienDive" | "capture" | "dualFighter" | "stageStart" | "challenging" | "gameOver";
export interface RPCMethods {
    getHighscores: () => Promise<HighScore[]>;
    saveHighscore: (params: {
        name: string;
        score: number;
        stage: number;
    }) => Promise<void>;
}
//# sourceMappingURL=types.d.ts.map