/**
 * Import Results Component
 *
 * Displays the results of a completed import.
 */

interface ImportResultsProps {
  result: {
    success: boolean;
    usersImported: number;
    conferencesImported: number;
    commandsImported: number;
    errors: string[];
    warnings: string[];
  };
  onReset: () => void;
}

export function ImportResults({ result, onReset }: ImportResultsProps) {
  return (
    <div className="import-results">
      <h2>Import Complete</h2>

      {result.success ? (
        <div className="status-banner success">
          ✓ Import completed successfully!
        </div>
      ) : (
        <div className="status-banner error">
          ✗ Import completed with errors
        </div>
      )}

      <div className="results-summary">
        <h3>Import Summary</h3>
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-label">Users Imported:</span>
            <span className="summary-value">{result.usersImported}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Conferences Imported:</span>
            <span className="summary-value">{result.conferencesImported}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Commands Imported:</span>
            <span className="summary-value">{result.commandsImported}</span>
          </div>
        </div>
      </div>

      {result.errors && result.errors.length > 0 && (
        <div className="results-errors">
          <h3>Errors ({result.errors.length})</h3>
          <ul>
            {result.errors.map((error, idx) => (
              <li key={idx} className="error-item">{error}</li>
            ))}
          </ul>
        </div>
      )}

      {result.warnings && result.warnings.length > 0 && (
        <div className="results-warnings">
          <h3>Warnings ({result.warnings.length})</h3>
          <ul>
            {result.warnings.slice(0, 10).map((warning, idx) => (
              <li key={idx} className="warning-item">{warning}</li>
            ))}
            {result.warnings.length > 10 && (
              <li className="more-items">
                ... and {result.warnings.length - 10} more warnings
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="results-actions">
        <button onClick={onReset} className="btn-primary">
          Import Another Archive
        </button>
      </div>
    </div>
  );
}
