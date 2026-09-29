/**
 * Doors that ship as an overlay of the BBS: the archive holds the same
 * tree the BBS keeps, and the author's install text says "copy this here,
 * that there".
 *
 *   Commands/BBSCmd/SENT.info          -> BBS:Commands/BBSCmd/
 *   Commands/SysCmd/EXAMINE.info       -> BBS:Commands/SysCmd/
 *   Doors/FileDescription/...          -> BBS:Doors/FileDescription/
 *
 * The command icon says LOCATION=DOORS:FileDescription/FileDescription.x, so
 * the door only runs when it lands at Doors/FileDescription/ - under the
 * author's own name, not under the command. Extracting the whole archive into
 * Doors/<command>/ (what the installer did) nests all of it a level too deep:
 * the icon points at a file that is not there, the SysCmd icon is never
 * installed, and the install still reports success (MST-FD11.LHA, File
 * Description 1.1, 2026-09-29).
 *
 * This module only reads and decides. Nothing here installs.
 */
export interface OverlayCommand {
    /** The command, as the archive spells it. */
    command: string;
    /** Absolute path of the archive's own icon. */
    infoPath: string;
    /** Which command directory the icon belongs in. */
    kind: 'BBSCmd' | 'SysCmd';
}
export interface ArchiveOverlay {
    /** The directory the archive's Commands/ and Doors/ sit in. */
    root: string;
    commands: OverlayCommand[];
    /** Absolute paths of the directories directly under the archive's Doors/. */
    doorDirs: string[];
}
/** A directory entry by name, in any case - the Amiga does not tell them apart. */
export declare function childNamed(dir: string, name: string): string | null;
/**
 * The overlay an extracted archive holds, or null when it is not one - a
 * flat door (binary and icon side by side) has no Commands/ beside a Doors/.
 */
export declare function findOverlay(extractedDir: string): ArchiveOverlay | null;
/**
 * A tooltype's value out of an Amiga icon (binary) or a text .info.
 *
 * In a real icon each tooltype is a big-endian u32 length followed by that
 * many bytes, the last one a NUL: `\0\0\0\x32LOCATION=DOORS:...\0`. The
 * length's last byte is a printable character as often as not ("1LOCATION=" in
 * strings(1)), so "the key follows a non-letter" is no test for where an entry
 * starts. The length is: an entry is real only when the four bytes before it
 * say exactly how long it is and it ends in a NUL there.
 */
export declare function readTooltype(infoPath: string, key: string): string | null;
/**
 * LOCATION=DOORS:FileDescription/FileDescription.x as a path under Doors/.
 * Any volume prefix goes ("DOORS:", "BBS:Doors/"); the rest is the path.
 */
export declare function locationUnderDoors(location: string): string | null;
/** A relative path resolved one component at a time, in any case. */
export declare function resolveInsensitive(base: string, rel: string): string | null;
/**
 * A door that ships one binary per CPU and expects the sysop to copy the
 * right one to the name the icon uses: FileDescription000.x and
 * FileDescription020.x, icon LOCATION=...FileDescription.x, install text
 * "Copy FileDescription020.x FileDescription.x". Returns the build to copy -
 * the plain 68000 one when there is a choice, since it runs on every CPU -
 * or null when the directory holds no such variant.
 */
export declare function cpuVariantOf(dir: string, binaryName: string): string | null;
/**
 * Whether an extracted overlay really is one: at least one command icon has a
 * LOCATION that leads into the archive's own Doors/ (directly, or to a
 * per-CPU build the sysop is meant to copy). An archive with a Commands/ and
 * a Doors/ whose icons lead nowhere in it is not something this can place, and
 * is left to the flat install.
 */
export declare function overlayBinaryFor(overlay: ArchiveOverlay, command: OverlayCommand): {
    doorsDir: string;
    rel: string;
} | null;
//# sourceMappingURL=archive-layout.d.ts.map