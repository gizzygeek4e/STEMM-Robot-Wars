import { useCallback, useEffect, useRef, useState } from 'react';
import type { TournamentState, WSServerMessage } from '../types/tournament';
import {
  fetchFirestoreTournamentState,
  subscribeToFirestoreTournamentState,
} from '../utils/firestoreSync';

export type SocketStatus = 'connecting' | 'connected' | 'reconnecting';
export type BackendMode = 'server' | 'firestore';

export function useTournamentSocket() {
  const [state, setState] = useState<TournamentState | null>(null);
  const [backendMode, setBackendMode] = useState<BackendMode>('server');
  const [untouchedBoot, setUntouchedBoot] = useState(false);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('connecting');
  const [connectedClients, setConnectedClients] = useState<number>(1);
  const [lastSyncAt, setLastSyncAt] = useState<number>(Date.now());
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const firestoreUnsubRef = useRef<(() => void) | null>(null);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);

  const startFirestoreMode = useCallback(() => {
    if (!mountedRef.current) return;
    setBackendMode('firestore');
    setUntouchedBoot(false);
    setSocketStatus('connecting');

    if (firestoreUnsubRef.current) {
      firestoreUnsubRef.current();
    }

    firestoreUnsubRef.current = subscribeToFirestoreTournamentState(
      (nextState) => {
        if (!mountedRef.current) return;
        setState(nextState);
        setSocketStatus('connected');
        setLastSyncAt(Date.now());
        setError(null);
      },
      (err) => {
        if (!mountedRef.current) return;
        setError(err.message);
      },
    );
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!mountedRef.current) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    setSocketStatus(attemptRef.current > 0 ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      attemptRef.current = 0;
      setSocketStatus('connected');
      setError(null);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(String(event.data)) as WSServerMessage;
        if (msg.type === 'state:init') {
          setState((prev) => (prev ? prev : msg.payload));
          setConnectedClients(msg.connectedClients);
          setLastSyncAt(msg.serverTime);
        } else if (msg.type === 'state:sync') {
          setUntouchedBoot(false);
          setState(msg.payload);
          setLastSyncAt(msg.serverTime);
        } else if (msg.type === 'match:updated') {
          setState((prev) => {
            if (!prev) return prev;
            const exists = prev.matches.some((m) => m.id === msg.payload.id);
            return {
              ...prev,
              matches: exists
                ? prev.matches.map((m) => (m.id === msg.payload.id ? msg.payload : m))
                : [...prev.matches, msg.payload],
            };
          });
          setLastSyncAt(msg.serverTime);
        } else if (msg.type === 'clock:tick') {
          setState((prev) => {
            if (!prev) return prev;
            const tickMap = new Map(msg.payload.map((u) => [u.id, u]));
            return {
              ...prev,
              matches: prev.matches.map((m) => {
                const tick = tickMap.get(m.id);
                if (!tick) return m;
                return {
                  ...m,
                  clockSeconds: tick.clockSeconds,
                  clockRunning: tick.clockRunning,
                  clockUpdatedAt: tick.clockUpdatedAt,
                };
              }),
            };
          });
          setLastSyncAt(msg.serverTime);
        } else if (msg.type === 'presence:count') {
          setConnectedClients(msg.payload.connectedClients);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setSocketStatus('reconnecting');
      const delay = Math.min(8000, 1000 * Math.pow(1.5, attemptRef.current));
      attemptRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(connectWebSocket, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  const initialize = useCallback(async () => {
    try {
      const res = await fetch('/api/tournament');
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || !contentType.includes('application/json')) {
        // Static hosting (e.g. GitHub Pages): use Cloud Firestore real-time listeners
        startFirestoreMode();
        return;
      }

      const data = (await res.json()) as {
        state: TournamentState;
        connectedClients?: number;
        untouchedBoot?: boolean;
      };
      if (!mountedRef.current) return;

      let resolvedState = data.state;
      const isUntouched = Boolean(data.untouchedBoot);
      setUntouchedBoot(isUntouched);

      if (isUntouched) {
        try {
          const fsState = await fetchFirestoreTournamentState();
          if (fsState && mountedRef.current) {
            resolvedState = fsState;
          }
        } catch {
          // Fallback cleanly to server snapshot if Firestore is unreachable
        }
      }

      if (!mountedRef.current) return;
      setBackendMode('server');
      setState(resolvedState);
      if (typeof data.connectedClients === 'number') {
        setConnectedClients(data.connectedClients);
      }
      setLastSyncAt(Date.now());
      setError(null);
      connectWebSocket();
    } catch {
      // Network error reaching /api/tournament -> use Cloud Firestore real-time mode
      startFirestoreMode();
    }
  }, [connectWebSocket, startFirestoreMode]);

  useEffect(() => {
    mountedRef.current = true;
    void initialize();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
      firestoreUnsubRef.current?.();
    };
  }, [initialize]);

  // Smooth local clock progression when running in static/Firestore mode
  useEffect(() => {
    if (backendMode !== 'firestore') return;
    const timer = window.setInterval(() => {
      setState((prev) => {
        if (!prev) return prev;
        const hasRunning = prev.matches.some((m) => m.status === 'live' && m.clockRunning);
        if (!hasRunning) return prev;
        return {
          ...prev,
          matches: prev.matches.map((m) => {
            if (m.status !== 'live' || !m.clockRunning) return m;
            const maxDur = m.durationSeconds || 120;
            const nextSec = Math.min(maxDur, m.clockSeconds + 1);
            return {
              ...m,
              clockSeconds: nextSec,
              clockRunning: nextSec < maxDur,
            };
          }),
        };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [backendMode]);

  return {
    state,
    setState,
    backendMode,
    untouchedBoot,
    socketStatus,
    connectedClients,
    lastSyncAt,
    error,
    refresh: initialize,
  };
}
