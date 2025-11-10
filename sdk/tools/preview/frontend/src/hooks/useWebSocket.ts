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
    maxReconnectAttempts = 5, // Limit reconnection attempts
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
  const isMountedRef = useRef(true);

  // Store callbacks in refs to avoid recreating connect function
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change
  useEffect(() => {
    onMessageRef.current = onMessage;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
  }, [onMessage, onConnect, onDisconnect, onError]);

  const connect = useCallback(() => {
    // Don't reconnect if component unmounted
    if (!isMountedRef.current) return;

    // Close existing connection before creating new one
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('WebSocket connected');
        if (isMountedRef.current) {
          setStatus({
            connected: true,
            reconnecting: false,
            error: null,
            lastConnected: Date.now(),
          });
          reconnectAttemptsRef.current = 0;
          onConnectRef.current?.();
        }
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          onMessageRef.current?.(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (isMountedRef.current) {
          setStatus((prev) => ({
            ...prev,
            error: 'Connection error',
          }));
          onErrorRef.current?.(error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        if (!isMountedRef.current) return;

        setStatus((prev) => ({
          ...prev,
          connected: false,
        }));
        onDisconnectRef.current?.();

        // Attempt to reconnect with exponential backoff (limited attempts)
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const nextDelay = Math.min(reconnectInterval * Math.pow(1.5, reconnectAttemptsRef.current - 1), 30000);

          setStatus((prev) => ({
            ...prev,
            reconnecting: true,
            error: `Reconnecting... (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`,
          }));

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, nextDelay);
        } else {
          setStatus((prev) => ({
            ...prev,
            reconnecting: false,
            error: `Failed to connect after ${maxReconnectAttempts} attempts`,
          }));
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      if (isMountedRef.current) {
        setStatus((prev) => ({
          ...prev,
          error: 'Failed to connect',
        }));
      }
    }
  }, [url, reconnectInterval, maxReconnectAttempts]);

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
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    status,
    send,
    disconnect,
    reconnect: connect,
    ws: wsRef, // Expose WebSocket instance
  };
};
