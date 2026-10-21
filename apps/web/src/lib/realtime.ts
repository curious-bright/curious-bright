import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL, getAccessToken } from './api';

export interface RealtimeMessage<T = unknown> {
  event: string;
  data: T;
}

interface Options {
  enabled?: boolean;
}

function websocketUrl(path: string): string {
  const base = (import.meta.env.VITE_WS_URL as string | undefined) || API_URL.replace(/^http/, 'ws');
  const token = getAccessToken();
  const separator = path.includes('?') ? '&' : '?';
  return `${base.replace(/\/$/, '')}${path}${token ? `${separator}token=${encodeURIComponent(token)}` : ''}`;
}

/**
 * One resilient WebSocket subscription with exponential-backoff reconnect.
 * The handler always sees the latest render closure; the socket is only
 * recreated when the path or enabled flag changes.
 */
export function useRealtime<T = unknown>(
  path: string | null,
  onMessage: (message: RealtimeMessage<T>) => void,
  { enabled = true }: Options = {},
) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;
  const socketRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  const send = useCallback((payload: unknown): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }, []);

  useEffect(() => {
    if (!path || !enabled) {
      setConnected(false);
      return;
    }

    let socket: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let retryTimer: number | undefined;

    const connect = () => {
      socket = new WebSocket(websocketUrl(path));
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
      };

      socket.onmessage = (raw) => {
        try {
          const parsed = JSON.parse(raw.data as string) as RealtimeMessage<T>;
          if (!parsed || typeof parsed.event !== 'string') return;
          if (parsed.event === 'connected') {
            setConnected(true);
            return;
          }
          handlerRef.current(parsed);
        } catch {
          // Ignore malformed frames; the next valid event still arrives.
        }
      };

      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        setConnected(false);
        if (stopped) return;
        const delay = Math.min(30000, 1000 * 2 ** attempt);
        attempt += 1;
        retryTimer = window.setTimeout(connect, delay);
      };

      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      if (socketRef.current === socket) socketRef.current = null;
      socket?.close();
      setConnected(false);
    };
  }, [path, enabled]);

  return { connected, send };
}
