import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Save } from 'lucide-react';
import { apiClient } from '../api/client';
import type { SystemConfig } from '../types';

export function SystemConfigPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['systemConfig'],
    queryFn: () => apiClient.getSystemConfig(),
  });

  const mutation = useMutation({
    mutationFn: (updates: Partial<SystemConfig>) =>
      apiClient.updateSystemConfig(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemConfig'] });
      alert('System configuration updated successfully');
    },
    onError: (error: Error) => {
      alert(`Failed to update configuration: ${error.message}`);
    },
  });

  const { register, handleSubmit, formState: { isDirty } } = useForm<SystemConfig>({
    values: data?.data || undefined,
  });

  const onSubmit = (formData: SystemConfig) => {
    mutation.mutate(formData);
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
        <p className="text-bbs-muted">Global BBS settings and parameters</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
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
              <input
                id="min_password_strength"
                type="number"
                {...register('min_password_strength', { min: 0, max: 4, valueAsNumber: true })}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="max_password_fails" className="label">
                Max Password Fails
              </label>
              <input
                id="max_password_fails"
                type="number"
                {...register('max_password_fails', { min: -1, valueAsNumber: true })}
                className="input-field w-full"
              />
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
              <input
                id="default_time_limit"
                type="number"
                {...register('default_time_limit', { min: 1, max: 1440, valueAsNumber: true })}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="max_session_time" className="label">
                Max Session Time (minutes)
              </label>
              <input
                id="max_session_time"
                type="number"
                {...register('max_session_time', { min: 1, max: 1440, valueAsNumber: true })}
                className="input-field w-full"
              />
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

        {/* Display Settings */}
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">Display Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="color_scheme" className="label">
                Color Scheme
              </label>
              <input
                id="color_scheme"
                type="text"
                {...register('color_scheme')}
                className="input-field w-full"
              />
            </div>

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
                Language Base Path
              </label>
              <input
                id="language_base"
                type="text"
                {...register('language_base')}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="default_language" className="label">
                Default Language
              </label>
              <input
                id="default_language"
                type="text"
                {...register('default_language')}
                className="input-field w-full"
              />
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
            </div>

            <div>
              <label htmlFor="max_nodes" className="label">
                Max Nodes
              </label>
              <input
                id="max_nodes"
                type="number"
                {...register('max_nodes', { min: 1, max: 8, valueAsNumber: true })}
                className="input-field w-full"
              />
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
                Default: 2323
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
                Default: 2222
              </p>
            </div>
          </div>
          <div className="mt-4 p-4 bg-bbs-background border border-bbs-border rounded">
            <p className="text-sm text-bbs-muted">
              Note: Changing these ports requires restarting the BBS server for the changes to take effect. The current server is using the ports specified in the environment variables or these configured values.
            </p>
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

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!isDirty || mutation.isPending}
            className="btn-primary flex items-center space-x-2"
          >
            <Save size={20} />
            <span>{mutation.isPending ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
