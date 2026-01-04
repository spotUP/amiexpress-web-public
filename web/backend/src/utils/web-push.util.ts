/**
 * Web Push Notification Utility
 *
 * Handles sending push notifications to subscribed sysops
 * when users page the operator.
 *
 * VAPID keys can be configured via:
 * 1. Database system config (preferred - via admin UI)
 * 2. Environment variables (fallback)
 */

import webPush from 'web-push';

// Track if web push is configured
let webPushConfigured = false;
let currentVapidPublicKey: string | null = null;

/**
 * Initialize web push with VAPID credentials
 * Checks database config first, then falls back to environment variables
 */
export function initWebPush(dbConfig?: { vapid_public_key?: string; vapid_private_key?: string; vapid_contact_email?: string }): boolean {
  // Priority: Database config > Environment variables
  let publicKey = dbConfig?.vapid_public_key || process.env.VAPID_PUBLIC_KEY || '';
  let privateKey = dbConfig?.vapid_private_key || process.env.VAPID_PRIVATE_KEY || '';
  let contactEmail = dbConfig?.vapid_contact_email || process.env.VAPID_CONTACT_EMAIL || '';

  // Ensure contact email has mailto: prefix
  if (contactEmail && !contactEmail.startsWith('mailto:')) {
    contactEmail = `mailto:${contactEmail}`;
  }

  if (!publicKey || !privateKey) {
console.log('[Web Push] VAPID keys not configured - push notifications disabled');
    webPushConfigured = false;
    currentVapidPublicKey = null;
    return false;
  }

  if (!contactEmail) {
    contactEmail = 'mailto:admin@example.com';
  }

  try {
    webPush.setVapidDetails(contactEmail, publicKey, privateKey);
    webPushConfigured = true;
    currentVapidPublicKey = publicKey;
console.log('[Web Push] Initialized with VAPID credentials');
    return true;
  } catch (error) {
console.error('[Web Push] Failed to initialize:', error);
    webPushConfigured = false;
    currentVapidPublicKey = null;
    return false;
  }
}

/**
 * Reinitialize web push with new config (called when config is updated)
 */
export function reinitWebPush(dbConfig: { vapid_public_key?: string; vapid_private_key?: string; vapid_contact_email?: string }): boolean {
  return initWebPush(dbConfig);
}

/**
 * Check if web push is available
 */
export function isWebPushEnabled(): boolean {
  return webPushConfigured;
}

/**
 * Get the public VAPID key for client subscription
 */
export function getVapidPublicKey(): string | null {
  return currentVapidPublicKey;
}

/**
 * Generate new VAPID keys
 * Returns an object with publicKey and privateKey
 */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webPush.generateVAPIDKeys();
}

/**
 * Push subscription interface (from browser's PushManager)
 */
export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Notification payload interface
 */
export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, any>;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

/**
 * Send a push notification to a single subscription
 * Returns true if sent successfully, false otherwise
 */
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushNotificationPayload
): Promise<boolean> {
  if (!webPushConfigured) {
console.warn('[Web Push] Not configured - cannot send notification');
    return false;
  }

  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys
      },
      JSON.stringify(payload),
      {
        TTL: 3600, // 1 hour
        urgency: 'high'
      }
    );
console.log('[Web Push] Notification sent successfully');
    return true;
  } catch (error: any) {
    // Handle expired/invalid subscriptions
    if (error.statusCode === 410 || error.statusCode === 404) {
console.log('[Web Push] Subscription expired or invalid:', subscription.endpoint);
      return false;
    }
console.error('[Web Push] Failed to send notification:', error);
    return false;
  }
}

/**
 * Send push notifications to multiple subscriptions
 * Returns array of results (subscription + success boolean)
 */
export async function sendPushNotifications(
  subscriptions: PushSubscription[],
  payload: PushNotificationPayload
): Promise<Array<{ subscription: PushSubscription; success: boolean }>> {
  const results = await Promise.all(
    subscriptions.map(async (subscription) => ({
      subscription,
      success: await sendPushNotification(subscription, payload)
    }))
  );

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
console.log(`[Web Push] Sent to ${succeeded} subscriptions, ${failed} failed`);

  return results;
}

/**
 * Create an operator page notification payload
 */
export function createPageNotificationPayload(
  userHandle: string,
  nodeId: number,
  conferenceName: string,
  pageId: string,
  authUrl: string
): PushNotificationPayload {
  return {
    title: 'Operator Page Request',
    body: `${userHandle} @Node${nodeId} is paging you from ${conferenceName}`,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `page-${pageId}`, // Replaces existing notifications with same tag
    data: {
      pageId,
      url: authUrl,
      type: 'operator-page'
    },
    actions: [
      {
        action: 'respond',
        title: 'Respond'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };
}
