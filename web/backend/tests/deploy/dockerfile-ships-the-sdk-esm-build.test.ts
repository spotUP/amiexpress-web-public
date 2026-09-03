/**
 * The image ships BOTH SDK builds.
 *
 * sdk/package.json's exports map answers an `import` with dist-esm/ and a
 * `require` with dist/. An esbuild/ESM door with the SDK external (BUGS) takes
 * the import branch at runtime, so an image that copies only dist/ kills it:
 *
 *   Error executing door: Cannot find module
 *   '.../node_modules/@amiexpress/bbs-door-sdk/dist-esm/engines/ui/theme/index.js'
 *
 * That is what live showed on 2026-09-03. This pins that every stage copying
 * the CJS build out of the sdk-builder also copies the ESM build.
 */

import * as fs from 'fs';
import * as path from 'path';

const DOCKERFILE = path.resolve(__dirname, '../../../../Dockerfile');

describe('the Docker image ships the SDK ESM build beside the CJS build', () => {
  const lines = fs.readFileSync(DOCKERFILE, 'utf-8').split(/\r?\n/);
  const distCopies = lines.filter((l) => /^COPY --from=sdk-builder \/app\/sdk\/dist\s/.test(l));
  const esmCopies = lines.filter((l) => /^COPY --from=sdk-builder \/app\/sdk\/dist-esm\s/.test(l));

  it('copies the CJS build somewhere at all', () => {
    expect(distCopies.length).toBeGreaterThan(0);
  });

  it('copies dist-esm into every stage that copies dist', () => {
    const distTargets = distCopies.map((l) => l.split(/\s+/)[3].replace(/\/dist$/, ''));
    const esmTargets = esmCopies.map((l) => l.split(/\s+/)[3].replace(/\/dist-esm$/, ''));
    expect(esmTargets.sort()).toEqual(distTargets.sort());
  });
});
