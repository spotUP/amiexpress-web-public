import React, { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Zap, Clock, TrendingUp, TrendingDown } from 'lucide-react';

export interface PerformanceMetric {
  timestamp: number;
  cpu: number;
  memory: number;
  fps: number;
}

export interface PerformanceSnapshot {
  function: string;
  calls: number;
  totalTime: number;
  avgTime: number;
  percentage: number;
}

interface PerformanceProfilerProps {
  metrics: PerformanceMetric[];
  snapshots: PerformanceSnapshot[];
  onStartProfiling: () => void;
  onStopProfiling: () => void;
  isProfiling: boolean;
  className?: string;
}

export const PerformanceProfiler: React.FC<PerformanceProfilerProps> = ({
  metrics,
  snapshots,
  onStartProfiling,
  onStopProfiling,
  isProfiling,
  className = '',
}) => {
  const [tab, setTab] = useState<'realtime' | 'analysis'>('realtime');
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<number[]>([]);

  // Update history
  useEffect(() => {
    if (metrics.length > 0) {
      const latest = metrics[metrics.length - 1];
      setCpuHistory(prev => [...prev.slice(-50), latest.cpu]);
      setMemoryHistory(prev => [...prev.slice(-50), latest.memory]);
    }
  }, [metrics]);

  const currentMetrics = metrics.length > 0 ? metrics[metrics.length - 1] : null;

  const renderSparkline = (data: number[], color: string, max: number = 100) => {
    if (data.length === 0) return null;

    const width = 200;
    const height = 40;
    const points = data.map((value, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * width;
      const y = height - (value / max) * height;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width={width} height={height} className="opacity-75">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    );
  };

  const getTrend = (data: number[]) => {
    if (data.length < 2) return 'stable';
    const recent = data.slice(-10);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const last = data[data.length - 1];
    if (last > avg * 1.1) return 'up';
    if (last < avg * 0.9) return 'down';
    return 'stable';
  };

  const sortedSnapshots = [...snapshots].sort((a, b) => b.totalTime - a.totalTime);

  return (
    <div className={`flex flex-col h-full bg-[#1E1E1E] ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-green-500" />
          <h3 className="font-semibold text-white">Performance Profiler</h3>
        </div>
        <button
          onClick={isProfiling ? onStopProfiling : onStartProfiling}
          className={`px-4 py-1.5 rounded transition-all ${
            isProfiling
              ? 'bg-red-600 hover:bg-red-700 animate-pulse'
              : 'bg-green-600 hover:bg-green-700'
          } text-white`}
        >
          {isProfiling ? 'Stop' : 'Start'} Profiling
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {(['realtime', 'analysis'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-[#252526] text-white border-b-2 border-green-600'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {t === 'realtime' ? 'Real-time' : 'Analysis'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'realtime' && (
          <div className="space-y-4">
            {/* Current metrics */}
            {currentMetrics && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-800 p-4 rounded border border-gray-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-gray-400">CPU</span>
                    {getTrend(cpuHistory) === 'up' && <TrendingUp className="w-3 h-3 text-red-500" />}
                    {getTrend(cpuHistory) === 'down' && <TrendingDown className="w-3 h-3 text-green-500" />}
                  </div>
                  <div className="text-2xl font-bold text-white">{currentMetrics.cpu.toFixed(1)}%</div>
                </div>

                <div className="bg-gray-800 p-4 rounded border border-gray-700">
                  <div className="flex items-center gap-2 mb-2">
                    <HardDrive className="w-4 h-4 text-purple-500" />
                    <span className="text-sm text-gray-400">Memory</span>
                    {getTrend(memoryHistory) === 'up' && <TrendingUp className="w-3 h-3 text-red-500" />}
                    {getTrend(memoryHistory) === 'down' && <TrendingDown className="w-3 h-3 text-green-500" />}
                  </div>
                  <div className="text-2xl font-bold text-white">{currentMetrics.memory.toFixed(0)} MB</div>
                </div>

                <div className="bg-gray-800 p-4 rounded border border-gray-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm text-gray-400">FPS</span>
                  </div>
                  <div className="text-2xl font-bold text-white">{currentMetrics.fps}</div>
                </div>
              </div>
            )}

            {/* Charts */}
            <div className="space-y-4">
              <div className="bg-gray-800 p-4 rounded border border-gray-700">
                <h4 className="text-sm font-semibold text-white mb-3">CPU Usage</h4>
                {renderSparkline(cpuHistory, '#3B82F6', 100)}
              </div>

              <div className="bg-gray-800 p-4 rounded border border-gray-700">
                <h4 className="text-sm font-semibold text-white mb-3">Memory Usage</h4>
                {renderSparkline(memoryHistory, '#A855F7', 200)}
              </div>
            </div>

            {/* Recommendations */}
            {currentMetrics && (
              <div className="bg-yellow-900/20 border border-yellow-600/50 p-4 rounded">
                <h4 className="text-sm font-semibold text-yellow-500 mb-2">Recommendations</h4>
                <ul className="text-sm text-yellow-200 space-y-1">
                  {currentMetrics.cpu > 80 && <li>• High CPU usage detected - consider optimizing loops</li>}
                  {currentMetrics.memory > 150 && <li>• High memory usage - check for memory leaks</li>}
                  {currentMetrics.fps < 30 && <li>• Low FPS - reduce rendering complexity</li>}
                  {currentMetrics.cpu < 20 && currentMetrics.memory < 50 && currentMetrics.fps >= 60 && (
                    <li className="text-green-400">✓ Performance looks good!</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === 'analysis' && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-400">Function Call Analysis</h4>
            {sortedSnapshots.length > 0 ? (
              sortedSnapshots.map((snapshot, index) => (
                <div
                  key={index}
                  className="bg-gray-800 p-4 rounded border border-gray-700 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <code className="text-sm font-mono text-blue-400">{snapshot.function}</code>
                    <span className="text-sm font-bold text-white">{snapshot.percentage.toFixed(1)}%</span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
                      style={{ width: `${snapshot.percentage}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-xs text-gray-400">
                    <div>
                      <Clock className="w-3 h-3 inline mr-1" />
                      {snapshot.calls} calls
                    </div>
                    <div>Total: {snapshot.totalTime.toFixed(2)}ms</div>
                    <div>Avg: {snapshot.avgTime.toFixed(2)}ms</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-500 py-8">
                <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Start profiling to see analysis</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PerformanceProfiler;
