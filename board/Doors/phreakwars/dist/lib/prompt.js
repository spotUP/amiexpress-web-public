/**
 * Read one line, echoing as the player types, and hand the door's keystroke
 * loop back its handler afterwards.
 *
 * The prompt is NOT passed to `getLine`: this door prints every row through
 * `say()`, which wraps to the caller's width (a C64 has forty columns), and
 * `getLine`'s own prompt path would bypass that.
 */
export async function readLine(ctx, maxLength) {
    const bbs = ctx.bbs;
    if (!bbs || typeof bbs.getLine !== 'function') {
        throw new Error('[PhreakWars] no BBS line reader on the door context');
    }
    const session = ctx.bbsSession;
    const loopHandler = session?.doorInputHandler;
    try {
        return await bbs.getLine(undefined, maxLength);
    }
    finally {
        if (session)
            session.doorInputHandler = loopHandler;
    }
}
