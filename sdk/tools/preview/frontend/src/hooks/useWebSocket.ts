import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage, ConnectionStatus } from '../types';

interface UseWebSocketOptions {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export const useWebSocket = (options: UseWebSocketOptions) => {
  const {
    url,
    reconnectInterval = 3000,
    maxReconnectAttempts = Infinity, // Infinite reconnection attempts
    onMessage,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>({
    connected: false,
    reconnecting: false,
    error: null,
    lastConnected: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setStatus({
          connected: true,
          reconnecting: false,
          error: null,
          lastConnected: Date.now(),
        });
        reconnectAttemptsRef.current = 0;
        onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          onMessage?.(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setStatus((prev) => ({
          ...prev,
          error: 'Connection error',
        }));
        onError?.(error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setStatus((prev) => ({
          ...prev,
          connected: false,
        }));
        onDisconnect?.();

        // Attempt to reconnect (infinite attempts)
        reconnectAttemptsRef.current++;
        const nextDelay = Math.min(reconnectInterval * Math.pow(1.5, Math.min(reconnectAttemptsRef.current - 1, 5)), 30000);

        setStatus((prev) => ({
          ...prev,
          reconnecting: true,
          error: `Reconnecting... (attempt ${reconnectAttemptsRef.current})`,
        }));

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, nextDelay);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      setStatus((prev) => ({
        ...prev,
        error: 'Failed to connect',
      }));
    }
  }, [url, reconnectInterval, maxReconnectAttempts, onMessage, onConnect, onDisconnect, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const send = useCallback((message: WebSocketMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    status,
    send,
    disconnect,
    reconnect: connect,
  };
};
