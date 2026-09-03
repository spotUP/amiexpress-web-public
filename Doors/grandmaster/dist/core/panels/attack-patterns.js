"use strict";
/**
 * Loading the shipped attack scripts.
 *
 * 68 files, vendored unmodified from panel-attack's own
 * client/assets/default_data/training. 66 of them are Challenge Mode stages;
 * the other two are the Training punching bags.
 *
 * MANY OF THESE ARE RECORDINGS OF REAL GAMES. The late Challenge stages carry
 * an `extraInfo` block naming the player and their garbage-per-minute -
 * challenge-8-12 is somebody sustaining 32.9 GPM - so the hardest stages are
 * not a designer's idea of hard, they are what a person actually did.
 *
 * Paths resolve from THIS FILE, never from the working directory: a door is
 * launched from wherever the BBS happens to be, and the build copies data/
 * alongside the compiled output so the same relative path works in both.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.attackPatternDirectory = attackPatternDirectory;
exports.hasChallengeFile = hasChallengeFile;
exports.loadAttackFile = loadAttackFile;
exports.loadChallengeAttack = loadChallengeAttack;
exports.listTrainingPatterns = listTrainingPatterns;
const fs_1 = require("fs");
const path_1 = require("path");
const challenge_mode_1 = require("./challenge-mode");
/** Where the vendored scripts live, relative to this module. */
const PATTERN_DIR = (0, path_1.join)(__dirname, '..', '..', 'attack-patterns');
function attackPatternDirectory() {
    return PATTERN_DIR;
}
/** Is there a script for this Challenge stage? Used to resolve fallbacks. */
function hasChallengeFile(difficulty, stage) {
    return (0, fs_1.existsSync)((0, path_1.join)(PATTERN_DIR, (0, challenge_mode_1.attackFileName)(difficulty, stage)));
}
/** Read one script by file name. */
function loadAttackFile(fileName) {
    const path = (0, path_1.join)(PATTERN_DIR, fileName);
    const parsed = JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
    if (!parsed.name) {
        parsed.name = fileName.replace(/\.json$/, '');
    }
    return parsed;
}
/**
 * The script for a Challenge stage, resolving DOWNWARD to the nearest stage
 * that has one - which is how the pressure changes in steps while the health
 * parameters change every stage.
 */
function loadChallengeAttack(difficulty, stage) {
    for (let candidate = stage; candidate >= 1; candidate--) {
        if (hasChallengeFile(difficulty, candidate)) {
            return loadAttackFile((0, challenge_mode_1.attackFileName)(difficulty, candidate));
        }
    }
    throw new Error(`no attack file for challenge difficulty ${difficulty}`);
}
/**
 * The Training scripts: the named punching bags, without the Challenge stages.
 */
function listTrainingPatterns() {
    return (0, fs_1.readdirSync)(PATTERN_DIR)
        .filter((name) => name.endsWith('.json') && !name.startsWith('challenge-'))
        .sort();
}
//# sourceMappingURL=attack-patterns.js.map