/**
 * Regression test for C-Z: Z (Zippy text search) uses the canonical handler.
 *
 * express.e:26123-26213 internalCommandZ requires three things:
 *   1. getDirSpan interactive prompt when the dir param is missing
 *      (express.e:26162-26168 — calls getDirSpan(parsedParams.item(1))
 *      or getDirSpan('') and the latter prompts the user).
 *   2. Per-directory "Scanning directory N" header before each DIR scan
 *      (express.e:26185, 26191).
 *   3. Context-buffered output: zippy() function in express.e:27529-27625
 *      buffers each multi-line file-description block and emits the WHOLE
 *      block when ANY line in it matches the search string
 *      (express.e:27574-27586 IF found THEN aePuts(currentEntry)).
 *
 * The canonical impl is content/zippy-search.handler.ts:ZippySearchHandler.
 * The legacy export in commands/utility-commands.handler.ts used to do a
 * flat DB query and skip all three properties. It is now a forwarder.
 *
 * Pinning:
 *   - canonical handler emits getDirSpan prompt when no dir param given
 *   - canonical handler emits "Scanning directory N" per DIR
 *   - canonical handler accumulates a multi-line entry buffer (currentEntry)
 *     and emits-on-match (context-buffered output)
 *   - dispatcher require paths point at content/zippy-search.handler
 *     (a typo in any of these would silently break Z command at runtime)
 *   - legacy export forwards to the canonical handler
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Z command uses canonical ZippySearchHandler (C-Z, express.e:26123-26213)', () => {
  const root = path.join(__dirname, '..');
  const canonical = fs.readFileSync(
    path.join(root, 'src', 'handlers', 'content', 'zippy-search.handler.ts'),
    'utf8'
  );

  test('canonical handler shows getDirSpan prompt when no dir param given', () => {
    expect(canonical).toMatch(/getDirSpanPrompt/);
    // _promptDirSpan must transition to ZIPPY_DIR_SPAN_INPUT so the user input lands in handleDirSpanInput
    expect(canonical).toMatch(
      /subState\s*=\s*LoggedOnSubState\.ZIPPY_DIR_SPAN_INPUT/
    );
  });

  test('canonical handler emits "Scanning directory N" per DIR (express.e:26185, 26191)', () => {
    expect(canonical).toMatch(/Scanning directory \$\{dirNum\}|Scanning directory \$\{[^}]+\}/);
    // HOLD path also has its own header (express.e:26198)
    expect(canonical).toMatch(/Scanning directory HOLD/);
  });

  test('canonical handler accumulates multi-line entry buffer and emits-on-match (context-buffered output)', () => {
    // express.e:27574-27586 buffers each file-description block and emits
    // the whole block once any line matches.
    expect(canonical).toMatch(/currentEntry/);
    expect(canonical).toMatch(/isNewFileEntry/);
    expect(canonical).toMatch(/found\s*&&\s*currentEntry\.length\s*>\s*0|currentEntry\.length\s*>\s*0\s*&&\s*found/);
  });

  test('all dispatchers require the canonical handler under content/zippy-search.handler', () => {
    const cmdHandler = fs.readFileSync(
      path.join(root, 'src', 'handlers', 'command.handler.ts'),
      'utf8'
    );
    const cmdExec = fs.readFileSync(
      path.join(root, 'src', 'handlers', 'command-handler', 'command-execution.ts'),
      'utf8'
    );
    const internalCmds = fs.readFileSync(
      path.join(root, 'src', 'handlers', 'command-handler', 'internal-commands.ts'),
      'utf8'
    );

    // command.handler.ts is in src/handlers/, so require './content/zippy-search.handler'
    expect(cmdHandler).toMatch(/require\(\s*['"]\.\/content\/zippy-search\.handler['"]\s*\)/);
    expect(cmdHandler).not.toMatch(/require\(\s*['"]\.\/zippy-search\.handler['"]\s*\)/);

    // command-execution.ts is in src/handlers/command-handler/, so require '../content/zippy-search.handler'
    expect(cmdExec).toMatch(/require\(\s*['"]\.\.\/content\/zippy-search\.handler['"]\s*\)/);
    expect(cmdExec).not.toMatch(/require\(\s*['"]\.\.\/zippy-search\.handler['"]\s*\)/);

    expect(internalCmds).toMatch(/require\(\s*['"]\.\.\/content\/zippy-search\.handler['"]\s*\)/);
    expect(internalCmds).not.toMatch(/require\(\s*['"]\.\.\/zippy-search\.handler['"]\s*\)/);
  });

  test('legacy utility-commands handleZippySearchCommand forwards to canonical handler', () => {
    const legacy = fs.readFileSync(
      path.join(root, 'src', 'handlers', 'commands', 'utility-commands.handler.ts'),
      'utf8'
    );
    expect(legacy).toMatch(
      /handleZippySearchCommand[\s\S]{0,300}?import\(\s*['"]\.\.\/content\/zippy-search\.handler['"]\s*\)[\s\S]{0,200}?ZippySearchHandler\.handleZippySearchCommand/
    );
    // The flat _searchFileDescriptions DB query must not be present.
    expect(legacy).not.toMatch(/_searchFileDescriptions\s*\(/);
  });
});
