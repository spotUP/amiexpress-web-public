import { db, Webhook } from '../database';
import axios from 'axios';

/**
 * Webhook Trigger Types
 * These are the events that can trigger webhook notifications
 */
export enum WebhookTrigger {
  NEW_UPLOAD = 'new_upload',
  NEW_MESSAGE = 'new_message',
  NEW_USER = 'new_user',
  SYSOP_PAGED = 'sysop_paged',
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  FILE_DOWNLOADED = 'file_downloaded',
  COMMENT_POSTED = 'comment_posted',
  NODE_FULL = 'node_full',
  SYSTEM_ERROR = 'system_error',
  CONFERENCE_JOINED = 'conference_joined',
  SECURITY_CHANGED = 'security_changed',
  DOOR_LAUNCHED = 'door_launched',
  VOTE_CAST = 'vote_cast',
  PRIVATE_MESSAGE = 'private_message',
  USER_KICKED = 'user_kicked',
  MAIL_SCAN = 'mail_scan'
}

/**
 * Webhook Event Data
 * Structure for data passed to webhooks
 */
export interface WebhookEventData {
  trigger: WebhookTrigger;
  timestamp: Date;
  data: {
    username?: string;
    userId?: string;
    filename?: string;
    filesize?: number;
    message?: string;
    subject?: string;
    conference?: string;
    messageBase?: string;
    details?: string;
    error?: string;
    door?: string;
    oldSecLevel?: number;
    newSecLevel?: number;
    [key: string]: any;
  };
}

class WebhookService {
  /**
   * Send webhook notification to all webhooks subscribed to this trigger
   */
  async sendWebhook(trigger: WebhookTrigger, data: WebhookEventData['data']): Promise<void> {
    try {
      console.log(`[Webhook] sendWebhook called - trigger: ${trigger}, data:`, data);
      const webhooks = await db.getWebhooksByTrigger(trigger);
      console.log(`[Webhook] Found ${webhooks.length} webhooks for trigger ${trigger}`);

      if (webhooks.length === 0) {
        console.log(`[Webhook] No webhooks configured for trigger ${trigger}, skipping`);
        return; // No webhooks configured for this trigger
      }

      const eventData: WebhookEventData = {
        trigger,
        timestamp: new Date(),
        data
      };

      console.log(`[Webhook] Sending ${webhooks.length} webhook(s) for trigger ${trigger}`);
      // Send to all matching webhooks
      const promises = webhooks.map(webhook => this.sendToWebhook(webhook, eventData));
      const results = await Promise.allSettled(promises); // Don't fail if one webhook fails
      console.log(`[Webhook] Completed sending webhooks for trigger ${trigger}, results:`, results);
    } catch (error) {
      console.error(`[Webhook] Error sending webhook for trigger ${trigger}:`, error);
    }
  }

