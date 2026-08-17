#!/usr/bin/env npx tsx
/**
 * gen-repo-types: mechanically extracts the ManifestDoor / DoorRepoManifest
 * interface declarations verbatim from web/backend's door-repo-manifest.ts
 * (the single source of truth for the door-repo API's manifest shape) and
 * writes them into repo-types.generated.ts, local to this package.
 *
 * Why generate instead of importing the .ts source directly: Doors/door-manager
 * and web/backend are separate TypeScript compilation units (own tsconfig,
 * own rootDir). door-repo-manifest.ts also imports better-sqlite3 and other
 * server-only modules; a raw cross-package `import type` still forces
 * TypeScript to add that whole file (and its transitive graph) to THIS
 * package's program to resolve the types, which trips TS6059 ("File is not
 * under rootDir") the moment rootDir is set (needed to keep dist/ flat and
 * to keep backend server code from being duplicate-compiled into this
 * door's dist output) -- confirmed empirically before writing this script.
 *
 * This script parses the real door-repo-manifest.ts with the TypeScript
 * compiler's own parser and copies the two interfaces' source text
 * byte-for-byte -- NOT retyped by hand, so there is no drift risk from
 * transcription. Whenever door-repo-manifest.ts's manifest shape changes,
 * re-run this script (`npm run gen:repo-types` from Doors/door-manager) to
 * refresh repo-types.generated.ts, exactly like dist/ is rebuilt after a
 * source change.
 *
 * `generateRepoTypesSource()` and `writeGeneratedTypes()` are exported (not
 * just used internally by `main()`) specifically so
 * web/backend/tests/doors/repo-types-generated-staleness.test.ts can call
 * the SAME extraction logic the CLI uses, write it to a temp path, and diff
 * it against the committed repo-types.generated.ts -- catching drift
 * (upstream field added/renamed/removed without regenerating) at test time
 * instead of it silently type-checking against a shape the server no
 * longer sends. `main()` only runs when this file is invoked directly
 * (`require.main === module`), never as a side effect of being imported by
 * that test.
 *
 * Usage: npx tsx scripts/gen-repo-types.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const SOURCE_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'web',
  'backend',
  'src',
  'doors',
  'door-repo-manifest.ts'
);
const OUTPUT_PATH = path.join(__dirname, '..', 'repo-types.generated.ts');
const INTERFACES_TO_EXTRACT = ['ManifestDoor', 'DoorRepoManifest'];

/**
 * Parses the real door-repo-manifest.ts and returns the generated
 * repo-types.generated.ts file content as a string (pure -- no filesystem
 * writes here). Always reads from the real, current SOURCE_PATH: this is
 * intentional, since both the CLI and the staleness test need to compare
 * against the CURRENT upstream shape, not a frozen/fixture copy.
 */
export function generateRepoTypesSource(): string {
  const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
  const sourceFile = ts.createSourceFile(
    SOURCE_PATH,
    sourceText,
    ts.ScriptTarget.ES2020,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  );

  const found = new Map<string, string>();

  sourceFile.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node) && INTERFACES_TO_EXTRACT.includes(node.name.text)) {
      found.set(node.name.text, node.getText(sourceFile));
    }
  });

  const missing = INTERFACES_TO_EXTRACT.filter((name) => !found.has(name));
  if (missing.length > 0) {
    throw new Error(
      `gen-repo-types: could not find interface(s) ${missing.join(', ')} in ${SOURCE_PATH}. ` +
        'door-repo-manifest.ts may have been renamed/restructured -- update INTERFACES_TO_EXTRACT or the source path.'
    );
  }

  const relSourcePath = path.relative(path.join(__dirname, '..'), SOURCE_PATH);
  const body = INTERFACES_TO_EXTRACT.map((name) => found.get(name) as string).join('\n\n');

  return (
    `/**\n` +
    ` * GENERATED FILE -- DO NOT EDIT BY HAND.\n` +
    ` *\n` +
    ` * Extracted verbatim from ${relSourcePath} by scripts/gen-repo-types.ts.\n` +
    ` * Regenerate with: npx tsx scripts/gen-repo-types.ts\n` +
    ` * (run whenever door-repo-manifest.ts's manifest shape changes upstream)\n` +
    ` */\n\n` +
    `${body}\n`
  );
}

/** Writes the generated source to `outputPath` (defaults to the real, committed location). */
export function writeGeneratedTypes(outputPath: string = OUTPUT_PATH): void {
  fs.writeFileSync(outputPath, generateRepoTypesSource(), 'utf8');
}

function main(): void {
  writeGeneratedTypes(OUTPUT_PATH);
  // eslint-disable-next-line no-console
  console.log(`gen-repo-types: wrote ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

if (require.main === module) {
  main();
}
