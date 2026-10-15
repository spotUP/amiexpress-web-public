/** Sound configuration */
export interface SoundConfig {
    note?: string;
    notes?: string[];
    duration: number;
}
/** Available sounds */
export declare const SOUNDS: Record<string, SoundConfig>;
