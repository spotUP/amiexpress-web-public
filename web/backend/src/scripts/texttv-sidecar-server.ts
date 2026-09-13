/**
 * The Text-TV proxy, in its own process.
 *
 * WHY A SEPARATE PROCESS AND NOT A ROUTE ON THE BOARD.
 *
 * The TEXTTV door fetches its page over plain HTTP because a 68K stack has
 * no TLS. It used to fetch from the board itself (`Host=127.0.0.1,
 * Port=3001`) - the same process running its emulator. The emulator waits
 * for the socket inside `deasync.loopWhile`, and that is documented in
 * storage/file-cache.ts:945-965: loopWhile drains pending work through
 * `process._tickCallback()`, which refuses to re-enter itself, so from
 * inside a microtask checkpoint nothing drains. Express accepted the
 * connection, the async handler ran to its first `await`, and its
 * continuation could never run. The door waited for an answer that was
 * structurally impossible, and because the parked loop is shared, it took
 * every node, session and socket on the board with it - measured live on
 * 2026-09-13 at 181% CPU with fifteen connections queued on the listener.
 *
 * A separate process cannot be parked by the emulator, so the answer
 * arrives whatever the board's loop is doing. It also matches what a real
 * Amiga does: talk to another machine.
 *
 * Bound to loopback only - this is the door's private door, not a public
 * API. The board keeps its own /api/texttv route for the chat tool and the
 * screen path.
 */
import * as http from 'http';
import { answerTextTv } from '../services/texttv-sidecar-handler';

export const TEXTTV_SIDECAR_PORT = Number(process.env.TEXTTV_SIDECAR_PORT || 3002);

/**
 * The path a supervisor asks "is a sidecar already serving here?".
 *
 * Answered without touching the network, so a probe cannot be mistaken for
 * a page fetch and cannot hang on texttv.nu being slow.
 */
export const TEXTTV_SIDECAR_HEALTH_PATH = '/health';

/**
 * Is that process still there?
 *
 * Signal 0 is the question, not an instruction: the kernel runs its
 * permission and existence checks and delivers nothing. ESRCH means gone;
 * EPERM means alive and owned by somebody else, which still counts as alive.
 */
export function processAlive(pid: number): boolean {
  if (!(pid > 0)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function createTextTvSidecar(
  fetchPage?: (page: number) => Promise<{ status: number; body: string }>,
): http.Server {
  return http.createServer((req, res) => {
    void (async () => {
      if ((req.url ?? '').split('?')[0] === TEXTTV_SIDECAR_HEALTH_PATH) {
        const body = JSON.stringify({ status: 'ok', pid: process.pid });
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        });
        res.end(body);
        return;
      }
      const fetcher =
        fetchPage ??
        (async (page: number) => {
          const { fetchTextTvPage } = await import('../services/texttv-proxy.service');
          const { status, body } = await fetchTextTvPage(page);
          return { status, body };
        });
      const answer = await answerTextTv(req.url ?? '', fetcher);
      // CONTENT-LENGTH IS NOT OPTIONAL HERE.
      //
      // Without it Node frames the body as `Transfer-Encoding: chunked`, and
      // the door's HTTP reader is a few hundred bytes of C on a 68K that
      // refuses chunked outright (texttv.c, error -7, "proxy speaks
      // chunked"). The Express route this replaced never had to say so:
      // res.send() sets the header itself, so moving to a raw http server
      // dropped it silently and every body-level test still passed.
      //
      // byteLength, not .length: a Swedish page is full of multi-byte UTF-8
      // and a character count frames the body short - which the door reports
      // as -8, "proxy cut the reply short".
      res.writeHead(answer.status, {
        'Content-Type': answer.contentType,
        'Content-Length': Buffer.byteLength(answer.body),
      });
      res.end(answer.body);
    })();
  });
}

/**
 * Started directly, rather than imported by a test.
 *
 * `require.main === module` is false under tsx, which is how the supervisor
 * runs this in dev - the process came up, listened to nothing and the door
 * got a refused connection. The entry path is the honest question, and it
 * answers the same in dev (tsx src/...) and in the container (node dist/...).
 */
const startedDirectly = (process.argv[1] ?? '').includes('texttv-sidecar-server');

if (startedDirectly) {
  /*
   * DIE WITH THE BOARD.
   *
   * The supervisor kills its child on a clean shutdown, but a dev machine
   * does not always get one: `kill-servers.sh` sends SIGKILL, and a killed
   * parent cannot kill anything. The orphan kept port 3002, so every backend
   * started afterwards failed to bind, burned its five restarts and told the
   * sysop the door was broken - while the orphan quietly went on serving
   * (2026-09-13, an orphan from 19:12 outlived three restarts).
   *
   * It watches the BOARD's pid, not its own parent's. In dev the sidecar is
   * spawned through `npx tsx`, so its parent is the tsx wrapper: the board
   * can die with that wrapper still standing, and a ppid check would see
   * nothing wrong. The board tells us its pid on the way in; `kill(pid, 0)`
   * asks the kernel whether it is still there without signalling it.
   */
  const boardPid = Number(process.env.TEXTTV_SIDECAR_PARENT_PID || 0);
  if (boardPid > 0) {
    const watchBoard = setInterval(() => {
      if (!processAlive(boardPid)) {
        console.log('[texttv-sidecar] the board went away - exiting');
        process.exit(0);
      }
    }, 2000);
    watchBoard.unref?.();
  }

  const server = createTextTvSidecar();
  server.listen(TEXTTV_SIDECAR_PORT, '127.0.0.1', () => {
    console.log(`[texttv-sidecar] serving /api/texttv on 127.0.0.1:${TEXTTV_SIDECAR_PORT}`);
  });
  server.on('error', (err) => {
    console.error(`[texttv-sidecar] ${(err as Error).message}`);
    process.exit(1);
  });
}
