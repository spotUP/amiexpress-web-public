import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { MessageSquare, Bot, Bell, Clock, Shield, Webhook, BellRing, Smartphone, AlertCircle, CheckCircle, Key, RefreshCw, Save, Eye, EyeOff, Server } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { securityLevelOptions } from './security-level-options';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { readAdminToken } from '../api/auth-token';

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
  aiEnabled: boolean;
  aiProvider: 'groq' | 'gemini' | 'openrouter' | 'rule-based';
  aiModelName: string;
  aiTemperature: number;
  aiSystemPrompt: string;
  groqApiKey: string;
  geminiApiKey: string;
  openRouterApiKey: string;
}

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

  // The levels this board has, not a list typed into this file: it offered
  // 70 and 150, which nobody here holds, and called 20 the new user level on
  // a board whose new users are 30.
  const { data: acsLevels } = useQuery({
    queryKey: ['acs-levels'],
    queryFn: () => apiClient.getAcsLevels(),
  });

  const { register, watch, getValues, setValue } = useForm<OperatorChatConfig>({
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

  // Auto-save with debounce (500ms delay).
  //
  // useCallback so the watch subscription below can depend on it honestly:
  // the effect ran once and closed over the first render's autoSave, which
  // happened to work only because everything it touches is a ref or a stable
  // mutation object. Naming the dependency keeps it that way.
  const autoSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const currentValues = getValues();
      updateMutation.mutate(currentValues);
    }, 500);
  }, [getValues, updateMutation]);

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
            'Authorization': `Bearer ${readAdminToken()}`
          }
        });
        if (response.ok) {
          const result = await response.json();
          setVapidConfig({
            vapid_public_key: result.data.vapid_public_key || '',
            vapid_private_key: result.data.vapid_private_key || '',
            vapid_contact_email: result.data.vapid_contact_email || '',
            enabled: result.data.enabled || false
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
          'Authorization': `Bearer ${readAdminToken()}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const result = await response.json();
        setVapidConfig(prev => ({
          ...prev,
          vapid_public_key: result.data.publicKey,
          vapid_private_key: result.data.privateKey
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
          'Authorization': `Bearer ${readAdminToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vapid_public_key: vapidConfig.vapid_public_key,
          vapid_private_key: vapidConfig.vapid_private_key,
          vapid_contact_email: vapidConfig.vapid_contact_email
        })
      });
      const result = await response.json();
      if (response.ok) {
        setVapidConfig(prev => ({ ...prev, enabled: result.data?.enabled }));
        showSuccess(result.message || 'VAPID configuration saved');
        // Refresh push notifications state
        window.location.reload();
      } else {
        setVapidError(result.error || 'Failed to save VAPID configuration');
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
  }, [watch, autoSave]);

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
        <div className="text-content-secondary">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-content-primary flex items-center gap-2">
          <MessageSquare className="w-7 h-7" />
          Operator Chat Settings
        </h1>
        <p className="text-content-secondary mt-2">
          Configure operator chat, grumpy bot, and notification settings
        </p>
      </div>

      <div className="space-y-8">
        {/* General Settings */}
        <section className="bg-surface-1 border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-content-primary mb-4 flex items-center gap-2">
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
              <label htmlFor="enabled" className="text-content-primary">
                Enable Operator Chat (allows users to page sysop with O command)
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Page Timeout (seconds)
              </label>
              <input
                type="number"
                {...register('pageTimeout', {
                  valueAsNumber: true,
                  min: 10,
                  max: 300
                })}
                className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <p className="text-sm text-content-secondary mt-1">
                How long to wait before grumpy bot activates (10-300 seconds)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Page Cooldown (seconds)
              </label>
              <input
                type="number"
                {...register('pageCooldown', {
                  valueAsNumber: true,
                  min: 0,
                  max: 3600
                })}
                className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <p className="text-sm text-content-secondary mt-1">
                Minimum time between page requests from same user
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Max Active Pages Per User
              </label>
              <input
                type="number"
                {...register('maxActivePages', {
                  valueAsNumber: true,
                  min: 1,
                  max: 10
                })}
                className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <p className="text-sm text-content-secondary mt-1">
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
              <label htmlFor="requireCarrier" className="text-content-primary">
                Require Carrier (disable for web/telnet users)
              </label>
            </div>
          </div>
        </section>

        {/* Security Settings */}
        <section className="bg-surface-1 border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-content-primary mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Security Settings
          </h2>

          <div>
            <label className="block text-sm font-medium text-content-primary mb-2">
              Allowed Security Levels
            </label>
            <div className="grid grid-cols-2 gap-2">
              {securityLevelOptions(
                acsLevels?.data?.levels ?? [],
                acsLevels?.data?.inUse ?? [],
                // Levels already allowed stay listed, so a saved choice cannot
                // disappear from the form that owns it.
                config?.allowedSecLevels?.map(Number) ?? [],
              ).map((level) => (
                <label key={level.value} className="flex items-center gap-2 text-content-primary">
                  <input
                    type="checkbox"
                    value={level.value}
                    checked={getValues('allowedSecLevels')?.includes(level.value) ?? false}
                    onChange={(e) => {
                      const current = getValues('allowedSecLevels') || [];
                      if (e.target.checked) {
                        setValue('allowedSecLevels', [...current, level.value]);
                      } else {
                        setValue('allowedSecLevels', current.filter(v => v !== level.value));
                      }
                    }}
                    className="w-4 h-4"
                  />
                  {level.label}
                </label>
              ))}
            </div>
            <p className="text-sm text-content-secondary mt-2">
              Users must have one of these security levels to page the operator
            </p>
          </div>
        </section>

        {/* Quiet Hours */}
        <section className="bg-surface-1 border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-content-primary mb-4 flex items-center gap-2">
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
              <label htmlFor="quietHours.enabled" className="text-content-primary">
                Enable Quiet Hours (disable paging during specific times)
              </label>
            </div>

            {quietHoursEnabled && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-content-primary mb-2">
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
                        className="w-20 px-3 py-2 bg-surface-0 border border-border text-content-primary rounded"
                      />
                      <span className="text-content-primary py-2">:</span>
                      <input
                        type="number"
                        placeholder="Minute"
                        {...register('quietHours.startMinute', {
                          valueAsNumber: true,
                          min: 0,
                          max: 59
                        })}
                        className="w-20 px-3 py-2 bg-surface-0 border border-border text-content-primary rounded"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-content-primary mb-2">
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
                        className="w-20 px-3 py-2 bg-surface-0 border border-border text-content-primary rounded"
                      />
                      <span className="text-content-primary py-2">:</span>
                      <input
                        type="number"
                        placeholder="Minute"
                        {...register('quietHours.endMinute', {
                          valueAsNumber: true,
                          min: 0,
                          max: 59
                        })}
                        className="w-20 px-3 py-2 bg-surface-0 border border-border text-content-primary rounded"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-primary mb-2">
                    Custom Message (optional)
                  </label>
                  <textarea
                    {...register('quietHours.customMessage')}
                    rows={2}
                    className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="The sysop is not available during quiet hours."
                  />
                </div>
              </>
            )}
          </div>
        </section>

        {/* Notification Settings */}
        <section className="bg-surface-1 border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-content-primary mb-4 flex items-center gap-2">
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
              <label htmlFor="notifyOnPage" className="text-content-primary">
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
              <label htmlFor="notifyDiscord" className="text-content-primary">
                Send Discord notifications via webhook
              </label>
            </div>

            {notifyDiscordEnabled && (
              <>
                <div>
                  <label className="block text-sm font-medium text-content-primary mb-2 flex items-center gap-2">
                    <Webhook className="w-4 h-4" />
                    Discord Webhook URL
                  </label>
                  <input
                    type="url"
                    {...register('discordWebhook')}
                    className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="https://discord.com/api/webhooks/..."
                  />
                  <p className="text-sm text-content-secondary mt-1">
                    Create a webhook in your Discord server settings
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-primary mb-2">
                    Discord User ID (for @mention)
                  </label>
                  <input
                    type="text"
                    {...register('discordUserId')}
                    className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="123456789012345678"
                  />
                  <p className="text-sm text-content-secondary mt-1">
                    Your Discord user ID. Right-click your name in Discord {'>'} Copy User ID (requires Developer Mode in Discord settings)
                  </p>
                </div>
              </>
            )}

            {/* Push Notifications */}
            <div className="border-t border-border pt-4 mt-4">
              <h3 className="text-lg font-medium text-content-primary mb-3 flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                Browser Push Notifications
              </h3>

              {!push.isEnabled ? (
                <div className="bg-surface-1/50 border border-border-strong rounded p-3">
                  <p className="text-sm text-content-secondary flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Push notifications not configured on server. Set VAPID keys or use the browser Notification API (auto-enabled on this page).
                  </p>
                </div>
              ) : push.isSubscribed ? (
                <div className="space-y-3">
                  <div className="bg-status-ok/10 border border-status-ok/50 rounded p-3">
                    <p className="text-sm text-status-ok flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Push notifications enabled - you'll receive alerts on this device
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => push.testNotification()}
                      className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-content-inverse text-sm rounded"
                    >
                      Test Notification
                    </button>
                    <button
                      type="button"
                      onClick={() => push.unsubscribe()}
                      disabled={push.loading}
                      className="px-3 py-1.5 bg-status-danger hover:bg-status-danger/90 text-content-inverse text-sm rounded disabled:opacity-50"
                    >
                      {push.loading ? 'Disabling...' : 'Disable Notifications'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-content-secondary">
                    Enable push notifications to receive alerts on this device when users page you,
                    even when the admin panel is closed.
                  </p>
                  {push.permission === 'denied' ? (
                    <div className="bg-status-danger/10 border border-status-danger/50 rounded p-3">
                      <p className="text-sm text-status-danger flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Notification permission was denied. Please enable notifications in your browser settings.
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => push.subscribe()}
                      disabled={push.loading}
                      className="px-4 py-2 bg-accent hover:bg-accent/80 text-content-inverse rounded flex items-center gap-2 disabled:opacity-50"
                    >
                      <BellRing className="w-4 h-4" />
                      {push.loading ? 'Enabling...' : 'Enable Push Notifications'}
                    </button>
                  )}
                  {push.error && (
                    <p className="text-sm text-status-danger">{push.error}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* VAPID Server Configuration */}
        <section className="bg-surface-1 border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-content-primary mb-4 flex items-center gap-2">
            <Server className="w-5 h-5" />
            Push Notification Server Configuration
          </h2>

          <div className="space-y-4">
            <div className="bg-accent/10 border border-accent/50 rounded p-3">
              <p className="text-sm text-status-info">
                <strong>VAPID Keys:</strong> Required for Web Push notifications. Generate new keys or enter existing ones.
                These keys are used to identify your server to push notification services.
              </p>
            </div>

            {/* Status indicator */}
            <div className={`flex items-center gap-2 p-3 rounded ${vapidConfig.enabled ? 'bg-status-ok/10 border border-status-ok/50' : 'bg-status-warn/10 border border-status-warn/50'}`}>
              {vapidConfig.enabled ? (
                <>
                  <CheckCircle className="w-4 h-4 text-status-ok" />
                  <span className="text-sm text-status-ok">Push notifications are enabled and working</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-status-warn" />
                  <span className="text-sm text-status-warn">Push notifications are not configured - add VAPID keys below</span>
                </>
              )}
            </div>

            {/* Generate Keys Button */}
            <div>
              <button
                type="button"
                onClick={generateVapidKeys}
                disabled={vapidLoading}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-content-inverse rounded flex items-center gap-2 disabled:opacity-50"
              >
                {vapidLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Key className="w-4 h-4" />
                )}
                {vapidLoading ? 'Generating...' : 'Generate New VAPID Keys'}
              </button>
              <p className="text-sm text-content-secondary mt-1">
                Warning: Generating new keys will invalidate all existing push subscriptions
              </p>
            </div>

            {/* Public Key */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                VAPID Public Key
              </label>
              <input
                type="text"
                value={vapidConfig.vapid_public_key}
                onChange={(e) => setVapidConfig(prev => ({ ...prev, vapid_public_key: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
                placeholder="BGXxxxxx..."
              />
            </div>

            {/* Private Key */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                VAPID Private Key
              </label>
              <div className="relative">
                <input
                  type={showPrivateKey ? 'text' : 'password'}
                  value={vapidConfig.vapid_private_key}
                  onChange={(e) => setVapidConfig(prev => ({ ...prev, vapid_private_key: e.target.value }))}
                  className="w-full px-3 py-2 pr-10 bg-surface-0 border border-border text-content-primary rounded focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
                  placeholder="xxxxxxxxxxxxx..."
                />
                <button
                  type="button"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content-primary"
                >
                  {showPrivateKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-sm text-content-secondary mt-1">
                Keep this secret - never share publicly
              </p>
            </div>

            {/* Contact Email */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Contact Email
              </label>
              <input
                type="email"
                value={vapidConfig.vapid_contact_email}
                onChange={(e) => setVapidConfig(prev => ({ ...prev, vapid_contact_email: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="admin@example.com"
              />
              <p className="text-sm text-content-secondary mt-1">
                Contact email for push service providers (required)
              </p>
            </div>

            {/* Error message */}
            {vapidError && (
              <div className="bg-status-danger/10 border border-status-danger/50 rounded p-3">
                <p className="text-sm text-status-danger flex items-center gap-2">
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
                className="px-4 py-2 bg-status-ok hover:bg-status-ok/90 text-content-inverse rounded flex items-center gap-2 disabled:opacity-50"
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

        {/* AI Bot Settings */}
        <section className="bg-surface-1 border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-content-primary mb-4 flex items-center gap-2">
            <Bot className="w-5 h-5" />
            AI Bot Settings
          </h2>

          <div className="space-y-4">
            <div className="bg-status-warn/10 border border-status-warn/50 rounded p-3">
              <p className="text-sm text-status-warn">
                <strong>Note:</strong> The AI bot automatically activates when a page times out.
                Configure which AI provider to use, or choose "Rule-based only" to use the
                built-in response patterns. API keys can be set in the fields below or via
                environment variables (will fall back to env vars if form fields are empty).
              </p>
            </div>

            {/* Enable AI */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" {...register('aiEnabled')} className="w-4 h-4" />
              <div>
                <span className="text-sm font-medium text-content-primary">Enable AI Bot</span>
                <p className="text-xs text-content-secondary">When disabled, only rule-based responses are used</p>
              </div>
            </label>

            {/* Provider */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">AI Provider</label>
              <select {...register('aiProvider')} className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded">
                <option value="openrouter">OpenRouter (auto-discovers free models)</option>
                <option value="groq">Groq (fast, Llama 3.1 8B)</option>
                <option value="gemini">Google Gemini (good quality, 1.5 Flash)</option>
                <option value="rule-based">Rule-based only (no API key needed)</option>
              </select>
              <p className="text-xs text-content-secondary mt-1">Select which AI provider to use. When a provider-specific model is set below, it overrides the default.</p>
            </div>

            {/* Model Name */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">Model Name (optional)</label>
              <input type="text" {...register('aiModelName')} className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded" placeholder="Leave empty for provider default" />
              <p className="text-xs text-content-secondary mt-1">Override the default model for the selected provider. For OpenRouter, you can specify any model ID from openrouter.ai/models.</p>
            </div>

            {/* API Keys */}
            <div className="border-t border-border pt-4 space-y-3">
              <h3 className="text-sm font-medium text-content-primary">API Keys</h3>
              <p className="text-xs text-content-secondary">Leave empty to use environment variables (GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY)</p>
              <div>
                <label className="block text-sm font-medium text-content-primary mb-1">OpenRouter API Key</label>
                <input type="password" {...register('openRouterApiKey')} className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded font-mono text-xs" placeholder="sk-or-v1-..." autoComplete="off" />
              </div>
              <div>
                <label className="block text-sm font-medium text-content-primary mb-1">Groq API Key</label>
                <input type="password" {...register('groqApiKey')} className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded font-mono text-xs" placeholder="gsk_..." autoComplete="off" />
              </div>
              <div>
                <label className="block text-sm font-medium text-content-primary mb-1">Gemini API Key</label>
                <input type="password" {...register('geminiApiKey')} className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded font-mono text-xs" placeholder="AIzaSy..." autoComplete="off" />
              </div>
            </div>

            {/* Temperature */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">Temperature: {watch('aiTemperature') ?? 0.9}</label>
              <input type="range" min="0" max="2" step="0.1" {...register('aiTemperature', { valueAsNumber: true })} className="w-full" />
              <div className="flex justify-between text-xs text-content-secondary">
                <span>0 (deterministic)</span>
                <span>1 (balanced)</span>
                <span>2 (creative)</span>
              </div>
            </div>

            {/* System Prompt */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">System Prompt / Personality</label>
              <textarea {...register('aiSystemPrompt')} rows={6} className="w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded font-mono text-xs" placeholder="Leave empty for default grumpy sysop personality" />
              <p className="text-xs text-content-secondary mt-1">Custom system prompt that defines the bot's personality and behavior. Leave empty to use the default grumpy 1990s sysop personality.</p>
            </div>

            <div className="bg-surface-0 border border-border rounded p-3">
              <p className="text-sm font-medium text-content-primary mb-2">Fallback Chain:</p>
              <ol className="text-sm text-content-secondary space-y-1 list-decimal list-inside">
                <li>Configured provider (or cascade: Groq → Gemini → OpenRouter if set to cascade)</li>
                <li>Rule-based patterns (built-in, works without any API key)</li>
              </ol>
            </div>
          </div>
        </section>

        {/* Quick Replies */}
        <section className="bg-surface-1 border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-content-primary mb-4">
            Quick Replies
          </h2>

          <div className="space-y-3">
            {config?.quickReplies?.map((reply: { label: string; message: string }, index: number) => (
              <div key={index} className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  value={reply.label}
                  disabled
                  className="px-3 py-2 bg-surface-0/50 border border-border text-content-primary rounded"
                  placeholder="Label"
                />
                <input
                  type="text"
                  value={reply.message}
                  disabled
                  className="col-span-2 px-3 py-2 bg-surface-0/50 border border-border text-content-primary rounded"
                  placeholder="Message"
                />
              </div>
            ))}
          </div>
          <p className="text-sm text-content-secondary mt-3">
            Quick replies appear as buttons in the operator chat interface for fast responses
          </p>
        </section>

        {/* Auto-save indicator */}
        <div className="flex justify-end gap-3 pt-4">
          {updateMutation.isPending && (
            <div className="text-sm text-content-secondary flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
              Saving...
            </div>
          )}
          {!updateMutation.isPending && (
            <div className="text-sm text-status-ok flex items-center gap-2">
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
