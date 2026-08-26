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

/**
 * The real size of a box, in cells.
 *
 * NOT `element.width`. That returns whatever was passed in - and the video
 * grid's container is created with '100%', so reading it back gives the
 * layout SPEC, not a number. Measuring with it made the grid believe its
 * size never changed (the signature came out "speaker|100%|100%|id" at every
 * window size, so the tiles were never rebuilt) and handed each tile the
 * string '100%' as its width. Reported as ASCII video that never resized
 * with the window, while a session STARTED wide came out wide.
 *
 * Resolved coordinates are the only honest answer; the spec is a fallback
 * for when they are not available yet.
 */
export function resolveBoxSize(
  element: { _getCoords?: () => { xi: number; xl: number; yi: number; yl: number } | undefined; width?: unknown; height?: unknown },
  fallback: { width: number; height: number }
): { width: number; height: number } {
  const coords = element._getCoords?.();
  if (coords) {
    const width = coords.xl - coords.xi;
    const height = coords.yl - coords.yi;
    if (width > 0 && height > 0) return { width, height };
  }

  const specWidth = typeof element.width === 'number' ? element.width : NaN;
  const specHeight = typeof element.height === 'number' ? element.height : NaN;
  return {
    width: Number.isFinite(specWidth) && specWidth > 0 ? specWidth : fallback.width,
    height: Number.isFinite(specHeight) && specHeight > 0 ? specHeight : fallback.height,
  };
}

/**
 * Which view mode to use when the user has not picked one.
 *
 * Speaker mode fills the panel with a single person, which is right when you
 * are alone - a grid of one is just a smaller picture. It is wrong the moment
 * somebody else is there: two people in a call showed ONE video, in both
 * browsers (reported 2026-08-26).
 *
 * An explicit choice always wins. Someone who asked for fullscreen focus does
 * not want it undone because a third person joined.
 */
export function autoViewMode(
  participantCount: number,
  userChose: boolean,
  current: ViewMode
): ViewMode {
  if (userChose) return current;
  return participantCount > 1 ? 'grid' : 'speaker';
}

/**
 * How many columns to arrange N video tiles in.
 *
 * NOT the arrangement with the biggest tiles. The grid used to maximise
 * tile AREA, and in a wide, short chat panel that picks a single column:
 * two people got tiles 63x9, which is three and a half to one once a
 * terminal cell's 2:1 shape is counted. A 4:3 camera letterboxes into a thin
 * strip inside that, leaving the tile's frame showing around it - "there is
 * still a frame behind the video... are the videos stacked on top of each
 * other instead of side by side?". They were.
 *
 * Video wants tiles SHAPED like the picture. This scores each arrangement by
 * how far its tile is from the camera's aspect and takes the closest, using
 * area only to break ties.
 */
export function bestColumns(
  participants: number,
  width: number,
  height: number,
  cameraAspect = 4 / 3,
  /** A terminal cell is about twice as tall as it is wide. */
  cellAspect = 0.5
): number {
  if (participants <= 1) return 1;

  let best = 1;
  let bestScore = Infinity;

  for (let cols = 1; cols <= participants; cols++) {
    const rows = Math.ceil(participants / cols);
    const tileW = Math.floor(width / cols);
    const tileH = Math.floor(height / rows);
    if (tileW < 1 || tileH < 1) continue;

    // What the tile looks like on screen, not in cells.
    const shown = (tileW / tileH) * cellAspect;
    // Distance in RATIO, so twice-too-wide and half-too-wide score alike.
    const distortion = shown > cameraAspect ? shown / cameraAspect : cameraAspect / shown;
    // Area only separates arrangements that distort about equally.
    const score = distortion - (tileW * tileH) / 1e6;

    if (score < bestScore) {
      bestScore = score;
      best = cols;
    }
  }

  return best;
}
