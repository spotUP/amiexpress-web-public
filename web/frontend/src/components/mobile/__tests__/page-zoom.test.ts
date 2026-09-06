import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { PAGE_ZOOM_EVENTS, refusePageZoom } from '../page-zoom';

describe('the page refuses to zoom', () => {
  it('cancels every Safari gesture event, which is how iOS zooms', () => {
    const stop = refusePageZoom(document);
    try {
      for (const name of PAGE_ZOOM_EVENTS) {
        const event = new Event(name, { bubbles: true, cancelable: true });
        document.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      }
    } finally {
      stop();
    }
  });

  it('stops refusing once torn down, so a desktop page keeps its own gestures', () => {
    refusePageZoom(document)();
    const event = new Event('gesturestart', { bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('pins the viewport meta that stops the other engines zooming', () => {
    const html = readFileSync(join(__dirname, '../../../../index.html'), 'utf8');
    const viewport = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1] ?? '';
    expect(viewport).toContain('maximum-scale=1.0');
    expect(viewport).toContain('user-scalable=no');
  });
});
