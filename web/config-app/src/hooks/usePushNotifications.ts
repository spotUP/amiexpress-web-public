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

        // Check current subscription
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

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
      const registration = await navigator.serviceWorker.register('/sw.js');
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

      // Register service worker if not already
      let registration = await navigator.serviceWorker.ready;
      if (!registration) {
        registration = await registerServiceWorker();
        if (!registration) {
          throw new Error('Failed to register service worker');
        }
      }

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
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
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

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

    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Test Notification', {
      body: 'Push notifications are working!',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
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
