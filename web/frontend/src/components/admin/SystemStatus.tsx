import { useEffect, useState } from 'react';
import './SystemStatus.css';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

export default function SystemStatus() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('/api/config/system');
        const payload: ApiResponse<Record<string, unknown>> = await response.json();
        if (!payload.success) {
          throw new Error(payload.message || 'Failed to load system configuration');
        }
        setConfig(payload.data || {});
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const renderRows = () => {
    if (!config) return null;
    return Object.entries(config).map(([key, value]) => (
      <tr key={key}>
        <td>{key}</td>
        <td>{String(value)}</td>
      </tr>
    ));
  };

  return (
    <div className="system-status">
      <h1>System Configuration</h1>
      {loading && <p className="loading">Loading system settings…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && (
        <div className="system-status__table-container">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>{renderRows()}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
