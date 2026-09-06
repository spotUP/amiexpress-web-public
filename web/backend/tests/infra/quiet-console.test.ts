/**
 * The log-volume pin. A run of `tests/doors` used to write 6.2 MB because
 * every one of `src/`'s 2,967 `console.log` sites printed a five-line block.
 */
describe('test console volume', () => {
  const quieted = (fn: unknown): boolean =>
    Boolean((fn as { quietedByTestSetup?: boolean }).quietedByTestSetup);

  it('drops the backend chatter', () => {
    expect(quieted(console.log)).toBe(true);
    expect(quieted(console.info)).toBe(true);
    expect(quieted(console.debug)).toBe(true);
  });

  it('keeps the warnings and errors a failing test is diagnosed with', () => {
    expect(quieted(console.warn)).toBe(false);
    expect(quieted(console.error)).toBe(false);
  });

  it('still lets a test spy on console.log', () => {
    // The suite has ~90 files that assert on what was logged. Quieting must
    // not take that away: a spy replaces the no-op and records as before.
    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    console.log('hello');
    expect(spy).toHaveBeenCalledWith('hello');
    spy.mockRestore();
    expect(quieted(console.log)).toBe(true);
  });
});
