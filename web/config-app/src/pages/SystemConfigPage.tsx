import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Key, Trash2, RefreshCw } from 'lucide-react';
import { apiClient } from '../api/client';
import type { SystemConfig } from '../types';
import { useEffect, useRef, useState } from 'react';
import { useNotification } from '../contexts/NotificationContext';

export function SystemConfigPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [isDeletingKey, setIsDeletingKey] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const skipNextSave = useRef(true);

  const { data, isLoading, error } = useQuery({
    queryKey: ['systemConfig'],
    queryFn: () => apiClient.getSystemConfig(),
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

      <form onSubmit={(e) => e.preventDefault()} className="space-y-8">
        {/* Basic Information */}
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

        {/* Security Settings */}
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
                {...register('min_password_strength', { valueAsNumber: true })}
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
                {...register('max_password_fails', { valueAsNumber: true })}
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

        {/* Session Settings */}
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
                Idle Timeout (minutes)
              </label>
              <input
                id="idle_timeout"
                type="number"
                {...register('idle_timeout', { min: 1, max: 60, valueAsNumber: true })}
                className="input-field w-full"
              />
            </div>
          </div>
        </div>

        {/* New User Defaults */}
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">New User Defaults</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="new_user_sec_level" className="label">
                Default Security Level
              </label>
              <input
                id="new_user_sec_level"
                type="number"
                {...register('new_user_sec_level', { min: 1, max: 255, valueAsNumber: true, value: 30 })}
                className="input-field w-full"
              />
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
              <input
                id="new_user_lines_per_screen"
                type="number"
                {...register('new_user_lines_per_screen', { min: 10, max: 100, valueAsNumber: true })}
                className="input-field w-full"
              />
            </div>
            <div>
              <label htmlFor="new_user_protocol" className="label">
                Default Protocol
              </label>
              <input
                id="new_user_protocol"
                type="text"
                {...register('new_user_protocol')}
                className="input-field w-full"
                placeholder="ZMODEM"
              />
            </div>
            <div>
              <label htmlFor="new_user_screen_type" className="label">
                Default Screen Type
              </label>
              <input
                id="new_user_screen_type"
                type="text"
                {...register('new_user_screen_type')}
                className="input-field w-full"
                placeholder="ANSI"
              />
            </div>
            <div>
              <label htmlFor="new_user_editor" className="label">
                Default Editor
              </label>
              <input
                id="new_user_editor"
                type="text"
                {...register('new_user_editor')}
                className="input-field w-full"
                placeholder="FULL"
              />
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

        {/* Display Settings */}
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

        {/* Language Settings */}
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">Language Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="language_base" className="label">
                Language Base
              </label>
              <select
                id="language_base"
                {...register('language_base')}
                className="input-field w-full"
              >
                <option value="Languages">Languages</option>
              </select>
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
                <option value="English">English</option>
              </select>
            </div>
          </div>
        </div>

        {/* System Limits */}
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

        {/* File Management */}
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
          </div>
        </div>

        {/* Mail & SMTP Settings */}
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
              <label htmlFor="smtp_password" className="label">
                SMTP Password
              </label>
              <input
                id="smtp_password"
                type="password"
                {...register('smtp_password')}
                className="input-field w-full"
              />
              <p className="text-xs text-bbs-muted mt-1">Leave empty to keep existing credentials.</p>
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
        </div>

        {/* FTP Server Settings */}
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

        {/* HTTP Server Settings */}
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

        {/* BBS Server Ports */}
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

        {/* SSH Key Management */}
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

        {/* System Behavior */}
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

        {/* Logging Settings */}
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
                Log Retention (days)
              </label>
              <input
                id="log_retention_days"
                type="number"
                {...register('log_retention_days', { min: 1, max: 365, valueAsNumber: true })}
                className="input-field w-full"
              />
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
          </div>
        </div>

      </form>
    </div>
  );
}
