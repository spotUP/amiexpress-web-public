/**
 * xterm keeps exactly ONE custom key handler.
 *
 * `attachCustomKeyEventHandler` assigns, it does not append: the second call
 * replaces the first with no warning and no error. BBSTerminal made two calls
 * for months, so the earlier handler - Shift+Arrow sequences, copy and
 * select-all with mouse reporting off, and the Ctrl+Shift+M block - was dead
 * code that read as live.
 *
 * A source count is the right level for this one: the defect IS a second
 * registration in the source, and the component cannot be mounted here to
 * catch it any other way. What the surviving handler DECIDES is covered by
 * classifyKey.test.ts, against the real function.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const BBS_TERMINAL = resolve(
  here,
  '../../../../../packages/terminal/src/components/BBSTerminal.tsx'
);

describe('BBSTerminal keyboard wiring', () => {
  it('registers the custom key handler exactly once', () => {
    const source = readFileSync(BBS_TERMINAL, 'utf8');
    const registrations = source.match(/attachCustomKeyEventHandler\s*\(/g) ?? [];
    expect(registrations).toHaveLength(1);
  });

  it('routes that handler through classifyKey', () => {
    const source = readFileSync(BBS_TERMINAL, 'utf8');
    expect(source).toContain('classifyKey(ev, {');
  });
});