  /**
   * Send to a specific webhook (Discord or Slack)
   */
  private async sendToWebhook(webhook: Webhook, eventData: WebhookEventData): Promise<void> {
    try {
      console.log(`[Webhook] sendToWebhook called for ${webhook.name}, enabled: ${webhook.enabled}, type: ${webhook.type}`);

      if (!webhook.enabled) {
        console.log(`[Webhook] Skipping ${webhook.name} - webhook is disabled`);
        return;
      }

      const payload = webhook.type === 'discord'
        ? this.formatDiscordPayload(eventData)
        : this.formatSlackPayload(eventData);

      console.log(`[Webhook] Sending HTTP POST to ${webhook.url.substring(0, 50)}...`);
      const response = await axios.post(webhook.url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });

      console.log(`[Webhook] ✅ Sent ${eventData.trigger} to ${webhook.name} (${webhook.type}), status: ${response.status}`);
    } catch (error: any) {
      console.error(`[Webhook] ❌ Failed to send to ${webhook.name}:`, error.message);
      if (error.response) {
        console.error(`[Webhook] Response status: ${error.response.status}, data:`, error.response.data);
      }
    }
  }

  /**
   * Format payload for Discord webhook
   */
  private formatDiscordPayload(eventData: WebhookEventData): any {
    const { trigger, data } = eventData;

    let color: number;
    let title: string;
    let description: string;
    let fields: Array<{ name: string; value: string; inline?: boolean }> = [];

    switch (trigger) {
      case WebhookTrigger.NEW_UPLOAD:
        color = 0x00ff00; // Green
        title = '📁 New File Upload';
        description = `${data.username} uploaded a file`;
        fields = [
          { name: 'Filename', value: data.filename || 'Unknown', inline: true },
          { name: 'Size', value: this.formatFileSize(data.filesize || 0), inline: true },
          { name: 'Conference', value: data.conference || 'Unknown', inline: false }
        ];
        break;

      case WebhookTrigger.NEW_MESSAGE:
        color = 0x0099ff; // Blue
        title = '💬 New Message Posted';
        description = `${data.username} posted a message`;
        fields = [
          { name: 'Subject', value: data.subject || 'No subject', inline: false },
          { name: 'Conference', value: data.conference || 'Unknown', inline: true },
          { name: 'Message Base', value: data.messageBase || 'Unknown', inline: true }
        ];
        break;

      case WebhookTrigger.NEW_USER:
        color = 0xffff00; // Yellow
        title = '👤 New User Registration';
        description = `New user registered: ${data.username}`;
        fields = [
          { name: 'Username', value: data.username || 'Unknown', inline: true },
          { name: 'User ID', value: data.userId || 'Unknown', inline: true }
        ];
        break;

      case WebhookTrigger.SYSOP_PAGED:
        color = 0xff9900; // Orange
        title = '🔔 Sysop Page Request';
        description = `${data.username} is paging the sysop`;
        fields = [
          { name: 'Username', value: data.username || 'Unknown', inline: true },
          { name: 'Message', value: data.message || 'No message', inline: false }
        ];
        break;

      case WebhookTrigger.USER_LOGIN:
        color = 0x00ff00; // Green
        title = '🔓 User Login';
        description = `${data.username} logged in`;
        fields = [
          { name: 'Username', value: data.username || 'Unknown', inline: true }
        ];
        break;

      case WebhookTrigger.USER_LOGOUT:
        color = 0x808080; // Gray
        title = '🔒 User Logout';
        description = `${data.username} logged out`;
        fields = [
          { name: 'Username', value: data.username || 'Unknown', inline: true }
        ];
        break;

      case WebhookTrigger.FILE_DOWNLOADED:
        color = 0x00ccff; // Cyan
        title = '⬇️ File Downloaded';
        description = `${data.username} downloaded a file`;
        fields = [
          { name: 'Filename', value: data.filename || 'Unknown', inline: true },
          { name: 'Size', value: this.formatFileSize(data.filesize || 0), inline: true }
        ];
        break;

      case WebhookTrigger.COMMENT_POSTED:
        color = 0xff6600; // Orange
        title = '💬 Comment to Sysop';
        description = `${data.username} posted a comment`;
        fields = [
          { name: 'Subject', value: data.subject || 'No subject', inline: false }
        ];
        break;

      case WebhookTrigger.NODE_FULL:
        color = 0xff0000; // Red
        title = '⚠️ All Nodes Busy';
        description = 'All BBS nodes are currently occupied';
        fields = [
          { name: 'Details', value: data.details || 'No details', inline: false }
        ];
        break;

      case WebhookTrigger.SYSTEM_ERROR:
        color = 0xff0000; // Red
        title = '❌ System Error';
        description = 'A system error occurred';
        fields = [
          { name: 'Error', value: data.error || 'Unknown error', inline: false }
        ];
        break;

      case WebhookTrigger.CONFERENCE_JOINED:
        color = 0x9933ff; // Purple
        title = '🚪 Conference Joined';
        description = `${data.username} joined a conference`;
        fields = [
          { name: 'Conference', value: data.conference || 'Unknown', inline: true }
        ];
        break;

      case WebhookTrigger.SECURITY_CHANGED:
        color = 0xff3333; // Red
        title = '🔐 Security Level Changed';
        description = `Security level changed for ${data.username}`;
        fields = [
          { name: 'Old Level', value: String(data.oldSecLevel || 0), inline: true },
          { name: 'New Level', value: String(data.newSecLevel || 0), inline: true }
        ];
        break;

      case WebhookTrigger.DOOR_LAUNCHED:
        color = 0x00cc99; // Teal
        title = '🚀 Door Program Launched';
        description = `${data.username} launched a door`;
        fields = [
          { name: 'Door', value: data.door || 'Unknown', inline: true }
        ];
        break;

      case WebhookTrigger.VOTE_CAST:
        color = 0x3366ff; // Blue
        title = '🗳️ Vote Cast';
        description = `${data.username} cast a vote`;
        fields = [
          { name: 'Topic', value: data.details || 'Unknown', inline: false }
        ];
        break;

      case WebhookTrigger.PRIVATE_MESSAGE:
        color = 0xff00ff; // Magenta
        title = '✉️ Private Message';
        description = `${data.username} sent a private message`;
        fields = [
          { name: 'To', value: data.details || 'Unknown', inline: true }
        ];
        break;

      case WebhookTrigger.USER_KICKED:
        color = 0xff0000; // Red
        title = '🚫 User Kicked';
        description = `User ${data.username} was kicked`;
        fields = [
          { name: 'Reason', value: data.details || 'No reason provided', inline: false }
        ];
        break;

      case WebhookTrigger.MAIL_SCAN:
        color = 0x0066ff; // Blue
        title = '📧 Mail Scan';
        description = `${data.username} performed a mail scan`;
        break;

      default:
        color = 0x808080; // Gray
        title = '📢 BBS Event';
        description = `Event: ${trigger}`;
    }

    return {
      embeds: [{
        title,
        description,
        color,
        fields,
        timestamp: eventData.timestamp.toISOString(),
        footer: {
          text: 'AmiExpress BBS'
        }
      }]
    };
  }

  /**
   * Format payload for Slack webhook
   */
  private formatSlackPayload(eventData: WebhookEventData): any {
    const { trigger, data } = eventData;

    let emoji: string;
    let title: string;
    let fields: Array<{ title: string; value: string; short?: boolean }> = [];

    switch (trigger) {
      case WebhookTrigger.NEW_UPLOAD:
        emoji = ':file_folder:';
        title = 'New File Upload';
        fields = [
          { title: 'User', value: data.username || 'Unknown', short: true },
          { title: 'Filename', value: data.filename || 'Unknown', short: true },
          { title: 'Size', value: this.formatFileSize(data.filesize || 0), short: true },
          { title: 'Conference', value: data.conference || 'Unknown', short: true }
        ];
        break;

      case WebhookTrigger.NEW_MESSAGE:
        emoji = ':speech_balloon:';
        title = 'New Message Posted';
        fields = [
          { title: 'User', value: data.username || 'Unknown', short: true },
          { title: 'Subject', value: data.subject || 'No subject', short: false },
          { title: 'Conference', value: data.conference || 'Unknown', short: true },
          { title: 'Message Base', value: data.messageBase || 'Unknown', short: true }
        ];
        break;

      case WebhookTrigger.NEW_USER:
        emoji = ':bust_in_silhouette:';
        title = 'New User Registration';
        fields = [
          { title: 'Username', value: data.username || 'Unknown', short: true },
          { title: 'User ID', value: data.userId || 'Unknown', short: true }
        ];
        break;

      case WebhookTrigger.SYSOP_PAGED:
        emoji = ':bell:';
        title = 'Sysop Page Request';
        fields = [
          { title: 'User', value: data.username || 'Unknown', short: true },
          { title: 'Message', value: data.message || 'No message', short: false }
        ];
        break;

      case WebhookTrigger.USER_LOGIN:
        emoji = ':unlock:';
        title = 'User Login';
        fields = [
          { title: 'Username', value: data.username || 'Unknown', short: true }
        ];
        break;

      case WebhookTrigger.USER_LOGOUT:
        emoji = ':lock:';
        title = 'User Logout';
        fields = [
          { title: 'Username', value: data.username || 'Unknown', short: true }
        ];
        break;

      case WebhookTrigger.FILE_DOWNLOADED:
        emoji = ':arrow_down:';
        title = 'File Downloaded';
        fields = [
          { title: 'User', value: data.username || 'Unknown', short: true },
          { title: 'Filename', value: data.filename || 'Unknown', short: true },
          { title: 'Size', value: this.formatFileSize(data.filesize || 0), short: true }
        ];
        break;

      case WebhookTrigger.COMMENT_POSTED:
        emoji = ':speech_balloon:';
        title = 'Comment to Sysop';
        fields = [
          { title: 'User', value: data.username || 'Unknown', short: true },
          { title: 'Subject', value: data.subject || 'No subject', short: false }
        ];
        break;

      case WebhookTrigger.NODE_FULL:
        emoji = ':warning:';
        title = 'All Nodes Busy';
        fields = [
          { title: 'Details', value: data.details || 'All BBS nodes are currently occupied', short: false }
        ];
        break;

      case WebhookTrigger.SYSTEM_ERROR:
        emoji = ':x:';
        title = 'System Error';
        fields = [
          { title: 'Error', value: data.error || 'Unknown error', short: false }
        ];
        break;

      case WebhookTrigger.CONFERENCE_JOINED:
        emoji = ':door:';
        title = 'Conference Joined';
        fields = [
          { title: 'User', value: data.username || 'Unknown', short: true },
          { title: 'Conference', value: data.conference || 'Unknown', short: true }
        ];
        break;

      case WebhookTrigger.SECURITY_CHANGED:
        emoji = ':key:';
        title = 'Security Level Changed';
        fields = [
          { title: 'User', value: data.username || 'Unknown', short: true },
          { title: 'Old Level', value: String(data.oldSecLevel || 0), short: true },
          { title: 'New Level', value: String(data.newSecLevel || 0), short: true }
        ];
        break;

      case WebhookTrigger.DOOR_LAUNCHED:
        emoji = ':rocket:';
        title = 'Door Program Launched';
        fields = [
          { title: 'User', value: data.username || 'Unknown', short: true },
          { title: 'Door', value: data.door || 'Unknown', short: true }
        ];
        break;

      case WebhookTrigger.VOTE_CAST:
        emoji = ':ballot_box:';
        title = 'Vote Cast';
        fields = [
          { title: 'User', value: data.username || 'Unknown', short: true },
          { title: 'Topic', value: data.details || 'Unknown', short: false }
        ];
        break;

      case WebhookTrigger.PRIVATE_MESSAGE:
        emoji = ':envelope:';
        title = 'Private Message';
        fields = [
          { title: 'From', value: data.username || 'Unknown', short: true },
          { title: 'To', value: data.details || 'Unknown', short: true }
        ];
        break;

      case WebhookTrigger.USER_KICKED:
        emoji = ':no_entry:';
        title = 'User Kicked';
        fields = [
          { title: 'User', value: data.username || 'Unknown', short: true },
          { title: 'Reason', value: data.details || 'No reason provided', short: false }
        ];
        break;

      case WebhookTrigger.MAIL_SCAN:
        emoji = ':email:';
        title = 'Mail Scan';
        fields = [
          { title: 'User', value: data.username || 'Unknown', short: true }
        ];
        break;

      default:
        emoji = ':loudspeaker:';
        title = 'BBS Event';
    }

    return {
      text: `${emoji} *${title}*`,
      attachments: [{
        color: '#36a64f',
        fields,
        footer: 'AmiExpress BBS',
        ts: Math.floor(eventData.timestamp.getTime() / 1000)
      }]
    };
  }

  /**
   * Format file size in human-readable format
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Test a webhook by sending a test notification
   */
  async testWebhook(webhookId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const webhook = await db.getWebhook(webhookId);
      if (!webhook) {
        return { success: false, error: 'Webhook not found' };
      }

      const testEvent: WebhookEventData = {
        trigger: WebhookTrigger.SYSTEM_ERROR,
        timestamp: new Date(),
        data: {
          error: 'This is a test notification from AmiExpress BBS',
          details: 'If you see this message, the webhook is working correctly!'
        }
      };

      await this.sendToWebhook(webhook, testEvent);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export const webhookService = new WebhookService();
