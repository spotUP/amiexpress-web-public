import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Info, RefreshCw, Wrench, XCircle } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

interface HealthIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  description: string;
  path?: string;
  autoFixable: boolean;
  fixAction?: string;
}

interface HealthCheckResult {
  category: string;
  passed: boolean;
  issues: HealthIssue[];
  checkedCount: number;
  errorCount: number;
  warningCount: number;
}

interface BBSHealthReport {
  timestamp: string;
  overallStatus: 'healthy' | 'warnings' | 'errors';
  totalIssues: number;
  autoFixableIssues: number;
  categories: HealthCheckResult[];
}

export function HealthCheckPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const { data: healthData, isLoading, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.getHealthCheck(),
  });

  const autoFixMutation = useMutation({
    mutationFn: () => apiClient.autoFixHealth(),
    onSuccess: (response) => {
      const { fixed, failed, failures, report } = response.data as {
        fixed: number; failed: number; failures?: string[]; report?: BBSHealthReport;
      };
      // A failure with no reason is a failure a sysop cannot act on, and this
      // page reported "47 fixed" over an untouched board for long enough.
      if (failed > 0) {
        showError(
          `Fixed ${fixed}, could not fix ${failed}`
          + (failures?.length ? `: ${failures.join('; ')}` : ''),
        );
      } else {
        showSuccess(`Auto-fix complete: ${fixed} issue${fixed === 1 ? '' : 's'} fixed`);
      }
      /*
       * The server re-ran the whole check after fixing and sent the result
       * back. Throwing it away to refetch left the OLD counts and the OLD
       * issue list on screen until a second full pass over 872 screens
       * returned - so a sysop who pressed Auto-Fix saw the same warnings
       * sitting there and concluded nothing had happened.
       */
      if (report) {
        queryClient.setQueryData(['health'], (previous: any) => ({
          ...(previous ?? {}),
          // Merged, not replaced: the GET adds bbsRoot to the report and the
          // auto-fix response does not carry it.
          data: { ...(previous?.data ?? {}), ...report },
        }));
      } else {
        queryClient.invalidateQueries({ queryKey: ['health'] });
      }
    },
    onError: (error: Error) => {
      showError(`Auto-fix failed: ${error.message}`);
    },
  });

  const report = healthData?.data as BBSHealthReport | undefined;

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const handleAutoFix = async () => {
    const confirmed = await confirm({
      title: 'Auto-Fix BBS Issues?',
      message: `This will automatically fix ${report?.autoFixableIssues || 0} fixable issues. Manual fixes will still be required for other issues. Continue?`,
      confirmText: 'Fix Issues',
      cancelText: 'Cancel',
      type: 'warning',
    });

    if (confirmed) {
      autoFixMutation.mutate();
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <XCircle size={16} className="text-status-danger" />;
      case 'warning':
        return <AlertCircle size={16} className="text-status-warn" />;
      case 'info':
        return <Info size={16} className="text-status-info" />;
      default:
        return <Info size={16} className="text-content-secondary" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'text-status-danger';
      case 'warning':
        return 'text-status-warn';
      case 'info':
        return 'text-status-info';
      default:
        return 'text-content-secondary';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return (
          <span className="px-3 py-1 rounded text-sm font-semibold bg-status-ok/20 text-status-ok border border-status-ok/30 flex items-center gap-2">
            <CheckCircle size={16} />
            Healthy
          </span>
        );
      case 'warnings':
        return (
          <span className="px-3 py-1 rounded text-sm font-semibold bg-status-warn/20 text-status-warn border border-status-warn/30 flex items-center gap-2">
            <AlertCircle size={16} />
            Warnings
          </span>
        );
      case 'errors':
        return (
          <span className="px-3 py-1 rounded text-sm font-semibold bg-status-danger/20 text-status-danger border border-status-danger/30 flex items-center gap-2">
            <XCircle size={16} />
            Errors
          </span>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-3">
          <RefreshCw className="animate-spin text-accent" size={24} />
          <span className="text-content-primary">Running BBS health check...</span>
        </div>
      </div>
    );
  }

  return (
    <div>

      {report && (
        <>
          {/* Summary Card */}
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-content-primary mb-2">System Status</h2>
                <p className="text-sm text-content-secondary">
                  Last checked: {new Date(report.timestamp).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => refetch()}
                  disabled={isLoading}
                  className="btn-secondary flex items-center gap-2"
                >
                  <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
                {report.autoFixableIssues > 0 && (
                  <button
                    onClick={handleAutoFix}
                    disabled={autoFixMutation.isPending}
                    className="btn-primary flex items-center gap-2"
                  >
                    {autoFixMutation.isPending ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        Fixing...
                      </>
                    ) : (
                      <>
                        <Wrench size={18} />
                        Auto-Fix ({report.autoFixableIssues})
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-surface-0 border border-border rounded">
                <div className="text-sm text-content-secondary mb-1">Overall Status</div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(report.overallStatus)}
                </div>
              </div>

              <div className="p-4 bg-surface-0 border border-border rounded">
                <div className="text-sm text-content-secondary mb-1">Total Issues</div>
                <div className="text-2xl font-bold text-content-primary">{report.totalIssues}</div>
              </div>

              <div className="p-4 bg-surface-0 border border-border rounded">
                <div className="text-sm text-content-secondary mb-1">Auto-Fixable</div>
                <div className="text-2xl font-bold text-status-ok">{report.autoFixableIssues}</div>
              </div>

              <div className="p-4 bg-surface-0 border border-border rounded">
                <div className="text-sm text-content-secondary mb-1">Categories Checked</div>
                <div className="text-2xl font-bold text-content-primary">{report.categories.length}</div>
              </div>
            </div>
          </div>

          {/* Category Results */}
          <div className="space-y-4">
            {report.categories.map((category) => {
              const isExpanded = expandedCategories.has(category.category);
              const hasIssues = category.issues.length > 0;

              return (
                <div key={category.category} className="card">
                  <button
                    onClick={() => toggleCategory(category.category)}
                    className="w-full text-left flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      {category.passed ? (
                        <CheckCircle size={24} className="text-status-ok flex-shrink-0" />
                      ) : (
                        <XCircle size={24} className="text-status-danger flex-shrink-0" />
                      )}
                      <div>
                        <h3 className="text-lg font-semibold text-content-primary">{category.category}</h3>
                        <div className="flex items-center gap-4 text-sm text-content-secondary mt-1">
                          <span>Checked: {category.checkedCount}</span>
                          {category.errorCount > 0 && (
                            <span className="text-status-danger">{category.errorCount} errors</span>
                          )}
                          {category.warningCount > 0 && (
                            <span className="text-status-warn">{category.warningCount} warnings</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasIssues && (
                        <span className="px-2 py-1 rounded text-xs bg-accent/20 text-accent">
                          {category.issues.length} {category.issues.length === 1 ? 'issue' : 'issues'}
                        </span>
                      )}
                      <span className="text-content-secondary">{isExpanded ? '▼' : '▶'}</span>
                    </div>
                  </button>

                  {isExpanded && hasIssues && (
                    <div className="mt-4 pt-4 border-t border-border space-y-3">
                      {category.issues.map((issue, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-surface-0 border border-border rounded flex gap-3"
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            {getSeverityIcon(issue.severity)}
                          </div>
                          <div className="flex-1">
                            <div className={`font-medium ${getSeverityColor(issue.severity)}`}>
                              {issue.description}
                            </div>
                            {issue.path && (
                              <div className="text-xs text-content-secondary mt-1 font-mono">
                                {issue.path}
                              </div>
                            )}
                            {issue.fixAction && (
                              <div className="text-sm text-content-secondary mt-2 flex items-start gap-2">
                                <Wrench size={14} className="mt-0.5 flex-shrink-0" />
                                <span>
                                  {issue.autoFixable ? (
                                    <span className="text-status-ok">Auto-fix: {issue.fixAction}</span>
                                  ) : (
                                    <span>Manual: {issue.fixAction}</span>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {isExpanded && !hasIssues && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="text-center text-status-ok py-4">
                        <CheckCircle size={32} className="mx-auto mb-2" />
                        <p>No issues found in this category</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
