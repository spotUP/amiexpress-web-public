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

// The runner's stdout (fd 1) is the door's Output() channel: the parent
// (utils/amiga-program-runner.util.ts) collects it verbatim and a `>file`
// redirect writes it to disk (Screens/quicknew.txt). It belongs to the door
// alone. Keep the one real writer for it here, then point process.stdout.write
// at stderr, so a backend module that writes a boot line with
// process.stdout.write (file-areas-loader, initialization, AmigaDoorManager,
// ...) lands in the parent's `[runner:*]` log instead of in the door's output.
const doorStdoutWrite = process.stdout.write.bind(process.stdout);

/** Write bytes to the door's Output() channel (the runner's fd 1). */
export function writeDoorOutput(data: string | Uint8Array, done?: () => void): void {
  if (done) doorStdoutWrite(data, done);
  else doorStdoutWrite(data);
}

process.stdout.write = ((...args: Parameters<typeof process.stderr.write>) =>
  process.stderr.write(...args)) as typeof process.stdout.write;
