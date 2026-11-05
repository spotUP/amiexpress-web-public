export interface WormsSettings {
    wormsPerTeam: number;
    startingHealth: number;
    /** Whether two callers can play each other over the board. */
    allowNetwork: boolean;
}
export declare const DEFAULT_SETTINGS: WormsSettings;
export declare function applySettings(raw: Record<string, string | number | boolean>): WormsSettings;
export declare function loadSettings(): WormsSettings;
