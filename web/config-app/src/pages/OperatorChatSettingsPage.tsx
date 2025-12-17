import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { MessageSquare, Bot, Bell, Clock, Shield, Webhook, BellRing, Smartphone, AlertCircle, CheckCircle, Key, RefreshCw, Save, Eye, EyeOff, Server } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { useEffect, useRef, useState } from 'react';
import { usePushNotifications } from '../hooks/usePushNotifications';

interface OperatorChatConfig {
  enabled: boolean;
  pageTimeout: number;
  pageCooldown: number;
  maxActivePages: number;
  requireCarrier: boolean;
  allowedSecLevels: number[];
  quickReplies: Array<{ label: string; message: string }>;
  discordWebhook?: string;
  discordUserId?: string;
  notifyOnPage: boolean;
  notifyDiscord: boolean;
  quietHours: {
    enabled: boolean;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
    customMessage?: string;
  };
}

// Standard AmiExpress security levels (0-255 range)
const SECURITY_LEVELS = [
  { value: 1, label: '1 - Guest' },
  { value: 10, label: '10 - Unvalidated' },
  { value: 20, label: '20 - New User' },
  { value: 30, label: '30 - Regular User' },
  { value: 40, label: '40 - Validated' },
  { value: 50, label: '50 - Trusted' },
  { value: 60, label: '60 - VIP' },
  { value: 70, label: '70 - Elite' },
  { value: 80, label: '80 - Moderator' },
  { value: 90, label: '90 - Sub-Sysop' },
  { value: 100, label: '100 - Co-Sysop' },
  { value: 150, label: '150 - Senior Sysop' },
  { value: 200, label: '200 - High Sysop' },
  { value: 255, label: '255 - Full Sysop' },
];

