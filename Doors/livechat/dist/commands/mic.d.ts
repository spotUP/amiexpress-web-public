import type { SlashCommand } from './types';
/**
 * Choosing which microphone the call actually listens to.
 *
 * getUserMedia was asked for "audio" with no device, so the browser handed
 * over the system's default input - and a default is not necessarily a
 * microphone. On a machine with BlackHole, Loopback or an aggregate device
 * installed, the default can be a loopback of system audio: the meter then
 * follows whatever is playing through the speakers and never reacts to the
 * person talking (reported 2026-08-26).
 *
 * There is no way to guess this correctly. A name-matching heuristic that
 * skipped "BlackHole" would break for the next virtual device and would
 * override somebody who routes their audio deliberately. The honest answer
 * is to show what exists and let the user say.
 */
/** Inputs the browser reported, filled in by the door's audio:devices handler. */
export interface MicDevice {
    deviceId: string;
    label: string;
}
/**
 * Render the device list for the user, one per line, numbered from one.
 *
 * Pure, so the numbering and the marker can be tested without a browser.
 */
export declare function renderMicList(devices: MicDevice[], currentId?: string): string;
/**
 * Which device a numbered choice refers to.
 *
 * Returns null for anything that is not a valid position, so a typo says so
 * rather than silently opening the wrong input.
 */
export declare function resolveMicChoice(devices: MicDevice[], choice: string): MicDevice | null;
/** /mic - list microphones, or switch to one */
export declare const micCmd: SlashCommand;
