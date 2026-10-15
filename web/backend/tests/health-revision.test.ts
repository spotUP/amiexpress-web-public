/**
 * Regression: /health endpoint must include a `revision` field that
 * surfaces the git SHA embedded at image build time (via Dockerfile
 * ARG GIT_SHA → /app/.git-sha). Monitoring relies on this to verify
 * "is the deploy actually fresh?" without inspecting docker image
 * mtimes (which can lie when an old container restarts).
 *
 * Driven through the real express app (server/app.ts loads under jest - see
 * tests/deploy/health-reports-callers.test.ts), with the image's
 * /app/.git-sha stood in for by an fs mock that answers that one path and
 * passes every other read through. The
 * reading rules themselves (trim, empty, absent, the dev checkout's HEAD)
 * are driven in tests/server/repo-revision.test.ts and
 * tests/deploy/health-names-the-commit-in-dev.test.ts.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

const IMAGE_SHA = '0123456789abcdef0123456789abcdef01234567';

/** What the image file holds for the current test; null = no such file. */
const mockImage: { sha: string | null; reads: number } = { sha: null, reads: 0 };
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    readFileSync: (file: unknown, ...rest: unknown[]) => {
      if (file === '/app/.git-sha') {
        mockImage.reads++;
        if (mockImage.sha === null) {
          throw Object.assign(new Error(`ENOENT: no such file or directory, open '${file}'`), { code: 'ENOENT' });
        }
        return `${mockImage.sha}\n`;
      }
      return actual.readFileSync(file, ...rest);
    },
  };
});

async function healthRevision(): Promise<string> {
  const request = require('supertest');
  const { app } = require('../src/server/app');
  const response = await request(app).get('/health');
  expect(response.status).toBe(200);
  return response.body.revision;
}

function clearRevisionCache(): void {
  require('../src/server/repo-revision')._clearRepoRevisionCacheForTests();
}

describe('/health revision field (ops: deploy freshness)', () => {
  beforeEach(() => {
    clearRevisionCache();
    mockImage.sha = null;
    mockImage.reads = 0;
  });

  test('reports the SHA the image was built with, read from /app/.git-sha once', async () => {
    mockImage.sha = IMAGE_SHA;

    expect(await healthRevision()).toBe(IMAGE_SHA);
    expect(await healthRevision()).toBe(IMAGE_SHA);

    // Memoized: a health probe every few seconds must not re-read the file.
    expect(mockImage.reads).toBe(1);
  });

  test('names a commit even where there is no image file (a dev checkout)', async () => {
    expect(await healthRevision()).toMatch(/^[0-9a-f]{40}$/);
    expect(mockImage.reads).toBe(1);
  });
});
