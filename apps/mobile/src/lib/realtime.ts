// Port of apps/web/src/lib/realtime.ts: one resilient WebSocket subscription
// per hook with exponential-backoff reconnect. RN timers replace window ones,
// and AppState foreground events force an immediate reconnect (mobile sockets
// drop silently in background).

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { WS_URL, createWebSocketTicket, getAccessToken } from './api';

export interface RealtimeMessage<T = unknown> {
  event: string;
  data: T;
}

interface Options {
  enabled?: boolean;
}

function websocketUrl(path: string, credential?: { key: 'ticket' | 'token'; value: string }): string {
  const base = WS_URL.replace(/\/$/, '');
  const url = `${base}${path}`;
  if (!credential) return url;
  const separator = path.includes('?') ? '&' : '?';
  return `${url}${separator}${credential.key}=${encodeURIComponent(credential.value)}`;
}

async function authenticatedWebSocketUrl(path: string): Promise<string> {
  const token = getAccessToken();
  if (!token) return websocketUrl(path);

  const ticket = await createWebSocketTicket();
  if (ticket) return websocketUrl(path, { key: 'ticket', value: ticket });

  const latestToken = getAccessToken();
  return websocketUrl(path, latestToken ? { key: 'token', value: latestToken } : undefined);
}

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
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRetry = () => {
      if (stopped) return;
      const delay = Math.min(30000, 1000 * 2 ** attempt);
      attempt += 1;
      retryTimer = setTimeout(connect, delay);
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
            const parsed = JSON.parse(String(raw.data)) as RealtimeMessage<T>;
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

    const appState = AppState.addEventListener('change', (state) => {
      if (stopped) return;
      if (state === 'active') {
        if (!socketRef.current || socketRef.current.readyState >= WebSocket.CLOSING) {
          clearTimeout(retryTimer);
          attempt = 0;
          connect();
        }
      }
    });

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      appState.remove();
      if (socketRef.current === socket) socketRef.current = null;
      socket?.close();
      setConnected(false);
    };
  }, [path, enabled]);

  return { connected, send };
}
