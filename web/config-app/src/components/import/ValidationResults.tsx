/**
 * Validation Results Component
 *
 * Displays validation results, conflicts, and import summary.
 */

import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';

interface ValidationResultsProps {
  validation: any;
  conflicts: any;
  summary: {
    users: number;
    conferences: number;
    commands: number;
    nodes: number;
  };
}

export function ValidationResults({ validation, conflicts, summary }: ValidationResultsProps) {
  const totalErrors = Object.values(validation || {}).reduce(
    (sum: number, result: any) => sum + (result.errors?.length || 0),
    0
  );

  const totalWarnings = Object.values(validation || {}).reduce(
    (sum: number, result: any) => sum + (result.warnings?.length || 0),
    0
  );

  const hasConflicts =
    (conflicts?.userConflicts?.length || 0) > 0 ||
    (conflicts?.conferenceConflicts?.length || 0) > 0 ||
    (conflicts?.commandConflicts?.length || 0) > 0;

  return (
    <div className="validation-results">
      <h2>Validation Results</h2>

      {/* Summary */}
      <div className="import-summary">
        <h3>Import Summary</h3>
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-label">Users:</span>
            <span className="summary-value">{summary.users}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Conferences:</span>
            <span className="summary-value">{summary.conferences}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Commands:</span>
            <span className="summary-value">{summary.commands}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Nodes:</span>
            <span className="summary-value">{summary.nodes}</span>
          </div>
        </div>
      </div>

      {/* Validation Status */}
      <div className="validation-status">
        {totalErrors === 0 && totalWarnings === 0 && !hasConflicts ? (
          <div className="status-banner success">
            <CheckCircle size={16} aria-hidden="true" />
            Archive validated successfully. No errors, warnings or conflicts.
          </div>
        ) : (
          <>
            {totalErrors > 0 && (
              <div className="status-banner error">
                <XCircle size={16} aria-hidden="true" />
                {totalErrors} validation errors found
              </div>
            )}
            {totalWarnings > 0 && (
              <div className="status-banner warning">
                <AlertTriangle size={16} aria-hidden="true" />
                {totalWarnings} warnings found
              </div>
            )}
            {hasConflicts && (
              <div className="status-banner info">
                <Info size={16} aria-hidden="true" />
                Conflicts detected - review and select resolution strategies
              </div>
            )}
          </>
        )}
      </div>

      {/* Conflicts */}
      {hasConflicts && (
        <div className="conflicts-section">
          <h3>Conflicts Detected</h3>

          {conflicts.userConflicts && conflicts.userConflicts.length > 0 && (
            <div className="conflict-category">
              <h4>User Conflicts ({conflicts.userConflicts.length})</h4>
              <p className="conflict-description">
                The following usernames already exist in the database:
              </p>
              <ul className="conflict-list">
                {conflicts.userConflicts.slice(0, 5).map((conflict: any, idx: number) => (
                  <li key={idx}>
                    <strong>{conflict.import.username}</strong>
                    <span className="conflict-details">
                      {' '}
                      (Existing: {conflict.existing.secLevel} sec, {conflict.existing.calls} calls
                      {' | '}
                      Import: {conflict.import.secLevel} sec, {conflict.import.calls} calls)
                    </span>
                  </li>
                ))}
                {conflicts.userConflicts.length > 5 && (
                  <li className="more-items">
                    ... and {conflicts.userConflicts.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {conflicts.conferenceConflicts && conflicts.conferenceConflicts.length > 0 && (
            <div className="conflict-category">
              <h4>Conference Conflicts ({conflicts.conferenceConflicts.length})</h4>
              <p className="conflict-description">
                The following conference names already exist:
              </p>
              <ul className="conflict-list">
                {conflicts.conferenceConflicts.slice(0, 5).map((conflict: any, idx: number) => (
                  <li key={idx}>
                    <strong>{conflict.import.name}</strong>
                  </li>
                ))}
                {conflicts.conferenceConflicts.length > 5 && (
                  <li className="more-items">
                    ... and {conflicts.conferenceConflicts.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {conflicts.recommendations && conflicts.recommendations.length > 0 && (
            <div className="recommendations">
              <h4>Recommendations</h4>
              <ul>
                {conflicts.recommendations.map((rec: string, idx: number) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Detailed Validation Results */}
      {(totalErrors > 0 || totalWarnings > 0) && (
        <details className="detailed-validation">
          <summary>View Detailed Validation Results</summary>
          <div className="validation-details">
            {Object.entries(validation || {}).map(([category, result]: [string, any]) => (
              <div key={category} className="validation-category">
                <h4>{category.charAt(0).toUpperCase() + category.slice(1)}</h4>

                {result.errors && result.errors.length > 0 && (
                  <div className="errors">
                    <strong>Errors:</strong>
                    <ul>
                      {result.errors.map((error: string, idx: number) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.warnings && result.warnings.length > 0 && (
                  <div className="warnings">
                    <strong>Warnings:</strong>
                    <ul>
                      {result.warnings.map((warning: string, idx: number) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
