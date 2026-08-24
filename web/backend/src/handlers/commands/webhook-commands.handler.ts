import { Socket } from 'socket.io';
import { db } from '../../database';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { PermissionsUtil } from '../../utils/permissions.util';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { webhookService, WebhookTrigger } from '../../services/webhook.service';
import { MenuUtil, MenuItem, MenuState } from '../../utils/menu.util';

/**
 * Webhook Commands Handler
 * Handles the WEBHOOK admin command for managing Discord/Slack webhooks
 * Features arrow-key navigation for improved UX
 */

export class WebhookCommandsHandler {
  /**
   * Main WEBHOOK command - displays webhook management menu with arrow navigation
   */
  static async handleWebhookCommand(socket: any, session: any): Promise<void> {
    // Check sysop permission
    if (!PermissionsUtil.isSysop(session.user)) {
      return ErrorHandler.permissionDenied(socket, 'manage webhooks', {
        nextState: LoggedOnSubState.DISPLAY_MENU
      });
    }

    // Define menu items
    const menuItems: MenuItem[] = [
      { label: 'List Webhooks', action: 'list', description: 'View all configured webhooks' },
      { label: 'Add Webhook', action: 'add', description: 'Create a new webhook' },
      { label: 'Edit Webhook', action: 'edit', description: 'Modify an existing webhook' },
      { label: 'Delete Webhook', action: 'delete', description: 'Remove a webhook' },
      { label: 'Test Webhook', action: 'test', description: 'Send a test notification' },
      { label: 'Show Triggers', action: 'triggers', description: 'View available event triggers' },
      { label: 'Quit', action: 'quit', description: 'Return to main menu' }
    ];

    // Initialize menu state
    session.tempData = {
      webhookMenu: {
        selectedIndex: 0,
        items: menuItems
      }
    };

    // Render menu
    const menuState: MenuState = {
      title: 'WEBHOOK MANAGEMENT',
      items: menuItems,
      selectedIndex: 0
    };

    socket.emit('ansi-output', MenuUtil.renderMenu(menuState));

    // Set state to wait for menu input
    session.subState = LoggedOnSubState.FILE_DIR_SELECT;
  }

  /**
   * Handle webhook menu input with arrow key support
   */
  static async handleWebhookMenuInput(socket: any, session: any, input: string): Promise<void> {
    const menuData = session.tempData.webhookMenu;

    // Handle arrow keys and enter
    const result = MenuUtil.handleMenuInput(input, menuData.selectedIndex, menuData.items.length);

    // Update selection index
    menuData.selectedIndex = result.newIndex;

    // Handle actions
    if (result.action === 'select') {
      // Enter pressed - execute selected action
      const selectedItem = menuData.items[menuData.selectedIndex];
      await this.executeMenuAction(socket, session, selectedItem.action);
    } else if (result.action === 'quit') {
      // Q or ESC pressed - quit to main menu
      delete session.tempData;
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
    } else if (result.action?.startsWith('hotkey:')) {
      // Hotkey pressed - find matching item
      const hotkey = result.action.split(':')[1];
      const item = menuData.items.find((i: any) => i.label[0].toUpperCase() === hotkey);
      if (item) {
        await this.executeMenuAction(socket, session, item.action);
      } else {
        // Redraw menu (arrow key navigation)
        const menuState: MenuState = {
          title: 'WEBHOOK MANAGEMENT',
          items: menuData.items,
          selectedIndex: menuData.selectedIndex
        };
        socket.emit('ansi-output', MenuUtil.renderMenu(menuState));
      }
    } else {
      // Just selection changed - redraw menu
      const menuState: MenuState = {
        title: 'WEBHOOK MANAGEMENT',
        items: menuData.items,
        selectedIndex: menuData.selectedIndex
      };
      socket.emit('ansi-output', MenuUtil.renderMenu(menuState));
    }
  }

