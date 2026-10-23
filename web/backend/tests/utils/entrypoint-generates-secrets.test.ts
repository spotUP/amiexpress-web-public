import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Runs the real docker/ensure-secrets.sh the entrypoint sources.
const SCRIPT = path.resolve(__dirname, '../../../../docker/ensure-secrets.sh');

function run(env: Record<string, string>, file: string): Record<string, string> {
  const out = execFileSync('sh', ['-c', `. "${SCRIPT}" >/dev/null; echo "$JWT_SECRET|$JWT_REFRESH_SECRET|$SESSION_SECRET"`], {
    env: { PATH: process.env.PATH ?? '', SECRETS_FILE: file, ...env },
    encoding: 'utf8',
  }).trim();
  const [JWT_SECRET, JWT_REFRESH_SECRET, SESSION_SECRET] = out.split('|');
  return { JWT_SECRET, JWT_REFRESH_SECRET, SESSION_SECRET };
}

describe('docker/ensure-secrets.sh', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-'));
    file = path.join(dir, 'data', '.secrets');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('replaces unset and placeholder values, persists them mode 600, reuses them', () => {
    const first = run({ JWT_SECRET: 'CHANGE_ME', SESSION_SECRET: 'your_session_secret_here' }, file);
    for (const v of Object.values(first)) expect(v).toMatch(/^[0-9a-f]{96}$/);
    expect(new Set(Object.values(first)).size).toBe(3);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(run({}, file)).toEqual(first);
  });

  it('a value set in the environment wins and is not stored', () => {
    const got = run({ JWT_SECRET: 'operator-chosen-secret' }, file);
    expect(got.JWT_SECRET).toBe('operator-chosen-secret');
    expect(fs.readFileSync(file, 'utf8')).not.toContain('JWT_SECRET=');
  });
});
