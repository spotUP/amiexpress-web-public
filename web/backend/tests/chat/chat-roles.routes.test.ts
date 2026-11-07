import express from 'express';
import request from 'supertest';
import { createChatRolesRouter } from '../../src/server/chat-roles.routes';
import { requireSysop } from '../../src/middleware/auth.middleware';
import { startChatStub, ChatStub } from '../helpers/chat-stub-server';

describe('/api/chat-roles proxy', () => {
  let stub: ChatStub;
  beforeAll(async () => { stub = await startChatStub(); });
  afterAll(async () => { await stub.close(); });

  function app(secLevel: number) {
    const a = express();
    a.use((req, _res, next) => { (req as never as { user: unknown }).user = { username: 'sysop', secLevel, accessLevel: secLevel }; next(); });
    a.use('/api/chat-roles', requireSysop(), createChatRolesRouter(() => ({ achievements_board_key: 'TEST.secret', achievements_server_url: stub.url } as never)));
    return a;
  }

  it('refuses a non-sysop and never calls the door server', async () => {
    const before = stub.calls.length;
    const res = await request(app(10)).get('/api/chat-roles');
    expect(res.status).toBe(403);
    expect(stub.calls.length).toBe(before);
  });

  it('sysop lists roles through a short session; the key never reaches the browser', async () => {
    const res = await request(app(255)).get('/api/chat-roles');
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('Crew');
    expect(JSON.stringify(res.body) + JSON.stringify(res.headers)).not.toContain('secret');
    expect(stub.calls.find((c) => c.path === '/roles')?.auth).toBe('Board TEST.secret');
    await new Promise((r) => setTimeout(r, 100));
    expect(stub.count('DELETE', '/sessions/current')).toBeGreaterThanOrEqual(1);
  });
});
