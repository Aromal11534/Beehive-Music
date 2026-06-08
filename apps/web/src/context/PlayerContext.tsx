'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import type { PlayerState } from '@/lib/types';
import { useGuilds } from '@/context/GuildContext';

const CONFIGURED_WS_URL = process.env.NEXT_PUBLIC_WS_URL || '/api/v1';

function normalizeWsBase(base: string) {
  const trimmed = base.replace(/\/$/, '');
  return trimmed.endsWith('/ws') ? trimmed.replace(/\/ws$/, '/api/v1') : trimmed;
}

function getWsBase() {
  const normalized = normalizeWsBase(CONFIGURED_WS_URL);

  if (typeof window === 'undefined') return normalized;

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'ws://localhost:8001/api/v1';
  }

  if (normalized.startsWith('wss://') && window.location.protocol !== 'https:') {
    return normalized.replace('wss://', 'ws://');
  }

  if (normalized.startsWith('ws://') || normalized.startsWith('wss://')) {
    return normalized;
  }

  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const path = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `${wsProtocol}://${window.location.host}${path}`;
}

interface PlayerContextType {
  state: PlayerState | null;
  localPosition: number;
  isDraggingRef: React.MutableRefObject<boolean>;
  sendCommand: (action: string, value?: string | number | boolean | Record<string, unknown>) => boolean;
  commitSeek: (value: number) => void;
  handleVolumeChange: (vol: number) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlayerState | null>(null);
  const { selectedGuild } = useGuilds();
  const [localPosition, setLocalPosition] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const positionRef = useRef(0);
  const lastUpdateRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const tick = () => {
      if (state?.is_playing && !state?.is_paused && !isDraggingRef.current) {
        const elapsed = performance.now() - lastUpdateRef.current;
        const interpolated = positionRef.current + elapsed;
        const duration = state?.current_track?.duration_ms || state?.current_track?.duration || 0;
        setLocalPosition(Math.min(interpolated, duration));
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [state?.is_playing, state?.is_paused, state?.current_track]);

  useEffect(() => {
    if (!selectedGuild) return;

    api.get<PlayerState>(`/player/${selectedGuild}`).then((data) => {
      setState(data);
      positionRef.current = data?.position_ms || 0;
      lastUpdateRef.current = performance.now();
      setLocalPosition(data?.position_ms || 0);
    }).catch(() => setState(null));

    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function connectWs() {
      const wsUrl = getWsBase();
      const wsToken = localStorage.getItem('beehive_access_token') || '';
      const ws = new WebSocket(`${wsUrl}/player/ws/${selectedGuild}?token=${encodeURIComponent(wsToken)}`);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as PlayerState;
          setState(data);
          positionRef.current = data.position_ms || 0;
          lastUpdateRef.current = performance.now();
        } catch {}
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (!closed) {
          reconnectTimeout = setTimeout(connectWs, 3000);
        }
      };
      wsRef.current = ws;
    }

    connectWs();

    return () => {
      closed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, [selectedGuild]);

  const sendCommand = useCallback((action: string, value?: string | number | boolean | Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const payload = typeof value === 'object' && value !== null && !Array.isArray(value)
        ? { action, ...value }
        : value !== undefined
          ? { action, value }
          : { action };
      wsRef.current.send(JSON.stringify(payload));

      // Optimistic UI updates
      setState((prev) => {
        if (!prev) return prev;
        switch (action) {
          case 'pause': return { ...prev, is_playing: false, is_paused: true };
          case 'resume': return { ...prev, is_playing: true, is_paused: false };
          case 'volume': return { ...prev, volume: value as number };
          case 'loop': return { ...prev, loop_mode: value as string };
          default: return prev;
        }
      });

      return true;
    }
    return false;
  }, []);

  const commitSeek = useCallback((value: number) => {
    isDraggingRef.current = false;
    positionRef.current = value;
    lastUpdateRef.current = performance.now();
    setLocalPosition(value);
    sendCommand('seek', value);
  }, [sendCommand]);

  const handleVolumeChange = useCallback((vol: number) => {
    // Optimistic update handled inside sendCommand, so just debounce the command
    setState((prev) => prev ? { ...prev, volume: vol } : prev);
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    volumeTimeoutRef.current = setTimeout(() => {
      // Skip optimistic update for volume here since we already did it above
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'volume', value: vol }));
      }
    }, 150);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        state,
        localPosition,
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
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}
