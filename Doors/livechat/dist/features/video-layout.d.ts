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
export declare function pickSpeaker<T extends LayoutParticipant>(participants: T[], activeSpeaker: number | string | undefined, currentUserId: number | string): T | undefined;
/**
 * Everything that decides where the tiles GO, as one comparable string.
 *
 * Deliberately excludes mute, speaking and audio level: they change many
 * times a second and move nothing. In speaker mode it also excludes every
 * participant who is not on screen - a person joining a call you are not
 * watching changes no geometry.
 */
export declare function layoutSignature(viewMode: ViewMode, width: number, height: number, participants: LayoutParticipant[], activeSpeaker: number | string | undefined, currentUserId: number | string): string;
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
export declare function resolveBoxSize(element: {
    _getCoords?: () => {
        xi: number;
        xl: number;
        yi: number;
        yl: number;
    } | undefined;
    width?: unknown;
    height?: unknown;
}, fallback: {
    width: number;
    height: number;
}): {
    width: number;
    height: number;
};
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
export declare function autoViewMode(participantCount: number, userChose: boolean, current: ViewMode): ViewMode;
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
export declare function bestColumns(participants: number, width: number, height: number, cameraAspect?: number, 
/** A terminal cell is about twice as tall as it is wide. */
cellAspect?: number): number;
