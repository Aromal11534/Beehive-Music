'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, getWsBase } from '@/lib/api';
import type { PlayerState } from '@/lib/types';
import { useGuilds } from '@/context/GuildContext';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface PlayerContextType {
  state: PlayerState | null;
  localPosition: number;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  isDraggingRef: React.MutableRefObject<boolean>;
  sendCommand: (action: string, value?: string | number | boolean | Record<string, unknown>) => Promise<boolean>;
  commitSeek: (value: number) => Promise<boolean>;
  handleVolumeChange: (vol: number) => Promise<boolean>;
}

interface ConnectionState {
  guildId: string | null;
  status: ConnectionStatus;
  error: string | null;
}

interface CommandResult {
  type: 'command_result';
  request_id: string;
  ok: boolean;
  error?: string;
}

interface PendingCommand {
  resolve: (ok: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

function isCommandResult(value: unknown): value is CommandResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<CommandResult>;
  return result.type === 'command_result'
    && typeof result.request_id === 'string'
    && typeof result.ok === 'boolean';
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [localPositionState, setLocalPosition] = useState(0);
  const [connection, setConnection] = useState<ConnectionState>({
    guildId: null,
    status: 'disconnected',
    error: null,
  });
  const { selectedGuild } = useGuilds();
  const wsRef = useRef<WebSocket | null>(null);
  const positionRef = useRef(0);
  const lastUpdateRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const pendingCommandsRef = useRef(new Map<string, PendingCommand>());

  const state = playerState?.guild_id === selectedGuild ? playerState : null;
  const localPosition = state ? localPositionState : 0;
  const connectionStatus: ConnectionStatus = !selectedGuild
    ? 'disconnected'
    : connection.guildId === selectedGuild
      ? connection.status
      : 'connecting';
  const connectionError = connection.guildId === selectedGuild ? connection.error : null;

  useEffect(() => {
    const tick = () => {
      if (state?.is_playing && !state.is_paused && !isDraggingRef.current) {
        const elapsed = performance.now() - lastUpdateRef.current;
        const interpolated = positionRef.current + elapsed;
        const duration = state.current_track?.duration_ms || state.current_track?.duration || 0;
        setLocalPosition(Math.min(interpolated, duration));
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [state]);

  useEffect(() => {
    if (!selectedGuild) return;

    let active = true;
    let unauthorizedRefreshAttempted = false;
    reconnectAttemptRef.current = 0;
    positionRef.current = 0;
    isDraggingRef.current = false;

    const clearPendingCommands = () => {
      for (const pending of pendingCommandsRef.current.values()) {
        clearTimeout(pending.timeout);
        pending.resolve(false);
      }
      pendingCommandsRef.current.clear();
    };

    const applyState = (data: PlayerState) => {
      if (!active || data.guild_id !== selectedGuild) return;
      setPlayerState(data);
      positionRef.current = data.position_ms || 0;
      lastUpdateRef.current = performance.now();
      if (!isDraggingRef.current) setLocalPosition(data.position_ms || 0);
    };

    const scheduleReconnect = (connect: () => void) => {
      if (!active) return;
      const delay = Math.min(1000 * (2 ** reconnectAttemptRef.current), 30_000);
      reconnectAttemptRef.current += 1;
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    const connect = () => {
      if (!active) return;
      setConnection({ guildId: selectedGuild, status: 'connecting', error: null });

      const wsToken = localStorage.getItem('beehive_access_token') || '';
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${getWsBase()}/player/ws/${selectedGuild}?token=${encodeURIComponent(wsToken)}`);
      } catch (error: unknown) {
        setConnection({
          guildId: selectedGuild,
          status: 'disconnected',
          error: error instanceof Error ? error.message : 'Unable to open the live player connection.',
        });
        scheduleReconnect(connect);
        return;
      }

      wsRef.current = ws;
      ws.onopen = () => {
        if (!active || wsRef.current !== ws) return;
        reconnectAttemptRef.current = 0;
        unauthorizedRefreshAttempted = false;
        setConnection({ guildId: selectedGuild, status: 'connected', error: null });
      };
      ws.onmessage = (event) => {
        if (!active || wsRef.current !== ws) return;
        try {
          const data: unknown = JSON.parse(event.data);
          if (isCommandResult(data)) {
            const pending = pendingCommandsRef.current.get(data.request_id);
            if (pending) {
              clearTimeout(pending.timeout);
              pendingCommandsRef.current.delete(data.request_id);
              pending.resolve(data.ok);
            }
            setConnection({
              guildId: selectedGuild,
              status: 'connected',
              error: data.ok ? null : (data.error || 'Player command was rejected.'),
            });
            return;
          }
          applyState(data as PlayerState);
        } catch {
          setConnection({
            guildId: selectedGuild,
            status: 'connected',
            error: 'Received an invalid player update.',
          });
        }
      };
      ws.onerror = () => {
        if (!active || wsRef.current !== ws) return;
        setConnection({ guildId: selectedGuild, status: 'disconnected', error: 'Live player connection failed.' });
      };
      ws.onclose = (event) => {
        if (!active || wsRef.current !== ws) return;
        wsRef.current = null;
        clearPendingCommands();
        setConnection({ guildId: selectedGuild, status: 'disconnected', error: 'Live player connection closed.' });

        if (event.code === 4401) {
          if (unauthorizedRefreshAttempted) {
            setConnection({ guildId: selectedGuild, status: 'disconnected', error: 'Your player session is no longer authorized.' });
            return;
          }
          unauthorizedRefreshAttempted = true;
          void api.get<PlayerState>(`/player/${selectedGuild}`).then((data) => {
            applyState(data);
            scheduleReconnect(connect);
          }).catch((error: unknown) => {
            setConnection({
              guildId: selectedGuild,
              status: 'disconnected',
              error: error instanceof Error ? error.message : 'Your player session expired.',
            });
          });
          return;
        }

        scheduleReconnect(connect);
      };
    };

    void api.get<PlayerState>(`/player/${selectedGuild}`).then(applyState).catch((error: unknown) => {
      if (!active) return;
      setConnection({
        guildId: selectedGuild,
        status: 'connecting',
        error: error instanceof Error ? error.message : 'Unable to load player state.',
      });
    }).finally(() => {
      if (active) connect();
    });

    return () => {
      active = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
      clearPendingCommands();
    };
  }, [selectedGuild]);

  const sendCommand = useCallback((
    action: string,
    value?: string | number | boolean | Record<string, unknown>
  ): Promise<boolean> => {
    const ws = wsRef.current;
    if (!selectedGuild || !ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve(false);
    }

    const requestId = window.crypto.randomUUID();
    const payload = typeof value === 'object' && value !== null && !Array.isArray(value)
      ? { action, ...value, request_id: requestId }
      : value !== undefined
        ? { action, value, request_id: requestId }
        : { action, request_id: requestId };

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        pendingCommandsRef.current.delete(requestId);
        setConnection({
          guildId: selectedGuild,
          status: ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected',
          error: 'The music bot did not acknowledge the player command.',
        });
        resolve(false);
      }, 20_000);

      pendingCommandsRef.current.set(requestId, { resolve, timeout });
      try {
        ws.send(JSON.stringify(payload));
      } catch {
        clearTimeout(timeout);
        pendingCommandsRef.current.delete(requestId);
        resolve(false);
      }
    });
  }, [selectedGuild]);

  const commitSeek = useCallback(async (value: number) => {
    isDraggingRef.current = false;
    positionRef.current = value;
    lastUpdateRef.current = performance.now();
    setLocalPosition(value);
    const accepted = await sendCommand('seek', value);
    return accepted;
  }, [sendCommand]);

  const handleVolumeChange = useCallback((vol: number) => sendCommand('volume', vol), [sendCommand]);

  return (
    <PlayerContext.Provider
      value={{
        state,
        localPosition,
        connectionStatus,
        connectionError,
        isDraggingRef,
        sendCommand,
        commitSeek,
        handleVolumeChange,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error('usePlayer must be used within PlayerProvider');
  }
  return context;
}
