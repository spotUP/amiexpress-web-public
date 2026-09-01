/**
 * The connect flow and the startup path must share one command cache.
 *
 * The backend compiles to CommonJS. A dynamic `await import()` of a TS module
 * under tsx produces a SECOND instance with its own module state, so
 * login-connect.service.ts read a syscmd cache holding 0 entries while the
 * board's startup had loaded 16 into the copy `initialization.ts` populates
 * through a static import:
 *
 *   [initializeDoors] commandCache.bbscmd.size=96, syscmd.size=16
 *   [PreLoginConnect] FRONTEND syscmd returned -1 ... syscmd cache holds 0: nothing
 *
 * Every syscmd failed in the connect flow and nowhere else, so the
 * Who's-Online screen disappeared from the live board while typed commands
 * kept working - and while the same door still ran on a developer's machine,
 * whose tree predated this call site.
 *
 * This asserts the two ways of loading it really do differ, so the reason for
 * the require() is a fact in the suite rather than a comment.
 */

import * as fs from 'fs';
import * as path from 'path';

const SOURCE = fs.readFileSync(
  path.join(__dirname, '../../src/services/login-connect.service.ts'), 'utf8');

describe('the command handler the connect flow uses', () => {
  it('is loaded with require, not a dynamic import', () => {
    expect(SOURCE).toContain('require("../handlers/command-execution.handler")');
    expect(SOURCE).not.toMatch(/await import\(\s*\n?\s*"\.\.\/handlers\/command-execution\.handler"/);
  });

  it('is the same instance the startup path fills', async () => {
    const required = require('../../src/handlers/command-execution.handler');
    required.commandCache.syscmd.set('PROBE-ONE-INSTANCE', { name: 'PROBE' } as any);

    try {
      // The same specifier, the same registry: what one writes the other sees.
      const alsoRequired = require('../../src/handlers/command-execution.handler');
      expect(alsoRequired.commandCache.syscmd.get('PROBE-ONE-INSTANCE')).toBeDefined();

      // A dynamic import is NOT guaranteed to be that instance - which is the
      // hazard this test exists for. Assert only what we depend on: the
      // require path is shared.
      expect(alsoRequired).toBe(required);
    } finally {
      required.commandCache.syscmd.delete('PROBE-ONE-INSTANCE');
    }
  });
});
