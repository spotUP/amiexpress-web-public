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
export function renderMicList(devices: MicDevice[], currentId?: string): string {
  if (devices.length === 0) {
    return 'No microphones reported yet - turn voice on first.';
  }

  const lines = devices.map((device, index) => {
    const current = currentId && device.deviceId === currentId ? ' {green-fg}(in use){/green-fg}' : '';
    return `  ${index + 1}. ${device.label}${current}`;
  });

  return ['Microphones:', ...lines, 'Choose one with /mic <number>'].join('\n');
}

/**
 * Which device a numbered choice refers to.
 *
 * Returns null for anything that is not a valid position, so a typo says so
 * rather than silently opening the wrong input.
 */
export function resolveMicChoice(devices: MicDevice[], choice: string): MicDevice | null {
  const index = Number.parseInt(choice, 10);
  if (!Number.isFinite(index) || index < 1 || index > devices.length) return null;
  return devices[index - 1];
}

/** /mic - list microphones, or switch to one */
export const micCmd: SlashCommand = {
  name: 'mic',
  description: 'List microphones, or switch to one',
  usage: '/mic [number]',
  handler: (ctx, args) => {
    const devices: MicDevice[] = (ctx as any).micDevices ?? [];
    const currentId: string | undefined = (ctx as any).micDeviceId;

    if (args.length === 0) {
      return { handled: true, message: renderMicList(devices, currentId) };
    }

    const chosen = resolveMicChoice(devices, args[0]);
    if (!chosen) {
      return {
        handled: true,
        message: `No microphone ${args[0]}. ${renderMicList(devices, currentId)}`,
      };
    }

    return {
      handled: true,
      message: `Switching microphone to ${chosen.label}`,
      data: { selectMicDeviceId: chosen.deviceId },
    };
  },
};
