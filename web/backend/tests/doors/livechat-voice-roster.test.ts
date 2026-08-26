/**
 * The voice channel roster, as the sidebar shows it.
 *
 * Voice "never worked": you joined a channel and the sidebar kept reading
 * `Voice (0)` for ever, with no sign anyone was in it or talking. The count
 * was a hardcoded fallback, and the roster behind it was never populated,
 * so a perfectly healthy channel was indistinguishable from a broken one.
 *
 * These lock the row the sidebar builds from a roster: the real count, the
 * in-channel marker, and the talking marker.
 */

import { buildSidebarItems } from '../../../../Doors/livechat/handlers/sidebar-items-builder';

/** Minimal stand-ins for the collaborators the builder reads. */
function makeInput(voiceChannels: any[], currentVoiceChannel: string | null) {
  return {
    channelsToShow: [],
    state: { currentChannel: null, channels: [], dmThreads: [] },
    onlineUsers: [],
    presenceService: { getPresence: () => 'online' },
    presenceIndicators: { online: '*' } as Record<string, string>,
    isCurrentChannel: () => false,
    expandedChannels: new Set<string>(),
    collapsedChannels: new Set<string>(),
    voiceChannelService: {
      getVoiceChannels: () => voiceChannels,
      isInVoiceChannel: () => currentVoiceChannel !== null,
      getCurrentVoiceChannel: () => currentVoiceChannel,
    },
  } as any;
}

/** The voice rows are the ones carrying the [V] icon. */
function voiceRows(items: string[]): string[] {
  return items.filter(row => row.includes('[V]'));
}

describe('livechat sidebar voice rows', () => {
  it('shows the real participant count, not a hardcoded zero', () => {
    const { items } = buildSidebarItems(makeInput([
      {
        id: 'general',
        name: 'Voice',
        participants: [
          { userId: '1', username: 'spot', isSpeaking: false },
          { userId: '2', username: 'guest', isSpeaking: false },
        ],
      },
    ], 'general'));

    const rows = voiceRows(items);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('(2)');
    expect(rows[0]).not.toContain('(0)');
  });

  it('marks the channel green while we are in it', () => {
    const channel = { id: 'general', name: 'Voice', participants: [{ userId: '1', username: 'spot', isSpeaking: false }] };

    const joined = voiceRows(buildSidebarItems(makeInput([channel], 'general')).items)[0];
    const notJoined = voiceRows(buildSidebarItems(makeInput([channel], null)).items)[0];

    expect(joined).toContain('{green-fg}[V]{/green-fg}');
    expect(notJoined).not.toContain('{green-fg}[V]{/green-fg}');
  });

  it('shows a talking marker only while somebody is speaking', () => {
    const silent = [{
      id: 'general',
      name: 'Voice',
      participants: [{ userId: '1', username: 'spot', isSpeaking: false }],
    }];
    const talking = [{
      id: 'general',
      name: 'Voice',
      participants: [
        { userId: '1', username: 'spot', isSpeaking: false },
        { userId: '2', username: 'guest', isSpeaking: true },
      ],
    }];

    expect(voiceRows(buildSidebarItems(makeInput(silent, 'general')).items)[0])
      .not.toContain('{green-fg}[*]{/green-fg}');
    expect(voiceRows(buildSidebarItems(makeInput(talking, 'general')).items)[0])
      .toContain('{green-fg}[*]{/green-fg}');
  });

  it('still offers a Voice row to click when no channel is known yet', () => {
    // Before the first join there is no roster; the row has to exist anyway,
    // because clicking it is how you join.
    const built = buildSidebarItems(makeInput([], null));
    expect(voiceRows(built.items)).toHaveLength(1);
    expect(built.channelItems.some((c: any) => c.type === 'voice')).toBe(true);
  });
});
