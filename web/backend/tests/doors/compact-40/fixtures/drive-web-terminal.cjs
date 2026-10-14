/**
 * Drives the REAL WEBTERM bundle (Doors/web-terminal/dist/index.js, against
 * sdk/dist): every byte it wrote, the board calls it made, and whether
 * execute() resolved, as JSON. The seam is shared: see drive-door.cjs.
 *
 *   node drive-web-terminal.cjs '{"cols":40,"rows":25,"petscii":true,"steps":[{"key":"\u001b[B","wait":100}]}'
 */
const driveDoor = require('./drive-door.cjs');

const calls = [];
let palette = 'C128 (VDC)';

driveDoor({
  dist: 'Doors/web-terminal/dist/index.js',
  callerId: 'wt-caller',
  extra: () => ({ calls }),
  makeBbs: () => ({
    webTerminalSettings: () => ({ modemSpeed: '2400 bps', font: 'MicroKnight', fontFixedNotice: '', petsciiPalette: palette, petsciiCharset: 'STANDARD' }),
    modemSpeedChoices: () => ['MAX (No Throttle)', '2400 bps'],
    chooseModemSpeed: async () => true,
    terminalFontChoices: () => [{ id: 'MicroKnight', label: 'MicroKnight' }],
    chooseTerminalFont: async () => 'set',
    togglePetsciiPalette: async () => { calls.push('togglePetsciiPalette'); palette = 'C64 (VIC-II)'; return 'vic'; },
    togglePetsciiCharset: async () => { calls.push('togglePetsciiCharset'); return { charset: 'swedish', notice: 'SWEDISH' }; },
    myData: () => [],
    eraseMyAccount: async () => ({ ok: false, reason: 'no' }),
  }),
});
