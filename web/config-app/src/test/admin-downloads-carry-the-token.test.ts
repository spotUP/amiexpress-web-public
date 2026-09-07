/**
 * EVERY ADMIN DOWNLOAD CARRIES THE TOKEN.
 *
 * Reported by the sysop: clicking Download on a screen answered
 * `{"error":"Access token required"}`. The cause is structural, not a
 * missing key - the button was an `<a href="/api/screens/file?...">`, and
 * an anchor cannot carry an Authorization header. Three links had the same
 * shape (the editor's Download, the open file's Download, and Export every
 * screen), which is why this file sweeps the SOURCE for the pattern class
 * rather than pinning the three call sites: the next link written as a
 * link fails here.
 *
 * The API client is the only way to download from this API. It fetches with
 * the header, hands the browser a blob, and now prefers the filename the
 * server offers in `Content-Disposition` - the screen export names its own
 * archive with the scope and a timestamp, and forcing a client-side name
 * threw that away.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { apiClient } from '../api/client';

const SRC = path.join(__dirname, '..');

/** Every .ts/.tsx file in the admin app, tests excluded. */
function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'test' || e.name === 'node_modules') continue;
        walk(p);
        continue;
      }
      if (/\.tsx?$/.test(e.name)) out.push(p);
    }
  };
  walk(SRC);
  return out;
}

/** The file's code with comment lines dropped - a comment about the bug is not the bug. */
function code(file: string): string {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

describe('the admin never links straight at the API', () => {
  it('has no <a href> pointing at /api/', () => {
    const offenders = sources()
      .filter((file) => /href=\{?["'`]?\/api\//.test(code(file)) || /href=\{`\/api\//.test(code(file)))
      .map((file) => path.relative(SRC, file));

    expect(offenders).toEqual([]);
  });
});

const blobResponse = (headers: Record<string, string>) =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers(headers),
    blob: async () => new Blob(['bytes']),
    json: async () => ({}),
    text: async () => 'bytes',
  } as unknown as Response);

describe('apiClient.downloadFile', () => {
  let clicked: { href: string; download: string } | null = null;

  beforeEach(() => {
    localStorage.clear();
    apiClient.setToken('an-access-token');
    clicked = null;
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: () => 'blob:fake',
      revokeObjectURL: () => undefined,
    }));
    // The anchor the client builds is what names the saved file.
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLAnchorElement;
      if (tag === 'a') el.click = () => { clicked = { href: el.href, download: el.download }; };
      return el;
    });
  });

  it('sends the Authorization header - the whole reason a link could not do this', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
      blobResponse({ 'content-type': 'application/zip' }));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.downloadFile('/api/screens/export?scope=all', 'screens.zip');

    const init = fetchMock.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string> | undefined)?.Authorization)
      .toBe('Bearer an-access-token');
  });

  it("saves under the server's own filename when it offers one", async () => {
    vi.stubGlobal('fetch', vi.fn(() => blobResponse({
      'content-disposition': 'attachment; filename="screens-all-20260907.zip"',
    })));

    await apiClient.downloadFile('/api/screens/export?scope=all', 'screens.zip');

    expect(clicked?.download).toBe('screens-all-20260907.zip');
  });

  it('falls back to the name the caller chose when the server offers none', async () => {
    vi.stubGlobal('fetch', vi.fn(() => blobResponse({ 'content-type': 'text/plain' })));

    await apiClient.downloadFile('/api/screens/file?path=Screens%2FMENU.TXT&download=1', 'MENU.TXT');

    expect(clicked?.download).toBe('MENU.TXT');
  });

  it('refuses a filename with a path in it', async () => {
    vi.stubGlobal('fetch', vi.fn(() => blobResponse({
      'content-disposition': 'attachment; filename="../../etc/passwd"',
    })));

    await apiClient.downloadFile('/api/screens/file?path=x&download=1', 'MENU.TXT');

    expect(clicked?.download).toBe('MENU.TXT');
  });

  it('throws what the API said when the download is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      json: async () => ({ error: 'Access token required' }),
    } as unknown as Response)));

    await expect(
      apiClient.downloadFile('/api/screens/file?path=x&download=1', 'MENU.TXT'),
    ).rejects.toThrow(/Access token required/);
  });
});
