/**
 * Every edit saves itself, once, and says so.
 *
 * "i want no save buttons at all in the admin ui everything should auto save"
 * (sysop, 2026-09-14), after removing a login-sequence include and getting no
 * toast - because nothing had happened: the button edited a draft and the
 * board was written only when Save was pressed.
 *
 * The debounce is not politeness. Every write to a screen file invalidates the
 * board's screen index, and rebuilding it is ~340ms of SYNCHRONOUS filesystem
 * work on the one backend thread that also answers telnet. A save per click
 * while reordering a list of five would freeze the board five times.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutosave } from '../src/hooks/useAutosave';

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess, showError, confirm: vi.fn(async () => true) }),
}));

beforeEach(() => { vi.useFakeTimers(); showSuccess.mockReset(); showError.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

/** Let the debounce elapse and any resulting promise settle. */
async function settle(ms = 800) {
  await act(async () => { vi.advanceTimersByTime(ms); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe('an edit saves itself', () => {
  it('writes once, after the edits stop', async () => {
    const save = vi.fn(async () => undefined);
    const { result } = renderHook(() => useAutosave({ save }));

    act(() => { result.current.schedule('a'); });
    act(() => { result.current.schedule('ab'); });
    act(() => { result.current.schedule('abc'); });
    expect(save).not.toHaveBeenCalled();

    await settle();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('abc', undefined);
  });

  it('says so out loud, which is what was missing', async () => {
    const save = vi.fn(async () => undefined);
    const { result } = renderHook(() => useAutosave({ save, label: () => 'Node 1 saved' }));

    act(() => { result.current.schedule('x'); });
    await settle();

    expect(showSuccess).toHaveBeenCalledWith('Node 1 saved');
  });

  it('keeps two subjects apart, so one does not cancel the other', async () => {
    // The login sequence has a list per screen; editing one must not swallow
    // a pending write for another.
    const save = vi.fn(async () => undefined);
    const { result } = renderHook(() => useAutosave({ save }));

    act(() => { result.current.schedule('one', 'LOGON'); });
    act(() => { result.current.schedule('two', 'BULL'); });
    await settle();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledWith('one', 'LOGON');
    expect(save).toHaveBeenCalledWith('two', 'BULL');
  });

  it('shows the board\'s refusal rather than claiming it saved', async () => {
    const save = vi.fn(async () => { throw new Error('a screen file may not be empty'); });
    const { result } = renderHook(() => useAutosave({ save }));

    act(() => { result.current.schedule('x'); });
    await settle();

    expect(showError).toHaveBeenCalledWith('a screen file may not be empty');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(result.current.error).toBe('a screen file may not be empty');
  });

  it('flush writes immediately, and the timer does not write again', async () => {
    const save = vi.fn(async () => undefined);
    const { result } = renderHook(() => useAutosave({ save }));

    act(() => { result.current.schedule('now'); });
    await act(async () => { await result.current.flush(); });
    expect(save).toHaveBeenCalledTimes(1);

    await settle();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not write on unmount what was never edited', async () => {
    const save = vi.fn(async () => undefined);
    const { unmount } = renderHook(() => useAutosave({ save }));
    unmount();
    await settle();
    expect(save).not.toHaveBeenCalled();
  });

  it('a pending edit is not lost when the page goes away', async () => {
    const save = vi.fn(async () => undefined);
    const { result, unmount } = renderHook(() => useAutosave({ save }));

    act(() => { result.current.schedule('half-typed'); });
    unmount();
    await act(async () => { await Promise.resolve(); });

    // Leaving the tab must not quietly discard it.
    expect(save).toHaveBeenCalledWith('half-typed', undefined);
  });
});
