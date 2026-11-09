/**
 * An in-process stand-in for the door server's /chat/v1 service: a real http
 * server on an ephemeral port that counts every call, so a test proves the
 * board's code reached the wire (call-count sentinel) without the live server.
 */
import * as http from 'http';
import type { AddressInfo } from 'net';

export interface StubCall {
  method: string;
  path: string;
  auth: string;
  sid: string;
  body: string;
}

export interface ChatStub {
  url: string;
  calls: StubCall[];
  count(method: string, pathPrefix: string): number;
  /** Queue an EVENTS row for the next poll. */
  push(row: { type: string; room: string; user: string; ref?: string; roleColor?: string; text: string }): void;
  roles: unknown[];
  close(): Promise<void>;
}

export async function startChatStub(): Promise<ChatStub> {
  const calls: StubCall[] = [];
  const queue: string[] = [];
  let seq = 0;
  const ignored: string[] = [];
  let waiting: Array<() => void> = [];
  const stub: ChatStub = {
    url: '',
    calls,
    roles: [{ id: 'r1', name: 'Crew', colorHex: '#ff0000', colorAnsi: 1, position: 0, perms: { kick: false, ban: false, mute: false, topic: false, createPrivate: false } }],
    count: (method, prefix) => calls.filter((c) => c.method === method && c.path.startsWith(prefix)).length,
    push(row) {
      seq += 1;
      queue.push(`${seq}|${row.type}|${row.room}|${row.user}|${row.ref ?? ''}|${Math.floor(Date.now() / 1000)}|${row.roleColor ?? ''}|${row.text}`);
      const w = waiting;
      waiting = [];
      w.forEach((f) => f());
    },
    close: () => new Promise<void>((r) => {
      waiting.forEach((f) => f());
      server.closeAllConnections();
      server.close(() => r());
    }),
  };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const path = (req.url ?? '').replace('/chat/v1', '');
      calls.push({ method: req.method ?? '', path, auth: String(req.headers.authorization ?? ''), sid: String(req.headers['x-chat-session'] ?? ''), body: Buffer.concat(chunks).toString() });
      const json = (code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
      const text = (body: string) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(body); };
      const p = path.split('?')[0];
      if (req.method === 'POST' && p === '/sessions') return json(200, { sid: `sid${calls.length}`, user: 'caller@TEST', expiresIn: 90 });
      if (req.method === 'DELETE' && p === '/sessions/current') { res.writeHead(204); return void res.end(); }
      if (p === '/rooms.txt') return text('ROOMS|1|1|1\r\nroom1|Lobby|Hello|public|1|sysop@TEST\r\n');
      if (req.method === 'POST' && p === '/rooms') { const b = JSON.parse(Buffer.concat(chunks).toString() || '{}'); return json(201, { id: 'room9', name: b.name, visibility: b.visibility ?? 'public', kind: b.kind ?? 'text' }); }
      if (req.method === 'POST' && /^\/rooms\/[^/]+\/join$/.test(p)) return json(200, { id: 'room1', name: 'Lobby', topic: 'Hello', members: 1, ops: [], since: 0 });
      if (req.method === 'POST' && /^\/rooms\/[^/]+\/typing$/.test(p)) return json(200, { ok: true });
      if (/\/history\.txt$/.test(p)) return text('HISTORY|1|0|0\r\n');
      if (req.method === 'POST' && /^\/rooms\/[^/]+\/messages$/.test(p)) return json(200, { id: 'm1', seq: 1, at: 1 });
      if (p === '/events.txt') {
        const send = () => { if (res.writableEnded) return; const rows = queue.splice(0); text(`EVENTS|1|${seq}|${rows.length}\r\n${rows.map((r) => `${r}\r\n`).join('')}`); };
        if (queue.length > 0) return send();
        const t = setTimeout(send, 400);
        waiting.push(() => { clearTimeout(t); send(); });
        return;
      }
      if (req.method === 'PUT' && p === '/presence') { res.writeHead(204); return void res.end(); }
      if (req.method === 'POST' && p === '/bbs-events') { res.writeHead(204); return void res.end(); }
      if (req.method === 'DELETE' && p === '/presence') { res.writeHead(204); return void res.end(); }
      if (req.method === 'GET' && /^\/users\/[^/]+\/profile\.txt$/.test(p)) return text('PROFILE|1|1|1\r\nbob@TEST|bob@TEST|TEST|online|Bob the builder|1|2|0|1|1\r\n');
      if (req.method === 'GET' && p === '/ignores.txt') return text(`IGNORES|1|1|${ignored.length}\r\n${ignored.map((u) => `${u}|1\r\n`).join('')}`);
      if (req.method === 'POST' && p === '/ignores') { const u = String(JSON.parse(Buffer.concat(chunks).toString() || '{}').user ?? ''); if (u && !ignored.includes(u)) ignored.push(u); res.writeHead(204); return void res.end(); }
      if (req.method === 'DELETE' && p.startsWith('/ignores/')) { const u = decodeURIComponent(p.slice(9)); const i = ignored.indexOf(u); if (i >= 0) ignored.splice(i, 1); res.writeHead(204); return void res.end(); }
      if (req.method === 'GET' && p === '/roles') return json(200, stub.roles);
      if (req.method === 'GET' && p === '/roles/assignments') return json(200, [{ handle: 'bob@TEST', roleId: 'r1' }]);
      return json(404, { error: 'not_found' });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  stub.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return stub;
}
