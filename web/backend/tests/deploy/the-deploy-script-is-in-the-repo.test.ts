/**
 * The deploy has to exist somewhere a person can run it.
 *
 * It was 534 lines of shell inside the workflow's `script:` block, pasted onto
 * the host by an SSH action. On 2026-09-08 GitHub Actions stopped running for
 * this repository - "recent account payments have failed or your spending
 * limit needs to be increased" - and that block was the ONLY copy of the
 * caller guard, the .info backup, the health check and the rollback. The board
 * could not be deployed by anybody, and the fix had to be typed by hand on the
 * box.
 *
 * So it lives in the repository now, and this pins the properties that made it
 * unreachable: the file exists, it is executable, it takes a lock, and the
 * workflow calls it rather than carrying a second copy that can drift.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const repo = path.join(__dirname, '..', '..', '..', '..');
const script = path.join(repo, 'deploy', 'deploy.sh');
const workflow = path.join(repo, '.github', 'workflows', 'deploy-hetzner.yml');

describe('the deploy script', () => {
  it('is in the repository, executable, and valid shell', () => {
    expect(fs.existsSync(script)).toBe(true);
    // A file the host cannot execute is a file the host does not have.
    expect(fs.statSync(script).mode & 0o111).toBeGreaterThan(0);
    // `bash -n` parses without running: a syntax error here is a board that
    // cannot deploy, discovered at the worst possible moment.
    expect(() => execFileSync('bash', ['-n', script])).not.toThrow();
  });

  it('carries the parts that were lost with Actions', () => {
    const body = fs.readFileSync(script, 'utf8');

    expect(body).toContain('caller-guard.sh');       // who is on the board
    expect(body).toContain('bbs-config-');           // the .info backup
    expect(body).toContain('--force-recreate');      // the recreate itself
    expect(body).toMatch(/rollback/i);               // and the way back
  });

  it('refuses to run twice at once', () => {
    const body = fs.readFileSync(script, 'utf8');

    // Two deploys in parallel raced into "Container name already in use" on
    // 2026-05-20; the workflow had a concurrency group and a file has none.
    expect(body).toContain('flock');
    expect(body).toMatch(/DEPLOY_LOCK/);
  });

  it('is what the workflow runs, so there is only one copy', () => {
    const yml = fs.readFileSync(workflow, 'utf8');

    expect(yml).toContain('deploy/deploy.sh');
    // The 534-line body is gone from the YAML: anything that long in there is
    // a second implementation waiting to drift from this one.
    const script_block = yml.slice(yml.indexOf('script: |'));
    expect(script_block.split('\n').length).toBeLessThan(40);
  });
});
