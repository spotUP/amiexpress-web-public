/**
 * A door's art is the DIRECTORY'S, not a command's.
 *
 * `GET /api/door-art` enumerated `getDoors()` - the registered BBS commands -
 * so a door with no `Commands/BBSCmd` icon could declare art in a valid
 * manifest, have the service list it correctly, and still show NOTHING in the
 * Studio, because the enumeration never reached its directory.
 *
 * QuickNew is exactly that: a logoff batch utility nobody types, whose config
 * holds the templates that ARE the new-files screen. The sysop asked for those
 * templates in the ANSI editor (2026-09-15); without this they would have been
 * shipped and invisible, which is the third time today a thing was "done" and
 * unreachable.
 */

process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import { createDoorArtRouter } from '../../src/api/door-art-routes';

/** No registered commands at all: everything here comes from the directories. */
function anAppWithNoRegisteredDoors() {
  const app = express();
  app.use(express.json());
  app.use('/api/door-art', createDoorArtRouter({ getDoors: () => [] }));
  return app;
}

describe('art belonging to a door nobody types', () => {
  it('lists QuickNew even though it is not a registered command', async () => {
    const res = await request(anAppWithNoRegisteredDoors()).get('/api/door-art');

    expect(res.status).toBe(200);
    const quicknew = (res.body.data ?? []).find((d: any) => d.command === 'QUICKNEW');
    expect(quicknew).toBeDefined();
  });

  it('offers both templates for every configured area', async () => {
    const res = await request(anAppWithNoRegisteredDoors()).get('/api/door-art');
    const quicknew = (res.body.data ?? []).find((d: any) => d.command === 'QUICKNEW');

    // Eleven areas on this board, a heading and a statistics line each.
    expect(quicknew.sections.length).toBeGreaterThanOrEqual(2);
    expect(quicknew.sections.length % 2).toBe(0);
    expect(quicknew.sections[0].section).toMatch(/^block\d+\.(header|stats)$/);
  });

  it('labels each one by the conference it belongs to', async () => {
    // A card saying "block3.header" would tell the sysop nothing about which
    // heading they are editing.
    const res = await request(anAppWithNoRegisteredDoors()).get('/api/door-art');
    const quicknew = (res.body.data ?? []).find((d: any) => d.command === 'QUICKNEW');

    expect(quicknew.sections[0].label).toMatch(/BBS:/i);
    expect(quicknew.sections[0].label).toMatch(/heading|statistics/);
  });

  it('holds each template to a single line', async () => {
    // Two lines would shift the `#` markers and silently re-point every
    // heading after it at the wrong conference.
    const res = await request(anAppWithNoRegisteredDoors()).get('/api/door-art');
    const quicknew = (res.body.data ?? []).find((d: any) => d.command === 'QUICKNEW');

    for (const section of quicknew.sections) expect(section.maxLines).toBe(1);
  });

  it('still lists a door that IS registered, without listing it twice', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/door-art', createDoorArtRouter({
      getDoors: () => [{ command: 'B', name: 'Bulls', path: 'Doors/emp_tools' } as any],
    }));

    const res = await request(app).get('/api/door-art');
    const commands = (res.body.data ?? []).map((d: any) => d.command);

    expect(commands.filter((c: string) => c === 'B')).toHaveLength(1);
    expect(commands).toContain('QUICKNEW');
  });
});

describe('the upload advert of the multi-check file checker', () => {
  // A file checker is run by the upload path, never typed: no Commands/BBSCmd
  // icon. The Studio listed its card, but opening or saving it asked the
  // registered-door list and answered "No door MULTICHECK".
  it('is listed, opens with its text, and a save reaches its manifest limits', async () => {
    const app = anAppWithNoRegisteredDoors();

    const list = await request(app).get('/api/door-art');
    const card = (list.body.data ?? []).find((d: any) => d.command === 'MULTICHECK');
    expect(card).toBeDefined();
    expect(card.sections[0]).toMatchObject({ file: 'uprough.txt', maxLineLength: 79 });

    const opened = await request(app).get('/api/door-art/MULTICHECK');
    expect(opened.status).toBe(200);
    const text = Buffer.from(opened.body.data[0].content, 'base64').toString('latin1');
    expect(text).toContain('bbs.uprough.net');
    expect(text).toContain('@@-@@-@@');

    // A save reaches the door's own directory. Doors/ is the checkout's here
    // (a symlink in the test board) and the live-data guard refuses writes
    // through it, so the save names a slot the manifest does not declare: the
    // service's own refusal is only reachable once the command resolves, and
    // before the fix this was "No door MULTICHECK" (404).
    const refused = await request(app)
      .put('/api/door-art/MULTICHECK')
      .send({ file: 'uprough.txt', section: 'setting:nope', content: '' });
    expect(refused.status).not.toBe(404);
    expect(refused.body.message).toMatch(/No art setting nope/);
  });

  it('still refuses a command that is neither registered nor a door directory', async () => {
    const res = await request(anAppWithNoRegisteredDoors()).get('/api/door-art/NOSUCHDOOR');
    expect(res.status).toBe(404);
  });
});

