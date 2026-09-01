/**
 * What the Activity feed is told a user is doing.
 *
 * The feed knew six things - logged on, logged off, upload, download, a door
 * opened, a door's own event - and nothing about the rest of a session. Every
 * command a logged-on user runs passes through `processCommand`, which
 * reported none of them, so the admin could see that someone was on and not
 * what they were doing.
 *
 * The vocabulary is written down TWICE: `BBSEventType` in the backend's
 * emitter and again in the admin's `types/realtime.ts`, because the union has
 * to exist on both sides of a socket. Nothing kept them in step - a type added
 * to one would simply never be rendered by the other, silently. That is the
 * two-store shape this codebase keeps getting caught by, so it is pinned here.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as path from 'path';

import { bbsEventEmitter, emitCommand } from '../../src/services/bbs-event-emitter';

const ROOT = path.join(__dirname, '..', '..', '..', '..');

function eventTypesIn(source: string): string[] {
  const union = source.slice(
    source.indexOf('BBSEventType ='),
    source.indexOf(';', source.indexOf('BBSEventType =')),
  );
  return [...union.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort();
}

describe('the event vocabulary', () => {
  it('is the same on both sides of the socket', () => {
    const backend = eventTypesIn(
      fs.readFileSync(
        path.join(ROOT, 'web/backend/src/services/bbs-event-emitter.ts'),
        'utf8',
      ),
    );
    const admin = eventTypesIn(
      fs.readFileSync(
        path.join(ROOT, 'web/config-app/src/types/realtime.ts'),
        'utf8',
      ),
    );

    expect(backend.length).toBeGreaterThan(6);
    expect(admin).toEqual(backend);
  });

  it('carries the command a user ran', () => {
    expect(eventTypesIn(
      fs.readFileSync(
        path.join(ROOT, 'web/backend/src/services/bbs-event-emitter.ts'),
        'utf8',
      ),
    )).toContain('command');
  });
});

describe('a command event', () => {
  it('reaches listeners with the command and the conference', () => {
    const heard: unknown[] = [];
    bbsEventEmitter.on('bbs:event', (payload: unknown) => heard.push(payload));

    emitCommand({
      username: 'Phantasm',
      nodeId: 4,
      command: 'R',
      conferenceId: 2,
      timestamp: 1_700_000_000_000,
    });

    expect(heard).toContainEqual(
      expect.objectContaining({
        type: 'command',
        username: 'Phantasm',
        nodeId: 4,
        data: { command: 'R', conferenceId: 2 },
      }),
    );
  });
});

describe('the command emit site', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'web/backend/src/handlers/command.handler.ts'),
    'utf8',
  );

  // processCommand is the one funnel every logged-on command passes through.
  // A feed fed from anywhere else would miss whatever routes around it.
  it('is the funnel every command passes through', () => {
    const funnel = source.slice(source.indexOf('export async function processCommand'));
    expect(funnel.slice(0, 2000)).toContain('emitCommand(');
  });

  // A command line can carry a password - the login prompt, AUTOVAL_PASSWORD,
  // a sysop changing one - and this is broadcast to every admin socket.
  it('never puts the parameters on the wire', () => {
    const call = source.slice(source.indexOf('emitCommand({'), source.indexOf('emitCommand({') + 400);

    expect(call).toContain('command: String(command');
    expect(call).not.toContain('params');
  });

  // The feed is a nicety; the command is the user's session.
  it('cannot stop a command running', () => {
    const call = source.slice(source.indexOf('emitCommand('), source.indexOf('emitCommand(') + 600);
    expect(call).toContain('catch');
  });
});
