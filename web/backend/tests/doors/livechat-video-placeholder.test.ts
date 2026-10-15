/**
 * The placeholder should say what is actually happening.
 *
 * "WAITING FOR VIDEO..." was shown on every tile with no frame yet, including
 * your OWN, and including when there was nobody else in the channel to wait
 * for. It sent !cyke looking for a broken camera for two days when the
 * camera was fine and the channel was empty.
 */

import {
  videoPlaceholderMessage,
  emptyChannelNotice,
} from '../../../../Doors/livechat/ui/video-tile';

describe('videoPlaceholderMessage', () => {
  it('tells you your own camera is starting, not that it is waiting for video', () => {
    expect(videoPlaceholderMessage({ isCurrentUser: true, videoError: null }))
      .toBe('STARTING CAMERA...');
  });

  it('still waits for somebody else', () => {
    expect(videoPlaceholderMessage({ isCurrentUser: false, videoError: null }))
      .toBe('WAITING FOR VIDEO...');
  });

  it('always prefers a real error over either', () => {
    expect(videoPlaceholderMessage({ isCurrentUser: true, videoError: 'CAMERA DENIED' }))
      .toBe('CAMERA DENIED');
    expect(videoPlaceholderMessage({ isCurrentUser: false, videoError: 'STREAM LOST' }))
      .toBe('STREAM LOST');
  });
});

describe('emptyChannelNotice', () => {
  it('says you are alone when you are the only participant', () => {
    expect(emptyChannelNotice(1)).toMatch(/only one here/i);
  });

  it('says nothing once somebody else is present', () => {
    expect(emptyChannelNotice(2)).toBeNull();
    expect(emptyChannelNotice(6)).toBeNull();
  });

  it('says nothing when the channel has nobody at all', () => {
    // Not in a channel: there is no tile grid to annotate.
    expect(emptyChannelNotice(0)).toBeNull();
  });
});
