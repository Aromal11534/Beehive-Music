'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '@/lib/api';
import type { GuildAccess } from '@/lib/types';

interface GuildContextType {
  guilds: GuildAccess[];
  selectedGuild: string;
  setSelectedGuild: (id: string) => void;
  isLoading: boolean;
}

const GuildContext = createContext<GuildContextType | undefined>(undefined);

export function GuildProvider({ children }: { children: ReactNode }) {
  const [guilds, setGuilds] = useState<GuildAccess[]>([]);
  const [selectedGuild, setSelectedGuildState] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.get<GuildAccess[]>('/guilds/my')
      .then((data) => {
        const g = Array.isArray(data) ? data : [];
        setGuilds(g);
        
        const savedGuild = localStorage.getItem('beehive_selected_guild');
        if (savedGuild && g.some(guild => guild.guild?.discord_guild_id === savedGuild)) {
          setSelectedGuildState(savedGuild);
        } else if (g.length > 0) {
          setSelectedGuildState(g[0].guild?.discord_guild_id || '');
        }
      })
      .catch((err) => {
        console.error("Failed to load guilds:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const setSelectedGuild = (id: string) => {
    setSelectedGuildState(id);
    localStorage.setItem('beehive_selected_guild', id);
  };

  return (
    <GuildContext.Provider value={{ guilds, selectedGuild, setSelectedGuild, isLoading }}>
      {children}
    </GuildContext.Provider>
  );
}

export function useGuilds() {
  const context = useContext(GuildContext);
  if (context === undefined) {
    throw new Error('useGuilds must be used within a GuildProvider');
  }
  return context;
}
