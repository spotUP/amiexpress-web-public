// Redirect ALL console output to stderr before any other module loads.
// Import this as the VERY FIRST import in run-amiga-door.ts.
// In tsx/ts-node CJS mode, imports run in order, so this fires before
// AmigaDoorSession (and transitively config.ts) initializes — preventing
// initialization logs from leaking into door stdout redirect files (quicknew.txt etc.).
const _w = (s: string) => process.stderr.write(s + '\n');
(console as any).log   = (...a: unknown[]) => _w(a.join(' '));
(console as any).info  = (...a: unknown[]) => _w(a.join(' '));
(console as any).warn  = (...a: unknown[]) => _w(a.join(' '));
(console as any).error = (...a: unknown[]) => _w(a.join(' '));
(console as any).debug = (...a: unknown[]) => _w(a.join(' '));
