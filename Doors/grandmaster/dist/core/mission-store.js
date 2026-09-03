"use strict";
/**
 * MISSION mode - where packs live, and how a sysop's pack gets written.
 *
 * The door ships one pack as content (`assets/missions/starter.json`, which
 * is tracked and reaches the board with the door). A pack a SYSOP writes
 * cannot live there: assets/ is part of the door's checkout, and the Doors
 * volume sync only ever adds files, so an edit made on the board would be
 * overwritten by the next deploy and a new file would outlive the door that
 * created it. Sysop packs go to the door's data directory instead, which is
 * runtime state and is exactly what it is for.
 *
 * Both are offered. A pack is only ever accepted through parseMissionPack -
 * the same loader the shipped pack goes through - so an editor cannot write
 * a pack the player would be unable to finish.
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
exports.MissionPackError = void 0;
exports.packFileName = packFileName;
exports.sysopPackDir = sysopPackDir;
exports.listPacks = listPacks;
exports.saveSysopPack = saveSysopPack;
exports.deleteSysopPack = deleteSysopPack;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const mission_pack_1 = require("./mission-pack");
Object.defineProperty(exports, "MissionPackError", { enumerable: true, get: function () { return mission_pack_1.MissionPackError; } });
/** File name rules: a pack the sysop names must not become a path. */
function packFileName(name) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `${slug || 'pack'}.json`;
}
/** Where a sysop's packs are kept. */
function sysopPackDir(dataDir) {
    return path.join(dataDir, 'missions');
}
/**
 * Every pack this board can offer, shipped first.
 *
 * A pack that will not parse is skipped rather than thrown: one bad file a
 * sysop is halfway through writing must not take MISSION mode away from
 * every player. The reason comes back in `problems` so it can be shown.
 */
function listPacks(doorRoot, dataDir) {
    const packs = [];
    const problems = [];
    const read = (file, origin) => {
        try {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            packs.push({ pack: (0, mission_pack_1.parseMissionPack)(raw, path.basename(file)), file, origin });
        }
        catch (error) {
            problems.push(`${path.basename(file)}: ${error.message}`);
        }
    };
    const shipped = path.join(doorRoot, 'assets', 'missions', 'starter.json');
    if (fs.existsSync(shipped))
        read(shipped, 'shipped');
    const dir = sysopPackDir(dataDir);
    if (fs.existsSync(dir)) {
        for (const entry of fs.readdirSync(dir).sort()) {
            if (entry.toLowerCase().endsWith('.json'))
                read(path.join(dir, entry), 'sysop');
        }
    }
    return { packs, problems };
}
/**
 * Write a sysop's pack.
 *
 * Validated first, through the loader the game uses: a pack that would be
 * rejected on load is rejected here, where the sysop is still looking at it
 * and can fix it. Returns the file it was written to.
 */
function saveSysopPack(dataDir, pack) {
    // Round-trip it: what is written must be what the game will accept, and
    // parseMissionPack is the only thing that decides that.
    const checked = (0, mission_pack_1.parseMissionPack)(JSON.parse(JSON.stringify(pack)), pack.name);
    const dir = sysopPackDir(dataDir);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, packFileName(checked.name));
    // Written whole and replaced, not appended: a half-written pack is a pack
    // that will not parse, and the reader above would drop it silently.
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(checked, null, 2)}\n`, 'utf8');
    fs.renameSync(temporary, file);
    return file;
}
/** Remove a sysop's pack. The shipped one is content and is not deletable. */
function deleteSysopPack(dataDir, name) {
    const file = path.join(sysopPackDir(dataDir), packFileName(name));
    if (!fs.existsSync(file))
        return false;
    fs.unlinkSync(file);
    return true;
}
//# sourceMappingURL=mission-store.js.map