  /**
   * Execute selected menu action
   */
  private static async executeMenuAction(socket: any, session: any, action: string): Promise<void> {
    switch (action) {
      case 'list':
        await this.listWebhooks(socket, session);
        break;
      case 'add':
        await this.addWebhookPrompt(socket, session);
        break;
      case 'edit':
        await this.editWebhookSelectPrompt(socket, session);
        break;
      case 'delete':
        await this.deleteWebhookSelectPrompt(socket, session);
        break;
      case 'test':
        await this.testWebhookSelectPrompt(socket, session);
        break;
      case 'triggers':
        await this.showTriggers(socket, session);
        break;
      case 'quit':
        delete session.tempData;
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        break;
    }
  }

  /**
   * List all webhooks with arrow selection
   */
  private static async listWebhooks(socket: any, session: any): Promise<void> {
    const webhooks = await db.getWebhooks();

    socket.emit('ansi-output', AnsiUtil.clearScreen());
    socket.emit('ansi-output', AnsiUtil.headerBox('WEBHOOKS'));
    socket.emit('ansi-output', '\r\n');

    if (webhooks.length === 0) {
      socket.emit('ansi-output', AnsiUtil.warning('No webhooks configured.\r\n'));
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = { returnToWebhookMenu: true };
      return;
    }

    // Create menu items from webhooks
    const menuItems: MenuItem[] = webhooks.map(webhook => {
      const status = webhook.enabled ? '\x1b[32m[ON]\x1b[0m' : '\x1b[31m[OFF]\x1b[0m';
      const typeIcon = webhook.type === 'discord' ? '💬' : '📢';
      return {
        label: `[${webhook.id}] ${webhook.name} ${status}`,
        action: `select:${webhook.id}`,
        description: `${webhook.type.toUpperCase()} | ${webhook.triggers.length} triggers`
      };
    });

    menuItems.push({ label: 'Back', action: 'back', description: 'Return to main menu' });

    // Initialize selection state
    session.tempData = {
      webhookListMenu: {
        selectedIndex: 0,
        items: menuItems,
        webhooks
      }
    };

    // Render menu
    const menuState: MenuState = {
      title: 'WEBHOOKS',
      items: menuItems,
      selectedIndex: 0,
      footer: 'Use ↑↓ arrows to navigate, ENTER to select, Q to quit'
    };

    socket.emit('ansi-output', MenuUtil.renderMenu(menuState));
    session.subState = LoggedOnSubState.FILE_DIR_SELECT;
  }

  /**
   * Handle webhook list selection
   */
  static async handleWebhookListInput(socket: any, session: any, input: string): Promise<void> {
    const menuData = session.tempData.webhookListMenu;

    // Handle arrow keys and enter
    const result = MenuUtil.handleMenuInput(input, menuData.selectedIndex, menuData.items.length);

    // Update selection index
    menuData.selectedIndex = result.newIndex;

    if (result.action === 'select') {
      const selectedItem = menuData.items[menuData.selectedIndex];

      if (selectedItem.action === 'back') {
        await this.handleWebhookCommand(socket, session);
      } else {
        // Show webhook details/actions menu
        const webhookId = parseInt(selectedItem.action.split(':')[1]);
        await this.showWebhookActions(socket, session, webhookId);
      }
    } else if (result.action === 'quit') {
      await this.handleWebhookCommand(socket, session);
    } else {
      // Redraw menu with updated selection
      const menuState: MenuState = {
        title: 'WEBHOOKS',
        items: menuData.items,
        selectedIndex: menuData.selectedIndex,
        footer: 'Use ↑↓ arrows to navigate, ENTER to select, Q to quit'
      };
      socket.emit('ansi-output', MenuUtil.renderMenu(menuState));
    }
  }

