/**
 * The installed-doors footer.
 *
 * Presentation only, and out of app.ts because that file is at the project's
 * 2000-line ceiling and a key list is the least view-dependent thing in it.
 * Pure, so the key list can be asserted without a terminal.
 */
/**
 * @param enabled whether the SELECTED door is enabled; the E key offers the
 *                opposite of the current state, and reads wrong otherwise.
 */
export declare function installedFooter(enabled: boolean, narrow?: boolean): string;
//# sourceMappingURL=installed-footer.d.ts.map