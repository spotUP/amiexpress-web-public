import { MODEL } from '@amiexpress/bbs-door-sdk/beeb/emulator-url';
/**
 * The three files a Model B needs, by the exact names the emulator asks
 * for (jsbeeb `src/models.js`: `os.rom`, `BASIC.ROM`, `b/DFS-1.2.rom`).
 * Getting one of these names wrong is a black screen, not an error.
 */
export declare const REQUIRED_ROMS: string[];
/**
 * The machine, named explicitly rather than left to the emulator's default.
 *
 * jsbeeb knows several models and they want DIFFERENT ROMs - `B` and
 * `B-DFS0.9` and `B1770` and `Master` each ask for their own set, and
 * `Master` wants `master/mos3.20`, which is nothing like the three files
 * this board tells a sysop to install. Leaving the model to the default
 * means the emulator asks for a ROM nobody was told about and shows "failed
 * to find a ROM" over a board that is correctly set up.
 *
 * So the model is pinned, and REQUIRED_ROMS above is exactly its ROM set.
 * The two must be changed together - which is why the pin itself lives in
 * the SDK now: the TELETEXT door sends callers to the same machine, and two
 * doors disagreeing about the model is two different sets of missing ROMs.
 */
export { MODEL };
/**
 * The DFS version the pinned model's 8271 disc controller expects.
 *
 * A 1770-era DFS (2.2x and later) on this model cannot drive the emulated
 * controller, and the failure looks like a missing file rather than a
 * mismatched ROM.
 */
export declare const EXPECTED_DFS_VERSION = "1.2";
export interface RomIdentity {
    /** The ROM's own title, from its sideways header. */
    title: string;
    /** Its version string, when it carries one. */
    version: string;
}
export interface RomCheck {
    /** Required ROMs that are not on disc at all. */
    missing: string[];
    /** ROMs whose own header disagrees with the name they were filed under. */
    mismatched: {
        file: string;
        expected: string;
        found: string;
    }[];
}
export interface Title {
    /** The filename, which is also what the emulator is told to load. */
    file: string;
    /** Tidied for the list. */
    name: string;
    kind: 'disc' | 'tape';
    bytes: number;
}
export declare function beebRoot(startDir?: string): string;
export declare function romsDir(startDir?: string): string;
export declare function softwareDir(startDir?: string): string;
/**
 * Which required ROMs are missing.
 *
 * Empty means the machine will boot. Anything else and the emulator shows
 * a black screen with no explanation, so the door says so first - there is
 * no open-source BBC ROM and never has been, so this is the normal state of
 * a board nobody has set up yet, not a fault.
 */
export declare function missingRoms(startDir?: string): string[];
/**
 * What a ROM says it is.
 *
 * A sideways ROM carries its own title and version as plain text after the
 * language entry vectors - the title from offset 9, NUL-terminated, then
 * the version. Reading it is how the door can tell that a file called
 * `DFS-1.2.rom` is actually DFS 2.42, which is the difference between a
 * disc that boots and a "File not found" nobody can explain.
 *
 * Returns null for a ROM with no readable header, which is normal for the
 * OS ROM - it is not a sideways ROM and has no such string.
 */
export declare function romIdentity(file: string): RomIdentity | null;
/**
 * The ROMs, checked for what they ARE and not only that they exist.
 *
 * A sysop who files a 1770-era DFS under the name of an 8271-era one has a
 * board that boots to BASIC and then cannot read a disc, and nothing
 * anywhere says why.
 */
export declare function checkRoms(startDir?: string): RomCheck;
/** Everything in the board's software folder the emulator could load. */
export declare function listTitles(startDir?: string): Title[];
/** The URL that runs one title, through the SDK's shared builder. */
export declare function urlFor(title: Title, options?: {
    autoboot?: boolean;
}): string;
/** An empty machine, for a caller who just wants BASIC. */
export declare function bareUrl(): string;