  /**
   * Show actions for a specific webhook
   */
  static async showWebhookActions(socket: any, session: any, webhookId: number): Promise<void> {
    const webhook = await db.getWebhook(webhookId);
    if (!webhook) {
      socket.emit('ansi-output', AnsiUtil.errorLine('Webhook not found'));
      await this.listWebhooks(socket, session);
      return;
    }

    socket.emit('ansi-output', AnsiUtil.clearScreen());
    socket.emit('ansi-output', AnsiUtil.headerBox(`WEBHOOK: ${webhook.name}`));
    socket.emit('ansi-output', '\r\n');

    // Show webhook details
    socket.emit('ansi-output', `\x1b[36mID:\x1b[0m ${webhook.id}\r\n`);
    socket.emit('ansi-output', `\x1b[36mName:\x1b[0m ${webhook.name}\r\n`);
    socket.emit('ansi-output', `\x1b[36mType:\x1b[0m ${webhook.type.toUpperCase()}\r\n`);
    socket.emit('ansi-output', `\x1b[36mURL:\x1b[0m ${webhook.url.substring(0, 60)}${webhook.url.length > 60 ? '...' : ''}\r\n`);
    socket.emit('ansi-output', `\x1b[36mStatus:\x1b[0m ${webhook.enabled ? '\x1b[32mENABLED\x1b[0m' : '\x1b[31mDISABLED\x1b[0m'}\r\n`);
    socket.emit('ansi-output', `\x1b[36mTriggers:\x1b[0m ${webhook.triggers.length > 0 ? webhook.triggers.join(', ') : 'None'}\r\n`);
    socket.emit('ansi-output', '\r\n');

    // Actions menu
    const menuItems: MenuItem[] = [
      { label: webhook.enabled ? 'Disable' : 'Enable', action: 'toggle', description: 'Toggle webhook on/off' },
      { label: 'Test', action: 'test', description: 'Send test notification' },
      { label: 'Delete', action: 'delete', description: 'Remove this webhook' },
      { label: 'Back', action: 'back', description: 'Return to webhook list' }
    ];

    session.tempData = {
      webhookActionsMenu: {
        selectedIndex: 0,
        items: menuItems,
        webhookId,
        webhook
      }
    };

    const menuState: MenuState = {
      title: 'ACTIONS',
      items: menuItems,
      selectedIndex: 0
    };

    socket.emit('ansi-output', MenuUtil.renderMenu(menuState));
    session.subState = LoggedOnSubState.FILE_DIR_SELECT;
  }

  /**
   * Handle webhook actions menu input
   */
  static async handleWebhookActionsInput(socket: any, session: any, input: string): Promise<void> {
    const menuData = session.tempData.webhookActionsMenu;

    const result = MenuUtil.handleMenuInput(input, menuData.selectedIndex, menuData.items.length);
    menuData.selectedIndex = result.newIndex;

    if (result.action === 'select') {
      const selectedItem = menuData.items[menuData.selectedIndex];

      switch (selectedItem.action) {
        case 'toggle':
          await db.updateWebhook(menuData.webhookId, { enabled: !menuData.webhook.enabled });
          socket.emit('ansi-output', AnsiUtil.successLine('Webhook updated!'));
          await this.listWebhooks(socket, session);
          break;

        case 'test':
          socket.emit('ansi-output', AnsiUtil.warning('Sending test notification...\r\n'));
          const result = await webhookService.testWebhook(menuData.webhookId);
          if (result.success) {
            socket.emit('ansi-output', AnsiUtil.successLine('Test notification sent successfully!'));
          } else {
            socket.emit('ansi-output', AnsiUtil.errorLine(`Test failed: ${result.error}`));
          }
          socket.emit('ansi-output', '\r\n');
          socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
          session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
          session.tempData = { returnToWebhookActionMenu: menuData };
          break;

        case 'delete':
          await db.deleteWebhook(menuData.webhookId);
          socket.emit('ansi-output', AnsiUtil.successLine('Webhook deleted!'));
          await this.listWebhooks(socket, session);
          break;

        case 'back':
          await this.listWebhooks(socket, session);
          break;
      }
    } else if (result.action === 'quit') {
      await this.listWebhooks(socket, session);
    } else {
      // Redraw menu
      const menuState: MenuState = {
        title: 'ACTIONS',
        items: menuData.items,
        selectedIndex: menuData.selectedIndex
      };
      socket.emit('ansi-output', MenuUtil.renderMenu(menuState));
    }
  }

