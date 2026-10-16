/**
 * Drives the REAL WHIP bundle (Doors/whip/dist/index.js, against sdk/dist)
 * and prints every byte it wrote, plus how often the door asked whether the
 * caller has colour, as JSON. The seam is shared: see drive-door.cjs.
 *
 *   BBS_DATA_DIR=<empty dir> node drive-whip.cjs \
 *     '{"cols":80,"rows":24,"colour":false,"steps":[{"key":"\t","wait":300}]}'
 */
const driveDoor = require('./drive-door.cjs');

let ansiAsks = 0;

driveDoor({
  dist: 'Doors/whip/dist/index.js',
  callerId: 'whip-caller',
  extra: () => ({ ansiAsks }),
  makeBbs: (spec) => ({
    getUser: () => ({ username: 'READER', securityLevel: 255 }),
    emitCustomEvent: () => {},
    isAnsiMode: () => { ansiAsks++; return spec.colour !== false; },
  }),
});
