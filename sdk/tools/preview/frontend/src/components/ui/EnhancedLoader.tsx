import React from 'react';

interface EnhancedLoaderProps {
  type?: 'spinner' | 'dots' | 'pulse' | 'bars' | 'orbital';
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  progress?: number;
}

export const EnhancedLoader: React.FC<EnhancedLoaderProps> = ({
  type = 'orbital',
  size = 'md',
  message,
  progress,
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  const renderLoader = () => {
    switch (type) {
      case 'spinner':
        return (
          <div className={`${sizeClasses[size]} border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin`} />
        );

      case 'dots':
        return (
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`w-3 h-3 bg-blue-500 rounded-full animate-bounce`}
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        );

      case 'pulse':
        return (
          <div className={`${sizeClasses[size]} relative`}>
            <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-75" />
            <div className="relative bg-blue-600 rounded-full h-full" />
          </div>
        );

      case 'bars':
        return (
          <div className="flex gap-1 items-end h-12">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-2 bg-blue-500 rounded-t animate-pulse"
                style={{
                  height: `${20 + Math.random() * 60}%`,
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
        );

      case 'orbital':
        return (
          <div className={`${sizeClasses[size]} relative`}>
            {/* Center dot */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
            </div>
            {/* Orbiting dots */}
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="absolute inset-0 animate-spin"
                style={{
                  animationDuration: '1.5s',
                  animationDelay: `${i * 0.5}s`,
                }}
              >
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-6">
      {renderLoader()}

      {message && (
        <div className="text-center">
          <p className="text-sm text-gray-400 animate-pulse">{message}</p>
        </div>
      )}

      {progress !== undefined && (
        <div className="w-full max-w-xs">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Loading...</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedLoader;
