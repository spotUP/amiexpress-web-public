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
      expect(serviceSrc).toMatch(/ANSI, RIP, PETSCII OR NO GRAPHICS/);
      // AREXX login trigger fires on every transport (was web-only).
      expect(serviceSrc).toMatch(/arexxEngine[\s\S]*?executeTrigger[\s\S]*?["']login["']/);
    });

    it('short-circuits before the prompt when passwordResetState is set', () => {
      expect(serviceSrc).toMatch(
        /if\s*\(\s*session\.passwordResetState\s*\)[\s\S]*?passwordResetActive:\s*true/,
      );
    });

    // Task 6 / audit F1-F3: this is the prompt real telnet/SSH/web callers
    // actually see at connect time (runPreLoginConnect emits it directly,
    // independent of any keypress) — so it, not command-handler/core.ts's
    // copy, is what a real C64 caller needs to be legible and to invite
    // the DEL-probe.
    it('graphics prompt is uppercase-only ASCII and invites <DEL>', () => {
      // Read the actual runtime string value, not the source text — the
      // source text's own "\r\n" escape sequence contains lowercase r/n
      // as characters, which would false-positive a source-regex check.
      const { ANSI_GRAPHICS_PROMPT } = require('../../src/services/login-connect.service');
      expect(typeof ANSI_GRAPHICS_PROMPT).toBe('string');

      expect(ANSI_GRAPHICS_PROMPT).toContain('<DEL>');
      // No lowercase ASCII letters anywhere in the actual (post-escape) string.
      expect(ANSI_GRAPHICS_PROMPT).not.toMatch(/[a-z]/);
    });

    // Sysop addendum (2026-09-02): a single long line word-wraps mid-word
    // on an 80-col terminal, worse on a real C64's 40-col screen. Assert
    // the shape (multi-line, every visible line <=40 cols, question last
    // with the input cursor sitting right after it) rather than pinning
    // one giant string.
    it('graphics prompt is explicit multi-line, each line <=40 columns, question last', () => {
      const { ANSI_GRAPHICS_PROMPT } = require('../../src/services/login-connect.service');

      // Leading "\r\n" is just a blank-line separator from prior screen
      // content, not a "line" with visible width — strip it before splitting.
      const body = (ANSI_GRAPHICS_PROMPT as string).replace(/^\r\n/, '');
      const lines = body.split('\r\n');

      expect(lines.length).toBeGreaterThanOrEqual(2);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(40);
      }

      const lastLine = lines[lines.length - 1];
      // Question mark comes last, followed only by a trailing space for
      // the input cursor — no CRLF after it.
      expect(lastLine).toMatch(/\? $/);
      expect(ANSI_GRAPHICS_PROMPT.endsWith('\r\n')).toBe(false);
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
