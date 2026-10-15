import React, { useState } from 'react';
import { GitBranch, GitCommit, GitPullRequest, GitMerge, RefreshCw, Check, X, Clock, User } from 'lucide-react';

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  timestamp: number;
  branch: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  ahead: number;
  behind: number;
}

export interface GitStatus {
  branch: string;
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}

interface GitIntegrationProps {
  status: GitStatus | null;
  commits: GitCommit[];
  branches: GitBranch[];
  onCommit: (message: string, files: string[]) => void;
  onPush: () => void;
  onPull: () => void;
  onBranchSwitch: (branch: string) => void;
  onRefresh: () => void;
}

export const GitIntegration: React.FC<GitIntegrationProps> = ({
  status,
  commits,
  branches,
  onCommit,
  onPush,
  onPull,
  onBranchSwitch,
  onRefresh,
}) => {
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [tab, setTab] = useState<'status' | 'history' | 'branches'>('status');

  const allChangedFiles = status ? [
    ...status.modified,
    ...status.added,
    ...status.deleted,
    ...status.untracked,
  ] : [];

  const toggleFile = (file: string) => {
    setSelectedFiles(prev =>
      prev.includes(file) ? prev.filter(f => f !== file) : [...prev, file]
    );
  };

  const handleCommit = () => {
    if (commitMessage.trim() && selectedFiles.length > 0) {
      onCommit(commitMessage.trim(), selectedFiles);
      setCommitMessage('');
      setSelectedFiles([]);
    }
  };

  const getFileIcon = (file: string) => {
    if (status?.added.includes(file)) return <Check className="w-4 h-4 text-green-500" />;
    if (status?.deleted.includes(file)) return <X className="w-4 h-4 text-red-500" />;
    if (status?.modified.includes(file)) return <RefreshCw className="w-4 h-4 text-yellow-500" />;
    return <Clock className="w-4 h-4 text-gray-500" />;
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  if (!status) {
    return (
      <div className="p-4 text-center text-gray-500">
        <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>No git repository detected</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#1E1E1E]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-blue-500" />
          <span className="font-semibold text-white">{status.branch}</span>
          {status.ahead > 0 && (
            <span className="text-xs bg-blue-600 px-2 py-0.5 rounded">↑{status.ahead}</span>
          )}
          {status.behind > 0 && (
            <span className="text-xs bg-yellow-600 px-2 py-0.5 rounded">↓{status.behind}</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onPull}
            disabled={status.behind === 0}
            className="p-1 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
            title="Pull"
          >
            <GitPullRequest className="w-4 h-4" />
          </button>
          <button
            onClick={onPush}
            disabled={status.ahead === 0}
            className="p-1 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
            title="Push"
          >
            <GitMerge className="w-4 h-4" />
          </button>
          <button
            onClick={onRefresh}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {(['status', 'history', 'branches'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-[#252526] text-white border-b-2 border-blue-600'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'status' && (
          <div>
            {/* Changed files */}
            {allChangedFiles.length > 0 ? (
              <div className="space-y-2 mb-4">
                <h3 className="text-sm font-semibold text-gray-400 mb-2">
                  Changes ({allChangedFiles.length})
                </h3>
                {allChangedFiles.map((file) => (
                  <label
                    key={file}
                    className="flex items-center gap-2 p-2 hover:bg-gray-800 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFiles.includes(file)}
                      onChange={() => toggleFile(file)}
                      className="rounded"
                    />
                    {getFileIcon(file)}
                    <span className="text-sm text-white flex-1 truncate">{file}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <Check className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No changes</p>
              </div>
            )}

            {/* Commit form */}
            {allChangedFiles.length > 0 && (
              <div className="border-t border-gray-700 pt-4">
                <textarea
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Commit message..."
                  className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm resize-none"
                  rows={3}
                />
                <button
                  onClick={handleCommit}
                  disabled={!commitMessage.trim() || selectedFiles.length === 0}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded transition-colors"
                >
                  <GitCommit className="w-4 h-4" />
                  Commit ({selectedFiles.length})
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-2">
            {commits.map((commit) => (
              <div
                key={commit.hash}
                className="p-3 bg-gray-800 rounded border border-gray-700 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start gap-2 mb-2">
                  <GitCommit className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium">{commit.message}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {commit.author}
                      </span>
                      <span>{formatTime(commit.timestamp)}</span>
                      <code className="font-mono">{commit.hash.slice(0, 7)}</code>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'branches' && (
          <div className="space-y-2">
            {branches.map((branch) => (
              <button
                key={branch.name}
                onClick={() => !branch.current && onBranchSwitch(branch.name)}
                className={`w-full p-3 rounded border transition-all text-left ${
                  branch.current
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600 text-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{branch.name}</span>
                  {branch.current && <Check className="w-4 h-4" />}
                </div>
                {(branch.ahead > 0 || branch.behind > 0) && (
                  <div className="flex gap-2 mt-1 text-xs">
                    {branch.ahead > 0 && (
                      <span className="text-green-400">↑{branch.ahead}</span>
                    )}
                    {branch.behind > 0 && (
                      <span className="text-yellow-400">↓{branch.behind}</span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GitIntegration;
