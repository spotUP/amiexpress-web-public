/**
 * The connect flow says what happened to the FRONTEND syscmd.
 *
 * A board with no FRONTEND registration goes straight to the ANSI prompt, and
 * so does a board whose FRONTEND is registered but never runs. Those looked
 * identical from outside and from the log: the step caught every throw and
 * printed "syscmd not found" whatever the cause, and ignored the RESULT code
 * entirely. A sysop reported the Who's-Online screen missing on the live board
 * while it worked locally, and there was nothing recorded to tell the two
 * cases apart.
 *
 * -1 is RESULT_FAILURE (no such command), -2 RESULT_NOT_ALLOWED (access), and
 * 0 is success (command-execution.handler.ts:27-29).
 */

import * as fs from 'fs';
import * as path from 'path';

const SOURCE = fs.readFileSync(
  path.join(__dirname, '../../src/services/login-connect.service.ts'), 'utf8');

describe('the FRONTEND step of the connect flow', () => {
  it('reports a non-zero result rather than passing it over', () => {
    expect(SOURCE).toMatch(/const result = await runSysCommand\([^)]*"FRONTEND"/);
    expect(SOURCE).toMatch(/if \(result !== 0\)/);
  });

  it('reports the error it caught, not a guess about the cause', () => {
    // The old catch printed "FRONTEND syscmd not found" for any throw at all.
    expect(SOURCE).toMatch(/catch \(err\)/);
    expect(SOURCE).toContain('FRONTEND syscmd failed:');
    expect(SOURCE).not.toContain('FRONTEND syscmd not found, continuing');
  });

  it('still treats a board with no FRONTEND as normal, not as an error', () => {
    // No throw, no crash: the flow continues to the graphics prompt either
    // way. Only the log distinguishes them.
    expect(SOURCE).toMatch(/Optional; a board with no\s+\/\/ FRONTEND registration is normal/);
  });
});