  /**
   * Every trigger this door can fire a webhook on. Shared by "Show
   * Triggers" (read-only display) and the Add Webhook triggers picker
   * (arrow-key multi-select) so the two never drift out of sync - this
   * list previously lived only inline in showTriggers() and silently
   * omitted DOOR_SCORE (the trigger GrandMaster and other score/match
   * doors actually use), which meant a sysop reading the menu had no
   * way to discover the one trigger name they were most likely to want.
   */
  private static readonly ALL_TRIGGERS: { name: string; desc: string }[] = [
    { name: WebhookTrigger.NEW_UPLOAD, desc: 'New file upload' },
    { name: WebhookTrigger.NEW_MESSAGE, desc: 'New message posted' },
    { name: WebhookTrigger.NEW_USER, desc: 'New user registration' },
    { name: WebhookTrigger.SYSOP_PAGED, desc: 'Sysop page request' },
    { name: WebhookTrigger.USER_LOGIN, desc: 'User login' },
    { name: WebhookTrigger.USER_LOGOUT, desc: 'User logout' },
    { name: WebhookTrigger.FILE_DOWNLOADED, desc: 'File downloaded' },
    { name: WebhookTrigger.COMMENT_POSTED, desc: 'Comment to sysop' },
    { name: WebhookTrigger.NODE_FULL, desc: 'All nodes busy' },
    { name: WebhookTrigger.SYSTEM_ERROR, desc: 'System error occurred' },
    { name: WebhookTrigger.CONFERENCE_JOINED, desc: 'Conference joined' },
    { name: WebhookTrigger.SECURITY_CHANGED, desc: 'Security level changed' },
    { name: WebhookTrigger.DOOR_LAUNCHED, desc: 'Door program launched' },
    { name: WebhookTrigger.VOTE_CAST, desc: 'Vote cast' },
    { name: WebhookTrigger.PRIVATE_MESSAGE, desc: 'Private message sent' },
    { name: WebhookTrigger.USER_KICKED, desc: 'User kicked/banned' },
    { name: WebhookTrigger.MAIL_SCAN, desc: 'Mail scan performed' },
    { name: WebhookTrigger.DOOR_SCORE, desc: 'Door score or match result submitted' }
  ];

  /**
   * Show available triggers
   */
  private static async showTriggers(socket: any, session: any): Promise<void> {
    socket.emit('ansi-output', AnsiUtil.clearScreen());
    socket.emit('ansi-output', AnsiUtil.headerBox('AVAILABLE WEBHOOK TRIGGERS'));
    socket.emit('ansi-output', '\r\n');

    for (const trigger of this.ALL_TRIGGERS) {
      socket.emit('ansi-output', AnsiUtil.complexPrompt([
        { text: '  • ', color: 'cyan' },
        { text: trigger.name, color: 'yellow' },
        { text: ' - ', color: 'white' },
        { text: trigger.desc + '\r\n', color: 'white' }
      ]));
    }

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = { returnToWebhookMenu: true };
  }

  /**
   * Prompt to add a new webhook (text input)
   */
  private static async addWebhookPrompt(socket: any, session: any): Promise<void> {
    socket.emit('ansi-output', AnsiUtil.clearScreen());
    socket.emit('ansi-output', AnsiUtil.headerBox('ADD WEBHOOK'));
    socket.emit('ansi-output', '\r\n');

    socket.emit('ansi-output', 'Webhook Name: ');
    // FILE_DIR_SELECT rather than READ_COMMAND, matching every other
    // free-text prompt in this codebase (see account.handler.ts) - keeps
    // this out of READ_COMMAND's own command-line semantics (history
    // navigation, syscmd dispatch, etc). The actual per-keystroke line
    // buffering for this flow lives in command.handler.ts's
    // `tempData?.webhookAdd` dispatch (same accumulate-until-Enter pattern
    // GDPR_BACKFILL uses) - reset here in case session.inputBuffer has
    // leftover content from an unrelated earlier prompt.
    session.subState = LoggedOnSubState.FILE_DIR_SELECT;
    session.inputBuffer = '';
    session.tempData = { webhookAdd: { step: 'name' } };
  }

