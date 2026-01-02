import React from 'react';
import { Sun, Moon, Settings, Wifi, WifiOff, Loader } from 'lucide-react';
import { ConnectionStatus } from '../types';

interface HeaderProps {
  theme: string;
  onThemeToggle: () => void;
  connectionStatus: ConnectionStatus;
  onSettingsClick: () => void;
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onThemeToggle,
  connectionStatus,
  onSettingsClick,
  className = '',
}) => {
  const getConnectionIcon = () => {
    if (connectionStatus.reconnecting) {
      return <Loader className="w-4 h-4 text-yellow-400 animate-spin" />;
    }
    if (connectionStatus.connected) {
      return <Wifi className="w-4 h-4 text-green-400" />;
    }
    return <WifiOff className="w-4 h-4 text-red-400" />;
  };

  const getConnectionText = () => {
    if (connectionStatus.reconnecting) {
      return 'Reconnecting...';
    }
    if (connectionStatus.connected) {
      return 'Connected';
    }
    if (connectionStatus.error) {
      return connectionStatus.error;
    }
    return 'Disconnected';
  };

  const getConnectionColor = () => {
    if (connectionStatus.reconnecting) return 'text-yellow-400';
    if (connectionStatus.connected) return 'text-green-400';
    return 'text-red-400';
  };

  return (
    <header
      className={`bg-[#1E1E1E] border-b border-gray-700 px-4 py-3 flex items-center justify-between ${className}`}
    >
      {/* Logo and title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded flex items-center justify-center">
            <span className="text-white font-bold text-sm">AX</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">AmiExpress SDK</h1>
            <p className="text-xs text-gray-400">Door Preview & Development</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {/* Connection status */}
        <div className={`flex items-center gap-2 text-sm ${getConnectionColor()}`}>
          {getConnectionIcon()}
          <span className="hidden sm:inline">{getConnectionText()}</span>
        </div>

        <div className="h-6 w-px bg-gray-700" />

        {/* Theme toggle */}
        <button
          onClick={onThemeToggle}
          className="p-2 hover:bg-gray-700 rounded transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 text-yellow-400" />
          ) : (
            <Moon className="w-5 h-5 text-blue-400" />
          )}
        </button>

        {/* Settings */}
        <button
          onClick={onSettingsClick}
          className="p-2 hover:bg-gray-700 rounded transition-colors"
          title="Settings (Ctrl+,)"
        >
          <Settings className="w-5 h-5 text-gray-400" />
        </button>
      </div>
    </header>
  );
};
