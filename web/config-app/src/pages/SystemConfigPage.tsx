import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Key, Trash2, RefreshCw, Eye, EyeOff, Lock, Mail, CheckCircle, XCircle } from 'lucide-react';
import { apiClient } from '../api/client';
import type { SystemConfig, Language, ScreenType } from '../types';
import { useEffect, useRef, useState } from 'react';
import { useNotification } from '../contexts/NotificationContext';

// Standard AmiExpress security levels
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
  { value: 200, label: '200 - Sysop' },
  { value: 250, label: '250 - Senior Sysop' },
  { value: 255, label: '255 - Super User' },
];

// AmiExpress editor types (express.e:31745+)
const EDITOR_TYPES = [
  { value: 'FULL', label: 'Full Screen Editor' },
  { value: 'LINE', label: 'Line Editor' },
  { value: 'EXT', label: 'External Editor' },
];

// Common lines per screen values
const LINES_PER_SCREEN = [
  { value: 23, label: '23 lines' },
  { value: 24, label: '24 lines (standard)' },
  { value: 25, label: '25 lines' },
  { value: 40, label: '40 lines' },
  { value: 50, label: '50 lines' },
];

// Common idle timeout values (minutes)
const IDLE_TIMEOUTS = [
  { value: 3, label: '3 minutes' },
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
];

// Log retention presets (days)
const LOG_RETENTION_PRESETS = [
  { value: 7, label: '1 week' },
  { value: 14, label: '2 weeks' },
  { value: 30, label: '1 month' },
  { value: 90, label: '3 months' },
  { value: 180, label: '6 months' },
  { value: 365, label: '1 year' },
];

