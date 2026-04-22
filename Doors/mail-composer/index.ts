/**
 * Mail Composer - ANSI Message Editor
 *
 * Uses the ANSIEditor widget directly (same as the ansi-editor door) with
 * message recipient/subject header bolted on. Draw ANSI art and send it
 * as messages to other users.
 */

import { CoreDoor as Door, type DoorContext, type KeyPress } from '@amiexpress/bbs-door-sdk';
import { Screen, Textbox, Box, Text, List, AutocompleteTextbox, Message } from '@amiexpress/bbs-door-sdk';
import { ANSIEditor } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createScreen, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

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

  const screen = createScreen(bbs, { title: 'Mail Composer' });
  activeScreen = screen;

  inputManager = new DoorInputManager(ctx as any, screen, {
    enableGrabKeys: true,
    enableMouse: true,
  });
  inputManager.enable();

  output.write('\x1b[2J\x1b[H');

  const runComposer = async () => {
    try {
      await showComposer(screen, bbs, username, ctx);
    } finally {
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

  return new Promise<void>((resolve) => {
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
          } else {
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
        } else if (action === 'draft') {
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
        } else if (action === 'discard') {
          await clearDraft(username, ctx);
          editor.destroy();
          ctx.close();
          resolve();
        }
        // 'cancel' - do nothing, return to editor
      } else {
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
async function showHeaderEditor(
  screen: any,
  initialTo: string,
  initialSubject: string,
  draft?: MessageDraft,
  usernames: string[] = []
): Promise<{ to: string; subject: string } | null> {
  return new Promise((resolve) => {
    const container = new Box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 70,
      height: 12,
      border: 'line',
      style: {
        border: { fg: 'cyan' },
      },
      label: ' {cyan-fg}New Message{/} ',
      shadow: true,
    });

    new Text({
      parent: container,
      top: 1,
      left: 2,
      content: '{yellow-fg}To:{/}' + (usernames.length > 0 ? ' {gray-fg}(type to search users){/}' : ''),
    });

    const toInput = new AutocompleteTextbox({
      parent: container,
      top: 2,
      left: 2,
      width: 64,
      height: 1,
      inputOnFocus: true,
      mouse: true,
      keys: true,
      value: draft?.to || initialTo,
      style: {
        fg: 'white',
        bg: 'blue',
      },
      suggestions: usernames,
      minLength: 1,
      maxSuggestions: 8,
      caseInsensitive: true,
      popupHeight: 10,
    });

    toInput.on('select', () => {
      screen.render();
    });

    new Text({
      parent: container,
      top: 4,
      left: 2,
      content: '{yellow-fg}Subject:{/}',
    });

    const subjectInput = new Textbox({
      parent: container,
      top: 5,
      left: 2,
      width: 64,
      height: 1,
      inputOnFocus: true,
      mouse: true,
      keys: true,
      value: draft?.subject || initialSubject,
      style: {
        fg: 'white',
        bg: 'blue',
      },
    });

    new Text({
      parent: container,
      bottom: 1,
      left: 2,
      content: '{gray-fg}Tab{/}: Next field  {gray-fg}Enter{/}: Continue  {gray-fg}ESC{/}: Cancel',
      style: { fg: 'cyan' },
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
    const box = new Box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 12,
      border: 'line',
      style: { border: { fg: 'yellow' } },
      label: ' {yellow-fg}Exit Editor{/} ',
      shadow: true,
    });

    new Text({
      parent: box,
      top: 1,
      left: 2,
      right: 2,
      content: '{cyan-fg}What would you like to do?{/}',
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
        selected: { bg: 'blue', fg: 'white', bold: true },
        item: { fg: 'white' },
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
      width: '50%',
      height: 'shrink',
      border: 'line',
      style: { border: { fg: 'cyan' } },
      label: ` {cyan-fg}${title}{/} `,
      shadow: true,
    });

    msg.display(message + '\n\n{gray-fg}Press any key to continue...{/}', () => {
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
    return true;
  } catch (error) {
    console.error('Failed to send message:', error);
    return false;
  }
}

export default door;
