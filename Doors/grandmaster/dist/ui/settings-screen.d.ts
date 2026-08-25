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
    private bbsSession;
    constructor(screen: Screen, state: AppState, sounds: SoundEngine, bbsSession?: any);
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
    /**
     * Edit one key binding.
     *
     * Every binding is a list of key names EXCEPT useSpecialOn, which is a
     * list per opponent slot - it is bound by position, not through this
     * editor, so it is excluded from the type rather than special-cased in
     * the body.
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
    /**
     * Key binding wizard — same UX as joypad wizard but captures keypresses.
     * Enter=skip, Escape=done, any other key=bind and auto-advance.
     */
    private bindAllKeys;
    /** Clear all key bindings. */
    private clearKeyBindings;
    /** Show a preset picker and apply the chosen key layout. */
    private pickKeyPreset;
    /** Show a preset picker and apply the chosen joypad layout. */
    private pickGamepadPreset;
    /**
     * Clear all joypad bindings (resets to defaults, which are handled by the
     * GAMEPAD_MAPPING in app.ts — storing an empty object means "use defaults").
     */
    private clearGamepadBindings;
    /**
     * Joypad binding wizard — steps through all 9 actions in order starting from
     * startIndex. Pressing a button/dpad/axis auto-saves and advances. Enter skips,
     * Escape exits the wizard.
     */
    private editAllGamepadBindings;
    /**
     * Edit a joypad binding — listen for the next gamepad button/axis/dpad press.
     * Up to 3 triggers per action. Enter saves, Escape cancels, Backspace removes last.
     */
    private editGamepadBinding;
}
//# sourceMappingURL=settings-screen.d.ts.map