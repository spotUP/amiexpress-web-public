"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.micCmd = void 0;
exports.renderMicList = renderMicList;
exports.resolveMicChoice = resolveMicChoice;
/**
 * Render the device list for the user, one per line, numbered from one.
 *
 * Pure, so the numbering and the marker can be tested without a browser.
 */
function renderMicList(devices, currentId) {
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
function resolveMicChoice(devices, choice) {
    const index = Number.parseInt(choice, 10);
    if (!Number.isFinite(index) || index < 1 || index > devices.length)
        return null;
    return devices[index - 1];
}
/** /mic - list microphones, or switch to one */
exports.micCmd = {
    name: 'mic',
    description: 'List microphones, or switch to one',
    usage: '/mic [number]',
    handler: (ctx, args) => {
        const devices = ctx.micDevices ?? [];
        const currentId = ctx.micDeviceId;
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
