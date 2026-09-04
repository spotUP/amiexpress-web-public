/**
 * Main Menu Screen
 *
 * Displays game mode selection and options
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { AppState } from '../core/types';
import type { SoundEngine } from '../audio/sounds';
export type MenuSelection = 'master' | 'death' | 'sprint' | 'marathon' | 'cpu_battle' | 'versus' | 'tetrinet' | 'training' | 'mission' | 'ultra' | 'dig' | 'zone' | 'spectate' | 'settings' | 'stats' | 'manual' | 'quit';
/**
 * Main menu screen
 */
/**
 * What each menu row does, in the order the rows are drawn.
 *
 * At module scope so a key handler can ask for a row by name. The two lists
 * - this one and the `items` array below - have to stay the same length and
 * the same order; tests/panels/menu-wiring.test.ts is what says so.
 */
export declare const MENU_SELECTIONS: readonly MenuSelection[];
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