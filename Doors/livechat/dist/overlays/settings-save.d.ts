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
}, updateStatusBar: () => void): void;
