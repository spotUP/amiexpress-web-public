import { Socket } from 'socket.io';
import { db } from '../database';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';
import { PermissionsUtil } from '../utils/permissions.util';
import { LoggedOnSubState } from '../constants/bbs-states';
import { webhookService, WebhookTrigger } from '../services/webhook.service';
import { MenuUtil, MenuItem, MenuState } from '../utils/menu.util';

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
      const item = menuData.items.find(i => i.label[0].toUpperCase() === hotkey);
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
   * Show available triggers
   */
  private static async showTriggers(socket: any, session: any): Promise<void> {
    socket.emit('ansi-output', AnsiUtil.clearScreen());
    socket.emit('ansi-output', AnsiUtil.headerBox('AVAILABLE WEBHOOK TRIGGERS'));
    socket.emit('ansi-output', '\r\n');

    const triggers = [
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
      { name: WebhookTrigger.MAIL_SCAN, desc: 'Mail scan performed' }
    ];

    for (const trigger of triggers) {
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
    session.subState = LoggedOnSubState.READ_COMMAND;
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
      socket.emit('ansi-output', 'Webhook URL: ');
      session.tempData.webhookAdd.step = 'url';
    } else if (step === 'url') {
      if (input.trim().length === 0 || !input.includes('http')) {
        socket.emit('ansi-output', AnsiUtil.errorLine('Invalid URL'));
        await this.handleWebhookCommand(socket, session);
        return;
      }
      session.tempData.webhookAdd.url = input.trim();
      socket.emit('ansi-output', 'Type [DISCORD/SLACK]: ');
      session.tempData.webhookAdd.step = 'type';
    } else if (step === 'type') {
      const type = input.trim().toLowerCase();
      if (type !== 'discord' && type !== 'slack') {
        socket.emit('ansi-output', AnsiUtil.errorLine('Invalid type. Must be DISCORD or SLACK'));
        await this.handleWebhookCommand(socket, session);
        return;
      }
      session.tempData.webhookAdd.type = type;
      socket.emit('ansi-output', 'Triggers (comma-separated, or ALL): ');
      session.tempData.webhookAdd.step = 'triggers';
    } else if (step === 'triggers') {
      let triggers: string[];
      if (input.trim().toUpperCase() === 'ALL') {
        triggers = Object.values(WebhookTrigger);
      } else {
        triggers = input.split(',').map(t => t.trim()).filter(t => t.length > 0);
      }

      try {
        const webhookId = await db.createWebhook({
          name: session.tempData.webhookAdd.name,
          url: session.tempData.webhookAdd.url,
          type: session.tempData.webhookAdd.type,
          triggers
        });

        socket.emit('ansi-output', AnsiUtil.successLine(`Webhook created successfully! ID: ${webhookId}`));
        socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        session.tempData = { returnToWebhookMenu: true };
      } catch (error: any) {
        socket.emit('ansi-output', AnsiUtil.errorLine(`Failed to create webhook: ${error.message}`));
        await this.handleWebhookCommand(socket, session);
      }
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
