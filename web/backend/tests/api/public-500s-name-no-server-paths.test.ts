/**
 * A route that takes no login answers a failure without the server's paths.
 *
 * The door API's 500s (doors/door-api-routes.ts) returned the error's own
 * text as `message`, and the bundler's text is "Door file not found:
 * /app/Doors/<door>/<entry>" - the board's absolute install path, to any
 * visitor who asked for a door whose client entry is missing. The chat API's
 * error wrapper (api/chat-routes.ts) did the same for anything its login
 * threw. The detail belongs in the log.
 *
 * Driven through the routers as the app mounts them (`app.use('/api',
 * doorApiRouter)`, `app.use('/api/chat', createChatRouter(db))`).
 */
jest.mock('../../src/handlers/door.handler', () => ({ getDoors: () => [] }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import { doorApiRouter } from '../../src/doors/door-api-routes';
import { createChatRouter } from '../../src/api/chat-routes';

describe('a public route that fails', () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'public-500-'));
    const door = path.join(root, 'Doors', 'brokendoor');
    fs.mkdirSync(door, { recursive: true });
    // A client door whose entry is not there: the bundler throws, naming it.
    fs.writeFileSync(path.join(door, 'package.json'),
      JSON.stringify({ name: 'brokendoor', runtime: 'client', entry: 'missing.ts' }));
    process.env.BBS_ROOT = root;
  });

  afterAll(() => {
    delete process.env.BBS_ROOT;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("does not send the door's absolute path with the bundle's 500", async () => {
    const app = express();
    app.use('/api', doorApiRouter);

    const res = await request(app).get('/api/doors/brokendoor/bundle.js');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to bundle door');
    expect(res.text).not.toContain(root);
    expect(res.text).not.toContain('missing.ts');
  });

  it("does not send an unexpected failure's text from the chat login, and still says why it refuses", async () => {
    const database = {
      authenticateUser: async (name: string) => {
        if (name === 'boom') throw new Error(`ENOENT: no such file or directory, open '${root}/user.data'`);
        return null;
      },
    };
    const app = express();
    app.use(express.json());
    app.use('/api/chat', createChatRouter(database as never));

    const failed = await request(app).post('/api/chat/login').send({ username: 'boom', password: 'x' });
    expect(failed.status).toBe(500);
    expect(failed.text).not.toContain(root);

    const refused = await request(app).post('/api/chat/login').send({ username: 'nobody', password: 'x' });
    expect(refused.status).toBe(401);
    expect(refused.body.message).toBe('Invalid username or password');
  });
});
