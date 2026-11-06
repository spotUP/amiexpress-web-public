/**
 * Settings save handler
 * Applies settings and updates state
 */
import type { AppState } from '../core/state';
export declare function saveSettings(state: AppState, checkboxes: {
    showLogins: any;
    showFileActivity: any;
    showDoorActivity: any;
    showMessages: any;
    showAnnouncements: any;
    muteSounds: any;
    timestamps: any;
    compact?: any;
}, updateStatusBar: () => void): void;
/**
 * The same checkboxes, read back from the saved prefs with one overridden:
 * how a slash command (/sounds, /compact, /timestamps) goes through
 * saveSettings instead of writing prefs a second way.
 */
export declare function prefsAsCheckboxes(state: AppState, override?: Partial<Record<'muteSounds' | 'timestamps' | 'compact', boolean>>): {
    showLogins: {
        isChecked: () => boolean;
    };
    showFileActivity: {
        isChecked: () => boolean;
    };
    showDoorActivity: {
        isChecked: () => boolean;
    };
    showMessages: {
        isChecked: () => boolean;
    };
    showAnnouncements: {
        isChecked: () => boolean;
    };
    muteSounds: {
        isChecked: () => boolean;
    };
    timestamps: {
        isChecked: () => boolean;
    };
    compact: {
        isChecked: () => boolean;
    };
};
