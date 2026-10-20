/**
 * MAG VIDEO: the live converter streams a clip's URL straight into ffmpeg.
 * Regression: a 100 MB clip (Content-Length above the old 50 MB download cap)
 * came back 'oversize' and the viewer showed only the poster.
 */
import axios from 'axios';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import type { ChildProcess } from 'child_process';
import { createVideoService, defaultPrepare } from '../../src/services/magazine/video-service';
import { fetchHttp, robotsByProcess, ROBOTS_TTL_MS } from '../../src/services/magazine/body-prefetch';

jest.mock('axios');
jest.mock('../../src/services/news-bulletins', () => ({ passHostGate: jest.fn(async () => {}) }));
jest.mock('../../src/services/magazine/body-prefetch', () => ({
  ...jest.requireActual('../../src/services/magazine/body-prefetch'),
  fetchHttp: jest.fn(async () => ({ status: 200, body: 'User-agent: *\nDisallow:\n', contentType: 'text/plain' })),
}));

const get = axios.get as unknown as jest.Mock;
const URL_ = 'https://media.example.org/big-clip.mp4';
const tools = { ffmpeg: '/bin/ffmpeg', ytDlp: null, ffprobe: null };

describe('a video clip is streamed to ffmpeg, never downloaded', () => {
  it('prepare returns the URL itself even when the server reports 100 MB', async () => {
    get.mockResolvedValue({ status: 200, headers: { 'content-length': String(100 * 1024 * 1024) }, data: new PassThrough() });
    const r = await defaultPrepare({ url: URL_, kind: 'video' } as never, tools);
    expect(r).toMatchObject({ input: URL_ });
    expect(get).not.toHaveBeenCalled();
  });

  it('the service hands ffmpeg the URL with the board user agent', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'magvid-'));
    const calls: string[][] = [];
    const svc = createVideoService({
      dir, tools: () => tools,
      spawn: (_c: string, args: string[]) => {
        calls.push(args);
        const k = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true });
        setImmediate(() => { k.stdout.end(); k.emit('close', 0); });
        return k as unknown as ChildProcess;
      },
    });
    await svc.requestClip({ url: URL_, kind: 'video', cols: 40, rows: 20, palette: 'amiga16' } as never).done;
    fs.rmSync(dir, { recursive: true, force: true });
    expect(calls).toHaveLength(1);
    expect(calls[0][calls[0].indexOf('-i') + 1]).toBe(URL_);
    expect(calls[0]).toContain('-user_agent');
    expect(calls[0].indexOf('-user_agent')).toBeLessThan(calls[0].indexOf('-i'));
  });
});

describe('the first V on a page starts without a second robots.txt round', () => {
  it('prepare reuses the robots verdict ingest already holds for the clip host', async () => {
    // Regression: the converter kept its own empty robots cache, refetched robots.txt for a
    // host ingest had just checked, and that fetch armed the 5 s host gate before ffmpeg ran.
    const host = 'clips.example.net';
    robotsByProcess.set(host, { kind: 'rules', rules: { allow: [], disallow: [] }, until: Date.now() + ROBOTS_TTL_MS });
    (fetchHttp as jest.Mock).mockClear();
    const r = await defaultPrepare({ url: `https://${host}/a.mp4`, kind: 'video' } as never, tools);
    expect(r).toMatchObject({ input: `https://${host}/a.mp4` });
    expect(fetchHttp).not.toHaveBeenCalled();
  });
});
