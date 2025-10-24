import { Socket } from 'socket.io';
import { db } from '../database';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';
import { PermissionsUtil } from '../utils/permissions.util';
import { LoggedOnSubState } from '../constants/bbs-states';
import { webhookService, WebhookTrigger } from '../services/webhook.service';

/**
 * Webhook Commands Handler
 * Handles the WEBHOOK admin command for managing Discord/Slack webhooks
 * Sysop-only command for webhook management
 */

export class WebhookCommandsHandler {
  /**
   * Main WEBHOOK command - displays webhook management menu
   */
  static async handleWebhookCommand(socket: any, session: any): Promise<void> {
    // Check sysop permission
    if (!PermissionsUtil.isSysop(session.user)) {
      return ErrorHandler.permissionDenied(socket, 'manage webhooks', {
        nextState: LoggedOnSubState.DISPLAY_MENU
      });
    }

    socket.emit('ansi-output', AnsiUtil.clearScreen());
    socket.emit('ansi-output', AnsiUtil.headerBox('WEBHOOK MANAGEMENT'));
    socket.emit('ansi-output', '\r\n');

    socket.emit('ansi-output', AnsiUtil.complexPrompt([
      { text: '[', color: 'blue' },
      { text: 'L', color: 'cyan' },
      { text: '] ', color: 'blue' },
      { text: 'List Webhooks\r\n', color: 'white' }
    ]));

    socket.emit('ansi-output', AnsiUtil.complexPrompt([
      { text: '[', color: 'blue' },
      { text: 'A', color: 'cyan' },
      { text: '] ', color: 'blue' },
      { text: 'Add Webhook\r\n', color: 'white' }
    ]));

    socket.emit('ansi-output', AnsiUtil.complexPrompt([
      { text: '[', color: 'blue' },
      { text: 'E', color: 'cyan' },
      { text: '] ', color: 'blue' },
      { text: 'Edit Webhook\r\n', color: 'white' }
    ]));

    socket.emit('ansi-output', AnsiUtil.complexPrompt([
      { text: '[', color: 'blue' },
      { text: 'D', color: 'cyan' },
      { text: '] ', color: 'blue' },
      { text: 'Delete Webhook\r\n', color: 'white' }
    ]));

    socket.emit('ansi-output', AnsiUtil.complexPrompt([
      { text: '[', color: 'blue' },
      { text: 'T', color: 'cyan' },
      { text: '] ', color: 'blue' },
      { text: 'Test Webhook\r\n', color: 'white' }
    ]));

    socket.emit('ansi-output', AnsiUtil.complexPrompt([
      { text: '[', color: 'blue' },
      { text: 'S', color: 'cyan' },
      { text: '] ', color: 'blue' },
      { text: 'Show Triggers\r\n', color: 'white' }
    ]));

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.complexPrompt([
      { text: 'Select option ', color: 'white' },
      { text: '<CR>=QUIT', color: 'cyan' },
      { text: ': ', color: 'white' }
    ]));