export function OperatorChatSettingsPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useNotification();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch current configuration
  const { data: config, isLoading } = useQuery({
    queryKey: ['operator-chat-config'],
    queryFn: async () => {
      const response = await apiClient.getOperatorChatConfig();
      return (response as any).data;
    },
  });

  const { register, watch, getValues } = useForm<OperatorChatConfig>({
    values: config,
  });

  // Update configuration mutation
  const updateMutation = useMutation({
    mutationFn: async (data: OperatorChatConfig) => {
      const response = await apiClient.updateOperatorChatConfig(data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operator-chat-config'] });
      showSuccess('Settings saved');
    },
    onError: (error: any) => {
      showError(error.response?.data?.message || 'Failed to save settings');
    },
  });

  // Auto-save with debounce (500ms delay)
  const autoSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const currentValues = getValues();
      updateMutation.mutate(currentValues);
    }, 500);
  };

  // Watch all fields and trigger auto-save
  const quietHoursEnabled = watch('quietHours.enabled');
  const notifyDiscordEnabled = watch('notifyDiscord');

  // Push notifications hook
  const push = usePushNotifications();

  // VAPID configuration state
  const [vapidConfig, setVapidConfig] = useState({
    vapid_public_key: '',
    vapid_private_key: '',
    vapid_contact_email: '',
    enabled: false
  });
  const [vapidLoading, setVapidLoading] = useState(false);
  const [vapidSaving, setVapidSaving] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [vapidError, setVapidError] = useState<string | null>(null);

  // Load VAPID configuration
  useEffect(() => {
    const loadVapidConfig = async () => {
      try {
        const response = await fetch('/api/config/push/vapid-config', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setVapidConfig({
            vapid_public_key: data.vapid_public_key || '',
            vapid_private_key: data.vapid_private_key || '',
            vapid_contact_email: data.vapid_contact_email || '',
            enabled: data.enabled || false
          });
        }
      } catch (err) {
        console.error('Failed to load VAPID config:', err);
      }
    };
    loadVapidConfig();
  }, []);

  // Generate new VAPID keys
  const generateVapidKeys = async () => {
    setVapidLoading(true);
    setVapidError(null);
    try {
      const response = await fetch('/api/config/push/generate-vapid', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        setVapidConfig(prev => ({
          ...prev,
          vapid_public_key: data.publicKey,
          vapid_private_key: data.privateKey
        }));
        showSuccess('New VAPID keys generated - click Save to apply');
      } else {
        const error = await response.json();
        setVapidError(error.message || 'Failed to generate VAPID keys');
      }
    } catch (err) {
      setVapidError('Failed to generate VAPID keys');
    } finally {
      setVapidLoading(false);
    }
  };

  // Save VAPID configuration
  const saveVapidConfig = async () => {
    setVapidSaving(true);
    setVapidError(null);
    try {
      const response = await fetch('/api/config/push/vapid-config', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vapid_public_key: vapidConfig.vapid_public_key,
          vapid_private_key: vapidConfig.vapid_private_key,
          vapid_contact_email: vapidConfig.vapid_contact_email
        })
      });
      const data = await response.json();
      if (response.ok) {
        setVapidConfig(prev => ({ ...prev, enabled: data.enabled }));
        showSuccess(data.message || 'VAPID configuration saved');
        // Refresh push notifications state
        window.location.reload();
      } else {
        setVapidError(data.error || 'Failed to save VAPID configuration');
      }
    } catch (err) {
      setVapidError('Failed to save VAPID configuration');
    } finally {
      setVapidSaving(false);
    }
  };

  // Watch for any form changes and auto-save
  useEffect(() => {
    const subscription = watch(() => {
      autoSave();
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-bbs-muted">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-bbs-text flex items-center gap-2">
          <MessageSquare className="w-7 h-7" />
          Operator Chat Settings
        </h1>
        <p className="text-bbs-muted mt-2">
          Configure operator chat, grumpy bot, and notification settings
        </p>
      </div>

      <div className="space-y-8">
        {/* General Settings */}
        <section className="bg-bbs-surface border border-bbs-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-bbs-text mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            General Settings
          </h2>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="enabled"
                {...register('enabled')}
                className="w-4 h-4"
              />
              <label htmlFor="enabled" className="text-bbs-text">
                Enable Operator Chat (allows users to page sysop with O command)
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-bbs-text mb-2">
                Page Timeout (seconds)
              </label>
              <input
                type="number"
                {...register('pageTimeout', {
                  valueAsNumber: true,
                  min: 10,
                  max: 300
                })}
                className="w-full px-3 py-2 bg-bbs-bg border border-bbs-border text-bbs-text rounded focus:outline-none focus:ring-2 focus:ring-bbs-accent"
              />
              <p className="text-sm text-bbs-muted mt-1">
                How long to wait before grumpy bot activates (10-300 seconds)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-bbs-text mb-2">
                Page Cooldown (seconds)
              </label>
              <input
                type="number"
                {...register('pageCooldown', {
                  valueAsNumber: true,
                  min: 0,
                  max: 3600
                })}
                className="w-full px-3 py-2 bg-bbs-bg border border-bbs-border text-bbs-text rounded focus:outline-none focus:ring-2 focus:ring-bbs-accent"
              />
              <p className="text-sm text-bbs-muted mt-1">
                Minimum time between page requests from same user
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-bbs-text mb-2">
                Max Active Pages Per User
              </label>
              <input
                type="number"
                {...register('maxActivePages', {
                  valueAsNumber: true,
                  min: 1,
                  max: 10
                })}
                className="w-full px-3 py-2 bg-bbs-bg border border-bbs-border text-bbs-text rounded focus:outline-none focus:ring-2 focus:ring-bbs-accent"
              />
              <p className="text-sm text-bbs-muted mt-1">
                Maximum pending pages a user can have at once
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="requireCarrier"
                {...register('requireCarrier')}
                className="w-4 h-4"
              />
              <label htmlFor="requireCarrier" className="text-bbs-text">
                Require Carrier (disable for web/telnet users)
              </label>
            </div>
          </div>
        </section>

        {/* Security Settings */}
        <section className="bg-bbs-surface border border-bbs-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-bbs-text mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Security Settings
          </h2>

          <div>
            <label className="block text-sm font-medium text-bbs-text mb-2">
              Allowed Security Levels
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SECURITY_LEVELS.map((level) => (
                <label key={level.value} className="flex items-center gap-2 text-bbs-text">
                  <input
                    type="checkbox"
                    value={level.value}
                    {...register('allowedSecLevels')}
                    className="w-4 h-4"
                  />
                  {level.label}
                </label>
              ))}
            </div>
            <p className="text-sm text-bbs-muted mt-2">
              Users must have one of these security levels to page the operator
            </p>
          </div>
        </section>

        {/* Quiet Hours */}
        <section className="bg-bbs-surface border border-bbs-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-bbs-text mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Quiet Hours
          </h2>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="quietHours.enabled"
                {...register('quietHours.enabled')}
                className="w-4 h-4"
              />
              <label htmlFor="quietHours.enabled" className="text-bbs-text">
                Enable Quiet Hours (disable paging during specific times)
              </label>
            </div>

            {quietHoursEnabled && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-bbs-text mb-2">
                      Start Time
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Hour"
                        {...register('quietHours.startHour', {
                          valueAsNumber: true,
                          min: 0,
                          max: 23
                        })}
                        className="w-20 px-3 py-2 bg-bbs-bg border border-bbs-border text-bbs-text rounded"
                      />
                      <span className="text-bbs-text py-2">:</span>
                      <input
                        type="number"
                        placeholder="Minute"
                        {...register('quietHours.startMinute', {
                          valueAsNumber: true,
                          min: 0,
                          max: 59
                        })}
                        className="w-20 px-3 py-2 bg-bbs-bg border border-bbs-border text-bbs-text rounded"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-bbs-text mb-2">
                      End Time
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Hour"
                        {...register('quietHours.endHour', {
                          valueAsNumber: true,
                          min: 0,
                          max: 23
                        })}
                        className="w-20 px-3 py-2 bg-bbs-bg border border-bbs-border text-bbs-text rounded"
                      />
                      <span className="text-bbs-text py-2">:</span>
                      <input
                        type="number"
                        placeholder="Minute"
                        {...register('quietHours.endMinute', {
                          valueAsNumber: true,
                          min: 0,
                          max: 59
                        })}
                        className="w-20 px-3 py-2 bg-bbs-bg border border-bbs-border text-bbs-text rounded"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-bbs-text mb-2">
                    Custom Message (optional)
                  </label>
                  <textarea
                    {...register('quietHours.customMessage')}
                    rows={2}
                    className="w-full px-3 py-2 bg-bbs-bg border border-bbs-border text-bbs-text rounded focus:outline-none focus:ring-2 focus:ring-bbs-accent"
                    placeholder="The sysop is not available during quiet hours."
                  />
                </div>
              </>
            )}
          </div>
        </section>

        {/* Notification Settings */}
        <section className="bg-bbs-surface border border-bbs-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-bbs-text mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notification Settings
          </h2>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="notifyOnPage"
                {...register('notifyOnPage')}
                className="w-4 h-4"
              />
              <label htmlFor="notifyOnPage" className="text-bbs-text">
                Show in-system notifications when users page
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="notifyDiscord"
                {...register('notifyDiscord')}
                className="w-4 h-4"
              />
              <label htmlFor="notifyDiscord" className="text-bbs-text">
                Send Discord notifications via webhook
              </label>
            </div>

            {notifyDiscordEnabled && (
              <>
                <div>
                  <label className="block text-sm font-medium text-bbs-text mb-2 flex items-center gap-2">
                    <Webhook className="w-4 h-4" />
                    Discord Webhook URL
                  </label>
                  <input
                    type="url"
                    {...register('discordWebhook')}
                    className="w-full px-3 py-2 bg-bbs-bg border border-bbs-border text-bbs-text rounded focus:outline-none focus:ring-2 focus:ring-bbs-accent"
                    placeholder="https://discord.com/api/webhooks/..."
                  />
                  <p className="text-sm text-bbs-muted mt-1">
                    Create a webhook in your Discord server settings
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-bbs-text mb-2">
                    Discord User ID (for @mention)
                  </label>
                  <input
                    type="text"
                    {...register('discordUserId')}
                    className="w-full px-3 py-2 bg-bbs-bg border border-bbs-border text-bbs-text rounded focus:outline-none focus:ring-2 focus:ring-bbs-accent"
                    placeholder="123456789012345678"
                  />
                  <p className="text-sm text-bbs-muted mt-1">
                    Your Discord user ID. Right-click your name in Discord {'>'} Copy User ID (requires Developer Mode in Discord settings)
                  </p>
                </div>
              </>
            )}

            {/* Push Notifications */}
            <div className="border-t border-bbs-border pt-4 mt-4">
              <h3 className="text-lg font-medium text-bbs-text mb-3 flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                Browser Push Notifications
              </h3>

              {!push.isSupported ? (
                <div className="bg-gray-800/50 border border-gray-600 rounded p-3">
                  <p className="text-sm text-gray-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Push notifications are not supported in this browser
                  </p>
                </div>
              ) : !push.isEnabled ? (
                <div className="bg-gray-800/50 border border-gray-600 rounded p-3">
                  <p className="text-sm text-gray-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Push notifications not configured on server. Add VAPID keys to enable.
                  </p>
                </div>
              ) : push.isSubscribed ? (
                <div className="space-y-3">
                  <div className="bg-green-900/20 border border-green-600/50 rounded p-3">
                    <p className="text-sm text-green-200 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Push notifications enabled - you'll receive alerts on this device
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => push.testNotification()}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                    >
                      Test Notification
                    </button>
                    <button
                      type="button"
                      onClick={() => push.unsubscribe()}
                      disabled={push.loading}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded disabled:opacity-50"
                    >
                      {push.loading ? 'Disabling...' : 'Disable Notifications'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-bbs-muted">
                    Enable push notifications to receive alerts on this device when users page you,
                    even when the admin panel is closed.
                  </p>
                  {push.permission === 'denied' ? (
                    <div className="bg-red-900/20 border border-red-600/50 rounded p-3">
                      <p className="text-sm text-red-200 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Notification permission was denied. Please enable notifications in your browser settings.
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => push.subscribe()}
                      disabled={push.loading}
                      className="px-4 py-2 bg-bbs-accent hover:bg-bbs-accent/80 text-white rounded flex items-center gap-2 disabled:opacity-50"
                    >
                      <BellRing className="w-4 h-4" />
                      {push.loading ? 'Enabling...' : 'Enable Push Notifications'}
                    </button>
                  )}
                  {push.error && (
                    <p className="text-sm text-red-400">{push.error}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* VAPID Server Configuration */}
        <section className="bg-bbs-surface border border-bbs-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-bbs-text mb-4 flex items-center gap-2">
            <Server className="w-5 h-5" />
            Push Notification Server Configuration
          </h2>

          <div className="space-y-4">
            <div className="bg-blue-900/20 border border-blue-600/50 rounded p-3">
              <p className="text-sm text-blue-200">
                <strong>VAPID Keys:</strong> Required for Web Push notifications. Generate new keys or enter existing ones.
                These keys are used to identify your server to push notification services.
              </p>
            </div>

            {/* Status indicator */}
            <div className={`flex items-center gap-2 p-3 rounded ${vapidConfig.enabled ? 'bg-green-900/20 border border-green-600/50' : 'bg-yellow-900/20 border border-yellow-600/50'}`}>
              {vapidConfig.enabled ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-green-200">Push notifications are enabled and working</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm text-yellow-200">Push notifications are not configured - add VAPID keys below</span>
                </>
              )}
            </div>

            {/* Generate Keys Button */}
            <div>
              <button
                type="button"
                onClick={generateVapidKeys}
                disabled={vapidLoading}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded flex items-center gap-2 disabled:opacity-50"
              >
                {vapidLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Key className="w-4 h-4" />
                )}
                {vapidLoading ? 'Generating...' : 'Generate New VAPID Keys'}
              </button>
              <p className="text-sm text-bbs-muted mt-1">
                Warning: Generating new keys will invalidate all existing push subscriptions
              </p>
            </div>

            {/* Public Key */}
            <div>
              <label className="block text-sm font-medium text-bbs-text mb-2">
                VAPID Public Key
              </label>
              <input
                type="text"
                value={vapidConfig.vapid_public_key}
                onChange={(e) => setVapidConfig(prev => ({ ...prev, vapid_public_key: e.target.value }))}
                className="w-full px-3 py-2 bg-bbs-bg border border-bbs-border text-bbs-text rounded focus:outline-none focus:ring-2 focus:ring-bbs-accent font-mono text-sm"
                placeholder="BGXxxxxx..."
              />
            </div>

            {/* Private Key */}
            <div>
              <label className="block text-sm font-medium text-bbs-text mb-2">
                VAPID Private Key
              </label>
              <div className="relative">
                <input
                  type={showPrivateKey ? 'text' : 'password'}
                  value={vapidConfig.vapid_private_key}
                  onChange={(e) => setVapidConfig(prev => ({ ...prev, vapid_private_key: e.target.value }))}
                  className="w-full px-3 py-2 pr-10 bg-bbs-bg border border-bbs-border text-bbs-text rounded focus:outline-none focus:ring-2 focus:ring-bbs-accent font-mono text-sm"
                  placeholder="xxxxxxxxxxxxx..."
                />
                <button
                  type="button"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-bbs-muted hover:text-bbs-text"
                >
                  {showPrivateKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-sm text-bbs-muted mt-1">
                Keep this secret - never share publicly
              </p>
            </div>

            {/* Contact Email */}
            <div>
              <label className="block text-sm font-medium text-bbs-text mb-2">
                Contact Email
              </label>
              <input
                type="email"
                value={vapidConfig.vapid_contact_email}
                onChange={(e) => setVapidConfig(prev => ({ ...prev, vapid_contact_email: e.target.value }))}
                className="w-full px-3 py-2 bg-bbs-bg border border-bbs-border text-bbs-text rounded focus:outline-none focus:ring-2 focus:ring-bbs-accent"
                placeholder="admin@example.com"
              />
              <p className="text-sm text-bbs-muted mt-1">
                Contact email for push service providers (required)
              </p>
            </div>

            {/* Error message */}
            {vapidError && (
              <div className="bg-red-900/20 border border-red-600/50 rounded p-3">
                <p className="text-sm text-red-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {vapidError}
                </p>
              </div>
            )}

            {/* Save Button */}
            <div>
              <button
                type="button"
                onClick={saveVapidConfig}
                disabled={vapidSaving || !vapidConfig.vapid_public_key || !vapidConfig.vapid_private_key}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded flex items-center gap-2 disabled:opacity-50"
              >
                {vapidSaving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {vapidSaving ? 'Saving...' : 'Save VAPID Configuration'}
              </button>
            </div>
          </div>
        </section>

        {/* Grumpy Bot Settings */}
        <section className="bg-bbs-surface border border-bbs-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-bbs-text mb-4 flex items-center gap-2">
            <Bot className="w-5 h-5" />
            Grumpy Bot Settings
          </h2>

          <div className="space-y-4">
            <div className="bg-yellow-900/20 border border-yellow-600/50 rounded p-3">
              <p className="text-sm text-yellow-200">
                <strong>Note:</strong> The grumpy bot automatically activates when a page times out.
                It types naturally with occasional typos for a more human-like experience.
              </p>
            </div>

            <div className="text-sm text-bbs-muted space-y-1">
              <p>- <strong>Typing Speed:</strong> 40-180ms per character (variable)</p>
              <p>• <strong>Typo Rate:</strong> 8% chance per character</p>
              <p>• <strong>Typo Correction:</strong> 300ms pause, then backspace and correct</p>
              <p>• <strong>Personality:</strong> Grumpy 1990s BBS sysop with Amiga nostalgia</p>
            </div>

            <div className="bg-bbs-bg border border-bbs-border rounded p-3">
              <p className="text-sm font-medium text-bbs-text mb-2">Bot Personality Traits:</p>
              <ul className="text-sm text-bbs-muted space-y-1 list-disc list-inside">
                <li>Veteran sysop since 1989, seen everything</li>
                <li>Complains about newbies but eventually helps</li>
                <li>Uses 90s BBS slang (warez, elite, phreaking)</li>
                <li>Proud of Amiga 4000, dislikes "IBM clone trash"</li>
                <li>References FidoNet, TradeWars, Legend of the Red Dragon</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Quick Replies */}
        <section className="bg-bbs-surface border border-bbs-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-bbs-text mb-4">
            Quick Replies
          </h2>

          <div className="space-y-3">
            {config?.quickReplies?.map((reply: { label: string; message: string }, index: number) => (
              <div key={index} className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  value={reply.label}
                  disabled
                  className="px-3 py-2 bg-bbs-bg/50 border border-bbs-border text-bbs-text rounded"
                  placeholder="Label"
                />
                <input
                  type="text"
                  value={reply.message}
                  disabled
                  className="col-span-2 px-3 py-2 bg-bbs-bg/50 border border-bbs-border text-bbs-text rounded"
                  placeholder="Message"
                />
              </div>
            ))}
          </div>
          <p className="text-sm text-bbs-muted mt-3">
            Quick replies appear as buttons in the operator chat interface for fast responses
          </p>
        </section>

        {/* Auto-save indicator */}
        <div className="flex justify-end gap-3 pt-4">
          {updateMutation.isPending && (
            <div className="text-sm text-bbs-muted flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-bbs-accent border-t-transparent rounded-full animate-spin"></div>
              Saving...
            </div>
          )}
          {!updateMutation.isPending && (
            <div className="text-sm text-green-500 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Auto-save enabled
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
