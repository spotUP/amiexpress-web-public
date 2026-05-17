/**
 * Regression tests for the shared pre-login connect-time pipeline.
 *
 * Before extraction the three transports (web, telnet, SSH) each
 * open-coded their own connect-time flow. They drifted: FRONTEND
 * syscmd only ran on web; operator-chat listeners and SamiLog
 * refresh were web-only; telnet/SSH never fired the AREXX 'login'
 * trigger. Today's refactor collapses them into runPreLoginConnect.
 *
 * These tests are structural assertions on the SHARED service and
 * each call-site source. If a transport stops routing through the
 * service the tests fail loudly — that's the whole point. The
 * runtime behaviour of each pipeline step (FRONTEND lookup, chat
 * listeners, etc.) is covered by their own targeted tests.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../../src');

describe('runPreLoginConnect — connect-time unification', () => {
  describe('service shape', () => {
    const serviceSrc = fs.readFileSync(
      path.join(SRC_ROOT, 'services/login-connect.service.ts'),
      'utf8',
    );

    it('runs the operator-chat / samilog / FRONTEND / prompt / arexx pipeline', () => {
      expect(serviceSrc).toMatch(/setupOperatorChatListeners/);
      expect(serviceSrc).toMatch(/triggerSamiLogRefresh/);
      // FRONTEND syscmd literal — must be uppercase per syscmd cache key.
      expect(serviceSrc).toMatch(/runSysCommand[\s\S]*?["']FRONTEND["']/);
      // Graphics prompt + parked state.
      expect(serviceSrc).toMatch(/ANSI_PROMPT/);
      expect(serviceSrc).toMatch(/ANSI, RIP, PETSCII or No graphics/);
      // AREXX login trigger fires on every transport (was web-only).
      expect(serviceSrc).toMatch(/arexxEngine[\s\S]*?executeTrigger[\s\S]*?["']login["']/);
    });

    it('short-circuits before the prompt when passwordResetState is set', () => {
      expect(serviceSrc).toMatch(
        /if\s*\(\s*session\.passwordResetState\s*\)[\s\S]*?passwordResetActive:\s*true/,
      );
    });
  });

  describe('all three transport entry points route through the service', () => {
    function loadSrc(rel: string): string {
      return fs.readFileSync(path.join(SRC_ROOT, rel), 'utf8');
    }

    it('web (index.ts io.on connection) calls runPreLoginConnect', () => {
      const src = loadSrc('index.ts');
      // Inside io.on('connection', …) the call must appear before
      // anything pre-prompt. We just assert the call site exists; the
      // shape (await + emitter argument) is verified by typecheck.
      expect(src).toMatch(/runPreLoginConnect\(\s*socket\s*,\s*session\s*,/);
    });

    it('telnet (telnet-server.ts) calls runPreLoginConnect from showPrompt', () => {
      const src = loadSrc('server/telnet-server.ts');
      expect(src).toMatch(/runPreLoginConnect\(\s*emitter\s*,\s*connection\.session\s*,/);
    });

    it('ssh (ssh-server.ts) calls runPreLoginConnect from the ready handler', () => {
      const src = loadSrc('server/ssh-server.ts');
      expect(src).toMatch(/runPreLoginConnect\(\s*emitter\s*,\s*session\s*,/);
    });

    it('no transport open-codes the inline FRONTEND syscmd path', () => {
      // The duplicated `runSysCommand(*, 'FRONTEND', '')` call sites
      // that existed prior to the unification must be gone from every
      // transport entry point. The only place FRONTEND lives now is
      // the shared service.
      const transports = [
        'index.ts',
        'server/telnet-server.ts',
        'server/ssh-server.ts',
      ];
      for (const rel of transports) {
        const src = loadSrc(rel);
        expect(src).not.toMatch(/runSysCommand\([^)]*'FRONTEND'/);
      }
    });
  });
});
