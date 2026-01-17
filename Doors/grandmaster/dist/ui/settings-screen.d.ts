/**
 * Settings Configuration Screen
 *
 * Interactive settings editor with real-time preview
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { AppState } from '../core/types';
import type { SoundEngine } from '../audio/sounds';
/**
 * Settings screen
 */
export declare class SettingsScreen {
    private screen;
    private state;
    private sounds;
    constructor(screen: Screen, state: AppState, sounds: SoundEngine);
    /**
     * Show settings editor and wait for exit
     */
    show(): Promise<void>;
    /**
     * Get menu items
     */
    private getMenuItems;
    /**
     * Get description for menu item
     */
    private getDescription;
    /**
     * Handle menu selection
     */
    private handleSelection;
    /**
     * Cycle rotation system
     */
    private cycleRotationSystem;
    /**
     * Adjust numeric value
     */
    private adjustValue;
    /**
     * Adjust volume (0.0 - 1.0)
     */
    private adjustVolume;
    /**
     * Edit a key binding
     */
    private editKeyBinding;
    /**
     * Adjust glow intensity
     */
    private adjustGlowIntensity;
    /**
     * Cycle clear style
     */
    private cycleClearStyle;
    /**
     * Cycle floating text mode
     */
    private cycleFloatTextMode;
}
//# sourceMappingURL=settings-screen.d.ts.map