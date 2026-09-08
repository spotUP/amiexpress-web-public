/**
 * A `${{ }}` inside a long `script:` block silently kills the whole workflow.
 *
 * GitHub treats a string containing an expression as ONE expression and caps
 * it at 21 000 characters. The Hetzner deploy's script is ~24 KB of shell and
 * comments, so the single `FORCE_DEPLOY="${{ github.event.inputs.force }}"`
 * that 6de2140f3 added took the file over the cap. GitHub then refused to
 * LOAD the workflow at all: `Invalid workflow file … Exceeded max expression
 * length 21000`, zero jobs, 0s, three consecutive pushes that never reached
 * the board while every run looked like an ordinary red X.
 *
 * The fix is to pass such a value through the step's `env:` and `envs:`
 * instead. This pins the shape that made the failure possible, for every
 * workflow, not just the one that hit it.
 */
import * as fs from 'fs';
import * as path from 'path';

const WORKFLOWS = path.resolve(__dirname, '../../../..', '.github/workflows');

/** GitHub Actions' own limit on the length of one evaluated expression. */
const MAX_EXPRESSION_LENGTH = 21000;

interface BlockScalar {
  readonly file: string;
  readonly key: string;
  readonly line: number;
  readonly body: string;
}

/**
 * Every `run: |` / `script: |` block in a workflow, with the line it opens on.
 * A block runs until a line that is neither blank nor indented past the key.
 */
function blockScalars(file: string): BlockScalar[] {
  const lines = fs.readFileSync(path.join(WORKFLOWS, file), 'utf8').split('\n');
  const blocks: BlockScalar[] = [];

  for (let i = 0; i < lines.length; i++) {
    const opener = /^(\s*)(run|script):\s*\|[-+]?\s*$/.exec(lines[i]);
    if (!opener) continue;

    const keyIndent = opener[1].length;
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === '') {
        body.push(line);
        continue;
      }
      if (line.length - line.trimStart().length <= keyIndent) break;
      body.push(line);
    }

    blocks.push({ file, key: opener[2], line: i + 1, body: body.join('\n') });
    i = j - 1;
  }

  return blocks;
}

const workflowFiles = fs
  .readdirSync(WORKFLOWS)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

describe('a workflow script never becomes an over-long expression', () => {
  it('finds the deploy script to check', () => {
    const deploy = blockScalars('deploy-hetzner.yml');
    expect(deploy.length).toBeGreaterThan(0);
    // The deploy ITSELF moved to `deploy/deploy.sh` on 2026-09-08, when a
    // billing failure stopped Actions and took the only copy of the caller
    // guard, the backup and the rollback with it. What is left in the
    // workflow is the call - so that is what this looks for now.
    expect(deploy.some((b) => b.body.includes('deploy/deploy.sh'))).toBe(true);
  });

  it.each(workflowFiles)('%s keeps every interpolated block under the cap', (file) => {
    for (const block of blockScalars(file)) {
      if (!block.body.includes('${{')) continue;
      // Asserted as a pair so a failure names the block, not just a number.
      const where = `${block.file}:${block.line} (${block.key})`;
      expect([where, block.body.length <= MAX_EXPRESSION_LENGTH]).toEqual([where, true]);
    }
  });

  it('passes the deploy guard override through env, not through the script', () => {
    const workflow = fs.readFileSync(path.join(WORKFLOWS, 'deploy-hetzner.yml'), 'utf8');
    expect(workflow).toMatch(/^\s*FORCE_DEPLOY: \$\{\{ github\.event\.inputs\.force \}\}$/m);
    expect(workflow).toMatch(/^\s*envs: .*\bFORCE_DEPLOY\b/m);
    const script = blockScalars('deploy-hetzner.yml').find((b) => b.body.includes('FORCE_DEPLOY'));
    expect(script).toBeDefined();
    expect(script!.body).not.toContain('${{');
  });
});
