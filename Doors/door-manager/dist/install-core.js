"use strict";
/**
 * The install core: turning an archive into an installed door.
 *
 * Extracted from app.ts, which had grown past the repo's 2000-line ceiling.
 * Nothing here touches the UI - it is the part of installing that both owner
 * mode and consumer mode share, and the part worth testing directly.
 *
 * installConsumerDoor and the command-collision guard moved here from app.ts
 * the second time it crossed that ceiling: consumer mode's orchestrator
 * belongs beside the extract/register core it delegates to, not in the file
 * that draws the panels. app.ts re-exports all of it, so its importers and
 * tests are unaffected.
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
exports.buildDoorInfoContent = buildDoorInfoContent;
exports.extractArchiveTo = extractArchiveTo;
exports.findExtractedBinary = findExtractedBinary;
exports.extractAndRegisterDoor = extractAndRegisterDoor;
exports.commandClaimedByOtherArchive = commandClaimedByOtherArchive;
exports.installConsumerDoor = installConsumerDoor;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const archive_command_1 = require("./archive-command");
const archive_layout_1 = require("./archive-layout");
/**
 * The backend's shared archive extractor, if it is loaded in this process.
 *
 * DOORMAN cannot import web/backend source paths, so it reaches the
 * already-loaded module through require.cache - the same discovery the
 * catalog service and the stripper use.
 */
function getExtractorFactory() {
    for (const k of Object.keys(require.cache))
        if (k.includes('archive-extractor'))
            return require.cache[k]?.exports ?? null;
    return null;
}
/** Content of the .info-style command config written on install. Pure and
 * exported for testing: door_type must flow through as TYPE= (a FIM door
 * force-typed XIM at install time simply won't run under the FIM engine).
 *
 * `access` is NEGATIVE by default, and that is not the same as 0: a negative
 * value writes NO ACCESS tooltype at all, which is the only correct way to
 * install a door everyone may run. express.e:4703 reads
 *
 *     IF access=0 THEN RETURN TRUE
 *
 * and that TRUE is RESULT_NOT_ALLOWED (axenums.e:23) - so `ACCESS=0` DENIES
 * a door to everybody on a real AmiExpress. This function wrote it on every
 * install. It is benign on amiexpress-web, whose runCommand treats 0 as "no
 * restriction" (command-execution.handler.ts), which is why it went
 * unnoticed here - but every .info DOORMAN has ever written is wrong on the
 * board it was modelled on. The C door was fixed the same way on
 * 2026-08-31 (flow_build_info_content); this is the other half.
 *
 * 255 is unaffected and still means sysop-only: express.e:4704 is
 * `IF (access>acsLevel)`, which is what the disable path relies on.
 */
function buildDoorInfoContent(doorType, cmd, binaryRel, access = -1) {
    const accessLine = access >= 0 ? `ACCESS=${access}\n` : '';
    return `TYPE=${doorType}\nLOCATION=Doors:${cmd}/${binaryRel}\nSTACK=65536\n${accessLine}`;
}
/**
 * Extract every file in an archive into destDir, preserving the archive's
 * internal directory structure. Portable — uses the backend's shared
 * extractor factory (pure-JS LHA, WASM LZX, etc.) instead of the native
 * `lha` CLI, so it works the same on macOS dev machines and the Linux
 * container on the live server.
 */
