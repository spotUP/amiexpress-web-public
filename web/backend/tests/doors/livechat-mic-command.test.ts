/**
 * Choosing which microphone the call listens to.
 *
 * getUserMedia was asked for "audio" with no device, so the browser handed
 * over the system default - and a default is not necessarily a microphone.
 * With BlackHole installed the default was a loopback of system audio, so
 * the meter followed whatever was playing and never reacted to the person
 * talking (2026-08-26).
 *
 * No heuristic can fix that honestly: skipping devices called "BlackHole"
 * would break for the next virtual device and would override somebody who
 * routes their audio on purpose. The list is shown and the user chooses.
 */

import {
  renderMicList,
  resolveMicChoice,
  micCmd,
  type MicDevice,
} from '../../../../Doors/livechat/commands/mic';

const DEVICES: MicDevice[] = [
  { deviceId: 'default', label: 'BlackHole 2ch' },
  { deviceId: 'abc123', label: 'MacBook Pro Microphone' },
  { deviceId: 'def456', label: 'Yeti Nano' },
];

function context(devices: MicDevice[] = DEVICES, currentId?: string): any {
  return { micDevices: devices, micDeviceId: currentId, secLevel: 255 };
}

describe('/mic', () => {
  describe('listing', () => {
    it('numbers the devices from one', () => {
      const listed = renderMicList(DEVICES);

      expect(listed).toContain('1. BlackHole 2ch');
      expect(listed).toContain('2. MacBook Pro Microphone');
      expect(listed).toContain('3. Yeti Nano');
    });

    it('marks the one in use', () => {
      const listed = renderMicList(DEVICES, 'abc123');

      expect(listed).toContain('MacBook Pro Microphone {green-fg}(in use){/green-fg}');
      expect(listed).not.toContain('BlackHole 2ch{green-fg}');
    });

    it('says so when nothing has been reported yet', () => {
      // Labels only exist after microphone permission is granted, so the
      // list is empty until voice has been turned on once.
      expect(renderMicList([])).toContain('turn voice on first');
    });

    it('explains how to choose', () => {
      expect(renderMicList(DEVICES)).toContain('/mic <number>');
    });
  });

  describe('choosing', () => {
    it('resolves a number to its device', () => {
      expect(resolveMicChoice(DEVICES, '2')).toEqual(DEVICES[1]);
    });

    it('refuses a number outside the list rather than picking something', () => {
      expect(resolveMicChoice(DEVICES, '0')).toBeNull();
      expect(resolveMicChoice(DEVICES, '4')).toBeNull();
      expect(resolveMicChoice(DEVICES, 'yeti')).toBeNull();
      expect(resolveMicChoice(DEVICES, '')).toBeNull();
    });
  });

  describe('the command', () => {
    it('lists when given no argument', async () => {
      const result = await micCmd.handler(context(), []);

      expect(result.handled).toBe(true);
      expect(result.message).toContain('Microphones:');
      expect(result.data?.selectMicDeviceId).toBeUndefined();
    });

    it('asks the browser to switch when given a number', async () => {
      const result = await micCmd.handler(context(), ['3']);

      expect(result.data?.selectMicDeviceId).toBe('def456');
      expect(result.message).toContain('Yeti Nano');
    });

    it('says what is wrong, and lists again, on a bad choice', async () => {
      const result = await micCmd.handler(context(), ['9']);

      expect(result.data?.selectMicDeviceId).toBeUndefined();
      expect(result.message).toContain('No microphone 9');
      expect(result.message).toContain('Microphones:');
    });

    it('survives being run before any device is known', async () => {
      const result = await micCmd.handler(context([]), ['1']);

      expect(result.handled).toBe(true);
      expect(result.data?.selectMicDeviceId).toBeUndefined();
    });
  });
});
