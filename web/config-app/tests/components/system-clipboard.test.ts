/**
 * System clipboard bridge: writes leave the canvas, reads come back, and a
 * denied permission is a false/null rather than a rejection.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { writeSystemText, readSystemText } from '../../src/components/system-clipboard';

function stubClipboard(impl: Record<string, unknown>) {
  Object.defineProperty(navigator, 'clipboard', { value: impl, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('system clipboard', () => {
  it('writes and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });
    await expect(writeSystemText('AB')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('AB');
  });
  it('a denied write is false, not a throw', async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    await expect(writeSystemText('AB')).resolves.toBe(false);
  });
  it('reads text back', async () => {
    stubClipboard({ readText: vi.fn().mockResolvedValue('Hi') });
    await expect(readSystemText()).resolves.toBe('Hi');
  });
  it('empty or denied reads are null', async () => {
    stubClipboard({ readText: vi.fn().mockResolvedValue('') });
    await expect(readSystemText()).resolves.toBeNull();
    stubClipboard({ readText: vi.fn().mockRejectedValue(new Error('denied')) });
    await expect(readSystemText()).resolves.toBeNull();
  });
});
