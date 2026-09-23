/**
 * PETSCII screen-code -> Unicode map.
 *
 * THE TABLE MOVED INTO THE SDK (`sdk/petscii/screencode-unicode.ts`) on
 * 2026-09-23, because a door and the board now need the same one: a caller
 * can type PETSCII, and what he typed has to be readable by an eighty-column
 * ANSI caller. `sdk/tests/petscii/unicode-to-petscii.test.ts` used to
 * apologise for not being able to import it from here and inline twelve
 * screen codes instead; it can import it now.
 *
 * This file stays as the backend's name for it, the way
 * `web/backend/src/utils/narrow-art.util.ts` stayed when its rule moved.
 */
export { SCREENCODE_TO_UNICODE } from '@amiexpress/bbs-door-sdk/petscii';
