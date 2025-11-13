import { useQuery } from '@tanstack/react-query';
import { Download, Check, X } from 'lucide-react';
import { apiClient } from '../api/client';
import type { Protocol } from '../types';

export function ProtocolsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['protocols'],
    queryFn: () => apiClient.getProtocols(),
  });

  if (isLoading) {
    return <div className="text-bbs-text">Loading protocols...</div>;
  }

  const protocols = data?.data || [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-bbs-accent mb-2">Transfer Protocols</h1>
        <p className="text-bbs-muted">Configure file transfer protocol handlers</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {protocols.map((protocol: Protocol) => (
          <div key={protocol.id} className="card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-bbs-primary rounded">
                  <Download className="text-bbs-accent" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-bbs-text">
                    {protocol.protocol_name}
                  </h3>
                  <p className="text-xs text-bbs-muted font-mono">{protocol.protocol_code}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {(protocol.batch_upload || protocol.batch_download) && (
                  <div className="px-2 py-1 bg-bbs-accent/20 text-bbs-accent rounded text-xs">
                    Batch
                  </div>
                )}
                {protocol.bidirectional && (
                  <div className="px-2 py-1 bg-blue-500/20 text-blue-500 rounded text-xs">
                    Bi-Dir
                  </div>
                )}
                <div
                  className={`p-1 rounded ${
                    protocol.enabled
                      ? 'bg-green-500/20 text-green-500'
                      : 'bg-bbs-muted/20 text-bbs-muted'
                  }`}
                >
                  {protocol.enabled ? <Check size={16} /> : <X size={16} />}
                </div>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div>
                <span className="text-bbs-muted block mb-1">Base Command:</span>
                <code className="text-bbs-text bg-bbs-bg px-2 py-1 rounded block font-mono text-xs">
                  {protocol.command || 'Not set'}
                </code>
              </div>
              <div>
                <span className="text-bbs-muted block mb-1">Upload Command:</span>
                <code className="text-bbs-text bg-bbs-bg px-2 py-1 rounded block font-mono text-xs">
                  {protocol.upload_command || 'Not set'}
                </code>
              </div>
              <div>
                <span className="text-bbs-muted block mb-1">Download Command:</span>
                <code className="text-bbs-text bg-bbs-bg px-2 py-1 rounded block font-mono text-xs">
                  {protocol.download_command || 'Not set'}
                </code>
              </div>
            </div>
          </div>
        ))}
      </div>

      {protocols.length === 0 && (
        <div className="card text-center text-bbs-muted">
          No protocols configured. Add transfer protocols like XMODEM, YMODEM, ZMODEM.
        </div>
      )}
    </div>
  );
}
