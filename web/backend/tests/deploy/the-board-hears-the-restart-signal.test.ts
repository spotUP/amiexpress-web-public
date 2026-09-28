/**
 * The board hears the deploy's restart signal.
 *
 * deploy.sh sends `docker kill -s SIGUSR1 amiexpress-bbs` and waits 60 seconds,
 * so every caller is told "SYSTEM UPDATE - restarting in 60 seconds" before the
 * container is replaced. Nobody ever was (the sysop, 2026-09-28: "i have never
 * ever seen such a warning"): the container ran `npx tsx src/index.ts`, the
 * signal went to npm, and npm relays SIGTERM and SIGINT but not SIGUSR1 - it
 * opened its own debugger instead, and the board's log never once said
 * "[RESTART NOTICE] SIGUSR1 received".
 *
 * Driven, not pinned: the Dockerfile's own CMD is launched with a probe script
 * in place of src/index.ts, sent SIGUSR1, and must hear it.
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const BACKEND = path.join(REPO, 'web', 'backend');

/** The exec-form CMD, as docker reads it. */
function dockerfileCmd(): string[] {
  const lines = fs.readFileSync(path.join(REPO, 'Dockerfile'), 'utf8').split('\n');
  const cmd = lines.filter((l) => l.startsWith('CMD ')).pop() as string;
  return JSON.parse(cmd.slice(4));
}

describe('the restart notice signal', () => {
  it('reaches the process the Dockerfile starts', async () => {
    const argv = dockerfileCmd();
    expect(argv[argv.length - 1]).toBe('src/index.ts');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usr1-'));
    const probe = path.join(dir, 'probe.ts');
    fs.writeFileSync(probe, [
      "process.on('SIGUSR1', () => { process.stdout.write('HEARD'); process.exit(0); });",
      "process.stdout.write('READY');",
      "setTimeout(() => process.exit(3), 15000);",
    ].join('\n'));

    try {
      const [command, ...args] = argv;
      const child = spawn(command === 'npx' ? 'npx' : command, [...args.slice(0, -1), probe], { cwd: BACKEND });
      let out = '';
      const done = new Promise<number>((resolve) => child.on('exit', (code) => resolve(code ?? -1)));
      await new Promise<void>((resolve) => child.stdout.on('data', (d) => { out += d; if (out.includes('READY')) resolve(); }));
      child.kill('SIGUSR1');
      const code = await done;
      expect(out).toContain('HEARD');
      expect(code).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);

  it('runs under an init that forwards signals and reaps door children', () => {
    const compose = fs.readFileSync(path.join(REPO, 'docker-compose.yml'), 'utf8');
    const bbs = compose.slice(compose.indexOf('\n  bbs:'), compose.indexOf('\n  whip-bot:'));
    expect(bbs).toMatch(/\n    init: true\n/);
  });
});
