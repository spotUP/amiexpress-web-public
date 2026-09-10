/**
 * "i still cant kick users from nodes in the admin ui:
 *  POST https://bbs.uprough.net/api/nodes/1/kick 404 (Not Found)"
 *
 * Two sources of truth for one question - which socket is this node on.
 *
 * `setSession` wrote `socketToNodeId` on every connect and left
 * `session.socketId` alone, and the two are read by different callers: the
 * route's guard asked the map (`getSocketIdByNodeId`) and the emitter registry
 * asked the session. A web caller who had reconnected passed the guard and
 * then had no emitter - a 404 with the board saying the node was there.
 *
 * The guard also DEMANDED a socket.io socket id, which telnet and SSH callers
 * never have, so every byte-transport node was unkickable by construction -
 * the same map the kick handler's own comment says it stopped using.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/operator-chat.handler', () => ({ initiateSysopChat: jest.fn() }));
jest.mock('../../src/database', () => ({ db: { getOperatorChatRepository: jest.fn().mockReturnValue({}) } }));

import express from 'express';
import request from 'supertest';

import { createNodeControlRouter } from '../../src/api/node-control-routes';
import { sessions, setSession, socketToNodeId, userSessions, socketToUser } from '../../src/server/session-manager';
import { registerConnectionEmitter } from '../../src/server/session-emitter-registry';

function app(io: unknown) {
  const a = express();
  a.use(express.json());
  a.use('/api/nodes', createNodeControlRouter(io as never));
  return a;
}

/** An io namespace holding one live socket. */
const ioWith = (socketId: string, socket: unknown) => ({
  to: () => ({ emit: () => {} }),
  emit: () => {},
  sockets: { sockets: new Map([[socketId, socket]]) },
});

beforeEach(() => {
  sessions.clear();
  socketToNodeId.clear();
  userSessions.clear();
  socketToUser.clear();
});

test('a web caller is kicked even though the session was registered under an older socket', async () => {
  const session: any = {
    user: { id: 'u1', username: 'spot' }, nodeId: 1, connectionType: 'web',
    // What the session was created with, and what the registry used to read.
    socketId: 'the-socket-that-went-away',
  };
  const emitted: string[] = [];
  const socket = { emit: (event: string) => emitted.push(event), disconnect: () => emitted.push('disconnect') };

  // The caller reconnects: the board learns the new socket here.
  setSession('the-socket-they-are-on-now', session);

  const res = await request(app(ioWith('the-socket-they-are-on-now', socket)))
    .post('/api/nodes/1/kick').send({ reason: 'testing' });

  expect(res.status).toBe(200);
  expect(emitted).toContain('system-message');
  expect(emitted).toContain('disconnect');
});

test('a telnet caller is kicked too - they never had a socket.io socket at all', async () => {
  const session: any = { user: { id: 'u2', username: 'caller' }, nodeId: 2, connectionType: 'telnet' };
  const emitted: string[] = [];
  registerConnectionEmitter(session, {
    emit: (event: string) => emitted.push(event),
    disconnect: () => emitted.push('disconnect'),
  } as never);
  sessions.set('2', session);

  const res = await request(app(ioWith('somebody-else', {}))).post('/api/nodes/2/kick').send({});

  // Red before: the guard demanded a socket id from a map of web sockets.
  expect(res.status).toBe(200);
  expect(emitted).toContain('disconnect');
});

test('a web caller whose socket id went stale is still reached', async () => {
  // The session says one socket; the namespace holds another carrying the same
  // session. Live symptom: "Node 1 has no active connection" about a caller
  // the board's own node list showed online.
  const session: any = {
    user: { id: 'u3', username: 'spot' }, nodeId: 3, connectionType: 'web',
    socketId: 'a-socket-that-is-gone',
  };
  const emitted: string[] = [];
  const socket: any = {
    id: 'the-one-he-is-really-on',
    session,
    emit: (event: string) => emitted.push(event),
    disconnect: () => emitted.push('disconnect'),
  };
  sessions.set('3', session);

  const res = await request(app(ioWith('the-one-he-is-really-on', socket)))
    .post('/api/nodes/3/kick').send({});

  expect(res.status).toBe(200);
  expect(emitted).toContain('disconnect');
  // And the session now points at the socket it was found on.
  expect(session.socketId).toBe('the-one-he-is-really-on');
});

test('a ghost is cleared, not refused: session rows but no live transport', async () => {
  // The admin UI kicked ghosts into a 404 ("has no active connection")
  // and every store kept them, so the next login was refused against
  // its own stale record (2026-09-10). Kicking a node with rows but no
  // emitter now clears the presence synchronously and says so.
  const session: any = {
    user: { id: 'u4', username: 'ghost' }, nodeId: 4, connectionType: 'web',
    socketId: 'long-gone',
  };
  sessions.set('4', session);
  userSessions.set('u4', session);
  socketToUser.set('long-gone', 'u4');
  socketToNodeId.set('long-gone', 4);

  const res = await request(app(ioWith('somebody-else', { id: 'somebody-else' })))
    .post('/api/nodes/4/kick').send({});

  expect(res.status).toBe(200);
  expect(String(res.body.message)).toContain('no live connection');
  expect(session.sysopKicked).toBe(true);
  expect(userSessions.has('u4')).toBe(false);
  expect(socketToUser.has('long-gone')).toBe(false);
  expect(socketToNodeId.has('long-gone')).toBe(false);
  // THE liveness entry the login refusal trusts: leaving it made the ghost
  // permanent - every fresh login refused, "i never get reloggedin".
  expect(sessions.has('4')).toBe(false);
});

test('a kicked caller reads offline everywhere, so the next login is admitted', async () => {
  const session: any = {
    user: { id: 'u5', username: 'backsoon' }, nodeId: 5, connectionType: 'web',
    socketId: 'kicked-socket',
  };
  const emitted: string[] = [];
  const socket = { emit: (event: string) => emitted.push(event), disconnect: () => emitted.push('disconnect') };
  setSession('kicked-socket', session);
  userSessions.set('u5', session);

  const res = await request(app(ioWith('kicked-socket', socket)))
    .post('/api/nodes/5/kick').send({});

  expect(res.status).toBe(200);
  expect(emitted).toContain('disconnect');
  expect(sessions.has('5')).toBe(false);
  expect(userSessions.has('u5')).toBe(false);
});

test('a node nobody is on is still a 404', async () => {
  const res = await request(app(ioWith('x', {}))).post('/api/nodes/9/kick').send({});

  expect(res.status).toBe(404);
  expect(String(res.body.message)).toMatch(/not found or offline/i);
});
