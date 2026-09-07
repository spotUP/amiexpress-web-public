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

/**
 * The first statement of `source`, skipping the blank lines and the comments
 * that may precede it. A statement ends at the first line carrying a `;`, so
 * a call broken over several lines is still read whole.
 */
function firstStatementIn(source: string): string {
  const statement: string[] = [];
  let inBlockComment = false;

  for (const raw of source.split('\n')) {
    const line = raw.trim();

    if (statement.length === 0) {
      if (inBlockComment) {
        if (line.includes('*/')) inBlockComment = false;
        continue;
      }
      if (line === '' || line.startsWith('//')) continue;
      if (line.startsWith('/*')) {
        if (!line.includes('*/')) inBlockComment = true;
        continue;
      }
    }

    statement.push(line);
    if (line.includes(';')) break;
  }

  return statement.join(' ');
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
    expect(funnel.slice(0, 2500)).toContain('emitCommand(');
  });

  // A command that names a DOOR is reported by the door's own entered/exited
  // event. Emitting here as well put every door in the feed twice - "Ran
  // FROGGER in Amiga Warez!" beside "Started a game of FROGGER" - which the
  // sysop saw on the live board and called wrong.
  //
  // So the report happens on the paths that handle the command HERE, never
  // unconditionally at the top of the funnel.
  it('reports only the commands it runs itself, not doors', () => {
    const funnel = source.slice(source.indexOf('export async function processCommand'));

    // Every report is immediately followed by an internal dispatch - which is
    // exactly "only what this handler runs itself". The J-with-a-number case
    // reports too, and correctly: it deliberately bypasses the door path and
    // calls the internal handler directly.
    //
    // Adjacency is read as "the next STATEMENT", not as a spelling: a comment
    // may sit between the two, and the dispatch may be assigned (the refusal
    // path needs its result). What must not be tolerated is a dispatch that
    // merely happens LATER - that would let a report be followed by anything
    // at all and stop proving the property - so only the first statement
    // after the report is examined.
    const reports = funnel.split('reportCommand();').slice(1);
    const nextStatements = reports.map(firstStatementIn);

    expect(nextStatements.length).toBeGreaterThan(0);
    for (const statement of nextStatements) {
      expect(statement).toContain('processBBSCommand(');
    }
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
