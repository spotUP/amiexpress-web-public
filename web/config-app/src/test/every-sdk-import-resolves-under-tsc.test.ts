/**
 * Every SDK module the admin imports, tsc can find.
 *
 * vite.config.ts aliases `@amiexpress/bbs-door-sdk/*` subpaths to the SDK
 * SOURCE, and tsconfig.json `paths` has to say the same, because the SDK's
 * dist is gitignored and config-app does not depend on the SDK package at
 * all. The PETSCII alias existed only in vite: the admin bundled and ran,
 * while `tsc` on a fresh clone failed eleven times with "Cannot find module
 * '@amiexpress/bbs-door-sdk/petscii'".
 *
 * This asks the TypeScript resolver itself, with the project's own compiler
 * options, about every SDK specifier found in src/.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const appRoot = path.resolve(__dirname, '../..');
const srcRoot = path.join(appRoot, 'src');

function compilerOptions(): ts.CompilerOptions {
  const file = path.join(appRoot, 'tsconfig.json');
  const { config } = ts.readConfigFile(file, ts.sys.readFile);
  return ts.parseJsonConfigFileContent(config, ts.sys, appRoot).options;
}

function sdkImports(): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        for (const match of text.matchAll(/from\s+'(@amiexpress\/bbs-door-sdk\/[^']+)'/g)) {
          if (!found.has(match[1])) found.set(match[1], full);
        }
      }
    }
  };
  walk(srcRoot);
  return found;
}

describe('SDK imports', () => {
  it('every @amiexpress/bbs-door-sdk import resolves under tsconfig', () => {
    const options = compilerOptions();
    const imports = sdkImports();
    expect(imports.size).toBeGreaterThan(0);
    const unresolved = [...imports].filter(
      ([specifier, from]) => !ts.resolveModuleName(specifier, from, options, ts.sys).resolvedModule,
    ).map(([specifier]) => specifier);
    expect(unresolved).toEqual([]);
  });
});
