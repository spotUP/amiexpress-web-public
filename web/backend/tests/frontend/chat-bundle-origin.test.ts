/**
 * The chat page loads the door bundle from the server it is talking to.
 *
 * Reported on the LIVE site 2026-08-26:
 *
 *   Failed to load resource: net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin
 *   [ChatTerminal] Failed to load client bundle: Event
 *
 * ...and video could not start, because LiveChat's client half never loaded.
 *
 * The script URL was built from `VITE_BACKEND_URL || 'http://localhost:3001'`.
 * That variable is not set for the production build, so the page served from
 * bbs.uprough.net asked the VIEWER'S OWN machine for the bundle. A viewer
 * running a backend on port 3001 got an answer, which the browser then
 * refused as cross-origin; a viewer without one just got a failure.
 *
 * The socket in the same file already resolved this correctly, so the two
 * disagreed about where the backend is.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const chat = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'web', 'frontend', 'src', 'chat', 'ChatTerminal.tsx'),
  'utf8'
);

describe('the door bundle URL', () => {
  it('is not hardcoded to localhost', () => {
    // The whole bug in one assertion: a production page must never be told
    // the backend is on the viewer's own machine.
    const loader = chat.slice(chat.indexOf("socket.on('door:load-client'"));

    expect(loader).not.toMatch(/VITE_BACKEND_URL \|\| 'http:\/\/localhost:3001'/);
  });

  it('uses the origin the socket connected to', () => {
    const loader = chat.slice(chat.indexOf("socket.on('door:load-client'"));

    expect(loader).toMatch(/\$\{backendUrl\}\$\{data\.bundleUrl\}/);
  });

  it('resolves that origin from the page in production', () => {
    // localhost only when the page itself is served from localhost.
    expect(chat).toMatch(/isDevelopment \? 'http:\/\/localhost:3001' : window\.location\.origin/);
  });

  it('hands doors the same origin', () => {
    // A door that reads __BBS__.backendUrl would otherwise call the wrong
    // host for everything else it does.
    const bbsGlobal = chat.slice(chat.indexOf('(window as any).__BBS__ ='));

    expect(bbsGlobal.slice(0, 300)).toMatch(/backendUrl,/);
    expect(bbsGlobal.slice(0, 300)).not.toContain('localhost:3001');
  });

  it('still honours an absolute URL from the server', () => {
    // The backend may send a fully-qualified bundle URL; that wins.
    expect(chat).toMatch(/data\.bundleUrl\.startsWith\('http'\)/);
  });
});
