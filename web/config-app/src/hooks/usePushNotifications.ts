/**
 * Push Notifications Hook
 *
 * Manages web push notification subscription for operator chat alerts.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';

interface PushState {
  isSupported: boolean;
  isEnabled: boolean;
  isSubscribed: boolean;
  permission: NotificationPermission | 'unsupported';
  loading: boolean;
  error: string | null;
}

interface VapidResponse {
  enabled: boolean;
  publicKey: string | null;
}

/**
 * Where the service worker lives.
 *
 * The admin is served under `/admin/` (vite `base`), so a bare `/sw.js` is a
 * 404 - and it was, on the live board, for every caller: the file was also
 * gitignored and never shipped at all. `import.meta.env.BASE_URL` is that
 * base, so this follows the app wherever it is mounted.
 */
const SERVICE_WORKER_URL = `${import.meta.env.BASE_URL}sw.js`;

/**
 * The registration this app already has, or nothing - WITHOUT waiting.
 *
 * `navigator.serviceWorker.ready` never resolves when no worker is
 * registered. It does not reject and it does not time out: the promise simply
 * never settles. The mount-time check awaited it, so on a board whose worker
 * had never been registered the hook sat at `loading: true, isSupported:
 * false` for ever - and the header's "Desktop notifications off" button, which
 * renders only when `isSupported`, could never appear. The only call that
 * registered the worker was behind that button. The sysop, 2026-09-08: "do i
 * need to screenshot to prove that there is no switch visible".
 */
async function existingRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  try {
    return (await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL))
      ?? (await navigator.serviceWorker.getRegistration());
  } catch {
    return undefined;
  }
}

/**
 * Convert a base64 string to Uint8Array for VAPID key
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>({
    isSupported: false,
    isEnabled: false,
    isSubscribed: false,
    permission: 'unsupported',
    loading: true,
    error: null
  });

  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);

  // Check if push is supported and get current state
  useEffect(() => {
    const checkSupport = async () => {
      // Check browser support
      const supported = 'serviceWorker' in navigator && 'PushManager' in window;

      if (!supported) {
        setState(prev => ({
          ...prev,
          isSupported: false,
          permission: 'unsupported',
          loading: false
        }));
        return;
      }

      try {
        // Check VAPID key availability
        const response = await apiClient.get<VapidResponse>('/api/config/push/vapid-key');
        const { enabled, publicKey } = response.data;

        if (!enabled || !publicKey) {
          setState(prev => ({
            ...prev,
            isSupported: true,
            isEnabled: false,
            permission: Notification.permission,
            loading: false,
            error: 'Push notifications not configured on server'
          }));
          return;
        }

        setVapidPublicKey(publicKey);

        // Check current subscription. No worker registered yet is the NORMAL
        // first visit, and it means "not subscribed" - not "wait for ever".
        const registration = await existingRegistration();
        const subscription = registration
          ? await registration.pushManager.getSubscription()
          : null;

        setState(prev => ({
          ...prev,
          isSupported: true,
          isEnabled: true,
          isSubscribed: !!subscription,
          permission: Notification.permission,
          loading: false
        }));
      } catch (error) {
        console.error('[Push] Error checking support:', error);
        setState(prev => ({
          ...prev,
          isSupported: supported,
          loading: false,
          error: 'Failed to check push notification status'
        }));
      }
    };

    checkSupport();
  }, []);

  // Register service worker
  const registerServiceWorker = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    if (!('serviceWorker' in navigator)) {
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
      console.log('[Push] Service worker registered');
      return registration;
    } catch (error) {
      console.error('[Push] Service worker registration failed:', error);
      return null;
    }
  }, []);

  // Subscribe to push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!vapidPublicKey) {
      setState(prev => ({ ...prev, error: 'VAPID key not available' }));
      return false;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        setState(prev => ({
          ...prev,
          permission,
          loading: false,
          error: 'Notification permission denied'
        }));
        return false;
      }

      // Register the worker if this browser has none. Awaiting `ready` FIRST
      // was the deadlock: with nothing registered it never resolves, so the
      // registration below was never reached.
      let registration: ServiceWorkerRegistration | null = (await existingRegistration()) ?? null;
      if (!registration) {
        registration = await registerServiceWorker();
        if (!registration) {
          throw new Error('Failed to register service worker');
        }
      }
      // Now that one EXISTS, waiting for it to activate is safe.
      await navigator.serviceWorker.ready;

      // Subscribe to push
      // Convert Uint8Array to ArrayBuffer for applicationServerKey
      const vapidKeyArray = urlBase64ToUint8Array(vapidPublicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: new Uint8Array(vapidKeyArray).buffer as ArrayBuffer
      });

      // Send subscription to server
      const subscriptionJson = subscription.toJSON();
      await apiClient.post('/api/config/push/subscribe', {
        subscription: {
          endpoint: subscriptionJson.endpoint,
          keys: subscriptionJson.keys
        }
      });

      setState(prev => ({
        ...prev,
        isSubscribed: true,
        permission: 'granted',
        loading: false
      }));

      console.log('[Push] Subscribed successfully');
      return true;
    } catch (error: any) {
      console.error('[Push] Subscribe error:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to subscribe'
      }));
      return false;
    }
  }, [vapidPublicKey, registerServiceWorker]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const registration = await existingRegistration();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;

      if (subscription) {
        // Unsubscribe from push manager
        await subscription.unsubscribe();

        // Remove from server
        await apiClient.delete('/api/config/push/unsubscribe', {
          data: { endpoint: subscription.endpoint }
        });
      }

      setState(prev => ({
        ...prev,
        isSubscribed: false,
        loading: false
      }));

      console.log('[Push] Unsubscribed successfully');
      return true;
    } catch (error: any) {
      console.error('[Push] Unsubscribe error:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to unsubscribe'
      }));
      return false;
    }
  }, []);

  // Test notification (for debugging)
  const testNotification = useCallback(async () => {
    if (!state.isSubscribed) {
      return;
    }

    const registration = await existingRegistration();
    if (!registration) return;
    await registration.showNotification('Test Notification', {
      body: 'Push notifications are working!',
      // Relative, so it resolves against the admin's own base. `/favicon.ico`
      // is not served by this board and answered 404 on every notification.
      icon: `${import.meta.env.BASE_URL}icon.svg`,
      badge: `${import.meta.env.BASE_URL}icon.svg`,
      tag: 'test'
    });
  }, [state.isSubscribed]);

  return {
    ...state,
    subscribe,
    unsubscribe,
    testNotification,
    registerServiceWorker
  };
}
