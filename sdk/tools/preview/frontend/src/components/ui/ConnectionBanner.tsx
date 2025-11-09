import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { ConnectionStatus as ConnectionStatusType } from '../../types';

interface ConnectionBannerProps {
  status: ConnectionStatusType;
  onRetry?: () => void;
}

export const ConnectionBanner: React.FC<ConnectionBannerProps> = ({ status, onRetry }) => {
  const [show, setShow] = useState(false);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    setShow(!status.connected || status.reconnecting || !!status.error);
  }, [status]);

  useEffect(() => {
    if (status.reconnecting) {
      const timer = setInterval(() => {
        setCountdown((prev) => (prev > 0 ? prev - 1 : 5));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [status.reconnecting]);

  if (!show) return null;

  const getBannerStyle = () => {
    if (status.error) return 'bg-red-500/90 border-red-400';
    if (status.reconnecting) return 'bg-yellow-500/90 border-yellow-400';
    return 'bg-blue-500/90 border-blue-400';
  };

  const getIcon = () => {
    if (status.error) return <AlertCircle className="w-5 h-5" />;
    if (status.reconnecting) return <RefreshCw className="w-5 h-5 animate-spin" />;
    return <WifiOff className="w-5 h-5" />;
  };

  const getMessage = () => {
    if (status.error) return `Connection Error: ${status.error}`;
    if (status.reconnecting) return `Reconnecting in ${countdown}s...`;
    return 'Disconnected from server';
  };

  return (
    <div
      className={`
        fixed top-16 left-1/2 transform -translate-x-1/2 z-40
        px-6 py-3 rounded-lg border-2 shadow-lg backdrop-blur-sm
        flex items-center gap-3 animate-slide-in-down
        ${getBannerStyle()}
      `}
    >
      {getIcon()}
      <span className="text-white font-medium">{getMessage()}</span>
      {onRetry && !status.reconnecting && (
        <button
          onClick={onRetry}
          className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
};

interface NetworkLatencyProps {
  latency: number;
}

export const NetworkLatency: React.FC<NetworkLatencyProps> = ({ latency }) => {
  const getColor = () => {
    if (latency < 100) return 'text-green-400';
    if (latency < 300) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getSignalBars = () => {
    const strength = latency < 100 ? 3 : latency < 300 ? 2 : 1;
    return (
      <div className="flex items-end gap-0.5 h-4">
        {[1, 2, 3].map((bar) => (
          <div
            key={bar}
            className={`w-1 rounded-t ${
              bar <= strength ? getColor() : 'bg-gray-600'
            }`}
            style={{ height: `${bar * 33}%` }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      {getSignalBars()}
      <span className={getColor()}>{latency}ms</span>
    </div>
  );
};
