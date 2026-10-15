import React, { useState } from 'react';
import { Clock, CheckCircle, XCircle, Info, AlertCircle, Play, X } from 'lucide-react';

export interface ActivityItem {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning' | 'action';
  title: string;
  description?: string;
  timestamp: number;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  onClear?: () => void;
  onItemClick?: (item: ActivityItem) => void;
  maxItems?: number;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  activities,
  onClear,
  onItemClick,
  maxItems = 50,
}) => {
  const [filter, setFilter] = useState<string>('all');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const filteredActivities = activities
    .filter((item) => filter === 'all' || item.type === filter)
    .slice(0, maxItems);

  const getIcon = (item: ActivityItem) => {
    if (item.icon) return item.icon;

    switch (item.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-500" />;
      case 'action':
        return <Play className="w-5 h-5 text-purple-500" />;
      default:
        return <Info className="w-5 h-5 text-gray-500" />;
    }
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className="fixed bottom-24 right-4 p-3 bg-gray-900 border border-gray-700 rounded-lg shadow-lg hover:bg-gray-800 transition-colors z-40"
      >
        <Clock className="w-5 h-5 text-gray-400" />
        {activities.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full text-xs flex items-center justify-center text-white">
            {activities.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 right-4 w-96 max-h-[500px] bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-40 flex flex-col animate-slideUp">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Activity
        </h3>
        <div className="flex items-center gap-2">
          {onClear && activities.length > 0 && (
            <button
              onClick={onClear}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setIsCollapsed(true)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 p-2 border-b border-gray-700 overflow-x-auto">
        {['all', 'success', 'error', 'warning', 'info', 'action'].map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
              filter === type
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      {/* Activity list */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredActivities.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No activities yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredActivities.map((item, index) => (
              <div
                key={item.id}
                onClick={() => onItemClick?.(item)}
                className={`
                  p-3 rounded-lg border transition-all cursor-pointer
                  ${
                    item.type === 'error'
                      ? 'bg-red-900/20 border-red-800/50 hover:bg-red-900/30'
                      : item.type === 'success'
                      ? 'bg-green-900/20 border-green-800/50 hover:bg-green-900/30'
                      : item.type === 'warning'
                      ? 'bg-yellow-900/20 border-yellow-800/50 hover:bg-yellow-900/30'
                      : 'bg-gray-800/50 border-gray-700 hover:bg-gray-800'
                  }
                  animate-fadeIn
                `}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">{getIcon(item)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.title}</p>
                    {item.description && (
                      <p className="text-xs text-gray-400 mt-1">{item.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-500">{formatTime(item.timestamp)}</span>
                      {item.action && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            item.action!.onClick();
                          }}
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          {item.action.label}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityFeed;
