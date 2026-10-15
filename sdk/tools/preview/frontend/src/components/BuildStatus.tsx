import React from 'react';
import { BuildStatus as BuildStatusType, BuildError } from '../types';
import { AlertCircle, CheckCircle, AlertTriangle, Clock, Loader } from 'lucide-react';
import { formatDuration } from '../utils/format';

interface BuildStatusProps {
  status: BuildStatusType;
  onErrorClick?: (error: BuildError) => void;
  className?: string;
}

export const BuildStatus: React.FC<BuildStatusProps> = ({
  status,
  onErrorClick,
  className = '',
}) => {
  const { building, success, errors, warnings, lastBuild, duration } = status;

  const getStatusIcon = () => {
    if (building) {
      return <Loader className="w-5 h-5 text-blue-400 animate-spin" />;
    }
    if (errors.length > 0) {
      return <AlertCircle className="w-5 h-5 text-red-400" />;
    }
    if (warnings.length > 0) {
      return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
    }
    if (success) {
      return <CheckCircle className="w-5 h-5 text-green-400" />;
    }
    return <Clock className="w-5 h-5 text-gray-400" />;
  };

  const getStatusText = () => {
    if (building) return 'Building...';
    if (errors.length > 0) return `Build failed (${errors.length} errors)`;
    if (warnings.length > 0) return `Build succeeded (${warnings.length} warnings)`;
    if (success) return 'Build succeeded';
    return 'No build';
  };

  const getStatusColor = () => {
    if (building) return 'text-blue-400';
    if (errors.length > 0) return 'text-red-400';
    if (warnings.length > 0) return 'text-yellow-400';
    if (success) return 'text-green-400';
    return 'text-gray-400';
  };

  const renderBuildError = (error: BuildError, index: number) => {
    const severityIcon = error.severity === 'error'
      ? <AlertCircle className="w-4 h-4 text-red-400" />
      : <AlertTriangle className="w-4 h-4 text-yellow-400" />;

    const severityColor = error.severity === 'error' ? 'text-red-400' : 'text-yellow-400';

    return (
      <button
        key={index}
        onClick={() => onErrorClick?.(error)}
        className="w-full text-left p-3 hover:bg-gray-700 rounded border border-gray-700 transition-colors"
      >
        <div className="flex items-start gap-2">
          {severityIcon}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1">
              <span className={`font-medium text-sm ${severityColor}`}>
                {error.severity === 'error' ? 'Error' : 'Warning'}
              </span>
              <span className="text-xs text-gray-500 truncate">
                {error.file}:{error.line}:{error.column}
              </span>
            </div>
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{error.message}</p>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className={`flex flex-col h-full bg-[#1E1E1E] ${className}`}>
      {/* Status header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-3 mb-2">
          {getStatusIcon()}
          <span className={`font-medium ${getStatusColor()}`}>{getStatusText()}</span>
        </div>

        {lastBuild > 0 && (
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>Last build: {new Date(lastBuild).toLocaleTimeString()}</span>
            {duration > 0 && <span>Duration: {formatDuration(duration)}</span>}
          </div>
        )}
      </div>

      {/* Errors and warnings list */}
      <div className="flex-1 overflow-y-auto p-4">
        {errors.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Errors ({errors.length})
            </h3>
            <div className="space-y-2">
              {errors.map((error, index) => renderBuildError(error, index))}
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-yellow-400 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Warnings ({warnings.length})
            </h3>
            <div className="space-y-2">
              {warnings.map((warning, index) => renderBuildError(warning, index))}
            </div>
          </div>
        )}

        {errors.length === 0 && warnings.length === 0 && !building && (
          <div className="text-center text-gray-500 py-8">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No build errors or warnings</p>
          </div>
        )}

        {building && (
          <div className="text-center text-gray-500 py-8">
            <Loader className="w-12 h-12 mx-auto mb-3 animate-spin" />
            <p>Building door...</p>
          </div>
        )}
      </div>

      {/* Summary footer */}
      {(errors.length > 0 || warnings.length > 0) && (
        <div className="p-3 border-t border-gray-700 bg-[#252526]">
          <div className="flex items-center justify-between text-xs">
            <div className="flex gap-4">
              {errors.length > 0 && (
                <span className="text-red-400">
                  {errors.length} error{errors.length !== 1 ? 's' : ''}
                </span>
              )}
              {warnings.length > 0 && (
                <span className="text-yellow-400">
                  {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <span className="text-gray-500">
              Click error to jump to location
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
