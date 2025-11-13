import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Save } from 'lucide-react';
import { apiClient } from '../api/client';
import type { SystemConfig } from '../types';
import { ImportExport } from '../components/import/ImportExport';

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
              <label htmlFor="max_login_attempts" className="label">
                Max Login Attempts
              </label>
              <input
                id="max_login_attempts"
                type="number"
                {...register('max_login_attempts', { min: 1, valueAsNumber: true })}
                className="input-field w-full"
              />
            </div>
          </div>
        </div>

        {/* Session Settings */}
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">Session Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="max_session_time" className="label">
                Max Session Time (minutes)
              </label>
              <input
                id="max_session_time"
                type="number"
                {...register('max_session_time', { min: 1, valueAsNumber: true })}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="inactivity_timeout" className="label">
                Inactivity Timeout (seconds)
              </label>
              <input
                id="inactivity_timeout"
                type="number"
                {...register('inactivity_timeout', { min: 0, valueAsNumber: true })}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="min_baud_rate" className="label">
                Minimum Baud Rate
              </label>
              <input
                id="min_baud_rate"
                type="number"
                {...register('min_baud_rate', { min: 0, valueAsNumber: true })}
                className="input-field w-full"
              />
            </div>
          </div>
        </div>

        {/* File Transfer Settings */}
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">File Transfer Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="max_upload_size_kb" className="label">
                Max Upload Size (KB)
              </label>
              <input
                id="max_upload_size_kb"
                type="number"
                {...register('max_upload_size_kb', { min: 0, valueAsNumber: true })}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="download_timeout" className="label">
                Download Timeout (seconds)
              </label>
              <input
                id="download_timeout"
                type="number"
                {...register('download_timeout', { min: 0, valueAsNumber: true })}
                className="input-field w-full"
              />
            </div>
          </div>
        </div>

        {/* User Settings */}
        <div className="card">
          <h2 className="text-xl font-semibold text-bbs-text mb-6">User Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="new_user_sec_level" className="label">
                New User Security Level
              </label>
              <input
                id="new_user_sec_level"
                type="number"
                {...register('new_user_sec_level', { min: 0, max: 255, valueAsNumber: true })}
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="guest_sec_level" className="label">
                Guest Security Level
              </label>
              <input
                id="guest_sec_level"
                type="number"
                {...register('guest_sec_level', { min: 0, max: 255, valueAsNumber: true })}
                className="input-field w-full"
              />
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="enable_guest_access"
                type="checkbox"
                {...register('enable_guest_access')}
                className="w-4 h-4"
              />
              <label htmlFor="enable_guest_access" className="text-sm text-bbs-text">
                Enable Guest Access
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="allow_alias"
                type="checkbox"
                {...register('allow_alias')}
                className="w-4 h-4"
              />
              <label htmlFor="allow_alias" className="text-sm text-bbs-text">
                Allow Alias Names
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="allow_ansi"
                type="checkbox"
                {...register('allow_ansi')}
                className="w-4 h-4"
              />
              <label htmlFor="allow_ansi" className="text-sm text-bbs-text">
                Allow ANSI Graphics
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="allow_avatar"
                type="checkbox"
                {...register('allow_avatar')}
                className="w-4 h-4"
              />
              <label htmlFor="allow_avatar" className="text-sm text-bbs-text">
                Allow User Avatars
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
                id="show_last_callers"
                type="checkbox"
                {...register('show_last_callers')}
                className="w-4 h-4"
              />
              <label htmlFor="show_last_callers" className="text-sm text-bbs-text">
                Show Last Callers List
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                id="show_who_is_online"
                type="checkbox"
                {...register('show_who_is_online')}
                className="w-4 h-4"
              />
              <label htmlFor="show_who_is_online" className="text-sm text-bbs-text">
                Show Who Is Online
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

      {/* Import/Export Section */}
      <div className="mt-12 pt-8 border-t border-bbs-muted/20">
        <ImportExport />
      </div>
    </div>
  );
}
