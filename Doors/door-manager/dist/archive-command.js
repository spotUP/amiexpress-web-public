"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUsableCommand = isUsableCommand;
exports.findArchiveCommand = findArchiveCommand;
exports.commandForArchive = commandForArchive;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** A command has to be one path segment and usable as a filename. */
function isUsableCommand(command) {
    return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(command) && command.length <= 32;
}
function walk(dir, depth, out) {
    if (depth > 6)
        return;
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory())
            walk(full, depth + 1, out);
        else
            out.push(full);
    }
}
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
function findArchiveCommand(extractedDir) {
    const files = [];
    walk(extractedDir, 0, files);
    const matches = [];
    for (const file of files) {
        const normalized = file.split(path.sep).join('/');
        const match = /\/commands\/bbscmd\/([^/]+)\.info$/i.exec(normalized);
        if (!match)
            continue;
        const command = match[1];
        if (!isUsableCommand(command))
            continue;
        matches.push({ command, infoPath: file });
    }
    if (matches.length === 0)
        return { chosen: null, others: [] };
    return { chosen: matches[0], others: matches.slice(1).map(m => m.command) };
}
/**
 * The command a door will be installed as.
 *
 * Always the archive's own - a door installed under an invented name is a
 * door that does not answer to it, and writing a fresh .info loses the STACK
 * and PRIORITY the author set. When the archive names none (or names
 * something that isn't a usable command), the archive's file name stands in,
 * and the caller says so on screen rather than pretending it was chosen.
 */
function commandForArchive(archiveName, archiveCommand) {
    const candidate = archiveCommand?.trim().toUpperCase() ?? '';
    if (candidate && isUsableCommand(candidate)) {
        return { command: candidate, source: 'archive' };
    }
    const base = archiveName.replace(/\.(lha|lzx|zip|lzh)$/i, '');
    const derived = base.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const fallback = isUsableCommand(derived) ? derived : 'DOOR';
    return { command: fallback, source: 'archive-name' };
}
//# sourceMappingURL=archive-command.js.map