  /**
   * Handle add webhook input flow (text input for details)
   */
  static async handleAddWebhookInput(socket: any, session: any, input: string): Promise<void> {
    const step = session.tempData.webhookAdd.step;

    if (step === 'name') {
      if (input.trim().length === 0) {
        socket.emit('ansi-output', AnsiUtil.errorLine('Name cannot be empty'));
        await this.handleWebhookCommand(socket, session);
        return;
      }
      session.tempData.webhookAdd.name = input.trim();
      socket.emit('ansi-output', '\r\nWebhook URL: ');
      session.tempData.webhookAdd.step = 'url';
    } else if (step === 'url') {
      if (input.trim().length === 0 || !input.includes('http')) {
        socket.emit('ansi-output', AnsiUtil.errorLine('Invalid URL'));
        await this.handleWebhookCommand(socket, session);
        return;
      }
      // Type and triggers are arrow-key pickers, not free text - see
      // addWebhookTypeSelectPrompt()/addWebhookTriggersSelectPrompt()
      // below. Carries name/url forward since this is still one
      // continuous "add webhook" flow, just switching input styles.
      await this.addWebhookTypeSelectPrompt(socket, session, session.tempData.webhookAdd.name, input.trim());
    }
  }

  /**
   * Step 3 of Add Webhook: pick Discord or Slack with an arrow-key menu
   * instead of typing the exact word - same MenuUtil pattern the main
   * WEBHOOK menu already uses, so the whole flow feels consistent rather
   * than switching between "arrow menu" and "type this exact string" for
   * no reason a sysop would know from the prompt alone.
   */
  private static async addWebhookTypeSelectPrompt(socket: any, session: any, name: string, url: string): Promise<void> {
    const menuItems: MenuItem[] = [
      { label: 'Discord', action: 'discord', description: 'Post to a Discord channel webhook' },
      { label: 'Slack', action: 'slack', description: 'Post to a Slack incoming webhook' }
    ];

    session.tempData = {
      webhookAddTypeSelect: { selectedIndex: 0, items: menuItems, name, url }
    };

    const menuState: MenuState = {
      title: 'WEBHOOK TYPE',
      items: menuItems,
      selectedIndex: 0
    };
    socket.emit('ansi-output', MenuUtil.renderMenu(menuState));
    session.subState = LoggedOnSubState.FILE_DIR_SELECT;
  }

  /**
   * Handle arrow-key input for the type picker.
   */
  static async handleAddWebhookTypeSelectInput(socket: any, session: any, input: string): Promise<void> {
    const menuData = session.tempData.webhookAddTypeSelect;
    const result = MenuUtil.handleMenuInput(input, menuData.selectedIndex, menuData.items.length);
    menuData.selectedIndex = result.newIndex;

    if (result.action === 'select') {
      const type = menuData.items[menuData.selectedIndex].action;
      await this.addWebhookTriggersSelectPrompt(socket, session, menuData.name, menuData.url, type);
    } else if (result.action === 'quit') {
      await this.handleWebhookCommand(socket, session);
    } else {
      const menuState: MenuState = { title: 'WEBHOOK TYPE', items: menuData.items, selectedIndex: menuData.selectedIndex };
      socket.emit('ansi-output', MenuUtil.renderMenu(menuState));
    }
  }

  /**
   * Builds the trigger picker's menu items fresh from the current
   * selection set on every render - two trailing control rows
   * ("Select All" and "Create Webhook") ride the same arrow-key list
   * rather than needing a separate confirm keystroke.
   */
  private static buildTriggerMenuItems(selected: Set<string>): MenuItem[] {
    const items: MenuItem[] = this.ALL_TRIGGERS.map(t => ({
      label: `${selected.has(t.name) ? '[x]' : '[ ]'} ${t.name}`,
      action: `toggle:${t.name}`,
      description: t.desc
    }));
    const allSelected = selected.size === this.ALL_TRIGGERS.length;
    items.push({
      label: `${allSelected ? '[x]' : '[ ]'} Select All`,
      action: 'select-all',
      description: 'Toggle every trigger at once'
    });
    items.push({
      label: `>> Create Webhook (${selected.size} trigger${selected.size === 1 ? '' : 's'} selected)`,
      action: 'confirm',
      description: 'Finish and save this webhook'
    });
    return items;
  }

