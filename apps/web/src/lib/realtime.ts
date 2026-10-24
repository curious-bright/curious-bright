import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL, createWebSocketTicket, getAccessToken } from './api';

export interface RealtimeMessage<T = unknown> {
  event: string;
  data: T;
}

interface Options {
  enabled?: boolean;
}

function websocketUrl(
  path: string,
  credential?: { key: 'ticket' | 'token'; value: string },
): string {
  const base = (import.meta.env.VITE_WS_URL as string | undefined) || API_URL.replace(/^http/, 'ws');
  const url = `${base.replace(/\/$/, '')}${path}`;
  if (!credential) return url;
  const separator = path.includes('?') ? '&' : '?';
  return `${url}${separator}${credential.key}=${encodeURIComponent(credential.value)}`;
}

/**
 * Prefer a short-lived, single-use ticket so the access token never appears
 * in a URL (and therefore never in proxy/access logs). The token fallback
 * keeps realtime working while older backends are still being rolled over.
 */
async function authenticatedWebSocketUrl(path: string): Promise<string> {
  const token = getAccessToken();
  if (!token) return websocketUrl(path);

  const ticket = await createWebSocketTicket();
  if (ticket) return websocketUrl(path, { key: 'ticket', value: ticket });

  // The ticket request may have refreshed the token, so read it again.
  const latestToken = getAccessToken();
  return websocketUrl(path, latestToken ? { key: 'token', value: latestToken } : undefined);
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

    const scheduleRetry = () => {
      if (stopped) return;
      const delay = Math.min(30000, 1000 * 2 ** attempt);
      attempt += 1;
      retryTimer = window.setTimeout(connect, delay);
    };

    const connect = () => {
      void (async () => {
        let url: string;
        try {
          url = await authenticatedWebSocketUrl(path);
        } catch {
          scheduleRetry();
          return;
        }
        if (stopped) return;

        try {
          socket = new WebSocket(url);
        } catch {
          scheduleRetry();
          return;
        }
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
          scheduleRetry();
        };

        socket.onerror = () => socket?.close();
      })();
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