export function SystemConfigPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [isDeletingKey, setIsDeletingKey] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const skipNextSave = useRef(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Password visibility and SMTP test state
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [smtpTestStatus, setSmtpTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [smtpTestMessage, setSmtpTestMessage] = useState<string>('');

  // Define categories
  const categories = ['All', 'General', 'Security & Access', 'Networking', 'System'];

  // Helper function to determine if a section should be shown based on category
  const shouldShowSection = (section: string): boolean => {
    if (selectedCategory === 'All') return true;

    const categoryMap: Record<string, string[]> = {
      'General': ['Basic Information', 'Display Settings', 'Language Settings'],
      'Security & Access': ['Security Settings', 'Session Settings', 'New User Defaults', 'Auto-Validation Settings', 'Password & Account Security'],
      'Networking': ['Mail & SMTP Settings', 'Email Notification Events', 'FTP Server Settings', 'HTTP Server Settings', 'BBS Server Ports', 'SSH Key Management'],
      'System': ['System Limits', 'File Management', 'System Behavior', 'Logging Settings']
    };

    return categoryMap[selectedCategory]?.includes(section) || false;
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['systemConfig'],
    queryFn: () => apiClient.getSystemConfig(),
  });

  // Fetch languages for dropdown
  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => apiClient.getLanguages(),
  });

  // Fetch screen types for dropdown
  const { data: screenTypesData } = useQuery({
    queryKey: ['screenTypes'],
    queryFn: () => apiClient.getScreenTypes(),
  });

  // SSH Key Info Query
  const { data: sshKeyData, refetch: refetchSSHKey } = useQuery({
    queryKey: ['sshKeyInfo'],
    queryFn: () => apiClient.getSSHKeyInfo(),
    refetchInterval: false,
  });

  const mutation = useMutation({
    mutationFn: (updates: Partial<SystemConfig>) =>
      apiClient.updateSystemConfig(updates),
    onSuccess: (resp) => {
      queryClient.invalidateQueries({ queryKey: ['systemConfig'] });
      if (resp?.data) {
        reset(resp.data as any);
      }
      setAutoSaveStatus('saved');
      showSuccess('System configuration saved');
    },
    onError: (error: Error) => {
      setAutoSaveStatus('error');
      showError(`Failed to update configuration: ${error.message}`);
    },
  });

  const { register, watch, reset } = useForm<SystemConfig>({
    values: {
      language_base: 'Languages',
      default_language: 'English',
      max_nodes: 255,
      telnet_port: 64128,
      ssh_port: 31337,
      ...data?.data
    },
  });

  useEffect(() => {
    if (data?.data) {
      reset(data.data);
      skipNextSave.current = true;
    }
  }, [data, reset]);

  useEffect(() => {
    const subscription = watch((value) => {
      if (!data?.data) return;
      if (skipNextSave.current) {
        skipNextSave.current = false;
        return;
      }
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
      setAutoSaveStatus('saving');
      autoSaveTimer.current = setTimeout(() => {
        const { created_at, updated_at, ...updates } = value as any;

        // Don't overwrite existing encrypted passwords with empty strings
        // If password field is empty, remove it from updates to preserve existing value
        if (!updates.smtp_password || updates.smtp_password === '') {
          delete updates.smtp_password;
        }
        if (!updates.reg_key || updates.reg_key === '') {
          delete updates.reg_key;
        }

        mutation.mutate(updates);
      }, 800);
    });

    return () => {
      subscription.unsubscribe();
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, [watch, mutation, data]);

  const handleGenerateSSHKey = async () => {
    if (sshKeyData?.data?.exists) {
      const confirmed = await confirm({
        title: 'Overwrite SSH Key?',
        message: 'An SSH key already exists. Do you want to overwrite it? This will require a server restart.',
        confirmText: 'Overwrite',
        cancelText: 'Cancel',
        type: 'warning',
      });
      if (!confirmed) {
        return;
      }
    }

    setIsGeneratingKey(true);
    try {
      const result = await apiClient.generateSSHKey(4096, sshKeyData?.data?.exists);
      showSuccess(`SSH key generated successfully!\n\nFingerprint: ${result.data.fingerprint}\n\nPlease restart the BBS server for the changes to take effect.`);
      refetchSSHKey();
    } catch (error: any) {
      showError(`Failed to generate SSH key: ${error.message}`);
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleDeleteSSHKey = async () => {
    const confirmed = await confirm({
      title: 'Delete SSH Key?',
      message: 'Are you sure you want to delete the SSH key? The SSH server will not be available until a new key is generated. This requires a server restart.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
    });
    if (!confirmed) {
      return;
    }

    setIsDeletingKey(true);
    try {
      await apiClient.deleteSSHKey();
      showSuccess('SSH key deleted successfully. Please restart the BBS server for the changes to take effect.');
      refetchSSHKey();
    } catch (error: any) {
      showError(`Failed to delete SSH key: ${error.message}`);
    } finally {
      setIsDeletingKey(false);
    }
  };

  const handleTestSmtp = async () => {
    setSmtpTestStatus('testing');
    setSmtpTestMessage('');
    try {
      const result = await apiClient.testSmtp();
      if (result?.data?.success) {
        setSmtpTestStatus('success');
        setSmtpTestMessage('SMTP test email sent successfully!');
        showSuccess('SMTP test email sent successfully!');
      } else {
        setSmtpTestStatus('error');
        setSmtpTestMessage(result?.data?.error || 'SMTP test failed');
        showError(`SMTP test failed: ${result?.data?.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      setSmtpTestStatus('error');
      setSmtpTestMessage(error.message);
      showError(`SMTP test failed: ${error.message}`);
    }
  };

  if (isLoading) {
    return <div className="text-bbs-text">Loading system configuration...</div>;
  }

  if (error) {
    return (
      <div className="bg-bbs-accent/10 border border-bbs-accent text-bbs-accent px-4 py-3 rounded">
        Error loading system configuration: {(error as Error).message}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-bbs-accent mb-2">System Configuration</h1>
        <div className="flex items-center space-x-3">
          <p className="text-bbs-muted">Global BBS settings and parameters</p>
          <span className="text-xs text-bbs-muted">
            {autoSaveStatus === 'saving' && 'Saving...'}
            {autoSaveStatus === 'saved' && 'Saved'}
            {autoSaveStatus === 'error' && 'Save failed'}
            {autoSaveStatus === 'idle' && 'Auto-save ready'}
          </span>
        </div>
      </div>

      {/* Category Filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            type="button"
            className={`px-4 py-2 rounded transition-colors ${
              selectedCategory === category
                ? 'bg-bbs-accent text-bbs-background'
                : 'bg-bbs-secondary text-bbs-text hover:bg-bbs-secondary/80'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <form onSubmit={(e) => e.preventDefault()} className="space-y-8">
        {/* Basic Information */}
        {shouldShowSection('Basic Information') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="bbs_name" className="label">
                BBS Name
              </label>
              <input
                id="bbs_name"
                type="text"
                {...register('bbs_name', { required: true })}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="sysop_name" className="label">
                Sysop Name
              </label>
              <input
                id="sysop_name"
                type="text"
                {...register('sysop_name', { required: true })}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="location" className="label">
                Location
              </label>
              <input
                id="location"
                type="text"
                {...register('location')}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="phone" className="label">
                Phone
              </label>
              <input
                id="phone"
                type="text"
                {...register('phone')}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                type="email"
                {...register('email')}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="website" className="label">
                Website
              </label>
              <input
                id="website"
                type="url"
                {...register('website')}
                className="input-field w-full"
              />
            </div>
          </div>
        </div>
        )}

        {/* Security Settings */}
        {shouldShowSection('Security Settings') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">Security Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="min_password_length" className="label">
                Minimum Password Length
              </label>
              <input
                id="min_password_length"
                type="number"
                {...register('min_password_length', { min: 0, max: 32, valueAsNumber: true })}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="min_password_strength" className="label">
                Minimum Password Strength
              </label>
              <select
                id="min_password_strength"
                {...register('min_password_strength', { setValueAs: (v) => parseInt(v, 10) })}
                className="input-field w-full"
              >
                <option value={0}>0 - No check</option>
                <option value={1}>1 - Weak</option>
                <option value={2}>2 - Medium</option>
                <option value={3}>3 - Strong</option>
                <option value={4}>4 - Very strong</option>
              </select>
            </div>

            <div>
              <label htmlFor="max_password_fails" className="label">
                Max Password Fails
              </label>
              <select
                id="max_password_fails"
                {...register('max_password_fails', { setValueAs: (v) => parseInt(v, 10) })}
                className="input-field w-full"
              >
                <option value={-1}>Unlimited (-1)</option>
                <option value={3}>3 attempts</option>
                <option value={5}>5 attempts</option>
                <option value={10}>10 attempts</option>
                <option value={20}>20 attempts</option>
              </select>
            </div>

            <div>
              <label htmlFor="password_security" className="label">
                Password Security
              </label>
              <select
                id="password_security"
                {...register('password_security')}
                className="input-field w-full"
              >
                <option value="bcrypt">bcrypt</option>
                <option value="sha256">SHA256</option>
                <option value="md5">MD5</option>
                <option value="legacy">Legacy (imported)</option>
              </select>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="strict_password_policy"
                type="checkbox"
                {...register('strict_password_policy')}
                className="w-4 h-4"
              />
              <label htmlFor="strict_password_policy" className="text-sm text-bbs-text">
                Strict Password Policy
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="auto_validate"
                type="checkbox"
                {...register('auto_validate')}
                className="w-4 h-4"
              />
              <label htmlFor="auto_validate" className="text-sm text-bbs-text">
                Auto Validate New Users
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="confirm_deletions"
                type="checkbox"
                {...register('confirm_deletions')}
                className="w-4 h-4"
              />
              <label htmlFor="confirm_deletions" className="text-sm text-bbs-text">
                Confirm Deletions
              </label>
            </div>
          </div>
        </div>
        )}

        {/* Session Settings */}
        {shouldShowSection('Session Settings') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">Session Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="default_time_limit" className="label">
                Default Time Limit (minutes)
              </label>
              <div className="flex space-x-2">
                <input
                  id="default_time_limit"
                  type="number"
                  placeholder="-1 for unlimited"
                  {...register('default_time_limit', { min: -1, max: 1440, valueAsNumber: true })}
                  className="input-field w-full"
                />
                <span className="text-xs text-bbs-muted self-center">-1 = unlimited</span>
              </div>
            </div>

            <div>
              <label htmlFor="max_session_time" className="label">
                Max Session Time (minutes)
              </label>
              <div className="flex space-x-2">
                <input
                  id="max_session_time"
                  type="number"
                  placeholder="-1 for unlimited"
                  {...register('max_session_time', { min: -1, max: 1440, valueAsNumber: true })}
                  className="input-field w-full"
                />
                <span className="text-xs text-bbs-muted self-center">-1 = unlimited</span>
              </div>
            </div>

            <div>
              <label htmlFor="idle_timeout" className="label">
                Idle Timeout
              </label>
              <select
                id="idle_timeout"
                {...register('idle_timeout', { setValueAs: (v) => parseInt(v, 10) })}
                className="input-field w-full"
              >
                {IDLE_TIMEOUTS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        )}

        {/* New User Defaults */}
        {shouldShowSection('New User Defaults') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">New User Defaults</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="new_user_sec_level" className="label">
                Default Security Level
              </label>
              <select
                id="new_user_sec_level"
                {...register('new_user_sec_level', { setValueAs: (v) => parseInt(v, 10) })}
                className="input-field w-full"
              >
                {SECURITY_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="new_user_time_limit" className="label">
                Default Daily Time (minutes)
              </label>
              <div className="flex space-x-2">
                <input
                  id="new_user_time_limit"
                  type="number"
                  placeholder="-1 for unlimited"
                  {...register('new_user_time_limit', { min: -1, max: 1440, valueAsNumber: true, value: -1 })}
                  className="input-field w-full"
                />
                <span className="text-xs text-bbs-muted self-center">-1 = unlimited</span>
              </div>
            </div>
            <div>
              <label htmlFor="new_user_chat_limit" className="label">
                Chat Time Limit (minutes)
              </label>
              <div className="flex space-x-2">
                <input
                  id="new_user_chat_limit"
                  type="number"
                  placeholder="-1 for unlimited"
                  {...register('new_user_chat_limit', { min: -1, max: 1440, valueAsNumber: true, value: -1 })}
                  className="input-field w-full"
                />
                <span className="text-xs text-bbs-muted self-center">-1 = unlimited</span>
              </div>
            </div>
            <div>
              <label htmlFor="new_user_lines_per_screen" className="label">
                Lines Per Screen
              </label>
              <select
                id="new_user_lines_per_screen"
                {...register('new_user_lines_per_screen', { setValueAs: (v) => parseInt(v, 10) })}
                className="input-field w-full"
              >
                {LINES_PER_SCREEN.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="new_user_protocol" className="label">
                Default Protocol
              </label>
              <select
                id="new_user_protocol"
                {...register('new_user_protocol')}
                className="input-field w-full"
              >
                <option value="zmodem">ZMODEM (Recommended)</option>
                <option value="ymodem">YMODEM (Batch)</option>
                <option value="xmodem-1k">XMODEM-1K</option>
                <option value="xmodem-crc">XMODEM-CRC</option>
                <option value="xmodem">XMODEM (Checksum)</option>
                <option value="punter">Punter (C64/C128)</option>
                <option value="websocket">WebSocket (Browser)</option>
              </select>
            </div>
            <div>
              <label htmlFor="new_user_screen_type" className="label">
                Default Screen Type
              </label>
              <select
                id="new_user_screen_type"
                {...register('new_user_screen_type')}
                className="input-field w-full"
              >
                <option value="ANSI">ANSI</option>
                <option value="ASCII">ASCII</option>
                <option value="RIP">RIP</option>
                <option value="C64">C64 / PETSCII</option>
                {/* Include additional screen types from config */}
                {((screenTypesData?.data || []) as ScreenType[])
                  .filter((st: ScreenType) =>
                    !['ANSI', 'ASCII', 'RIP', 'C64'].includes(st.screen_type?.toUpperCase())
                  )
                  .map((st: ScreenType) => (
                    <option key={st.id} value={st.screen_type}>
                      {st.screen_title || st.screen_type}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor="new_user_editor" className="label">
                Default Editor
              </label>
              <select
                id="new_user_editor"
                {...register('new_user_editor')}
                className="input-field w-full"
              >
                {EDITOR_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="new_user_conf_access" className="label">
                Default Conference Access
              </label>
              <input
                id="new_user_conf_access"
                type="text"
                {...register('new_user_conf_access')}
                className="input-field w-full"
                placeholder="XXX"
              />
              <p className="text-xs text-bbs-muted mt-1">ACS string applied to new accounts</p>
            </div>
            <div className="flex items-center space-x-3">
              <input
                id="new_user_expert"
                type="checkbox"
                {...register('new_user_expert')}
                className="w-4 h-4"
              />
              <label htmlFor="new_user_expert" className="text-sm text-bbs-text">
                Start new users in Expert mode
              </label>
            </div>
            <div className="flex items-center space-x-3">
              <input
                id="new_user_ansi"
                type="checkbox"
                {...register('new_user_ansi')}
                className="w-4 h-4"
              />
              <label htmlFor="new_user_ansi" className="text-sm text-bbs-text">
                Enable ANSI by default
              </label>
            </div>
            <div className="flex items-center space-x-3">
              <input
                id="new_user_available_chat"
                type="checkbox"
                {...register('new_user_available_chat')}
                className="w-4 h-4"
              />
              <label htmlFor="new_user_available_chat" className="text-sm text-bbs-text">
                Allow chat by default
              </label>
            </div>
            <div className="flex items-center space-x-3">
              <input
                id="new_user_quiet_node"
                type="checkbox"
                {...register('new_user_quiet_node')}
                className="w-4 h-4"
              />
              <label htmlFor="new_user_quiet_node" className="text-sm text-bbs-text">
                Quiet node (no join beeps)
              </label>
            </div>
            <div className="flex items-center space-x-3">
              <input
                id="new_user_auto_rejoin"
                type="checkbox"
                {...register('new_user_auto_rejoin')}
                className="w-4 h-4"
              />
              <label htmlFor="new_user_auto_rejoin" className="text-sm text-bbs-text">
                Auto rejoin last conference
              </label>
            </div>
          </div>
        </div>
        )}

        {/* Auto-Validation Settings */}
        {shouldShowSection('Auto-Validation Settings') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">Auto-Validation Settings</h2>
          <p className="text-sm text-bbs-muted mb-6">
            Configure automatic validation for new users. Users can be validated after a delay period
            or instantly with a password.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="autoval_delay" className="label">
                Auto-Validation Delay (hours)
              </label>
              <input
                id="autoval_delay"
                type="number"
                {...register('autoval_delay', { min: -1, valueAsNumber: true })}
                className="input-field w-full"
                placeholder="-1 to disable"
              />
              <p className="text-xs text-bbs-muted mt-1">
                Hours to wait before auto-validating. -1 = disabled, 0 = immediate.
              </p>
            </div>

            <div>
              <label htmlFor="autoval_preset" className="label">
                Auto-Validation Preset
              </label>
              <input
                id="autoval_preset"
                type="text"
                {...register('autoval_preset')}
                className="input-field w-full"
                placeholder="Preset name"
              />
              <p className="text-xs text-bbs-muted mt-1">
                User preset to apply when auto-validating (from Presets directory).
              </p>
            </div>

            <div>
              <label htmlFor="autoval_password" className="label">
                Instant Validation Password
              </label>
              <input
                id="autoval_password"
                type="password"
                {...register('autoval_password')}
                className="input-field w-full"
                placeholder="Leave empty to disable"
              />
              <p className="text-xs text-bbs-muted mt-1">
                Password users can enter for instant validation during signup.
              </p>
            </div>
          </div>
        </div>
        )}

        {/* Password & Account Security */}
        {shouldShowSection('Password & Account Security') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">Password & Account Security</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="password_expiry_days" className="label">
                Password Expiry (days)
              </label>
              <input
                id="password_expiry_days"
                type="number"
                {...register('password_expiry_days', { min: 0, valueAsNumber: true })}
                className="input-field w-full"
                placeholder="0 = never expires"
              />
              <p className="text-xs text-bbs-muted mt-1">
                Days until password expires and user must change it. 0 = never.
              </p>
            </div>

            <div>
              <label htmlFor="auto_deactivate_days" className="label">
                Auto-Deactivate After (days)
              </label>
              <input
                id="auto_deactivate_days"
                type="number"
                {...register('auto_deactivate_days', { min: 0, valueAsNumber: true })}
                className="input-field w-full"
                placeholder="0 = never deactivate"
              />
              <p className="text-xs text-bbs-muted mt-1">
                Days of inactivity before user account is deactivated. 0 = never.
              </p>
            </div>
          </div>
        </div>
        )}

        {/* Display Settings */}
        {shouldShowSection('Display Settings') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">Display Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center space-x-3">
              <input
                id="ansi_enabled"
                type="checkbox"
                {...register('ansi_enabled')}
                className="w-4 h-4"
              />
              <label htmlFor="ansi_enabled" className="text-sm text-bbs-text">
                ANSI Graphics Enabled
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="allow_custom_screens"
                type="checkbox"
                {...register('allow_custom_screens')}
                className="w-4 h-4"
              />
              <label htmlFor="allow_custom_screens" className="text-sm text-bbs-text">
                Allow Custom Screens
              </label>
            </div>
          </div>
        </div>
        )}

        {/* Language Settings */}
        {shouldShowSection('Language Settings') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">Language Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="language_base" className="label">
                Language Base Directory
              </label>
              <input
                id="language_base"
                type="text"
                {...register('language_base')}
                className="input-field w-full"
                placeholder="Languages"
              />
              <p className="text-xs text-bbs-muted mt-1">Directory containing language files</p>
            </div>

            <div>
              <label htmlFor="default_language" className="label">
                Default Language
              </label>
              <select
                id="default_language"
                {...register('default_language')}
                className="input-field w-full"
              >
                <option value="English">English (default)</option>
                {/* Include languages from config */}
                {((languagesData?.data || []) as Language[])
                  .filter((lang: Language) => lang.enabled && lang.title?.toLowerCase() !== 'english')
                  .map((lang: Language) => (
                    <option key={lang.id} value={lang.title || lang.language_code}>
                      {lang.title || lang.language_code}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-bbs-muted mt-1">Language shown to new users</p>
            </div>
          </div>
        </div>
        )}

        {/* System Limits */}
        {shouldShowSection('System Limits') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">System Limits</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="max_conferences" className="label">
                Max Conferences
              </label>
              <input
                id="max_conferences"
                type="number"
                {...register('max_conferences', { min: 1, max: 256, valueAsNumber: true })}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="max_message_bases" className="label">
                Max Message Bases
              </label>
              <input
                id="max_message_bases"
                type="number"
                {...register('max_message_bases', { min: 1, max: 1024, valueAsNumber: true })}
                className="input-field w-full"
              />
              <p className="text-xs text-bbs-muted mt-1">Up to 1024; lower this if you want a tighter cap.</p>
            </div>

            <div>
              <label htmlFor="max_file_areas" className="label">
                Max File Areas
              </label>
              <input
                id="max_file_areas"
                type="number"
                {...register('max_file_areas', { min: 1, max: 1024, valueAsNumber: true })}
                className="input-field w-full"
              />
              <p className="text-xs text-bbs-muted mt-1">Supports up to 1024 file areas.</p>
            </div>

            <div>
              <label htmlFor="max_nodes" className="label">
                Max Nodes
              </label>
              <input
                id="max_nodes"
                type="number"
                {...register('max_nodes', { min: 1, max: 255, valueAsNumber: true })}
                className="input-field w-full"
              />
              <p className="text-xs text-bbs-muted mt-1">Supports up to 255 nodes.</p>
            </div>
          </div>
        </div>
        )}

        {/* File Management */}
        {shouldShowSection('File Management') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">File Management</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center space-x-3">
              <input
                id="file_check_enabled"
                type="checkbox"
                {...register('file_check_enabled')}
                className="w-4 h-4"
              />
              <label htmlFor="file_check_enabled" className="text-sm text-bbs-text">
                File Check Enabled
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="upload_check_virus"
                type="checkbox"
                {...register('upload_check_virus')}
                className="w-4 h-4"
              />
              <label htmlFor="upload_check_virus" className="text-sm text-bbs-text">
                Check Uploads for Viruses
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="upload_check_dupe"
                type="checkbox"
                {...register('upload_check_dupe')}
                className="w-4 h-4"
              />
              <label htmlFor="upload_check_dupe" className="text-sm text-bbs-text">
                Check for Duplicate Uploads
              </label>
            </div>

            <div>
              <label htmlFor="local_upload_path" className="label">
                Local Upload Path
              </label>
              <input
                id="local_upload_path"
                type="text"
                {...register('local_upload_path')}
                className="input-field w-full"
                placeholder="RAM:uploads"
              />
              <p className="text-xs text-bbs-muted mt-1">Default path for local file uploads.</p>
            </div>

            <div>
              <label htmlFor="filediz_syscmd" className="label">
                File DIZ Extract Command
              </label>
              <input
                id="filediz_syscmd"
                type="text"
                {...register('filediz_syscmd')}
                className="input-field w-full"
                placeholder="lha e {file} FILE_ID.DIZ"
              />
              <p className="text-xs text-bbs-muted mt-1">Command to extract FILE_ID.DIZ from archives.</p>
            </div>

            <div>
              <label htmlFor="max_desclines" className="label">
                Max Description Lines
              </label>
              <input
                id="max_desclines"
                type="number"
                {...register('max_desclines', { min: 1, max: 100, valueAsNumber: true })}
                className="input-field w-full"
                placeholder="25"
              />
              <p className="text-xs text-bbs-muted mt-1">Maximum lines for file descriptions.</p>
            </div>

            <div>
              <label htmlFor="hold_access_level" className="label">
                Hold Files Access Level
              </label>
              <input
                id="hold_access_level"
                type="number"
                {...register('hold_access_level', { min: 0, max: 255, valueAsNumber: true })}
                className="input-field w-full"
                placeholder="100"
              />
              <p className="text-xs text-bbs-muted mt-1">Minimum access level to put files on hold.</p>
            </div>
          </div>
        </div>
        )}

        {/* Mail & SMTP Settings */}
        {shouldShowSection('Mail & SMTP Settings') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">Mail & SMTP Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="smtp_server" className="label">
                SMTP Server
              </label>
              <input
                id="smtp_server"
                type="text"
                {...register('smtp_server')}
                className="input-field w-full"
              />
              <p className="text-xs text-bbs-muted mt-1">Hostname of your SMTP relay (e.g., smtp.example.com).</p>
            </div>

            <div>
              <label htmlFor="smtp_port" className="label">
                SMTP Port
              </label>
              <input
                id="smtp_port"
                type="number"
                {...register('smtp_port', { min: 1, max: 65535, valueAsNumber: true })}
                className="input-field w-full"
              />
              <p className="text-xs text-bbs-muted mt-1">Typical: 25, 465 (SSL), or 587 (STARTTLS).</p>
            </div>

            <div>
              <label htmlFor="smtp_username" className="label">
                SMTP Username
              </label>
              <input
                id="smtp_username"
                type="text"
                {...register('smtp_username')}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="smtp_password" className="label flex items-center gap-2">
                SMTP Password
                <span className="inline-flex items-center gap-1 text-xs text-green-400 font-normal">
                  <Lock size={12} />
                  Encrypted
                </span>
              </label>
              <div className="relative">
                <input
                  id="smtp_password"
                  type={showSmtpPassword ? 'text' : 'password'}
                  {...register('smtp_password')}
                  className="input-field w-full pr-10"
                  placeholder="Enter new password or leave empty to keep existing"
                />
                <button
                  type="button"
                  onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-bbs-muted hover:text-bbs-text transition-colors"
                  title={showSmtpPassword ? 'Hide password' : 'Show password'}
                >
                  {showSmtpPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-bbs-muted mt-1">Leave empty to keep existing encrypted credentials.</p>
            </div>

            <div>
              <label htmlFor="smtp_from_email" className="label">
                SMTP From Email
              </label>
              <input
                id="smtp_from_email"
                type="email"
                {...register('smtp_from_email')}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="sysop_email" className="label">
                Sysop Email
              </label>
              <input
                id="sysop_email"
                type="email"
                {...register('sysop_email')}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="bbs_email" className="label">
                BBS Email
              </label>
              <input
                id="bbs_email"
                type="email"
                {...register('bbs_email')}
                className="input-field w-full"
              />
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="allow_internet_email"
                type="checkbox"
                {...register('allow_internet_email')}
                className="w-4 h-4"
              />
              <label htmlFor="allow_internet_email" className="text-sm text-bbs-text">
                Allow Internet Email
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="smtp_ssl"
                type="checkbox"
                {...register('smtp_ssl')}
                className="w-4 h-4"
              />
              <label htmlFor="smtp_ssl" className="text-sm text-bbs-text">
                SMTP SSL/TLS
              </label>
            </div>
          </div>

          {/* SMTP Test Section */}
          <div className="mt-6 pt-6 border-t border-bbs-border">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleTestSmtp}
                disabled={smtpTestStatus === 'testing'}
                className="btn-primary flex items-center gap-2"
              >
                {smtpTestStatus === 'testing' ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    <span>Testing...</span>
                  </>
                ) : (
                  <>
                    <Mail size={18} />
                    <span>Test SMTP Connection</span>
                  </>
                )}
              </button>

              {smtpTestStatus === 'success' && (
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle size={18} />
                  <span className="text-sm">{smtpTestMessage}</span>
                </div>
              )}

              {smtpTestStatus === 'error' && (
                <div className="flex items-center gap-2 text-red-400">
                  <XCircle size={18} />
                  <span className="text-sm">{smtpTestMessage}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-bbs-muted mt-2">
              Sends a test email to the sysop email address to verify SMTP configuration.
            </p>
          </div>
        </div>
        )}

        {/* Email Notification Events */}
        {shouldShowSection('Email Notification Events') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">Email Notification Events</h2>
          <p className="text-sm text-bbs-muted mb-6">
            Configure which BBS events trigger email notifications to the sysop.
            Requires SMTP to be configured above.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center space-x-3">
              <input
                id="mail_on_new_user"
                type="checkbox"
                {...register('mail_on_new_user')}
                className="w-4 h-4"
              />
              <label htmlFor="mail_on_new_user" className="text-sm text-bbs-text">
                New User Registration
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="mail_on_logon"
                type="checkbox"
                {...register('mail_on_logon')}
                className="w-4 h-4"
              />
              <label htmlFor="mail_on_logon" className="text-sm text-bbs-text">
                User Logon
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="mail_on_logoff"
                type="checkbox"
                {...register('mail_on_logoff')}
                className="w-4 h-4"
              />
              <label htmlFor="mail_on_logoff" className="text-sm text-bbs-text">
                User Logoff
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="mail_on_upload"
                type="checkbox"
                {...register('mail_on_upload')}
                className="w-4 h-4"
              />
              <label htmlFor="mail_on_upload" className="text-sm text-bbs-text">
                File Upload
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="mail_on_sysop_comment"
                type="checkbox"
                {...register('mail_on_sysop_comment')}
                className="w-4 h-4"
              />
              <label htmlFor="mail_on_sysop_comment" className="text-sm text-bbs-text">
                Sysop Comment/Feedback
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="mail_on_sysop_page"
                type="checkbox"
                {...register('mail_on_sysop_page')}
                className="w-4 h-4"
              />
              <label htmlFor="mail_on_sysop_page" className="text-sm text-bbs-text">
                Sysop Page Request
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="mail_on_pwd_fail"
                type="checkbox"
                {...register('mail_on_pwd_fail')}
                className="w-4 h-4"
              />
              <label htmlFor="mail_on_pwd_fail" className="text-sm text-bbs-text">
                Password Failure (send reset link to user)
              </label>
            </div>
          </div>
        </div>
        )}

        {/* FTP Server Settings */}
        {shouldShowSection('FTP Server Settings') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">FTP Server Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="ftp_host" className="label">
                FTP Host
              </label>
              <input
                id="ftp_host"
                type="text"
                {...register('ftp_host')}
                className="input-field w-full"
              />
              <p className="text-xs text-bbs-muted mt-1">Bind address for FTP (blank = all interfaces).</p>
            </div>

            <div>
              <label htmlFor="ftp_port" className="label">
                FTP Port
              </label>
              <input
                id="ftp_port"
                type="number"
                {...register('ftp_port', { min: 1, max: 65535, valueAsNumber: true })}
                className="input-field w-full"
              />
              <p className="text-xs text-bbs-muted mt-1">Default 21; change if another service uses it.</p>
            </div>

            <div>
              <label htmlFor="ftp_data_ports" className="label">
                FTP Data Ports (comma-separated)
              </label>
              <input
                id="ftp_data_ports"
                type="text"
                {...register('ftp_data_ports')}
                className="input-field w-full"
                placeholder="50101,50102,50103"
              />
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="ftp_enabled"
                type="checkbox"
                {...register('ftp_enabled')}
                className="w-4 h-4"
              />
              <label htmlFor="ftp_enabled" className="text-sm text-bbs-text">
                FTP Server Enabled
              </label>
            </div>
          </div>
        </div>
        )}

        {/* HTTP Server Settings */}
        {shouldShowSection('HTTP Server Settings') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">HTTP Server Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="http_host" className="label">
                HTTP Host
              </label>
              <input
                id="http_host"
                type="text"
                {...register('http_host')}
                className="input-field w-full"
              />
              <p className="text-xs text-bbs-muted mt-1">Bind address for HTTP (blank = all interfaces).</p>
            </div>

            <div>
              <label htmlFor="http_port" className="label">
                HTTP Port
              </label>
              <input
                id="http_port"
                type="number"
                {...register('http_port', { min: 1, max: 65535, valueAsNumber: true })}
                className="input-field w-full"
              />
              <p className="text-xs text-bbs-muted mt-1">Default 3001 in this stack; adjust if port conflicts arise.</p>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="http_enabled"
                type="checkbox"
                {...register('http_enabled')}
                className="w-4 h-4"
              />
              <label htmlFor="http_enabled" className="text-sm text-bbs-text">
                HTTP Server Enabled
              </label>
            </div>
          </div>
        </div>
        )}

        {/* BBS Server Ports */}
        {shouldShowSection('BBS Server Ports') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">BBS Server Ports</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="telnet_port" className="label">
                Telnet Port
              </label>
              <input
                id="telnet_port"
                type="number"
                {...register('telnet_port', { min: 1, max: 65535, valueAsNumber: true })}
                className="input-field w-full"
              />
              <p className="text-xs text-bbs-muted mt-1">
                Default 2323; change if another service binds this port or if you’re behind NAT.
              </p>
            </div>

            <div>
              <label htmlFor="ssh_port" className="label">
                SSH Port
              </label>
              <input
                id="ssh_port"
                type="number"
                {...register('ssh_port', { min: 1, max: 65535, valueAsNumber: true })}
                className="input-field w-full"
              />
              <p className="text-xs text-bbs-muted mt-1">
                Default 2222; open/forward this if you expect remote SSH logins.
              </p>
            </div>
          </div>
          <div className="mt-4 p-4 bg-bbs-background border border-bbs-border rounded">
            <p className="text-sm text-bbs-muted">
              Note: Changing these ports requires restarting the BBS server for the changes to take effect. The current server is using the ports specified in the environment variables or these configured values.
            </p>
          </div>
        </div>
        )}

        {/* SSH Key Management */}
        {shouldShowSection('SSH Key Management') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6 flex items-center gap-2">
            <Key size={24} />
            SSH Key Management
          </h2>

          <div className="space-y-4">
            {/* SSH Key Status */}
            <div className="p-4 bg-bbs-background border border-bbs-border rounded">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-bbs-text">SSH Key Status:</span>
                  <span className={`px-3 py-1 rounded text-sm font-semibold ${
                    sshKeyData?.data?.exists
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {sshKeyData?.data?.exists ? 'Key Exists' : 'No Key Found'}
                  </span>
                </div>

                {sshKeyData?.data?.exists && (
                  <>
                    {sshKeyData.data.fingerprint && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-bbs-muted">Fingerprint:</span>
                        <code className="text-xs bg-bbs-background/50 p-2 rounded border border-bbs-border font-mono text-bbs-text break-all">
                          {sshKeyData.data.fingerprint}
                        </code>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {sshKeyData.data.keyType && (
                        <div>
                          <span className="text-bbs-muted">Key Type:</span>
                          <span className="ml-2 text-bbs-text font-semibold">{sshKeyData.data.keyType}</span>
                        </div>
                      )}
                      {sshKeyData.data.keySize && (
                        <div>
                          <span className="text-bbs-muted">Key Size:</span>
                          <span className="ml-2 text-bbs-text font-semibold">{sshKeyData.data.keySize} bits</span>
                        </div>
                      )}
                    </div>

                    {sshKeyData.data.createdAt && (
                      <div className="text-xs text-bbs-muted">
                        Created: {new Date(sshKeyData.data.createdAt).toLocaleString()}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleGenerateSSHKey}
                disabled={isGeneratingKey || isDeletingKey}
                className="btn-primary flex items-center gap-2"
              >
                {isGeneratingKey ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Key size={18} />
                    <span>{sshKeyData?.data?.exists ? 'Regenerate SSH Key' : 'Generate SSH Key'}</span>
                  </>
                )}
              </button>

              {sshKeyData?.data?.exists && (
                <button
                  type="button"
                  onClick={handleDeleteSSHKey}
                  disabled={isGeneratingKey || isDeletingKey}
                  className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 text-red-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isDeletingKey ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={18} />
                      <span>Delete SSH Key</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Info Box */}
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded">
              <h3 className="text-sm font-semibold text-blue-400 mb-2">Important Information</h3>
              <ul className="text-xs text-bbs-muted space-y-1 list-disc list-inside">
                <li>SSH keys are required for the SSH server to function</li>
                <li>Generated keys are stored in the data/ssh directory</li>
                <li>4096-bit RSA keys are generated by default for maximum security</li>
                <li>Server restart is required after generating or deleting keys</li>
                <li>Regenerating keys will invalidate any cached client connections</li>
              </ul>
            </div>
          </div>
        </div>
        )}

        {/* System Behavior */}
        {shouldShowSection('System Behavior') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">System Behavior</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="reg_key" className="label">
                Registration Key
              </label>
              <input
                id="reg_key"
                type="text"
                {...register('reg_key')}
                className="input-field w-full"
              />
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="quiet_join"
                type="checkbox"
                {...register('quiet_join')}
                className="w-4 h-4"
              />
              <label htmlFor="quiet_join" className="text-sm text-bbs-text">
                Quiet Join (suppress conference join messages)
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="convert_to_mb"
                type="checkbox"
                {...register('convert_to_mb')}
                className="w-4 h-4"
              />
              <label htmlFor="convert_to_mb" className="text-sm text-bbs-text">
                Convert to MB (display byte counts as megabytes)
              </label>
            </div>
          </div>
        </div>
        )}

        {/* Logging Settings */}
        {shouldShowSection('Logging Settings') && (
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">Logging Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="log_level" className="label">
                Log Level
              </label>
              <select
                id="log_level"
                {...register('log_level')}
                className="input-field w-full"
              >
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>

            <div>
              <label htmlFor="log_retention_days" className="label">
                Log Retention
              </label>
              <select
                id="log_retention_days"
                {...register('log_retention_days', { setValueAs: (v) => parseInt(v, 10) })}
                className="input-field w-full"
              >
                {LOG_RETENTION_PRESETS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="debug_mode"
                type="checkbox"
                {...register('debug_mode')}
                className="w-4 h-4"
              />
              <label htmlFor="debug_mode" className="text-sm text-bbs-text">
                Debug Mode
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="sysop_debug_enabled"
                type="checkbox"
                {...register('sysop_debug_enabled')}
                className="w-4 h-4"
              />
              <label htmlFor="sysop_debug_enabled" className="text-sm text-bbs-text">
                Sysop Debug Output (show [SYSOP DEBUG] messages to sysops)
              </label>
            </div>
          </div>
        </div>
        )}

      </form>
    </div>
  );
}
