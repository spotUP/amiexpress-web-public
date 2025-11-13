/**
 * Import Progress Component
 *
 * Displays real-time progress during import execution.
 */

interface ImportProgressProps {
  session: {
    id: string;
    status: string;
    progress: number;
  };
  progress: number;
}

export function ImportProgress({ session, progress }: ImportProgressProps) {
  return (
    <div className="import-progress">
      <h2>Importing BBS Data</h2>
      <p>Please wait while the import completes...</p>

      <div className="progress-bar-container">
        <div
          className="progress-bar"
          style={{ width: `${progress}%` }}
        />
        <span className="progress-text">{progress}%</span>
      </div>

      <div className="status-info">
        <p>Status: <strong>{session.status}</strong></p>
        <p>Session ID: <code>{session.id}</code></p>
      </div>

      <div className="progress-spinner">
        <div className="spinner"></div>
      </div>
    </div>
  );
}
