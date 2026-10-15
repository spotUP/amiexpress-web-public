/**
 * What an error may say in a log line.
 *
 * `console.error('...', err)` on an AxiosError prints the whole object, and
 * an AxiosError carries `config.headers` - which for this bot is
 * `Authorization: Bearer <WHIP_SERVICE_TOKEN>` on every WHIP call and
 * `<BOARD_DATA_TOKEN>` on every board call. A board restart (ECONNREFUSED)
 * was enough to put either in the log, and the admin plugin page renders
 * those logs.
 *
 * The diagnostic value is the status, the method, the path and WHETHER the
 * request carried credentials at all - so the header NAME is kept and its
 * value is not. The query string goes too: `?key=` is how another of this
 * codebase's clients passes its key.
 */
import axios from 'axios';

function pathOf(url: string | undefined): string {
  if (!url) return '(no url)';
  const cut = url.indexOf('?');
  return cut === -1 ? url : `${url.slice(0, cut)}?(query hidden)`;
}

export function describeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const cfg = err.config ?? ({} as Record<string, any>);
    const method = String(cfg.method ?? 'get').toUpperCase();
    const where = `${method} ${pathOf(cfg.url)}`;
    const auth = cfg.headers && (cfg.headers as any).Authorization ? ' [Authorization sent]' : '';
    const status = err.response ? String(err.response.status) : err.code || 'no response';
    return `${status} ${where}${auth}: ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
