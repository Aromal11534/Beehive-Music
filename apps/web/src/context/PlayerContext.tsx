'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { api, getWsBase } from '@/lib/api';
import type { PlayerState } from '@/lib/types';
import { useGuilds } from '@/context/GuildContext';

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
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    let shouldReconnect = true;

    api.get<PlayerState>(`/player/${selectedGuild}`).then((data) => {
      setState(data);
      positionRef.current = data?.position_ms || 0;
      lastUpdateRef.current = performance.now();
      setLocalPosition(data?.position_ms || 0);
    }).catch(() => setState(null));

    const connect = () => {
      const wsUrl = getWsBase();
      const wsToken = localStorage.getItem('beehive_access_token') || '';
      const ws = new WebSocket(`${wsUrl}/player/ws/${selectedGuild}?token=${encodeURIComponent(wsToken)}`);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as PlayerState;
          setState(data);
          positionRef.current = data.position_ms || 0;
          lastUpdateRef.current = performance.now();
        } catch { }
      };
      ws.onerror = () => { };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (shouldReconnect) {
          reconnectTimeoutRef.current = setTimeout(connect, 2500);
        }
      };
      wsRef.current = ws;
    };

    connect();

    return () => {
      shouldReconnect = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
      wsRef.current = null;
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
    setState((prev) => prev ? { ...prev, volume: vol } : prev);
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    volumeTimeoutRef.current = setTimeout(() => {
      sendCommand('volume', vol);
    }, 150);
  }, [sendCommand]);

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
