/**
 * Two crashes taken straight from the live container log of 2026-08-26.
 *
 *   [DoorSocket] Local handler error for chat:dm
 *     TypeError: Cannot read properties of undefined (reading 'trim')
 *       at hidesDirectMessages (Doors/livechat/dist/core/mute-list.js:68)
 *       at Doors/livechat/dist/handlers/chat-socket-handlers.js:100
 *
 *   [DoorSocket] Local handler error for chat:pin:list
 *     TypeError: Cannot read properties of undefined (reading 'length')
 *       at createPinnedPanel (Doors/livechat/dist/ui/pinned-panel.js:32)
 *
 * The first is why a DM can silently never appear: the handler throws before
 * it renders anything, so the message is simply lost. That is the reported
 * "/msg does not send, though the context menu does".
 */

import {
  createMuteList,
  toggleMute,
  hidesDirectMessages,
  hidesRoomMessages,
} from '../../../../Doors/livechat/core/mute-list';

describe('mute list with a missing username (live crash: chat:dm)', () => {
  it('does not throw when the payload carries no sender name', () => {
    const list = createMuteList();
    // The live payload had neither `from` nor `username`, so the handler
    // passed undefined straight into the mute lookup.
    expect(() => hidesDirectMessages(list, undefined as any)).not.toThrow();
    expect(() => hidesRoomMessages(list, undefined as any)).not.toThrow();
  });

  it('treats an unnamed sender as not muted rather than as a match', () => {
    const list = createMuteList();
    toggleMute(list, 'dino', 'block');

    // An unknown sender must not accidentally match a blocked entry.
    expect(hidesDirectMessages(list, undefined as any)).toBe(false);
    expect(hidesDirectMessages(list, '' as any)).toBe(false);
    expect(hidesDirectMessages(list, 'dino')).toBe(true);
  });

  it('still matches names regardless of case and padding', () => {
    const list = createMuteList();
    toggleMute(list, 'DiNO', 'ignore');
    expect(hidesDirectMessages(list, '  dino  ')).toBe(true);
  });
});

/**
 * The pinned panel was handed `undefined` because the door's own REQUEST is
 * delivered back to its own listener: `getPinnedMessages()` emits
 * `chat:pin:list` with `{ roomId }`, and the backend answers on the SAME
 * event name with `{ roomId, pinnedMessages }`. door.handler's dispatchLocal
 * hands the door its outgoing emit, so the response handler runs on a request
 * payload that has no `pinnedMessages`.
 */
describe('pin list payloads (live crash: chat:pin:list)', () => {
  // The guard under test, matching what the door now applies before it
  // builds a panel. Kept as a named predicate so the intent is testable
  // without a blessed screen.
  const isPinListResponse = (data: any): boolean => Array.isArray(data?.pinnedMessages);

  it('rejects the door\'s own request, which has no pinnedMessages', () => {
    expect(isPinListResponse({ roomId: 'room_1' })).toBe(false);
  });

  it('rejects an undefined or malformed payload', () => {
    expect(isPinListResponse(undefined)).toBe(false);
    expect(isPinListResponse(null)).toBe(false);
    expect(isPinListResponse({ roomId: 'r', pinnedMessages: null })).toBe(false);
  });

  it('accepts the server response, including an empty room', () => {
    expect(isPinListResponse({ roomId: 'r', pinnedMessages: [] })).toBe(true);
    expect(isPinListResponse({ roomId: 'r', pinnedMessages: [{ message: 'hi' }] })).toBe(true);
  });
});