async function extractArchiveTo(archivePath, destDir) {
    const factory = getExtractorFactory();
    if (!factory?.getExtractorForFile) {
        return { ok: false, fileCount: 0, error: 'Extractor unavailable in this process' };
    }
    let extractor;
    try {
        extractor = await factory.getExtractorForFile(archivePath);
    }
    catch (err) {
        return { ok: false, fileCount: 0, error: `Extractor init failed: ${err.message}` };
    }
    if (!extractor)
        return { ok: false, fileCount: 0, error: 'Unsupported archive format' };
    let entries;
    try {
        entries = await extractor.getEntries(archivePath);
    }
    catch (err) {
        return { ok: false, fileCount: 0, error: `Could not read archive: ${err.message}` };
    }
    if (!entries.length)
        return { ok: false, fileCount: 0, error: 'Archive is empty or unreadable' };
    const destRoot = path.normalize(destDir + path.sep);
    let written = 0;
    for (const entry of entries) {
        if (!entry.name)
            continue;
        // The pure-JS LHA reader emits Amiga-style directory-separated names
        // with '\' (its "directory" extended header joins path segments with
        // 0xFF, which the parser renders as a literal backslash) — normalize
        // to '/' so path.join/dirname treat it as real subdirectories on every
        // OS instead of writing one file with a literal backslash in its name.
        const entryPath = entry.name.replace(/\\/g, '/');
        if (entryPath.endsWith('/'))
            continue; // directory marker, nothing to write
        let data = null;
        try {
            data = await extractor.extractFile(archivePath, entry.name);
        }
        catch { /* skip unreadable member, keep going */ }
        if (!data)
            continue;
        const outPath = path.normalize(path.join(destDir, entryPath));
        if (!outPath.startsWith(destRoot))
            continue; // zip-slip guard
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, data);
        written++;
    }
    return written > 0
        ? { ok: true, fileCount: written }
        : { ok: false, fileCount: 0, error: 'No files could be extracted' };
}
/**
 * Archives (especially FAME door packs) often nest the actual door binary
 * several directories deep (e.g. "add_2_fame/doors/5d/5d!sysop/5d!sysop").
 * The catalog only stores the binary's basename, so after extraction we
 * search the extracted tree for a case-insensitive match rather than
 * assuming it landed at the archive root. Returns a path relative to
 * destDir (posix-style, for use in an AmigaDOS LOCATION= line).
 */
function findExtractedBinary(destDir, binaryName) {
    if (!binaryName)
        return null;
    const target = binaryName.toLowerCase();
    const stack = [destDir];
    while (stack.length) {
        const dir = stack.pop();
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                stack.push(full);
                continue;
            }
            if (e.name.toLowerCase() === target) {
                return path.relative(destDir, full).split(path.sep).join('/');
            }
        }
    }
    return null;
}
/**
 * Move a freshly extracted door to the command the archive names.
 *
 * Returns the new directory, or null when the target already exists - an
 * existing install is never overwritten by a rename.
 */
function renameInstallDir(installDir, command) {
    if (!(0, archive_command_1.isUsableCommand)(command))
        return null;
    const target = path.join(path.dirname(installDir), command);
    if (target === installDir)
        return installDir;
    if (fs.existsSync(target))
        return null;
    try {
        fs.renameSync(installDir, target);
        return target;
    }
    catch {
        return null;
    }
}
/** Where a command's icon belongs on the board. */
function commandIconDir(bbsRoot, kind) {
    return path.join(bbsRoot, 'Commands', kind);
}
/**
 * Install an archive that is an overlay of the BBS (see archive-layout.ts):
 * its Doors/<Name>/ goes to BBS:Doors/<Name>/ under the author's own name,
 * every command icon in it to its own Commands directory, byte for byte.
 * That is what the author's install text asks the sysop to do by hand, and
 * it is what makes the icon's LOCATION true.
 *
 * Returns null when the archive is not an overlay (the caller carries on with
 * the flat install). Otherwise the whole outcome - and a door whose binary is
 * not there when it is done is a FAILED install that leaves nothing behind,
 * not a success the sysop finds out about at the first run.
 */
