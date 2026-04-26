/**
 * Main Menu Screen
 *
 * Displays game mode selection and options
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { AppState } from '../core/types';
import type { SoundEngine } from '../audio/sounds';
export type MenuSelection = 'master' | 'death' | 'sprint' | 'marathon' | 'cpu_battle' | 'versus' | 'tetrinet' | 'training' | 'ultra' | 'dig' | 'zone' | 'settings' | 'stats' | 'manual' | 'quit';
/**
 * Main menu screen
 */
export declare class MenuScreen {
    private screen;
    private state;
    private sounds;
    constructor(screen: Screen, state: AppState, sounds: SoundEngine);
    /**
     * Show menu and wait for selection
     */
    show(): Promise<MenuSelection>;
    /**
     * Get title ASCII art
     */
    private getTitleArt;
    /**
     * Get mode description for selected index
     */
    private getModeDescription;
    /**
     * Get player info display
     */
    private getPlayerInfo;
}
//# sourceMappingURL=menu.d.ts.map