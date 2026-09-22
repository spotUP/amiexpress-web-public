/**
 * Mail Composer - ANSI Message Editor
 *
 * Uses the ANSIEditor widget directly (same as the ansi-editor door) with
 * message recipient/subject header bolted on. Draw ANSI art and send it
 * as messages to other users.
 */
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import { Textbox, Box, Text, List, AutocompleteTextbox, Message } from '@amiexpress/bbs-door-sdk';
import { ANSIEditor } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createScreen, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { T, S, CURRENT, applyTheme } from './door-theme';
import { headerDialog, noticeWidth, headerHints } from './layout';
import { attachDoorChrome, footerStyle } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
const door = new Door({
    name: 'Mail Composer',
    version: '2.0.0',
    author: 'AmiExpress-Web',
    description: 'ANSI editor for composing BBS messages',
});
let activeScreen = null;
let inputManager = null;
door.onStart(async (ctx) => {
    const { bbs, user, output } = ctx;
    const username = user?.username || 'Guest';
    // Before any widget is built: T and S are live bindings, so every style
    // object below reads the caller's theme rather than the classic default.
    applyTheme(bbs);
    const screen = createScreen(bbs, { title: 'Mail Composer' });
    screen.program.write('\x1b[2J');
    screen.program.write('\x1b[H');
    screen.clearRegion(0, screen.width, 0, screen.height);
    screen.alloc();
    activeScreen = screen;
    inputManager = new DoorInputManager(ctx, screen, {
        enableGrabKeys: true,
        enableMouse: true,
    });
    inputManager.enable();
    output.write('\x1b[2J\x1b[H');
    /*
     * THE BOARD'S CHROME, not just its colours.
     *
     * Sysop, 2026-09-03: "only colors makes no great theme". A door that takes
     * the theme takes the masthead, the rail, the glitch and the footer from
     * the one SDK entry point, so it cannot drift from the next door -
     * `theme-chrome-wiring.test.ts` is the pin, and it is what caught this door
     * the moment it started importing the theme.
     *
     * Two one-row strips at the very top and bottom: the composer's own box is
     * centred and 12 rows tall, so it never reaches either of them.
     */
    const chromeTop = new Box({
        parent: screen,
        top: 0,
        left: 0,
        width: '100%',
        height: 1,
        content: '',
        style: { fg: T.dim, bg: T.ground },
    });
    const chromeFooter = new Box({
        parent: screen,
        bottom: 0,
        left: 0,
        width: '100%',
        height: 1,
        content: '',
        style: footerStyle(CURRENT),
    });
    const chrome = attachDoorChrome(CURRENT, {
        width: screen.width || 80,
        title: 'MAIL COMPOSER',
        masthead: chromeTop,
        footer: chromeFooter,
        hints: [
            { key: 'Tab', does: 'next field' },
            { key: 'ESC', does: 'cancel' },
        ],
        footerPad: ' ',
        styles: S,
        render: () => screen.render(),
    });
    const runComposer = async () => {
        try {
            await showComposer(screen, bbs, username, ctx);
        }
        finally {
            // Stop the rail/glitch timer BEFORE the screen goes, or it renders
            // into a destroyed screen on the way out.
            try {
                chrome.stop();
            }
            catch { /* leaving anyway */ }
            if (inputManager)
                inputManager.disable();
            inputManager = null;
            activeScreen = null;
            screen.destroy();
        }
    };
    void runComposer();
});
door.onInput(async (_ctx, key) => {
    if (activeScreen && key.raw) {
        activeScreen.program.emit('data', key.raw);
    }
});
async function showComposer(screen, bbs, username, ctx) {
    const params = bbs?.getParams?.() || [];
    const recipient = params[0] || '';
    const subject = params[1] || '';
    const draft = await loadDraft(username, ctx);
    // Get usernames for autocomplete in header
    let usernames = [];
    try {
        if (bbs?.getUserList) {
            const users = await bbs.getUserList();
            usernames = users.map((u) => u.username || u.name || u).filter(Boolean);
        }
    }
    catch {
        // Autocomplete will just be empty
    }
    // Show header editor first (To/Subject with autocomplete)
    const headerInfo = await showHeaderEditor(screen, recipient, subject, draft, usernames);
    if (!headerInfo) {
        ctx.close();
        return;
    }
    // Autosave interval handle
    let autosaveInterval = null;
    return new Promise((resolve) => {
        // Create the full ANSIEditor widget - same as the ansi-editor door
        const editor = new ANSIEditor({
            parent: screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            title: `To: ${headerInfo.to} | ${headerInfo.subject}`,
            initialContent: draft?.content || '',
            initialMode: 'draw',
            showLineNumbers: false,
            showMenuBar: true,
            showToolbar: true,
            showSidebar: true,
            showStatusBar: true,
            // View > Theme, from the editor widget: the writer can change the
            // board's colours without abandoning a half-written message.
            themeHost: ctx.bbs,
            // Save = save draft
            onSave: async (content) => {
                await saveDraft(username, {
                    to: headerInfo.to,
                    subject: headerInfo.subject,
                    content,
                    savedAt: new Date(),
                }, ctx);
                return true;
            },
            // Exit = show send/draft/discard dialog
            onExit: () => {
                handleExit();
            },
        });
        // Autosave every 5 minutes
        autosaveInterval = setInterval(async () => {
            const content = editor.getContent();
            if (content.trim()) {
                await saveDraft(username, {
                    to: headerInfo.to,
                    subject: headerInfo.subject,
                    content,
                    savedAt: new Date(),
                }, ctx);
            }
        }, 5 * 60 * 1000);
        screen.render();
        async function handleExit() {
            if (autosaveInterval) {
                clearInterval(autosaveInterval);
                autosaveInterval = null;
            }
            const content = editor.getContent();
            if (content.trim()) {
                const action = await confirmExitAction(screen);
                if (action === 'send') {
                    const success = await sendMessage(bbs, {
                        from: username,
                        to: headerInfo.to,
                        subject: headerInfo.subject,
                        content,
                    });
                    if (success) {
                        await showMsg(screen, 'Message Sent!', 'Your message has been sent successfully.');
                        await clearDraft(username, ctx);
                    }
                    else {
                        await showMsg(screen, 'Send Failed', 'Failed to send message. Draft has been saved.');
                        await saveDraft(username, {
                            to: headerInfo.to,
                            subject: headerInfo.subject,
                            content,
                            savedAt: new Date(),
                        }, ctx);
                    }
                    editor.destroy();
                    ctx.close();
                    resolve();
                }
                else if (action === 'draft') {
                    await saveDraft(username, {
                        to: headerInfo.to,
                        subject: headerInfo.subject,
                        content,
                        savedAt: new Date(),
                    }, ctx);
                    await showMsg(screen, 'Draft Saved', 'Your message has been saved as a draft.');
                    editor.destroy();
                    ctx.close();
                    resolve();
                }
                else if (action === 'discard') {
                    await clearDraft(username, ctx);
                    editor.destroy();
                    ctx.close();
                    resolve();
                }
                // 'cancel' - do nothing, return to editor
            }
            else {
                editor.destroy();
                ctx.close();
                resolve();
            }
        }
    });
}
/**
 * Show header editor (To, Subject) with username autocomplete
 */
