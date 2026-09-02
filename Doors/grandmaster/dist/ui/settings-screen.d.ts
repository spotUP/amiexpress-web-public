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
    /**
     * The door's 80x25 / responsive switch, so the size can be changed from
     * a menu and not only from a key: "we also need to add a fullscren
     * toggle in the settings menu" (2026-09-02). A player who never finds
     * Alt+Enter never finds the room.
     */
    private terminalMode;
    constructor(screen: Screen, state: AppState, sounds: SoundEngine, bbsSession?: any, 
    /**
     * The door's 80x25 / responsive switch, so the size can be changed from
     * a menu and not only from a key: "we also need to add a fullscren
     * toggle in the settings menu" (2026-09-02). A player who never finds
     * Alt+Enter never finds the room.
     */
    terminalMode?: {
        mode(): 'fixed' | 'wide';
        toggle(): void;
    } | null);
    /**
     * Show settings editor and wait for exit
     */
    show(): Promise<void>;
    /**
     * Every settings row, in one place.
     *
     * The menu used to exist three times over - a list of label strings, a
     * parallel array of descriptions, and a `switch (index)` of actions - all
     * keyed by POSITION. They had already drifted apart: the descriptions
     * array stopped at the joypad section, so every DISPLAY row described the
     * wrong thing, and the Save & Exit index had been renumbered by hand in a
     * comment. One table ends that class of bug - adding a row cannot
     * renumber anything, because nothing is numbered.
     */
    private menuRows;
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
    /** Cycle HIDDEN off -> 300 -> 150 -> 100 frames (the reference's 1/2/3 rates). */
    private cycleHiddenMode;
    /** Cycle SURVIVAL -> GOAL LV -> GOAL LINE (gamestart.c's wintype 2/0/1). */
    private cycleVersusWinType;
    /**
     * Cycle the item mode - HeborisCE's item_mode[player], over the four
     * selection presets core/items.ts implements.
     */
    private cycleItemMode;
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