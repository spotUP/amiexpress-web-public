/**
 * T17 (2026-09-08): a caller on the web terminal could not type a name at
 * the long-filename rename prompt, and the prompt left no server-side
 * trace — arm/disarm/complete lines make the next report answerable from
 * the runtime log alone ("did the prompt even arm? did the name land?").
 *
 * Behavioral: arm logs the old name, completion logs old -> new, and the
 * rename still lands on disk. Gate: needsRename fires on >12 chars and on
 * express.e:19223's forbidden set, and stays quiet otherwise. And the
 * null-context early return in handleDizExtractionAndDescription warns
 * instead of skipping silently (it sits above the rename block, so a
 * missing context used to skip the whole prompt with zero output) - driven
 * through the real function with a session that has no upload context.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { needsRename, startRenamePrompt } from '../src/services/rename-prompt.service';
import { LoggedOnSubState } from '../src/constants/bbs-states';
import { handleDizExtractionAndDescription } from '../src/server/file-socket-handlers';
import { config } from '../src/config';

function fakeEmitter(captured: string[]) {
  return { emit: (ev: string, ...args: unknown[]) => { captured.push(`${ev}:${args.join('')}`); } };
}

describe('T17 rename prompt observability (express.e:19192-19256)', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('needsRename fires on >12 chars and forbidden chars, quiet otherwise', () => {
    expect(needsRename('AVeryLongName.LHA')).toBe(true);
    expect(needsRename('A B.LHA')).toBe(true);
    expect(needsRename('OK.LHA')).toBe(false);
    expect(needsRename('12345678.123')).toBe(false);
  });

  test('arming logs the old name and installs prompt state', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't17-test-'));
    try {
      const oldPath = path.join(dir, 'AVeryLongName.LHA');
      fs.writeFileSync(oldPath, 'x');
      const session: any = { user: { username: 'probe' }, nodeId: 3 };
      startRenamePrompt(fakeEmitter([]) as any, session, oldPath, () => {});
      expect(session.subState).toBe(LoggedOnSubState.UPLOAD_RENAME_PROMPT);
      expect(typeof session.uploadRenameInputHandler).toBe('function');
      const armed = logSpy.mock.calls.map((c) => String(c[0]));
      expect(armed.some((l) => l.includes('[rename] prompt armed') && l.includes('AVeryLongName.LHA'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('completion logs old -> new and renames on disk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't17-test-'));
    try {
      const oldPath = path.join(dir, 'AVeryLongName.LHA');
      fs.writeFileSync(oldPath, 'x');
      const session: any = {};
      let result: any = null;
      startRenamePrompt(fakeEmitter([]) as any, session, oldPath, (r) => { result = r; });
      for (const ch of 'SHORT.LHA\r') session.uploadRenameInputHandler(ch);
      expect(result?.newFilename).toBe('SHORT.LHA');
      expect(fs.existsSync(path.join(dir, 'SHORT.LHA'))).toBe(true);
      const lines = logSpy.mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes('[rename]') && l.includes('AVeryLongName.LHA') && l.includes('SHORT.LHA'))).toBe(true);
      // Handler disarms so later keystrokes cannot double-complete.
      expect(session.uploadRenameInputHandler).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('null-context skip warns instead of vanishing', async () => {
    const socket: any = { id: 't17-no-context', emit: jest.fn() };
    const session: any = { nodeId: 3, user: { username: 'probe' } };

    const handled = await handleDizExtractionAndDescription(
      socket, session,
      { filename: 'AVeryLongName.LHA', originalname: 'AVeryLongName.LHA', size: 1 },
      config
    );

    expect(handled).toBe(false);
    const warned = warnSpy.mock.calls.map((c) => String(c[0]));
    expect(warned.some((l) => l.includes('no upload context') && l.includes('AVeryLongName.LHA'))).toBe(true);
    // Nothing is armed and nothing reaches the caller.
    expect(session.subState).toBeUndefined();
    expect(socket.emit).not.toHaveBeenCalled();
  });
});
