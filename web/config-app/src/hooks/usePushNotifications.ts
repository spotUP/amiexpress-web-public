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
  /**
   * What this browser reports about itself, in the sysop's own words.
   *
   * Every question in "the board says it sent one and nothing appeared" is
   * answered by four values the sysop cannot see: whether a worker is
   * installed and ACTIVE, what scope it claims, whether a subscription exists
   * in the browser (not just a row in the board's database), and what the
   * permission actually is. Two evenings went into asking for these one at a
   * time over chat.
   */
  diagnostics: PushDiagnostics;
}

export interface PushDiagnostics {
  /** 'none' when nothing is registered - the usual reason nothing is drawn. */
  workerState: 'none' | 'installing' | 'waiting' | 'active' | 'unknown';
  workerScope: string | null;
  /** The browser's own subscription, which is the one that must exist. */
  hasBrowserSubscription: boolean;
  endpointHost: string | null;
  /**
   * The tail of this browser's endpoint, which is what identifies it.
   *
   * The board can hold a subscription this browser no longer has - a worker
   * re-registered at a different scope, site data cleared - and the push
   * service still answers 201 for it, so every send "succeeds" and nothing is
   * ever drawn. Comparing this with what the board sends to is the only way
   * to see that from the outside.
   */
  endpointTail: string | null;
}

const NO_DIAGNOSTICS: PushDiagnostics = {
  workerState: 'unknown',
  workerScope: null,
  hasBrowserSubscription: false,
  endpointHost: null,
  endpointTail: null,
};

/** The last characters of an endpoint - enough to tell two apart, not a key. */
export function endpointTail(endpoint: string): string {
  return endpoint.slice(-12);
}

/** What a registration is doing right now, named the way the sysop reads it. */
function describeWorker(registration: ServiceWorkerRegistration | null | undefined): PushDiagnostics['workerState'] {
  if (!registration) return 'none';
  if (registration.active) return 'active';
  if (registration.waiting) return 'waiting';
  if (registration.installing) return 'installing';
  return 'unknown';
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
    error: null,
    diagnostics: NO_DIAGNOSTICS
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
          loading: false,
          diagnostics: {
            workerState: describeWorker(registration),
            workerScope: registration?.scope ?? null,
            hasBrowserSubscription: !!subscription,
            endpointHost: subscription ? new URL(subscription.endpoint).host : null,
            endpointTail: subscription ? endpointTail(subscription.endpoint) : null,
          }
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
        loading: false,
        diagnostics: {
          workerState: describeWorker(registration),
          workerScope: registration.scope,
          hasBrowserSubscription: true,
          endpointHost: new URL(subscriptionJson.endpoint as string).host,
          endpointTail: endpointTail(subscriptionJson.endpoint as string),
        }
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

  /**
   * Draw a notification now, and SAY what happened.
   *
   * This had three silent exits - not subscribed, no registration, and any
   * throw at all, since the page calls it as `void testNotification()`. So a
   * sysop who pressed it got nothing: no notification, no error, nothing in
   * the console. "i cant send a test desktop notification in the admin ui".
   *
   * It now asks for permission if it has none, registers the worker if the
   * browser has none (the file ships as of this session), and reports the
   * reason through the same `error` the page already shows.
   */
  const testNotification = useCallback(async (): Promise<boolean> => {
    setState(prev => ({ ...prev, error: null }));
    try {
      if (!('serviceWorker' in navigator)) {
        throw new Error('This browser cannot show desktop notifications.');
      }

      let permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      setState(prev => ({ ...prev, permission }));
      if (permission !== 'granted') {
        throw new Error(
          "Your browser is blocking notifications for this site. Allow them in the browser's site settings, then reload.",
        );
      }

      const registration = (await existingRegistration()) ?? (await registerServiceWorker());
      if (!registration) {
        throw new Error('The service worker could not be registered, so there is nothing to draw with.');
      }

      await registration.showNotification('AmiExpress', {
        body: 'This is what a caller paging you looks like.',
        // Relative, so it resolves against the admin's own base. `/favicon.ico`
        // is not served by this board and answered 404 on every notification.
        icon: `${import.meta.env.BASE_URL}icon.svg`,
        badge: `${import.meta.env.BASE_URL}icon.svg`,
        tag: 'test',
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The test notification could not be shown.';
      setState(prev => ({ ...prev, error: message }));
      return false;
    }
  }, [registerServiceWorker]);

  return {
    ...state,
    subscribe,
    unsubscribe,
    testNotification,
    registerServiceWorker
  };
}
