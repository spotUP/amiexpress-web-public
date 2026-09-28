/**
 * The board's vendored copy of the door server's describe rules.
 *
 * WHY THERE IS A COPY. The board reads the same FILE_ID.DIZ files the door
 * server does, and a door described one way there and another way here is the
 * same defect as two stores disagreeing about a user - the class this repo has
 * been bitten by most often. The rules are pure text processing with no
 * imports, so they vendor cleanly.
 *
 * TWO TESTS, because a sibling checkout cannot be a CI dependency:
 *
 *  1. THE CORPUS (always runs). Both repos run the same committed cases
 *     against their own copy of the extractor. This is what proves identity
 *     where there is no door-server checkout, and it is what fails when
 *     somebody edits the generated mirror by hand.
 *  2. THE BYTE COMPARISON (runs when the checkout is there, found as the
 *     sibling amiexpress-doorserver directory or DOORSERVER_CONTRACT). The
 *     mirror must equal what the generator would produce from the contract
 *     right now, and the contract versions must agree. Without the checkout
 *     the block is reported SKIPPED, naming the path it looked for.
 *
 * WHAT IDENTITY DOES NOT CLAIM: that a given archive gets the same description
 * in both places. `analyseDoor` is pure in its inputs, but one of those inputs
 * is `groupTags`, derived from the CORPUS - the server's 3301 archives, this
 * board's own file base - and the two corpora differ. Same input, same output;
 * different corpus, legitimately different tags.
 */
import * as fs from 'fs';
import * as path from 'path';

import * as mirrorModule from '../../src/utils/describe.generated';
import { analyseDoor, DESCRIBE_CONTRACT_VERSION } from '../../src/utils/describe.generated';

// The sibling checkout, found relative to this repo rather than one
// developer's home directory; DOORSERVER_CONTRACT overrides it (e.g. in CI).
const SERVER_CONTRACT = process.env.DOORSERVER_CONTRACT
  ?? path.resolve(__dirname, '..', '..', '..', '..', '..', 'amiexpress-doorserver', 'contract', 'describe.ts');
const MIRROR = path.join(__dirname, '..', '..', 'src', 'utils', 'describe.generated.ts');
const FIXTURES = path.join(__dirname, 'describe-fixtures.json');

const serverPresent = fs.existsSync(SERVER_CONTRACT);
const describeIfServer = serverPresent ? describe : describe.skip;

interface FixtureFile {
  contractVersion: string;
  cases: Array<{
    input: Parameters<typeof analyseDoor>[0];
    groupTags: string[];
    expected: Record<string, unknown>;
  }>;
}

const fixtures: FixtureFile = JSON.parse(fs.readFileSync(FIXTURES, 'utf-8'));

describe('the vendored describe mirror', () => {
  it('exists and says it is generated', () => {
    // REASONABLE source read: the generated-file header is a comment,
    // invisible at runtime, and without the door-server checkout it is the
    // only generated marker CI can see. The byte comparison is the real check.
    const mirror = fs.readFileSync(MIRROR, 'utf-8');
    expect(mirror).toContain('GENERATED FILE -- DO NOT EDIT BY HAND');
    expect(mirror).toContain('Mirror of amiexpress-doorserver contract/describe.ts');
  });

  it('exports the API the board needs', () => {
    // Read from the loaded module, not the text: how each is declared is the
    // generator's business, that it is callable is the board's.
    expect(typeof mirrorModule.analyseDoor).toBe('function');
    expect(typeof mirrorModule.buildGroupTags).toBe('function');
    expect(typeof mirrorModule.DESCRIBE_CONTRACT_VERSION).toBe('string');
    expect(mirrorModule.DESCRIBE_CONTRACT_VERSION.length).toBeGreaterThan(0);
  });
});

describe('the shared corpus - the same cases the door server runs', () => {
  it('was generated from the contract version this mirror carries', () => {
    expect(fixtures.contractVersion).toBe(DESCRIBE_CONTRACT_VERSION);
  });

  it.each(fixtures.cases.map((c, i) => [i, c.input.archiveName ?? `case ${i}`, c] as const))(
    'case %i (%s) reads the same facts here as it does there',
    (_i, _name, testCase) => {
      const facts = analyseDoor(testCase.input, new Set(testCase.groupTags));
      expect({ ...facts, description: facts.description ?? '' }).toEqual(testCase.expected);
    },
  );
});

// Absent checkout: reported as SKIPPED with the path looked for, never a
// silent pass.
describeIfServer(serverPresent
  ? 'against the door server checkout'
  : `against the door server checkout (SKIPPED: ${SERVER_CONTRACT} not found; set DOORSERVER_CONTRACT)`, () => {
  it('is byte-identical to what the generator produces today', () => {
    const source = fs.readFileSync(SERVER_CONTRACT, 'utf-8');
    // renderMirror's own shape, kept here rather than imported: importing
    // across the checkout boundary is the dependency this test exists to
    // avoid. If the generator's header changes, this fails loudly and the
    // fix is to regenerate and update both.
    const expected = [
      '/**',
      ' * GENERATED FILE -- DO NOT EDIT BY HAND.',
      ' *',
      ' * Mirror of amiexpress-doorserver contract/describe.ts.',
      ' * Regenerate with: npx tsx scripts/gen-describe-types.ts',
      ' */',
      '',
      source.replace(/^\/\*\*[\s\S]*?\*\/\n/, ''),
    ].join('\n');
    expect(fs.readFileSync(MIRROR, 'utf-8')).toBe(expected);
  });

  it('carries the same contract version the server does', () => {
    const source = fs.readFileSync(SERVER_CONTRACT, 'utf-8');
    const there = source.match(/DESCRIBE_CONTRACT_VERSION\s*=\s*'([^']+)'/)?.[1];
    expect(there).toBe(DESCRIBE_CONTRACT_VERSION);
  });
});
