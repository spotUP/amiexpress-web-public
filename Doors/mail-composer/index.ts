/**
 * Mail Composer - the message editor, in whichever art the caller's terminal
 * speaks.
 *
 * It has always been the ANSIEditor widget with a recipient/subject header
 * bolted on - the same widget the ansi-editor door hosts. A PETSCII caller
 * could not reach it at all: the door gated at eighty columns, and an ANSI
 * canvas is not a C64 screen anyway.
 *
 * So the widget is chosen by the terminal, the way this board chooses
 * everything else a caller authors: `PetsciiEditor` for a C64, `ANSIEditor`
 * for everyone else, one door and one command. The ANSI path is untouched.
 *
 * WHAT A PETSCII MESSAGE IS. Not a `.seq` - a message body is TEXT, and the
 * board carries authored PETSCII as glyph and pen markers precisely because
 * every ESC is stripped out of a message before it is stored. So the body is
 * `editor.toPua()`, which an eighty-column reader gets folded to Unicode
 * blocks in the same colours.
 */

import { CoreDoor as Door, type DoorContext, type KeyPress } from '@amiexpress/bbs-door-sdk';
import { Screen, Textbox, Box, Text, List, AutocompleteTextbox, Message } from '@amiexpress/bbs-door-sdk';
import { ANSIEditor, PetsciiEditor } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createScreen, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { T, S, CURRENT, applyTheme } from './door-theme';
import { headerDialog, noticeWidth, headerHints } from './layout';
import { attachDoorChrome, footerStyle } from '@amiexpress/bbs-door-sdk/engines/ui/theme';

interface MessageDraft {
  to?: string;
  subject?: string;
  content: string;
  savedAt: Date;
}

const door = new Door({
  name: 'Mail Composer',
  version: '2.0.0',
  author: 'AmiExpress-Web',
  description: 'ANSI editor for composing BBS messages',
});

let activeScreen: Screen | null = null;
let inputManager: DoorInputManager | null = null;

door.onStart(async (ctx: DoorContext) => {
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

  inputManager = new DoorInputManager(ctx as any, screen, {
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
    width: (screen as any).width || 80,
    title: 'MAIL COMPOSER',
    masthead: chromeTop as any,
    footer: chromeFooter as any,
    hints: [
      { key: 'Tab', does: 'next field' },
      { key: 'ESC', does: 'cancel' },
    ],
    footerPad: ' ',
    styles: S,
    render: () => screen.render(),
  } as never);

  const runComposer = async () => {
    try {
      await showComposer(screen, bbs, username, ctx);
    } finally {
      // Stop the rail/glitch timer BEFORE the screen goes, or it renders
      // into a destroyed screen on the way out.
      try { chrome.stop(); } catch { /* leaving anyway */ }
      if (inputManager) inputManager.disable();
      inputManager = null;
      activeScreen = null;
      screen.destroy();
    }
  };

  void runComposer();
});

door.onInput(async (_ctx: DoorContext, key: KeyPress) => {
  if (activeScreen && key.raw) {
    activeScreen.program.emit('data', key.raw);
  }
});