async function showHeaderEditor(screen, initialTo, initialSubject, draft, usernames = []) {
    return new Promise((resolve) => {
        /*
         * Sized to the screen - `./layout.ts`. A seventy-column dialog on a C64
         * puts its right border, and the buttons anchored to it, off the glass.
         */
        const dialog = headerDialog(screen.width, screen.height);
        const container = new Box({
            parent: screen,
            top: 'center',
            left: 'center',
            width: dialog.width,
            height: dialog.height,
            border: S.frame.border,
            style: S.frame.style,
            label: ` ${S.accentAlt('New Message')} `,
            shadow: true,
        });
        new Text({
            parent: container,
            top: 1,
            left: 2,
            content: S.accent('To:') + (usernames.length > 0 ? ' ' + S.dim('(type to search users)') : ''),
        });
        const toInput = new AutocompleteTextbox({
            parent: container,
            top: 2,
            left: 2,
            width: dialog.inner,
            height: 1,
            inputOnFocus: true,
            mouse: true,
            keys: true,
            value: draft?.to || initialTo,
            style: {
                fg: T.selectionInk,
                bg: T.selectionBg,
            },
            suggestions: usernames,
            minLength: 1,
            maxSuggestions: 8,
            caseInsensitive: true,
            popupHeight: 10,
        });
        toInput.on('select', () => {
            // After selecting from autocomplete dropdown, advance to subject
            subjectInput.focus();
            currentIndex = 1;
            screen.render();
        });
        toInput.on('submit', () => {
            // Enter on To field (no popup) -> advance to subject
            subjectInput.focus();
            currentIndex = 1;
            screen.render();
        });
        new Text({
            parent: container,
            top: 4,
            left: 2,
            content: S.accent('Subject:'),
        });
        const subjectInput = new Textbox({
            parent: container,
            top: 5,
            left: 2,
            width: dialog.inner,
            height: 1,
            inputOnFocus: true,
            mouse: true,
            keys: true,
            value: draft?.subject || initialSubject,
            style: {
                fg: T.selectionInk,
                bg: T.selectionBg,
            },
        });
        new Text({
            parent: container,
            bottom: 1,
            left: 2,
            // The words shorten at forty columns, never the keys: a caller who
            // cannot see `ESC` has lost the way out of the box (`./layout.ts`).
            content: headerHints(screen.width).map(h => `${S.key(h.key)}: ${h.does}`).join('  '),
            style: { fg: T.accentAlt },
        });
        const inputs = [toInput, subjectInput];
        let currentIndex = 0;
        container.key(['tab'], () => {
            currentIndex = (currentIndex + 1) % inputs.length;
            inputs[currentIndex].focus();
            screen.render();
        });
        subjectInput.key(['enter'], () => {
            const to = toInput.getValue().trim();
            const subj = subjectInput.getValue().trim();
            if (!to) {
                toInput.focus();
                screen.render();
                return;
            }
            container.destroy();
            resolve({ to, subject: subj || '(no subject)' });
        });
        container.key(['escape'], () => {
            container.destroy();
            resolve(null);
        });
        if (toInput.getValue()) {
            subjectInput.focus();
        }
        else {
            toInput.focus();
        }
        screen.render();
    });
}
/**
 * Confirm exit action (send/draft/discard/cancel)
 */