async function installOverlayDoor(installDir, doorType, fileCount, deps, archiveName, steps) {
    if (!fs.existsSync(installDir))
        return null; // nothing extracted to look at
    const bbsRoot = path.resolve(installDir, '..', '..');
    // Out of the way first: the archive's own Doors/<Name> may be called
    // exactly what the caller named this directory.
    const staging = `${installDir}.staging`;
    fs.rmSync(staging, { recursive: true, force: true });
    fs.renameSync(installDir, staging);
    let overlay = null;
    try {
        overlay = (0, archive_layout_1.findOverlay)(staging);
        if (overlay && !overlay.commands.some((c) => (0, archive_layout_1.overlayBinaryFor)(overlay, c)))
            overlay = null;
    }
    finally {
        if (!overlay)
            fs.renameSync(staging, installDir);
    }
    if (!overlay)
        return null;
    const fail = (step, detail) => {
        steps.push({ kind: 'fail', text: detail });
        return { ok: false, step, detail, steps };
    };
    const movedDirs = [];
    const copiedInfos = [];
    const rollBack = () => {
        for (const info of copiedInfos)
            fs.rmSync(info, { force: true });
        for (const dir of movedDirs)
            fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(staging, { recursive: true, force: true });
    };
    try {
        const doorsRoot = path.join(bbsRoot, 'Doors');
        for (const dir of overlay.doorDirs) {
            const target = path.join(doorsRoot, path.basename(dir));
            if (fs.existsSync(target)) {
                fs.rmSync(staging, { recursive: true, force: true });
                return fail('conflict', `Doors/${path.basename(dir)} already exists - not overwritten`);
            }
        }
        for (const dir of overlay.doorDirs) {
            const target = path.join(doorsRoot, path.basename(dir));
            fs.renameSync(dir, target);
            movedDirs.push(target);
            steps.push({ kind: 'ok', text: `Doors/${path.basename(dir)}/ installed under the archive's own name` });
        }
        const installed = [];
        for (const command of overlay.commands) {
            const dir = commandIconDir(bbsRoot, command.kind);
            const target = path.join(dir, `${command.command}.info`);
            if (fs.existsSync(target)) {
                steps.push({ kind: 'skip', text: `Commands/${command.kind}/${command.command}.info already exists - kept` });
                continue;
            }
            fs.mkdirSync(dir, { recursive: true });
            fs.copyFileSync(command.infoPath, target);
            copiedInfos.push(target);
            installed.push({ ...command, infoPath: target });
            steps.push({ kind: 'ok', text: `installed Commands/${command.kind}/${command.command}.info` });
        }
        if (installed.length === 0) {
            rollBack();
            return fail('conflict', 'every command this archive installs already exists - nothing installed');
        }
        // Every icon has to lead to a program that is there.
        const good = [];
        let firstBinary = null;
        let firstDoorDir = null;
        let firstType = null;
        for (const command of installed) {
            const location = (0, archive_layout_1.readTooltype)(command.infoPath, 'LOCATION');
            const rel = location ? (0, archive_layout_1.locationUnderDoors)(location) : null;
            if (!rel) {
                fs.rmSync(command.infoPath, { force: true });
                steps.push({ kind: 'skip', text: `${command.command}.info has no usable LOCATION - not installed` });
                continue;
            }
            let found = (0, archive_layout_1.resolveInsensitive)(doorsRoot, rel);
            if (!found) {
                const dir = (0, archive_layout_1.resolveInsensitive)(doorsRoot, path.posix.dirname(rel));
                const variant = dir ? (0, archive_layout_1.cpuVariantOf)(dir, path.posix.basename(rel)) : null;
                if (dir && variant) {
                    fs.copyFileSync(path.join(dir, variant), path.join(dir, path.posix.basename(rel)));
                    found = path.join(dir, path.posix.basename(rel));
                    steps.push({ kind: 'ok', text: `${path.posix.basename(rel)} is ${variant}, the build for every 68000` });
                }
            }
            if (!found) {
                // One icon that leads nowhere does not sink the others; it is not
                // installed, and the log says so.
                fs.rmSync(command.infoPath, { force: true });
                steps.push({ kind: 'skip', text: `${command.command}.info points at Doors:${rel}, which the archive does not contain - not installed` });
                continue;
            }
            good.push(command);
            firstBinary ?? (firstBinary = rel);
            firstDoorDir ?? (firstDoorDir = rel.split('/')[0]);
            firstType ?? (firstType = (0, archive_layout_1.readTooltype)(command.infoPath, 'TYPE'));
        }
        fs.rmSync(staging, { recursive: true, force: true });
        const primary = good.find((c) => c.kind === 'BBSCmd') ?? good[0];
        const extras = good.filter((c) => c !== primary || c.kind !== 'BBSCmd').map((c) => c.infoPath);
        try {
            deps.recordInstall(primary.command, `Doors/${firstDoorDir}`, archiveName, { files: extras, wroteCommandIcon: true });
            steps.push({ kind: 'ok', text: `recorded the install as ${primary.command}` });
        }
        catch (err) {
            steps.push({ kind: 'skip', text: `install record not written: ${err?.message ?? err}` });
            console.log(`[DOORMAN] install failed: record-install: ${err?.message ?? err}`);
        }
        if (await deps.refreshDoorRegistry()) {
            steps.push({ kind: 'ok', text: 'door registry reloaded' });
        }
        else {
            steps.push({ kind: 'skip', text: 'registry refresh unavailable - the door is hidden until the BBS restarts' });
        }
        return {
            ok: true, doorType: (firstType || doorType || 'XIM').toUpperCase(), fileCount,
            binaryRel: firstBinary, steps,
        };
    }
    catch (err) {
        rollBack();
        return fail('overlay', err?.message ?? String(err));
    }
}
async function extractAndRegisterDoor(archivePath, installDir, infoPath, doorType, binaryName, finalCmd, deps, archiveName) {
    const steps = [];
    let command = finalCmd;
    let targetDir = installDir;
    let targetInfoPath = infoPath;
    const result = await deps.extractArchiveTo(archivePath, installDir);
    if (!result.ok) {
        steps.push({ kind: 'fail', text: `extract ${path.basename(archivePath)}: ${result.error ?? 'unknown error'}` });
        return { ok: false, step: 'extract', detail: result.error ?? 'unknown error', steps };
    }
    steps.push({ kind: 'ok', text: `extracted ${result.fileCount} files to ${installDir}` });
    // An archive that is an overlay of the BBS installs as one.
    const overlayOutcome = await installOverlayDoor(installDir, doorType, result.fileCount, deps, archiveName, steps);
    if (overlayOutcome)
        return overlayOutcome;
    // The archive names its own command. An AmiExpress door ships
    // Commands/BBSCmd/<COMMAND>.info, and that file carries the tooltypes the
    // door was built with - TYPE, LOCATION, STACK, PRIORITY, NAME. Asking the
    // sysop to type a command instead is how a door ends up installed under a
    // name it does not answer to, and writing a fresh four-line .info is how
    // STACK and PRIORITY get lost.
    const fromArchive = (0, archive_command_1.findArchiveCommand)(installDir);
    if (fromArchive.chosen && fromArchive.chosen.command.toUpperCase() !== finalCmd.toUpperCase()) {
        const renamed = renameInstallDir(installDir, fromArchive.chosen.command);
        if (renamed) {
            steps.push({
                kind: 'ok',
                text: `the archive installs as ${fromArchive.chosen.command}, not ${finalCmd}`,
            });
            command = fromArchive.chosen.command;
            targetDir = renamed;
            targetInfoPath = path.join(path.dirname(infoPath), `${command}.info`);
        }
        else {
            steps.push({
                kind: 'skip',
                text: `archive names ${fromArchive.chosen.command}; kept ${finalCmd} (that directory already exists)`,
            });
        }
    }
    for (const other of fromArchive.others) {
        steps.push({ kind: 'skip', text: `archive also carries the command ${other}` });
    }
    const resolvedDoorType = doorType || 'XIM';
    const binaryRel = deps.findExtractedBinary(targetDir, binaryName) ?? (binaryName ?? command);
    steps.push({ kind: 'ok', text: `binary ${binaryRel}, type ${resolvedDoorType}` });
    try {
        // Prefer the archive's own icon: it is the door author's configuration,
        // tooltypes and all. Only fall back to a synthesised one when the
        // archive has none.
        const archiveInfo = fromArchive.chosen
            ? (0, archive_command_1.findArchiveCommand)(targetDir).chosen ?? fromArchive.chosen
            : null;
        if (archiveInfo && fs.existsSync(archiveInfo.infoPath)) {
            fs.copyFileSync(archiveInfo.infoPath, targetInfoPath);
            steps.push({ kind: 'ok', text: `installed the archive's own ${command}.info` });
        }
        else {
            deps.writeInfoFile(targetInfoPath, buildDoorInfoContent(resolvedDoorType, command, binaryRel));
            steps.push({ kind: 'ok', text: `wrote ${targetInfoPath}` });
        }
    }
    catch (err) {
        steps.push({ kind: 'fail', text: `write ${targetInfoPath}: ${err?.message ?? err}` });
        return { ok: false, step: 'write-info', detail: `${targetInfoPath}: ${err?.message ?? err}`, steps };
    }
    try {
        deps.recordInstall(command, `Doors/${command}`, archiveName);
        steps.push({ kind: 'ok', text: `recorded the install as ${command}` });
    }
    catch (err) {
        steps.push({ kind: 'skip', text: `install record not written: ${err?.message ?? err}` });
        // The door is on disk and the .info is written — it will run. The
        // install just won't show as installed locally. Surface it but don't
        // roll back a working install over a bookkeeping error.
        console.log(`[DOORMAN] install failed: record-install: ${err?.message ?? err}`);
    }
    const refreshed = await deps.refreshDoorRegistry();
    if (refreshed) {
        steps.push({ kind: 'ok', text: 'door registry reloaded' });
    }
    else {
        steps.push({ kind: 'skip', text: 'registry refresh unavailable - the door is hidden until the BBS restarts' });
        console.log('[DOORMAN] warning: door registry refresh unavailable — new door hidden until BBS restart');
    }
    return { ok: true, doorType: resolvedDoorType, fileCount: result.fileCount, binaryRel, steps };
}
// ─── Consumer-mode install (moved from app.ts) ─────────────────────────
// True when `command` is already claimed by a DIFFERENT archive -- guards
// both install call sites against recordInstall's ON CONFLICT(command)
// upsert silently stealing another install's row.
function commandClaimedByOtherArchive(getInstallByCommand, command, archiveName) {
    const collision = getInstallByCommand(command);
    if (!collision || collision.archive_name === archiveName)
        return false;
    console.log(`[DOORMAN] install: "${command}" already installed from a different archive ` +
        `(${collision.archive_name}) -- not clobbering it; ${archiveName} installs registry-only.`);
    return true;
}
async function installConsumerDoor(cfg, archiveName, doorType, binaryName, finalCmd, installDir, infoPath, tmpDir, deps) {
    const destPath = path.join(tmpDir, archiveName);
    try {
        deps.mkdir(tmpDir);
        let manifest;
        try {
            ({ manifest } = await deps.fetchManifest(cfg));
        }
        catch (err) {
            // This is a SEPARATE fetch from whatever populated the browse list
            // (loadConsumerManifest, on view enter) -- normally a cheap 304 off
            // repo-client's ETag cache, but if the on-disk cache file is gone or
            // the network is down at this exact moment, an install that would
            // otherwise have succeeded (the sysop already saw this door in the
            // browse list moments ago) fails here instead. Said plainly, not
            // just via repo-client's raw error text.
            return {
                ok: false, step: 'manifest-lookup',
                detail: `could not re-fetch the central manifest to verify this download ` +
                    `(browsing and installing re-fetch independently -- this can fail even ` +
                    `right after a successful browse if the network or manifest cache ` +
                    `dropped out in between): ${err?.message ?? String(err)}`,
            };
        }
        const manifestRow = manifest.doors.find(d => d.archiveName === archiveName);
        if (!manifestRow || !manifestRow.sha256) {
            return { ok: false, step: 'manifest-lookup', detail: `No sha256 for ${archiveName} in the central manifest` };
        }
        try {
            await deps.downloadArchive(cfg, archiveName, destPath, manifestRow.sha256);
        }
        catch (err) {
            return { ok: false, step: 'download', detail: err?.message ?? String(err) };
        }
        let registeredLocally = false;
        const localRow = deps.lookupLocal(archiveName);
        // The manifest has no version; GET /doors/:archiveName does. The
        // archive is already downloaded and verified at this point, so a
        // detail fetch that fails or times out costs the record one field
        // rather than the install.
        let detail = null;
        if (deps.fetchDoorDetail) {
            try {
                detail = await deps.fetchDoorDetail(cfg, archiveName);
            }
            catch {
                detail = null;
            }
        }
        const outcome = await extractAndRegisterDoor(destPath, installDir, infoPath, doorType, binaryName, finalCmd, {
            extractArchiveTo: deps.extractArchiveTo,
            findExtractedBinary: deps.findExtractedBinary,
            writeInfoFile: deps.writeInfoFile,
            refreshDoorRegistry: deps.refreshDoorRegistry,
            recordInstall: (installedCmd, installedDir, archive, extras) => {
                // installedCmd, not finalCmd: the archive may name its own command,
                // and the record has to describe what is actually on disk.
                if (!extras?.wroteCommandIcon && commandClaimedByOtherArchive(deps.getInstallByCommand, installedCmd, archive))
                    return;
                deps.recordInstall({
                    id: `install-${installedCmd}`,
                    catalog_id: localRow?.id ?? null,
                    archive_name: archive,
                    command: installedCmd,
                    install_dir: installedDir,
                    door_type: doorType || 'XIM',
                    name: manifestRow.name ?? archive,
                    md5: manifestRow.md5 ?? null,
                    description: manifestRow.description ?? null,
                    category: manifestRow.category ?? null,
                    version: detail?.version ?? null, // only the detail endpoint carries a version
                    release_group: manifestRow.releaseGroup ?? null,
                    source_url: cfg.url, // the resolved URL actually used, not the possibly-unset raw env var
                    source_revision: manifest.revision ?? null, // the revision this install actually came from
                    extra_files: extras?.files,
                });
                registeredLocally = true;
            },
        }, archiveName);
        if (!outcome.ok)
            return outcome;
        return { ok: true, doorType: outcome.doorType, fileCount: outcome.fileCount, binaryRel: outcome.binaryRel, steps: outcome.steps, registeredLocally };
    }
    finally {
        deps.unlink(destPath);
    }
}
//# sourceMappingURL=install-core.js.map