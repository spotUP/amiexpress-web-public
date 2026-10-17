// Preloaded into a real `run-amiga-door.ts` child by
// tests/scripts/runner-graph-skips-the-server.test.ts. It watches the module
// graph the runner loads and reports on stderr:
//   RUNNER-GRAPH:door-session  - the runner reached AmigaDoorSession (sentinel)
//   RUNNER-GRAPH:server-entry  - src/index.ts (the server entry) was loaded
// When AmigaDoorSession loads (after the runner's console-to-stderr shim), it
// also writes a stray boot line with process.stdout.write, the way
// file-areas-loader / initialization do, and one door byte string through the
// runner's real Output() writer.
const fs = require('fs');
const Module = require('module');
const path = require('path');
const orig = Module._load;
let sawSession = false;
Module._load = function (request, parent, isMain) {
  const out = orig.apply(this, arguments);
  let resolved = '';
  try { resolved = Module._resolveFilename(request, parent, isMain); } catch { return out; }
  if (/[\\/]src[\\/]index\.ts$/.test(resolved)) {
    fs.writeSync(2, 'RUNNER-GRAPH:server-entry ' + (parent ? path.basename(parent.filename) : '') + '\n');
  }
  if (!sawSession && /[\\/]amiga-emulation[\\/]AmigaDoorSession\.ts$/.test(resolved)) {
    sawSession = true;
    fs.writeSync(2, 'RUNNER-GRAPH:door-session\n');
    process.stdout.write('[FileAreas] STRAY BOOT LINE\n');
    // The runner's shim, already loaded as its first import.
    const shimPath = Object.keys(require.cache).find((k) => /[\\/]scripts[\\/]console-to-stderr\.ts$/.test(k));
    const shim = require.cache[shimPath].exports;
    shim.writeDoorOutput('DOOR-OUTPUT-BYTES\n');
    // Pipes are asynchronous on macOS and the runner's usage path calls
    // process.exit at once; let both pipes drain before the exit is taken.
    const realExit = process.exit.bind(process);
    process.exit = (code) => {
      shim.writeDoorOutput('', () => process.stderr.write('', () => realExit(code)));
    };
  }
  return out;
};
