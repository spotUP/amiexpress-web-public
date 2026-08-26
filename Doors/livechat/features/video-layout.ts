/**
 * What decides where the video tiles go.
 *
 * The grid rebuilds its tiles by destroying them and constructing new ones,
 * and a new tile has no picture - it paints the avatar until the next frame
 * arrives, a tenth of a second later. So a relayout triggered by something
 * that did not move a single tile is not merely wasteful, it is a visible
 * flicker: frame, avatar, frame, avatar.
 *
 * That is what "every second frame in the video is broken" turned out to be,
 * and why it only happened in the 80x25 view. That view runs in SPEAKER
 * mode, where setActiveSpeaker() relayouts - and voice activity toggles the
 * active speaker continuously while anyone makes a sound. Grid mode reacts to
 * the same event by recolouring a border, so the big view never flickered.
 *
 * Pure, so which changes count as layout changes can be tested without a
 * terminal, a camera or a socket.
 */

export type ViewMode = 'speaker' | 'grid';

/** Only the parts of a participant that can affect the layout. */
export interface LayoutParticipant {
  userId: number | string;
}

/**
 * Who fills the tile in speaker mode: the active speaker, else yourself,
 * else whoever is first.
 */
export function pickSpeaker<T extends LayoutParticipant>(
  participants: T[],
  activeSpeaker: number | string | undefined,
  currentUserId: number | string
): T | undefined {
  return participants.find(p => String(p.userId) === String(activeSpeaker))
    ?? participants.find(p => String(p.userId) === String(currentUserId))
    ?? participants[0];
}

/**
 * Everything that decides where the tiles GO, as one comparable string.
 *
 * Deliberately excludes mute, speaking and audio level: they change many
 * times a second and move nothing. In speaker mode it also excludes every
 * participant who is not on screen - a person joining a call you are not
 * watching changes no geometry.
 */
export function layoutSignature(
  viewMode: ViewMode,
  width: number,
  height: number,
  participants: LayoutParticipant[],
  activeSpeaker: number | string | undefined,
  currentUserId: number | string
): string {
  const shown = viewMode === 'speaker'
    ? [pickSpeaker(participants, activeSpeaker, currentUserId)?.userId]
    : participants.map(p => p.userId);

  return [viewMode, width, height, ...shown.map(String)].join('|');
}
