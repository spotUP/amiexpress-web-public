/**
 * Service Worker for Operator Chat Push Notifications
 *
 * Handles incoming push notifications and click actions.
 */

// Cache name for offline support (optional)
const CACHE_NAME = 'amiexpress-admin-v1';

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(self.clients.claim());
});

// Push event - display notification
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received');

  let data = {
    title: 'Operator Page',
    body: 'Someone is paging the sysop',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'operator-page',
    data: {}
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      console.error('[Service Worker] Failed to parse push data:', e);
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || 'operator-page',
    data: data.data || {},
    requireInteraction: true, // Keep notification visible until user interacts
    actions: data.actions || [
      { action: 'respond', title: 'Respond' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    vibrate: [200, 100, 200] // Vibration pattern
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event - handle actions
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event.action);

  const notification = event.notification;
  const data = notification.data || {};

  notification.close();

  if (event.action === 'dismiss') {
    // User dismissed - do nothing
    return;
  }

  // Default action or 'respond' - open the operator chat page
  const urlToOpen = data.url || '/admin/operator-chat';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open with the admin panel
        for (const client of clientList) {
          if (client.url.includes('/admin') && 'focus' in client) {
            // Navigate to operator chat and focus
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // No existing window - open new one
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

// Notification close event - log for debugging
self.addEventListener('notificationclose', (event) => {
  console.log('[Service Worker] Notification closed');
});