async function showComposer(screen: any, bbs: any, username: string, ctx: DoorContext): Promise<void> {
  const params = bbs?.getParams?.() || [];
  const recipient = params[0] || '';
  const subject = params[1] || '';

  const draft = await loadDraft(username, ctx);

  // Get usernames for autocomplete in header
  let usernames: string[] = [];
  try {
    if (bbs?.getUserList) {
      const users = await bbs.getUserList();
      usernames = users.map((u: any) => u.username || u.name || u).filter(Boolean);
    }
  } catch {
    // Autocomplete will just be empty
  }

  // Show header editor first (To/Subject with autocomplete)
  const headerInfo = await showHeaderEditor(screen, recipient, subject, draft, usernames);
  if (!headerInfo) {
    ctx.close();
    return;
  }

  // Autosave interval handle
  let autosaveInterval: ReturnType<typeof setInterval> | null = null;

  /*
   * WHICH EDITOR THIS CALLER GETS.
   *
   * One door, a renderer per terminal. A C64 draws PETSCII and everyone else
   * draws ANSI; the header, the drafts and the send path below do not care
   * which, because both hand back a string and that string is the body.
   */
  const petscii = (bbs as any).isPetsciiMode?.() === true;

  return new Promise<void>((resolve) => {
    if (petscii) {
      buildPetsciiComposer();
      return;
    }

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
      themeHost: (ctx as any).bbs,

      // Save = save draft
      onSave: async (content: string) => {
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
      await finishWith(editor.getContent(), () => editor.destroy());
    }

    /**
     * Send, keep or throw away - the same three answers whichever editor drew
     * the body.
     *
     * It takes the CONTENT rather than reading it, because an ANSI body is
     * `getContent()` and a PETSCII one is `toPua()`; everything after that
     * sentence is identical, and was worth not having twice.
     */
    async function finishWith(content: string, destroyEditor: () => void) {
      if (autosaveInterval) {
        clearInterval(autosaveInterval);
        autosaveInterval = null;
      }

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
          } else {
            await showMsg(screen, 'Send Failed', 'Failed to send message. Draft has been saved.');
            await saveDraft(username, {
              to: headerInfo.to,
              subject: headerInfo.subject,
              content,
              savedAt: new Date(),
            }, ctx);
          }
          destroyEditor();
          ctx.close();
          resolve();
        } else if (action === 'draft') {
          await saveDraft(username, {
            to: headerInfo.to,
            subject: headerInfo.subject,
            content,
            savedAt: new Date(),
          }, ctx);
          await showMsg(screen, 'Draft Saved', 'Your message has been saved as a draft.');
          destroyEditor();
          ctx.close();
          resolve();
        } else if (action === 'discard') {
          await clearDraft(username, ctx);
          destroyEditor();
          ctx.close();
          resolve();
        }
        // 'cancel' - do nothing, return to editor
      } else {
        destroyEditor();
        ctx.close();
        resolve();
      }
    }

    /**
     * THE SAME COMPOSER, DRAWN ON A C64.
     *
     * Forty columns by twenty-five is the whole of the caller's glass, so
     * there is no sidebar and no menu bar: the canvas is the message, F5 keeps
     * a draft and Escape asks what to do with it. The body is authored text -
     * glyph and pen markers - which is the form a message and a chat line both
     * carry, and which an eighty-column reader gets folded to Unicode.
     */
    function buildPetsciiComposer(): void {
      const keep = async (): Promise<void> => {
        await saveDraft(username, {
          to: headerInfo.to,
          subject: headerInfo.subject,
          content: editor.toPua(),
          savedAt: new Date(),
        }, ctx);
      };

      /*
       * A MESSAGE HAS TO SAY HOW TO SEND IT.
       *
       * The first cut handed the caller a bare canvas with no menu and no
       * hooks, so File > Leave did nothing and the only way out was a key
       * nothing told him about - "ae opens the normal petscii editor? how do
       * i send my message?" (the sysop, 2026-09-23).
       *
       * So the composer gives the editor its own menu - Send, Save as draft,
       * Discard - and shows the menu bar even on a C64, where the studio
       * hides it. One row of the picture is what a caller pays for being able
       * to send what he drew.
       */
      const messageMenu = {
        label: 'Message',
        items: [
          { label: 'Send it', action: () => { void finish('send'); } },
          { label: 'Save as a draft', action: () => { void finish('draft'); } },
          { label: 'Throw it away', action: () => { void finish('discard'); } },
        ],
      };

      const editor: any = new PetsciiEditor({
        parent: screen,
        top: 0,
        left: 0,
        width: screen.width,
        height: screen.height,
        /*
         * THE SAME EDITOR THE STUDIO GIVES, not a stripped one.
         *
         * The first cut asked for the menu bar and the status line only, so a
         * caller composing a message had no character picker and no colour
         * row - "the ae is not on par with petscii-edit no panels etc" (the
         * sysop, 2026-09-23). Both doors host the same widget; they should
         * hand the caller the same tools. F2 takes the lot away when he wants
         * the whole screen for the picture.
         */
        showMenuBar: true,
        showToolbar: true,
        showTools: true,
        showStatusBar: true,
        hostMenus: [messageMenu],
        // A message is SENT, not saved to a file. Without this the bar led
        // with File > Open / Save as / Leave and, at forty columns, had no
        // room left for the menu that actually sends anything.
        showFileMenu: false,
        onSave: () => { void keep(); },
        onExit: () => { void finishWith(editor.toPua(), () => editor.destroy()); },
        onHelp: () => { void showMsg(screen, 'Sending', 'Escape asks whether to send, keep or throw away.\nF5 shows the menu bar, which has the same three.'); },
      } as any);

      /** Send, keep or throw away, straight from the menu. */
      async function finish(action: 'send' | 'draft' | 'discard'): Promise<void> {
        const content = editor.toPua();
        if (action === 'draft') {
          await keep();
          await showMsg(screen, 'Draft Saved', 'Your message has been saved as a draft.');
          editor.destroy();
          ctx.close();
          resolve();
          return;
        }
        if (action === 'discard') {
          await clearDraft(username, ctx);
          editor.destroy();
          ctx.close();
          resolve();
          return;
        }
        const sent = await sendMessage(bbs, {
          from: username,
          to: headerInfo.to,
          subject: headerInfo.subject,
          content,
        });
        if (sent) {
          await showMsg(screen, 'Message Sent!', 'Your message has been sent successfully.');
          await clearDraft(username, ctx);
        } else {
          await showMsg(screen, 'Send Failed', 'Failed to send message. Draft has been saved.');
          await keep();
        }
        editor.destroy();
        ctx.close();
        resolve();
      }

      if (draft?.content) editor.fromPua(draft.content);
      editor.focus();
      (bbs as any).enableMouseEvents?.();

      autosaveInterval = setInterval(() => {
        if (editor.toPua().trim()) void keep();
      }, 5 * 60 * 1000);

      // Escape asks the same three questions the ANSI path asks.
      screen.key(['escape'], () => {
        void finishWith(editor.toPua(), () => editor.destroy());
      });

      screen.render();
    }
  });
}