async function confirmExitAction(screen) {
    return new Promise((resolve) => {
        const exitDialog = headerDialog(screen.width, screen.height);
        const box = new Box({
            parent: screen,
            top: 'center',
            left: 'center',
            width: Math.min(60, exitDialog.width),
            height: exitDialog.height,
            border: 'line',
            style: { ...S.frame.style, border: { fg: T.accent } },
            label: ` ${S.accent('Exit Editor')} `,
            shadow: true,
        });
        new Text({
            parent: box,
            top: 1,
            left: 2,
            right: 2,
            content: S.accentAlt('What would you like to do?'),
        });
        const list = new List({
            parent: box,
            top: 3,
            left: 2,
            right: 2,
            height: 4,
            items: ['Send message', 'Save as draft', 'Discard changes', 'Cancel'],
            keys: true,
            mouse: true,
            vi: true,
            style: {
                selected: { bg: T.selectionBg, fg: T.selectionInk, bold: true },
                item: { fg: T.ink },
            },
        });
        list.on('select', (_item, index) => {
            box.destroy();
            screen.render();
            const actions = ['send', 'draft', 'discard', 'cancel'];
            resolve(actions[index]);
        });
        list.key(['escape'], () => {
            box.destroy();
            screen.render();
            resolve('cancel');
        });
        list.focus();
        screen.render();
    });
}
async function showMsg(screen, title, message) {
    return new Promise((resolve) => {
        const msg = new Message({
            parent: screen,
            top: 'center',
            left: 'center',
            width: noticeWidth(screen.width),
            height: 'shrink',
            border: 'line',
            style: S.frame.style,
            label: ` ${S.accentAlt(title)} `,
            shadow: true,
        });
        msg.display(message + '\n\n' + S.dim('Press any key to continue...'), () => {
            msg.destroy();
            screen.render();
            resolve();
        });
        screen.render();
    });
}
async function loadDraft(username, ctx) {
    return ctx.storage.load(`draft_${username}.json`);
}
async function saveDraft(username, draft, ctx) {
    await ctx.storage.save(`draft_${username}.json`, draft);
}
async function clearDraft(username, ctx) {
    if (await ctx.storage.exists(`draft_${username}.json`)) {
        await ctx.storage.delete(`draft_${username}.json`);
    }
}
async function sendMessage(bbs, message) {
    try {
        await bbs.postMessage(message.to, message.subject, message.content);
        // Board webhooks the sysop subscribed to `door_announcement`
        // (web/backend/src/services/bbs-event-emitter.ts) - the same bridge
        // grandmaster's score broadcast uses. Best-effort: the mail is sent,
        // an announcement is never worth a crash.
        try {
            bbs.emitCustomEvent?.('mail_sent', `Sent mail to ${message.to} "${message.subject}"`, { to: message.to, subject: message.subject });
        }
        catch (announceErr) {
            console.error('Failed to announce mail event:', announceErr);
        }
        return true;
    }
    catch (error) {
        console.error('Failed to send message:', error);
        return false;
    }
}
export default door;
