export interface ComposerDialog {
    /** The dialog box itself. */
    width: number;
    height: number;
    /** An input or list inside it, inset by two columns on each side. */
    inner: number;
}
/** The New Message header dialog: To, Subject, and the buttons under them. */
export declare function headerDialog(screenWidth: number, screenHeight: number): ComposerDialog;
/** A notice or a confirm - `width: '50%'` at eighty, the screen at forty. */
export declare function noticeWidth(screenWidth: number): string | number;
/**
 * The hint row under the header dialog's fields.
 *
 * `Tab: Next field  Enter: Continue  ESC: Cancel` is forty-five printable
 * columns; the dialog's interior on a C64 is thirty-four. The words are what
 * shortens, never the keys - a caller who cannot see `ESC` has lost the way
 * out of the box.
 */
export declare function headerHints(screenWidth: number): Array<{
    key: string;
    does: string;
}>;