/**
 * Show header editor (To, Subject) with username autocomplete
 */
async function showHeaderEditor(
  screen: any,
  initialTo: string,
  initialSubject: string,
  draft?: MessageDraft,
  usernames: string[] = []
): Promise<{ to: string; subject: string } | null> {
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
      /*
       * HEIGHT 1, OR IT EATS THE DIALOG.
       *
       * A `Text` with no height fills its parent, and a later sibling paints
       * its blanks over everything already there. The hint row at the foot of
       * this box is built LAST, so it covered the To and Subject labels and
       * both inputs: the caller saw a titled frame with one line of key hints
       * and nowhere to type ("missing inputs for receiver etc?", the sysop,
       * 2026-09-23). Every label here is one row and now says so.
       */
      height: 1,
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
      /*
       * A FIELD A C64 CAN SEE.
       *
       * `selectionInk on selectionBg` is white on blue, and a PETSCII cell
       * has ONE colour - the background is dropped - so an empty field was a
       * blank line on a black screen with nothing to say "type here". Black
       * ink on a coloured ground is the one pairing that survives: the
       * transducer renders it as a filled bar in that colour, which is how
       * the board's own menu bar stays visible on a C64.
       */
      style: {
        fg: T.ground,
        bg: T.chrome,
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
      height: 1,
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
      /*
       * A FIELD A C64 CAN SEE.
       *
       * `selectionInk on selectionBg` is white on blue, and a PETSCII cell
       * has ONE colour - the background is dropped - so an empty field was a
       * blank line on a black screen with nothing to say "type here". Black
       * ink on a coloured ground is the one pairing that survives: the
       * transducer renders it as a filled bar in that colour, which is how
       * the board's own menu bar stays visible on a C64.
       */
      style: {
        fg: T.ground,
        bg: T.chrome,
      },
    });

    new Text({
      parent: container,
      bottom: 1,
      left: 2,
      height: 1,
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
    } else {
      toInput.focus();
    }
    screen.render();
  });
}

/**
 * Confirm exit action (send/draft/discard/cancel)
 */
async function confirmExitAction(screen: any): Promise<'send' | 'draft' | 'discard' | 'cancel'> {
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

    list.on('select', (_item: any, index: number) => {
      box.destroy();
      screen.render();
      const actions = ['send', 'draft', 'discard', 'cancel'] as const;
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

async function showMsg(screen: any, title: string, message: string): Promise<void> {
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

async function loadDraft(username: string, ctx: DoorContext): Promise<MessageDraft | null> {
  return ctx.storage.load<MessageDraft>(`draft_${username}.json`);
}

async function saveDraft(username: string, draft: MessageDraft, ctx: DoorContext): Promise<void> {
  await ctx.storage.save(`draft_${username}.json`, draft);
}

async function clearDraft(username: string, ctx: DoorContext): Promise<void> {
  if (await ctx.storage.exists(`draft_${username}.json`)) {
    await ctx.storage.delete(`draft_${username}.json`);
  }
}

async function sendMessage(
  bbs: any,
  message: { from: string; to: string; subject: string; content: string }
): Promise<boolean> {
  try {
    await bbs.postMessage(message.to, message.subject, message.content);
    // Board webhooks the sysop subscribed to `door_announcement`
    // (web/backend/src/services/bbs-event-emitter.ts) - the same bridge
    // grandmaster's score broadcast uses. Best-effort: the mail is sent,
    // an announcement is never worth a crash.
    try {
      bbs.emitCustomEvent?.(
        'mail_sent',
        `Sent mail to ${message.to} "${message.subject}"`,
        { to: message.to, subject: message.subject },
      );
    } catch (announceErr) {
      console.error('Failed to announce mail event:', announceErr);
    }
    return true;
  } catch (error) {
    console.error('Failed to send message:', error);
    return false;
  }
}

export default door;
