/**
 * /api/chat-roles - the sysop's proxy to the door server's chat roles.
 *
 * The board key lives in system_config and never leaves the server: the
 * browser calls this router with its admin token, the router opens a short
 * sysop chat session with the key, forwards the call and closes the session.
 * Mounted behind authenticateToken + requireSysop (routes-setup.ts).
 */
import express, { Request, Response, Router } from 'express';
import type { SystemConfig } from '../database/types';
import { ChatApiError, ChatClient, chatTarget } from '../services/chat-federation/chat-client';
import type { ChatRoleInput } from '../services/chat-federation/chat-client';

function handleOf(req: Request): string {
  return String((req as Request & { user?: { username?: string } }).user?.username ?? 'sysop');
}

export function createChatRolesRouter(getConfig: () => SystemConfig | null): Router {
  const router = express.Router();
  router.use(express.json());

  async function run<T>(req: Request, res: Response, work: (c: ChatClient, sid: string) => Promise<T>, okStatus = 200) {
    const target = chatTarget(getConfig());
    if (!target) {
      res.status(503).json({ error: 'chat_not_configured', detail: 'No door server address or board key is set.' });
      return;
    }
    const client = new ChatClient(target);
    let sid: string | null = null;
    try {
      sid = (await client.openSession(handleOf(req), true, 'amiexpress-web-admin')).sid;
      const result = await work(client, sid);
      if (result === undefined) res.status(204).end();
      else res.status(okStatus).json(result);
    } catch (err) {
      if (err instanceof ChatApiError) {
        res.status(err.status).json({ error: err.code, detail: err.detail, retryAfter: err.retryAfter });
      } else {
        res.status(502).json({ error: 'chat_unreachable', detail: 'The door server did not answer.' });
      }
    } finally {
      if (sid) await client.closeSession(sid).catch(() => undefined);
    }
  }

  router.get('/', (req, res) => run(req, res, (c, sid) => c.roles(sid)));
  router.get('/assignments', (req, res) => run(req, res, (c, sid) => c.roleAssignments(sid)));
  router.post('/', (req, res) => run(req, res, (c, sid) => c.createRole(sid, req.body as ChatRoleInput), 201));
  router.put('/assignments/:handle', (req, res) =>
    run(req, res, (c, sid) =>
      c.setRoleAssignments(sid, req.params.handle, (req.body as { roleIds?: string[] }).roleIds ?? []),
    ),
  );
  router.put('/:id', (req, res) => run(req, res, (c, sid) => c.updateRole(sid, req.params.id, req.body as ChatRoleInput)));
  router.delete('/:id', (req, res) => run(req, res, (c, sid) => c.deleteRole(sid, req.params.id)));
  return router;
}
