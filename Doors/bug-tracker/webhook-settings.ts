/**
 * The door's OWN webhook list UI (Discord/Slack/generic URLs in
 * data/bugs.json) - the per-door setup that predates the board's webhook
 * system. Moved out of app.ts, which has a 2000-line ceiling: this view
 * draws itself from the host below and knows nothing else about the app.
 *
 * (Board announcements live in board-announce.ts. The two systems coexist:
 * this list POSTs directly, the board bridge goes through the sysop's
 * door_announcement subscriptions.)
 */
import {
  createBox,
  createList,
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { T } from './door-theme-bugs';
import type { BugStorage } from './storage';
import type { BugView } from './dialogs';

/** Everything the view needs from the app that opened it. */
export interface WebhookSettingsHost {
  screen: Screen;
  main: any;
  storage: BugStorage;
  isSysop: boolean;
  getView(): BugView;
  setView(view: BugView): void;
  clear(): void;
  panelLeft(): number;
  panelWidth(): string;
  chromeH(): number;
  bodyH(): string;
  panelBorder(): any;
  screenWidth(): number;
  narrow(): boolean;
  stripText(wide: string, short: string): string;
  onKey(keys: string | string[], handler: () => void): void;
  select(title: string, items: string[], callback: (idx: number) => void): void;
  input(title: string, defaultValue: string, multiline: boolean, callback: (value: string | null) => void): void;
  back(): void;
  render(): void;
}

export function showWebhookSettings(host: WebhookSettingsHost): void {
  if (!host.isSysop) return;

  host.setView('settings');
  host.clear();

  const webhooks = host.storage.getWebhooks();

  // Header
  createBox({
    parent: host.main,
    top: 0,
    left: host.panelLeft(),
    width: host.panelWidth(),
    height: host.chromeH(),
    border: host.panelBorder(),
    label: ' Webhook Settings ',
    style: {
      fg: T.ink,
      bg: T.ground,
      border: { fg: T.warn },
    },
    content: host.stripText(` ${webhooks.length} webhook(s) configured | Notifications for bug events`, ` WEBHOOKS ${webhooks.length}`),
    tags: true,
    focusable: false,
    mouse: false,
    clickable: false,
  });

  const listItems = webhooks.map((w) => {
    const status = w.enabled ? `{${T.ok}-fg}[ON]{/}` : `{${T.alert}-fg}[OFF]{/}`;
    const urlCol = host.narrow() ? Math.max(8, host.screenWidth() - 16) : 50;
    return `${status} ${w.type.toUpperCase().padEnd(8)} ${w.url.substring(0, urlCol)}${w.url.length > urlCol ? '...' : ''}`;
  });

  if (listItems.length === 0) {
    listItems.push(`{${T.dim}-fg}No webhooks configured - press A to add one{/}`);
  }

  const webhookList = createList({
    parent: host.main,
    top: host.chromeH(),
    left: host.panelLeft(),
    width: host.panelWidth(),
    height: host.bodyH(),
    border: host.panelBorder(),
    label: ' Webhooks ',
    style: {
      fg: T.ink,
      bg: T.ground,
      border: { fg: T.accent },
      selected: { fg: T.selectionInk, bg: T.accent },
      item: { fg: T.ink, bg: T.ground },
    },
    items: listItems,
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    padding: { left: 1 },
  });

  // Footer
  createBox({
    parent: host.main,
    bottom: 0,
    left: host.panelLeft(),
    width: host.panelWidth(),
    height: host.chromeH(),
    border: host.panelBorder(),
    style: {
      fg: T.dim,
      bg: T.ground,
      border: { fg: T.dim },
    },
    content: host.stripText(` {${T.accent}-fg}[A]{/} Add   {${T.accent}-fg}[D]{/} Delete   {${T.accent}-fg}[T]{/} Toggle   {${T.alert}-fg}[ESC]{/} Back`, ` {${T.accent}-fg}A{/} add  {${T.accent}-fg}D{/} del  {${T.accent}-fg}T{/} toggle  {${T.alert}-fg}ESC{/} back`),
    tags: true,
    focusable: false,
    mouse: false,
    clickable: false,
  });

  webhookList.focus();

  host.onKey(['a', 'A'], () => {
    if (host.getView() === 'settings') {
      showAddWebhook(host);
    }
  });

  host.onKey(['d', 'D'], () => {
    if (host.getView() === 'settings' && webhooks.length > 0) {
      const idx = (webhookList as any).selected || 0;
      host.storage.removeWebhook(idx);
      showWebhookSettings(host);
    }
  });

  host.onKey(['t', 'T'], () => {
    if (host.getView() === 'settings' && webhooks.length > 0) {
      const idx = (webhookList as any).selected || 0;
      webhooks[idx].enabled = !webhooks[idx].enabled;
      host.storage.save();
      showWebhookSettings(host);
    }
  });

  // ESC goes back to main menu (deferred to avoid race with global handler)
  host.onKey(['escape'], () => {
    if (host.getView() === 'settings') {
      setImmediate(() => host.back());
    }
  });

  host.render();
}

function showAddWebhook(host: WebhookSettingsHost): void {
  host.select('Webhook Type', ['Discord', 'Slack', 'Generic'], (typeIdx) => {
    if (typeIdx === -1) {
      showWebhookSettings(host);
      return;
    }

    const type = ['discord', 'slack', 'generic'][typeIdx] as 'discord' | 'slack' | 'generic';

    host.input('Webhook URL', '', false, (url) => {
      if (url && url.trim()) {
        host.storage.addWebhook({
          enabled: true,
          url: url.trim(),
          type,
          events: ['create', 'update', 'close', 'comment'],
        });
      }
      showWebhookSettings(host);
    });
  });
}
