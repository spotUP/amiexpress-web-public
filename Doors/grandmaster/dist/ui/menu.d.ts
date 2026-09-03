/**
 * Main Menu Screen
 *
 * Displays game mode selection and options
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { AppState } from '../core/types';
import type { SoundEngine } from '../audio/sounds';
export type MenuSelection = 'master' | 'death' | 'sprint' | 'marathon' | 'cpu_battle' | 'versus' | 'tetrinet' | 'tetris_attack' | 'training' | 'mission' | 'ultra' | 'dig' | 'zone' | 'spectate' | 'settings' | 'stats' | 'manual' | 'quit';
/**
 * The menu's selections, index-aligned with the `items` array that renders them
 * and with the descriptions beside it. Three parallel arrays, so a row added to
 * one has to be added to all three.
 *
 * Hoisted out of the select handler so key bindings can look an index UP rather
 * than hardcode one - they used to hardcode, and adding rows above them quietly
 * pointed q/ESC at High Scores and F1 at Settings.
 */
/**
 * The menu's rows, index-aligned with MENU_SELECTIONS below and with the
 * descriptions in getModeDescription. Adding a row means adding to all three;
 * tests/panels/menu-wiring.test.ts checks the first two agree.
 */
export declare const MENU_ITEMS: string[];
export declare const MENU_SELECTIONS: MenuSelection[];
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