    session.subState = LoggedOnSubState.FILE_DIR_SELECT;
    session.tempData = { webhookMenu: true };
  }

  /**
   * Handle webhook menu input
   */
  static async handleWebhookMenuInput(socket: any, session: any, input: string): Promise<void> {
    const cmd = input.trim().toUpperCase();

    if (cmd === '' || cmd === 'Q') {
      // Quit back to main menu
      delete session.tempData;
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    switch (cmd) {
      case 'L':
        await this.listWebhooks(socket, session);
        break;
      case 'A':
        await this.addWebhookPrompt(socket, session);
        break;
      case 'E':
        await this.editWebhookPrompt(socket, session);
        break;
      case 'D':
        await this.deleteWebhookPrompt(socket, session);
        break;
      case 'T':
        await this.testWebhookPrompt(socket, session);
        break;
      case 'S':
        await this.showTriggers(socket, session);
        break;
      default:
        socket.emit('ansi-output', AnsiUtil.errorLine('Invalid option'));
        await this.handleWebhookCommand(socket, session);
    }
  }

  /**
   * List all webhooks
   */
  private static async listWebhooks(socket: any, session: any): Promise<void> {
    const webhooks = await db.getWebhooks();

    socket.emit('ansi-output', AnsiUtil.clearScreen());
    socket.emit('ansi-output', AnsiUtil.headerBox('WEBHOOKS'));
    socket.emit('ansi-output', '\r\n');

    if (webhooks.length === 0) {
      socket.emit('ansi-output', AnsiUtil.warning('No webhooks configured.\r\n'));
    } else {
      for (const webhook of webhooks) {
        const status = webhook.enabled
          ? AnsiUtil.success('[ENABLED]')
          : AnsiUtil.error('[DISABLED]');

        socket.emit('ansi-output', AnsiUtil.complexPrompt([
          { text: `[${webhook.id}] `, color: 'cyan' },
          { text: webhook.name, color: 'yellow' },
          { text: ` ${status}\r\n`, color: 'white' }
        ]));

        socket.emit('ansi-output', `     Type: ${webhook.type.toUpperCase()}\r\n`);
        socket.emit('ansi-output', `     URL: ${webhook.url.substring(0, 50)}...\r\n`);
        socket.emit('ansi-output', `     Triggers: ${webhook.triggers.length > 0 ? webhook.triggers.join(', ') : 'None'}\r\n`);
        socket.emit('ansi-output', '\r\n');
      }
    }

    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = { returnToWebhookMenu: true };
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
        { text: '  ', color: 'white' },
        { text: trigger.name, color: 'cyan' },
        { text: ' - ', color: 'white' },
        { text: trigger.desc + '\r\n', color: 'yellow' }
      ]));
    }

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = { returnToWebhookMenu: true };
  }

  /**
   * Prompt to add a new webhook
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
   * Handle add webhook input flow
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

      // Create webhook
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
   * Prompt to edit a webhook
   */
  private static async editWebhookPrompt(socket: any, session: any): Promise<void> {
    socket.emit('ansi-output', '\r\nWebhook ID to edit (or ENTER to cancel): ');
    session.subState = LoggedOnSubState.READ_COMMAND;
    session.tempData = { webhookEdit: { step: 'id' } };
  }

  /**
   * Handle edit webhook input
   */
  static async handleEditWebhookInput(socket: any, session: any, input: string): Promise<void> {
    const step = session.tempData.webhookEdit.step;

    if (step === 'id') {
      if (input.trim().length === 0) {
        await this.handleWebhookCommand(socket, session);
        return;
      }

      const id = parseInt(input.trim());
      if (isNaN(id)) {
        socket.emit('ansi-output', AnsiUtil.errorLine('Invalid ID'));
        await this.handleWebhookCommand(socket, session);
        return;
      }

      const webhook = await db.getWebhook(id);
      if (!webhook) {
        socket.emit('ansi-output', AnsiUtil.errorLine('Webhook not found'));
        await this.handleWebhookCommand(socket, session);
        return;
      }

      session.tempData.webhookEdit.id = id;
      socket.emit('ansi-output', 'Enable/Disable [E/D] or ENTER to skip: ');
      session.tempData.webhookEdit.step = 'enabled';
    } else if (step === 'enabled') {
      const cmd = input.trim().toUpperCase();
      if (cmd === 'E' || cmd === 'D') {
        await db.updateWebhook(session.tempData.webhookEdit.id, {
          enabled: cmd === 'E'
        });
        socket.emit('ansi-output', AnsiUtil.successLine('Webhook updated'));
      }
      socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = { returnToWebhookMenu: true };
    }
  }

  /**
   * Prompt to delete a webhook
   */
  private static async deleteWebhookPrompt(socket: any, session: any): Promise<void> {
    socket.emit('ansi-output', '\r\nWebhook ID to delete (or ENTER to cancel): ');
    session.subState = LoggedOnSubState.READ_COMMAND;
    session.tempData = { webhookDelete: true };
  }

  /**
   * Handle delete webhook input
   */
  static async handleDeleteWebhookInput(socket: any, session: any, input: string): Promise<void> {
    if (input.trim().length === 0) {
      await this.handleWebhookCommand(socket, session);
      return;
    }

    const id = parseInt(input.trim());
    if (isNaN(id)) {
      socket.emit('ansi-output', AnsiUtil.errorLine('Invalid ID'));
      await this.handleWebhookCommand(socket, session);
      return;
    }

    const webhook = await db.getWebhook(id);
    if (!webhook) {
      socket.emit('ansi-output', AnsiUtil.errorLine('Webhook not found'));
      await this.handleWebhookCommand(socket, session);
      return;
    }

    await db.deleteWebhook(id);
    socket.emit('ansi-output', AnsiUtil.successLine('Webhook deleted'));
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = { returnToWebhookMenu: true };
  }

  /**
   * Prompt to test a webhook
   */
  private static async testWebhookPrompt(socket: any, session: any): Promise<void> {
    socket.emit('ansi-output', '\r\nWebhook ID to test (or ENTER to cancel): ');
    session.subState = LoggedOnSubState.READ_COMMAND;
    session.tempData = { webhookTest: true };
  }

  /**
   * Handle test webhook input
   */
  static async handleTestWebhookInput(socket: any, session: any, input: string): Promise<void> {
    if (input.trim().length === 0) {
      await this.handleWebhookCommand(socket, session);
      return;
    }

    const id = parseInt(input.trim());
    if (isNaN(id)) {
      socket.emit('ansi-output', AnsiUtil.errorLine('Invalid ID'));
      await this.handleWebhookCommand(socket, session);
      return;
    }

    socket.emit('ansi-output', AnsiUtil.warning('Sending test notification...\r\n'));
    const result = await webhookService.testWebhook(id);

    if (result.success) {
      socket.emit('ansi-output', AnsiUtil.successLine('Test notification sent successfully!'));
    } else {
      socket.emit('ansi-output', AnsiUtil.errorLine(`Test failed: ${result.error}`));
    }

    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = { returnToWebhookMenu: true };
  }
}
