"use strict";
/**
 * PETSCII Studio - the ANSI editor door, forked into a C64 art editor.
 *
 * Fork lineage, as asked for: `Doors/ansi-editor/index.ts` by way of
 * `Doors/sprite-editor/index.ts`, which is the same wrapper. Everything lives
 * inside the fork - one full-screen editor with its requesters - and the
 * editor itself is the SDK's `PetsciiEditor`, so the mail composer can host
 * the same one for a caller writing a message.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PetsciiStudioDoor = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const studio_1 = require("./studio");
Object.defineProperty(exports, "PetsciiStudioDoor", { enumerable: true, get: function () { return studio_1.PetsciiStudioDoor; } });
const door = new bbs_door_sdk_1.CoreDoor({
    name: 'PETSCII Studio',
    version: '1.0.0',
    description: 'PETSCII art editor - draw a C64 screen from the BBS',
    author: 'AmiExpress BBS',
});
let app = null;
door.onStart(async (ctx) => {
    app = new studio_1.PetsciiStudioDoor();
    app.setContext(ctx);
    await app.start();
});
door.onClose(async () => {
    app?.destroy();
    app = null;
});
door.onError(async (ctx, error) => {
    ctx.output.writeLine(`\r\n\x1b[31mError in PETSCII Studio: ${error.message}\x1b[0m\r\n`);
});
exports.default = door;
