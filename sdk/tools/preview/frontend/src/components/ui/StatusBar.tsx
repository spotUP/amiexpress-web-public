import React from 'react';
import { Activity, AlertCircle, CheckCircle, Clock, Cpu, HardDrive, Zap } from 'lucide-react';

interface StatusBarProps {
  currentFile?: string;
  lineCount?: number;
  errorCount?: number;
  warningCount?: number;
  buildTime?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  connected?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  currentFile,
  lineCount,
  errorCount = 0,
  warningCount = 0,
  buildTime,
  cpuUsage,
  memoryUsage,
  connected = true,
}) => {
  return (
    <div className="h-6 bg-[#007ACC] text-white flex items-center justify-between px-3 text-xs font-medium border-t border-blue-600 animate-slideUp">
      {/* Left side */}
      <div className="flex items-center gap-4">
        {/* Connection status */}
        <div className={`flex items-center gap-1 ${connected ? 'text-green-300' : 'text-red-300'}`}>
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-300 animate-pulse' : 'bg-red-300'}`} />
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>

        {/* Current file */}
        {currentFile && (
          <div className="flex items-center gap-1">
            <span className="opacity-75">File:</span>
            <span className="font-mono">{currentFile}</span>
          </div>
        )}

        {/* Line count */}
        {lineCount !== undefined && (
          <div className="flex items-center gap-1">
            <span className="opacity-75">Lines:</span>
            <span>{lineCount.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Errors */}
        {errorCount > 0 && (
          <button className="flex items-center gap-1 hover:bg-red-600/30 px-1.5 py-0.5 rounded transition-colors">
            <AlertCircle className="w-3 h-3" />
            <span>{errorCount}</span>
          </button>
        )}

        {/* Warnings */}
        {warningCount > 0 && (
          <button className="flex items-center gap-1 hover:bg-yellow-600/30 px-1.5 py-0.5 rounded transition-colors">
            <AlertCircle className="w-3 h-3 text-yellow-300" />
            <span>{warningCount}</span>
          </button>
        )}

        {/* Build time */}
        {buildTime !== undefined && (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{buildTime}ms</span>
          </div>
        )}

        {/* CPU Usage */}
        {cpuUsage !== undefined && (
          <div className="flex items-center gap-1">
            <Cpu className="w-3 h-3" />
            <span>{cpuUsage}%</span>
          </div>
        )}

        {/* Memory Usage */}
        {memoryUsage !== undefined && (
          <div className="flex items-center gap-1">
            <HardDrive className="w-3 h-3" />
            <span>{memoryUsage}MB</span>
          </div>
        )}

        {/* Success indicator */}
        {errorCount === 0 && warningCount === 0 && buildTime !== undefined && (
          <div className="flex items-center gap-1 text-green-300">
            <CheckCircle className="w-3 h-3" />
            <span>Ready</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default StatusBar;
