import React, { useState, useEffect } from 'react';
import { BuildStatus as BuildStatusType, BuildError } from '../types';
import { AlertCircle, CheckCircle, AlertTriangle, Clock, Loader2, Copy, Check } from 'lucide-react';
import { formatDuration } from '../utils/format';
import { ProgressBar, StepProgress, ProgressStep } from './ui/Progress';

interface BuildStatusProps {
  status: BuildStatusType;
  onErrorClick?: (error: BuildError) => void;
  className?: string;
}

export const BuildStatusEnhanced: React.FC<BuildStatusProps> = ({
  status,
  onErrorClick,
  className = '',
}) => {
  const { building, success, errors, warnings, lastBuild, duration } = status;
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildSteps, setBuildSteps] = useState<ProgressStep[]>([
    { id: 'init', label: 'Initializing build...', status: 'pending' },
    { id: 'typecheck', label: 'Type checking...', status: 'pending' },
    { id: 'compile', label: 'Compiling TypeScript...', status: 'pending' },
    { id: 'validate', label: 'Validating output...', status: 'pending' },
  ]);

  useEffect(() => {
    if (building) {
      // Simulate build progress
      setBuildProgress(0);
      setBuildSteps([
        { id: 'init', label: 'Initializing build...', status: 'running' },
        { id: 'typecheck', label: 'Type checking...', status: 'pending' },
        { id: 'compile', label: 'Compiling TypeScript...', status: 'pending' },
        { id: 'validate', label: 'Validating output...', status: 'pending' },
      ]);

      const timers: NodeJS.Timeout[] = [];

      // Step 1: Init (0-25%)
      timers.push(
        setTimeout(() => {
          setBuildProgress(25);
          setBuildSteps((prev) =>
            prev.map((step) =>
              step.id === 'init'
                ? { ...step, status: 'complete', duration: 200 }
                : step.id === 'typecheck'
                ? { ...step, status: 'running' }
                : step
            )
          );
        }, 200)
      );

      // Step 2: Type check (25-60%)
      timers.push(
        setTimeout(() => {
          setBuildProgress(60);
          setBuildSteps((prev) =>
            prev.map((step) =>
              step.id === 'typecheck'
                ? { ...step, status: 'complete', duration: 800 }
                : step.id === 'compile'
                ? { ...step, status: 'running' }
                : step
            )
          );
        }, 1000)
      );

      // Step 3: Compile (60-90%)
      timers.push(
        setTimeout(() => {
          setBuildProgress(90);
          setBuildSteps((prev) =>
            prev.map((step) =>
              step.id === 'compile'
                ? { ...step, status: 'complete', duration: 500 }
                : step.id === 'validate'
                ? { ...step, status: 'running' }
                : step
            )
          );
        }, 1500)
      );

      return () => timers.forEach(clearTimeout);
    } else if (!building && duration > 0) {
      // Build completed
      setBuildProgress(100);
      setBuildSteps((prev) =>
        prev.map((step) =>
          step.id === 'validate'
            ? {
                ...step,
                status: errors.length > 0 ? 'error' : 'complete',
                duration: 100,
              }
            : step
        )
      );
    }
  }, [building, errors.length, duration]);

  const getStatusIcon = () => {
    if (building) {
      return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
    }
    if (errors.length > 0) {
      return <AlertCircle className="w-5 h-5 text-red-400 animate-bounce-in" />;
    }
    if (warnings.length > 0) {
      return <AlertTriangle className="w-5 h-5 text-yellow-400 animate-bounce-in" />;
    }
    if (success) {
      return <CheckCircle className="w-5 h-5 text-green-400 animate-bounce-in" />;
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
    const [copied, setCopied] = useState(false);

    const copyError = () => {
      navigator.clipboard.writeText(
        `${error.file}:${error.line}:${error.column} - ${error.message}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    const severityIcon =
      error.severity === 'error' ? (
        <AlertCircle className="w-4 h-4 text-red-400" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-yellow-400" />
      );

    const severityColor = error.severity === 'error' ? 'text-red-400' : 'text-yellow-400';

    return (
      <button
        key={index}
        onClick={() => onErrorClick?.(error)}
        className="w-full text-left p-3 hover:bg-gray-700 rounded border border-gray-700 transition-all hover:border-gray-600 group animate-fade-in"
      >
        <div className="flex items-start gap-2">
          {severityIcon}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1">
              <span className={`font-medium text-sm ${severityColor}`}>
                {error.severity === 'error' ? 'Error' : 'Warning'}
              </span>
              <span className="text-xs text-gray-500 truncate font-mono">
                {error.file}:{error.line}:{error.column}
              </span>
            </div>
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{error.message}</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyError();
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded transition-all"
            title="Copy error"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>
      </button>
    );
  };

  return (
    <div className={`flex flex-col h-full bg-[#1E1E1E] ${className}`}>
      {/* Status header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-3 mb-3">
          {getStatusIcon()}
          <span className={`font-medium ${getStatusColor()}`}>{getStatusText()}</span>
        </div>

        {/* Build progress bar */}
        {building && (
          <ProgressBar
            progress={buildProgress}
            indeterminate={buildProgress === 0}
            color="blue"
            showPercentage
            className="mb-3"
          />
        )}

        {lastBuild > 0 && (
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>Last build: {new Date(lastBuild).toLocaleTimeString()}</span>
            {duration > 0 && (
              <span className={success ? 'text-green-400' : 'text-gray-500'}>
                Duration: {formatDuration(duration)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Build steps timeline */}
      {(building || (duration > 0 && lastBuild > Date.now() - 5000)) && (
        <div className="p-4 border-b border-gray-700 bg-gray-800/30">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Build Timeline
          </h4>
          <StepProgress steps={buildSteps} />
        </div>
      )}

      {/* Errors and warnings list */}
      <div className="flex-1 overflow-y-auto p-4">
        {errors.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
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
            <h3 className="text-sm font-semibold text-yellow-400 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Warnings ({warnings.length})
            </h3>
            <div className="space-y-2">
              {warnings.map((warning, index) => renderBuildError(warning, index))}
            </div>
          </div>
        )}

        {errors.length === 0 && warnings.length === 0 && !building && (
          <div className="text-center text-gray-500 py-8 animate-fade-in">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 opacity-50 text-green-400" />
            <p className="text-lg font-medium">No build errors or warnings</p>
            <p className="text-sm mt-2">Your code is looking great!</p>
          </div>
        )}

        {building && errors.length === 0 && warnings.length === 0 && (
          <div className="text-center text-gray-500 py-8 animate-fade-in">
            <Loader2 className="w-16 h-16 mx-auto mb-4 animate-spin text-blue-400" />
            <p className="text-lg font-medium">Building door...</p>
            <p className="text-sm mt-2">Please wait while we compile your code</p>
          </div>
        )}
      </div>

      {/* Summary footer */}
      {(errors.length > 0 || warnings.length > 0) && (
        <div className="p-3 border-t border-gray-700 bg-[#252526]">
          <div className="flex items-center justify-between text-xs">
            <div className="flex gap-4">
              {errors.length > 0 && (
                <span className="text-red-400 font-medium">
                  {errors.length} error{errors.length !== 1 ? 's' : ''}
                </span>
              )}
              {warnings.length > 0 && (
                <span className="text-yellow-400 font-medium">
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