  private static renderTriggersMenu(socket: any, selected: Set<string>, selectedIndex: number): void {
    const items = this.buildTriggerMenuItems(selected);
    const menuState: MenuState = {
      title: 'SELECT TRIGGERS',
      items,
      selectedIndex,
      footer: 'Use ↑↓ arrows to navigate, ENTER to toggle/select, Q to cancel'
    };
    socket.emit('ansi-output', MenuUtil.renderMenu(menuState));
  }

  /**
   * Step 4 of Add Webhook: multi-select trigger picker, replacing the
   * old "type a comma-separated list of exact trigger names" prompt - a
   * sysop had no way to see the valid names without leaving this flow to
   * run "Show Triggers" first. ENTER on a trigger row toggles it; ENTER
   * on "Select All" toggles every trigger; ENTER on "Create Webhook"
   * saves (refused if nothing is selected, matching this door's other
   * "can't submit an empty choice" prompts).
   */
  private static async addWebhookTriggersSelectPrompt(socket: any, session: any, name: string, url: string, type: string): Promise<void> {
    const selected = new Set<string>();
    session.tempData = {
      webhookAddTriggersSelect: { selectedIndex: 0, selected, name, url, type }
    };
    this.renderTriggersMenu(socket, selected, 0);
    session.subState = LoggedOnSubState.FILE_DIR_SELECT;
  }

  /**
   * Handle arrow-key input for the trigger picker.
   */
  static async handleAddWebhookTriggersSelectInput(socket: any, session: any, input: string): Promise<void> {
    const menuData = session.tempData.webhookAddTriggersSelect;
    const items = this.buildTriggerMenuItems(menuData.selected);
    const result = MenuUtil.handleMenuInput(input, menuData.selectedIndex, items.length);
    menuData.selectedIndex = result.newIndex;

    if (result.action === 'select') {
      const action = items[menuData.selectedIndex].action;

      if (action === 'confirm') {
        if (menuData.selected.size === 0) {
          socket.emit('ansi-output', '\r\n' + AnsiUtil.errorLine('Select at least one trigger first.'));
          this.renderTriggersMenu(socket, menuData.selected, menuData.selectedIndex);
          return;
        }

        try {
          const webhookId = await db.createWebhook({
            name: menuData.name,
            url: menuData.url,
            type: menuData.type,
            triggers: Array.from(menuData.selected)
          });

          socket.emit('ansi-output', '\r\n' + AnsiUtil.successLine(`Webhook created successfully! ID: ${webhookId}`));
          socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
          session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
          session.tempData = { returnToWebhookMenu: true };
        } catch (error: any) {
          socket.emit('ansi-output', '\r\n' + AnsiUtil.errorLine(`Failed to create webhook: ${error.message}`));
          await this.handleWebhookCommand(socket, session);
        }
        return;
      }

      if (action === 'select-all') {
        if (menuData.selected.size === this.ALL_TRIGGERS.length) {
          menuData.selected.clear();
        } else {
          this.ALL_TRIGGERS.forEach(t => menuData.selected.add(t.name));
        }
      } else if (action.startsWith('toggle:')) {
        const triggerName = action.slice('toggle:'.length);
        if (menuData.selected.has(triggerName)) {
          menuData.selected.delete(triggerName);
        } else {
          menuData.selected.add(triggerName);
        }
      }
      this.renderTriggersMenu(socket, menuData.selected, menuData.selectedIndex);
    } else if (result.action === 'quit') {
      await this.handleWebhookCommand(socket, session);
    } else {
      this.renderTriggersMenu(socket, menuData.selected, menuData.selectedIndex);
    }
  }

  /**
   * Select webhook to edit (arrow selection)
   */
  private static async editWebhookSelectPrompt(socket: any, session: any): Promise<void> {
    await this.listWebhooks(socket, session);
  }

  /**
   * Select webhook to delete (arrow selection)
   */
  private static async deleteWebhookSelectPrompt(socket: any, session: any): Promise<void> {
    await this.listWebhooks(socket, session);
  }

  /**
   * Select webhook to test (arrow selection)
   */
  private static async testWebhookSelectPrompt(socket: any, session: any): Promise<void> {
    await this.listWebhooks(socket, session);
  }
}
