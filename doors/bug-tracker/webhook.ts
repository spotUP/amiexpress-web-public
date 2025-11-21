/**
 * Webhook Module - Multi-platform notification system
 *
 * Supports Discord, Slack, and generic webhooks with:
 * - Rich embeds with colors and formatting
 * - Retry logic with exponential backoff
 * - Per-category/door routing
 * - Custom payloads
 */

import * as https from 'https';
import * as http from 'http';

export enum WebhookPlatform {
  DISCORD = 'discord',
  SLACK = 'slack',
  GENERIC = 'generic'
}

export interface WebhookConfig {
  platform: WebhookPlatform;
  url: string;
  enabled: boolean;
  username?: string;
  avatarUrl?: string;
  categories?: string[];  // Which categories trigger this webhook
  retryAttempts?: number;
  retryDelay?: number;    // Base delay in ms
  headers?: Record<string, string>;
}

export interface BugReportWebhookPayload {
  id: number;
  title: string;
  category: string;
  subcategory?: string;
  priority: string;
  description: string;
  reporter: string;
  tags?: string[];
}

export class WebhookManager {
  private configs: WebhookConfig[] = [];

  constructor(configs: WebhookConfig[] = []) {
    this.configs = configs;
  }

  addWebhook(config: WebhookConfig): void {
    this.configs.push(config);
  }

  async sendBugReport(bug: BugReportWebhookPayload): Promise<void> {
    const promises = this.configs
      .filter(config => {
        if (!config.enabled) return false;
        if (config.categories && config.categories.length > 0) {
          return config.categories.includes(bug.category);
        }
        return true;
      })
      .map(config => this.sendToWebhook(config, bug));

    await Promise.allSettled(promises);
  }

  private async sendToWebhook(config: WebhookConfig, bug: BugReportWebhookPayload): Promise<void> {
    const payload = this.buildPayload(config.platform, bug, config);
    const retryAttempts = config.retryAttempts || 3;
    const baseDelay = config.retryDelay || 1000;

    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        await this.makeRequest(config, payload);
        return; // Success
      } catch (error) {
        if (attempt < retryAttempts - 1) {
          // Exponential backoff
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`Webhook failed after ${retryAttempts} attempts:`, error);
          throw error;
        }
      }
    }
  }

  private buildPayload(platform: WebhookPlatform, bug: BugReportWebhookPayload, config: WebhookConfig): any {
    switch (platform) {
      case WebhookPlatform.DISCORD:
        return this.buildDiscordPayload(bug, config);
      case WebhookPlatform.SLACK:
        return this.buildSlackPayload(bug, config);
      default:
        return this.buildGenericPayload(bug);
    }
  }

  private buildDiscordPayload(bug: BugReportWebhookPayload, config: WebhookConfig): any {
    // Color based on priority
    let color = 0x3498db; // Blue for medium
    if (bug.priority === 'Critical') color = 0xe74c3c; // Red
    else if (bug.priority === 'High') color = 0xe67e22; // Orange
    else if (bug.priority === 'Low') color = 0x95a5a6; // Gray

    const embed: any = {
      title: `Bug Report #${bug.id}`,
      description: bug.title,
      color: color,
      fields: [
        {
          name: 'Category',
          value: bug.subcategory ? `${bug.category} > ${bug.subcategory}` : bug.category,
          inline: true
        },
        {
          name: 'Priority',
          value: bug.priority,
          inline: true
        },
        {
          name: 'Reporter',
          value: bug.reporter,
          inline: true
        },
        {
          name: 'Description',
          value: bug.description.substring(0, 1024),
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Bug Tracker v1.0'
      }
    };

    if (bug.tags && bug.tags.length > 0) {
      embed.fields.push({
        name: '🏷️ Tags',
        value: bug.tags.join(', '),
        inline: false
      });
    }

    return {
      username: config.username || 'Bug Tracker',
      avatar_url: config.avatarUrl,
      embeds: [embed]
    };
  }

  private buildSlackPayload(bug: BugReportWebhookPayload, config: WebhookConfig): any {
    let color = '#3498db'; // Blue
    if (bug.priority === 'Critical') color = '#e74c3c'; // Red
    else if (bug.priority === 'High') color = '#e67e22'; // Orange
    else if (bug.priority === 'Low') color = '#95a5a6'; // Gray

    const attachment: any = {
      fallback: `Bug #${bug.id}: ${bug.title}`,
      color: color,
      title: `Bug Report #${bug.id}`,
      text: bug.title,
      fields: [
        {
          title: 'Category',
          value: bug.subcategory ? `${bug.category} > ${bug.subcategory}` : bug.category,
          short: true
        },
        {
          title: 'Priority',
          value: bug.priority,
          short: true
        },
        {
          title: 'Reporter',
          value: bug.reporter,
          short: true
        },
        {
          title: 'Description',
          value: bug.description.substring(0, 1024),
          short: false
        }
      ],
      footer: 'Bug Tracker v1.0',
      ts: Math.floor(Date.now() / 1000)
    };

    if (bug.tags && bug.tags.length > 0) {
      attachment.fields.push({
        title: 'Tags',
        value: bug.tags.join(', '),
        short: false
      });
    }

    return {
      username: config.username || 'Bug Tracker',
      icon_url: config.avatarUrl,
      attachments: [attachment]
    };
  }

  private buildGenericPayload(bug: BugReportWebhookPayload): any {
    return {
      event: 'bug.created',
      timestamp: Date.now(),
      data: bug
    };
  }

  private makeRequest(config: WebhookConfig, payload: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(config.url);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const data = JSON.stringify(payload);

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...config.headers
        }
      };

      const req = lib.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(data);
      req.end();
    });
  }

  saveConfig(filepath: string): void {
    const fs = require('fs');
    fs.writeFileSync(filepath, JSON.stringify(this.configs, null, 2));
  }

  loadConfig(filepath: string): void {
    const fs = require('fs');
    if (fs.existsSync(filepath)) {
      const data = fs.readFileSync(filepath, 'utf-8');
      this.configs = JSON.parse(data);
    }
  }
}
