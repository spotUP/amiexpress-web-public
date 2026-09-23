/**
 * Mail Composer - the message editor, in whichever art the caller's terminal
 * speaks.
 *
 * It has always been the ANSIEditor widget with a recipient/subject header
 * bolted on - the same widget the ansi-editor door hosts. A PETSCII caller
 * could not reach it at all: the door gated at eighty columns, and an ANSI
 * canvas is not a C64 screen anyway.
 *
 * So the widget is chosen by the terminal, the way this board chooses
 * everything else a caller authors: `PetsciiEditor` for a C64, `ANSIEditor`
 * for everyone else, one door and one command. The ANSI path is untouched.
 *
 * WHAT A PETSCII MESSAGE IS. Not a `.seq` - a message body is TEXT, and the
 * board carries authored PETSCII as glyph and pen markers precisely because
 * every ESC is stripped out of a message before it is stored. So the body is
 * `editor.toPua()`, which an eighty-column reader gets folded to Unicode
 * blocks in the same colours.
 */
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
declare const door: Door;
export default door;
