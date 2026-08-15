/**
 * Test-only stand-in for src/utils/archive-extractor.ts.
 *
 * DOORMAN's extractArchiveTo() (Doors/door-manager/app.ts) deliberately does
 * NOT import the backend's archive-extractor module directly — it discovers
 * whichever copy is already loaded in the running process via a
 * require.cache scan (getExtractorFactory), so DOORMAN (which runs inside
 * the backend node process) reuses the backend's extractors without a
 * duplicate dependency.
 *
 * That makes it awkward to stub in a unit test: jest.mock() registers a
 * module in Jest's mock registry, which is NOT what Jest's require.cache
 * shim enumerates (confirmed empirically — a jest.mock'd module never shows
 * up in Object.keys(require.cache) from another module's perspective, even
 * though a real require()/import of it does). So instead of mocking the
 * real module, this is a genuinely separate real file — its path contains
 * "archive-extractor" (matching getExtractorFactory's substring scan) and a
 * plain `import` of it populates the real require.cache the normal way.
 */

export interface FakeExtractor {
  getEntries: (filepath: string) => Promise<Array<{ name: string; size: number }>>;
  extractFile: (filepath: string, name: string) => Promise<Buffer | null>;
}

let stub: FakeExtractor | null | 'throw' = null;

export function __setStubExtractor(e: FakeExtractor | null | 'throw'): void {
  stub = e;
}

export async function getExtractorForFile(_filepath: string): Promise<FakeExtractor | null> {
  if (stub === 'throw') throw new Error('boom');
  return stub;
}
