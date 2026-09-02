/**
 * The frame pipeline reaches the backend through a PACKAGE EXPORT, not a
 * relative path out of web/backend into sdk/. Two map entries carry it and
 * both are load-bearing:
 *
 * - `exports["./petscii/frame"]` is what Node's runtime resolver reads.
 * - `typesVersions["*"]["petscii/frame"]` is what tsc reads, because
 *   web/backend/tsconfig.json sets moduleResolution "node", which IGNORES the
 *   exports map and walks the package directory instead. In the Docker backend
 *   stage only sdk/dist + package.json are copied (no SDK source), so without
 *   the typesVersions line tsc has nothing to walk to and the image build fails
 *   with TS2307 - exactly the failure the SDK-copy comment in the Dockerfile's
 *   backend-builder stage describes for "@amiexpress/bbs-door-sdk/petscii".
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  FrameReconstructor,
  adaptFrame,
  renderDiff,
  looksLikeAsciiArt,
} from '@amiexpress/bbs-door-sdk/petscii/frame';

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../sdk/package.json'), 'utf8'),
);

describe('@amiexpress/bbs-door-sdk/petscii/frame', () => {
  it('is declared in exports with the same shape as ./petscii', () => {
    expect(pkg.exports['./petscii/frame']).toEqual({
      types: './dist/petscii/frame/index.d.ts',
      import: './dist-esm/petscii/frame/index.js',
      require: './dist/petscii/frame/index.js',
      default: './dist/petscii/frame/index.js',
    });
  });

  it('is mirrored in typesVersions (moduleResolution:node walks the directory, not exports)', () => {
    expect(pkg.typesVersions['*']['petscii/frame']).toEqual(['dist/petscii/frame/index.d.ts']);
  });

  it('resolves and carries the whole pipeline', () => {
    for (const f of [FrameReconstructor, adaptFrame, renderDiff, looksLikeAsciiArt]) {
      expect(typeof f).toBe('function');
    }
  });
});
