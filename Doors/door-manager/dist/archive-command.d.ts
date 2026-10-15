/**
 * The command a door archive says it installs as.
 *
 * An AmiExpress door ships its own command icon. Listing any real archive
 * shows it:
 *
 *   VCLCALC/COMMANDS/BBSCMD/CALC.info
 *   VCLCALC/DOORS/CALCULATOR/CALC.rexx
 *
 * So the archive already names the command - CALC - and that .info carries
 * the tooltypes the door was built with: TYPE, LOCATION, STACK, PRIORITY,
 * NAME. DOORMAN asked the sysop to type a command instead and then wrote a
 * fresh four-line .info of its own, which is how a door ends up installed
 * under a name that does not match what it ships with, and how STACK and
 * PRIORITY get lost.
 *
 * This module finds that file. Nothing here writes anything.
 */
export interface ArchiveCommand {
    /** The command, exactly as the archive spells it. */
    command: string;
    /** Absolute path to the archive's own .info for that command. */
    infoPath: string;
}
/** A command has to be one path segment and usable as a filename. */
export declare function isUsableCommand(command: string): boolean;
/**
 * Find `.../Commands/BBSCmd/<COMMAND>.info` anywhere in an extracted archive.
 *
 * The case is whatever the author's Amiga wrote - COMMANDS/BBSCMD, Commands/
 * BBSCmd, commands/bbscmd have all been seen - so the match is
 * case-insensitive. When an archive carries more than one command icon the
 * first in walk order wins and the rest are returned for the caller to
 * report; installing several commands from one archive is not something this
 * flow does.
 */
export declare function findArchiveCommand(extractedDir: string): {
    chosen: ArchiveCommand | null;
    others: string[];
};
/**
 * The command a door will be installed as.
 *
 * Always the archive's own - a door installed under an invented name is a
 * door that does not answer to it, and writing a fresh .info loses the STACK
 * and PRIORITY the author set. When the archive names none (or names
 * something that isn't a usable command), the archive's file name stands in,
 * and the caller says so on screen rather than pretending it was chosen.
 */
export declare function commandForArchive(archiveName: string, archiveCommand: string | null): {
    command: string;
    source: 'archive' | 'archive-name';
};
//# sourceMappingURL=archive-command.d.ts.map