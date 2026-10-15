// @ts-nocheck

/**
 * Cross-project test: validates DM context helpers in the LiveChat door's
 * core/state.ts. Lives in web/backend/tests because that's where the test
 * runner is configured; uses `require` to reach into Doors/livechat.
 */
describe('LiveChat state DM context helpers', () => {
  let createInitialState: any;
  let setDmContext: any;
  let clearDmContext: any;
  let setChannel: any;

  beforeAll(() => {
    const mod = require('../../../../Doors/livechat/core/state');
    createInitialState = mod.createInitialState;
    setDmContext = mod.setDmContext;
    clearDmContext = mod.clearDmContext;
    setChannel = mod.setChannel;
  });

  it('initial state has empty dmThreads and null currentDmThread', () => {
    const s = createInitialState();
    expect(Array.isArray(s.dmThreads)).toBe(true);
    expect(s.dmThreads.length).toBe(0);
    expect(s.currentDmThread).toBeNull();
  });

  it('setDmContext sets currentDmThread, clears messages and typing buffers', () => {
    const s = createInitialState();
    s.messages = [{ id: '1', userId: '1', username: 'a', content: 'hi', timestamp: 0 }];
    s.typingBuffers.set(1, { lines: ['x'], lastUpdate: 0, color: 'gray' });
    setDmContext(s, 'dm-thread-abc');
    expect(s.currentDmThread).toBe('dm-thread-abc');
    expect(s.messages.length).toBe(0);
    expect(s.typingBuffers.size).toBe(0);
  });

  it('setDmContext clears currentChannel so room:leave is not re-emitted on DM->DM switch', () => {
    const s = createInitialState();
    s.currentChannel = 'general';
    setDmContext(s, 'dm-thread-abc');
    // Empty string is the codebase convention for "no channel" (createInitialState
    // initializes currentChannel: '' on line ~45 of core/state.ts).
    expect(s.currentChannel).toBe('');
  });

  it('clearDmContext nulls currentDmThread and clears messages', () => {
    const s = createInitialState();
    setDmContext(s, 'dm-thread-abc');
    s.messages.push({ id: '2', userId: '1', username: 'a', content: 'hi', timestamp: 0 });
    clearDmContext(s);
    expect(s.currentDmThread).toBeNull();
    expect(s.messages.length).toBe(0);
  });

  it('setChannel clears currentDmThread so callers can not leave both contexts active', () => {
    const s = createInitialState();
    setDmContext(s, 'dm-thread-abc');
    setChannel(s, 'general');
    // setChannel now also nulls currentDmThread (Task 7 follow-up): a single
    // mutation switches contexts atomically without requiring callers to
    // clearDmContext first.
    expect(s.currentDmThread).toBeNull();
    expect(s.currentChannel).toBe('general');
    expect(s.messages.length).toBe(0);
  });
});
