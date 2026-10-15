/**
 * The unsubscribe link in a notification email. PUBLIC and token-scoped: the
 * signed token in `?t=` is the only credential, there is no session.
 *
 *   GET  /notify/unsubscribe?t=   a page with one button (a mail scanner or
 *                                 link preview that fetches the link must not
 *                                 unsubscribe anybody, so GET changes nothing)
 *   POST /notify/unsubscribe?t=   does it. Also the RFC 8058 one-click target:
 *                                 a mail client POSTs `List-Unsubscribe=One-Click`
 *                                 to the List-Unsubscribe URL.
 *
 * Mounted bare of auth in server/routes-setup.ts.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { findEvent } from '@amiexpress/bbs-door-sdk/formats/notify';
import { ALL_EVENTS, applyUnsubscribe, verifyUnsubscribeToken } from '../notify/unsubscribe';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plain page, system fonts, black on white: nothing here needs the board's art. */
function page(title: string, lines: string[], form?: { action: string; button: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="robots" content="noindex"><title>${esc(title)}</title></head>` +
    `<body style="font-family:sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#000;background:#fff">` +
    `<h1 style="font-size:1.3rem">${esc(title)}</h1>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}` +
    (form ? `<form method="post" action="${esc(form.action)}"><button type="submit" style="font-size:1rem;padding:.5rem 1rem">${esc(form.button)}</button></form>` : '') +
    `</body></html>`;
}

function what(evt: string): string {
  return evt === ALL_EVENTS ? 'all notifications' : `email for "${findEvent(evt)?.label ?? evt}"`;
}

export function createNotifyRouter(rawDb: () => Database.Database | undefined): Router {
  const router = Router();

  router.get('/unsubscribe', (req: Request, res: Response) => {
    const t = typeof req.query.t === 'string' ? req.query.t : '';
    const claims = verifyUnsubscribeToken(t);
    res.set('Cache-Control', 'no-store');
    if (!claims) return void res.status(400).type('html').send(page('Link not valid', ['This unsubscribe link is not valid.']));
    res.type('html').send(page('Unsubscribe', [`Turn off ${what(claims.evt)}?`],
      { action: `/notify/unsubscribe?t=${encodeURIComponent(t)}`, button: 'Unsubscribe' }));
  });

  router.post('/unsubscribe', (req: Request, res: Response) => {
    const t = typeof req.query.t === 'string' ? req.query.t : '';
    const claims = verifyUnsubscribeToken(t);
    res.set('Cache-Control', 'no-store');
    if (!claims) return void res.status(400).type('html').send(page('Link not valid', ['This unsubscribe link is not valid.']));
    const handle = rawDb();
    if (!handle) return void res.status(503).type('html').send(page('Try again later', ['The board could not save that. Please try again.']));
    applyUnsubscribe(handle, claims);
    res.type('html').send(page('Unsubscribed', [`Done. ${what(claims.evt)} is turned off.`, 'You can change this any time in the Notifications door on the board.']));
  });

  return router;
}
