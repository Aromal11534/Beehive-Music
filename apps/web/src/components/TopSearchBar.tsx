'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
import { useGuilds } from '@/context/GuildContext';
import { FallbackImage } from '@/components/FallbackImage';
import { usePlayer } from '@/context/PlayerContext';

interface SearchTrack {
  encoded: string;
  title: string;
  author: string;
  url: string;
  identifier: string;
  duration: number;
  artwork_url?: string;
  source: string;
}

export function TopSearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchTrack[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isGuildDropdownOpen, setIsGuildDropdownOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ idx: number; msg: string } | null>(null);
  
  const { guilds, selectedGuild, setSelectedGuild } = useGuilds();
  const { sendCommand } = usePlayer();
  const [isReloading, setIsReloading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsGuildDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !selectedGuild) return;
    
    setIsSearching(true);
    setIsOpen(true);
    try {
      const data = await api.post<{ tracks: SearchTrack[] }>('/player/search', {
        query: query.trim(),
        guild_id: selectedGuild,
      });
      setResults(data.tracks || []);
    } catch (err) {
      console.error(err);
      setResults([]);
    }
    setIsSearching(false);
  };

  const handlePlay = async (track: SearchTrack, action: 'play' | 'queue', idx: number) => {
    try {
      await api.post('/player/play', {
        guild_id: selectedGuild,
        track,
        action,
      });
      setFeedback({ idx, msg: action === 'play' ? '▶ Playing' : '➕ Queued' });
      setTimeout(() => setFeedback(null), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative w-full max-w-md ml-4" ref={containerRef}>
      <form onSubmit={handleSearch} className="flex gap-2 w-full">
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (results.length > 0) setIsOpen(true); }}
            placeholder="Search for music..."
            className="w-full pl-9 pr-4 py-1.5 bg-zinc-800/50 border border-zinc-700/50 rounded-full text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition"
          />
        </div>
        {guilds.length > 0 && (
          <div className="relative shrink-0 flex items-center gap-1.5">
            <div className="relative w-[140px]">
              <button
                type="button"
                onClick={() => setIsGuildDropdownOpen(!isGuildDropdownOpen)}
                className="w-full flex items-center justify-between gap-1.5 px-3 py-1.5 bg-zinc-800/50 border border-zinc-700/50 hover:bg-zinc-700/50 rounded-full text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition whitespace-nowrap"
              >
                <span className="truncate text-left flex-1">
                  {guilds.find(g => g.guild?.discord_guild_id === selectedGuild)?.guild?.name || 'Select Server'}
                </span>
                <svg className={`shrink-0 w-3 h-3 text-zinc-500 transition-transform ${isGuildDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>

              {isGuildDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl overflow-hidden z-50 py-1">
                  <div className="max-h-[250px] overflow-y-auto">
                    {guilds.map((g) => {
                      const isSelected = selectedGuild === g.guild?.discord_guild_id;
                      return (
                        <button
                          key={g.guild?.discord_guild_id || g.id}
                          type="button"
                          onClick={() => {
                            setSelectedGuild(g.guild?.discord_guild_id || '');
                            setIsGuildDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                            isSelected 
                              ? 'bg-amber-500/10 text-amber-400 font-medium' 
                              : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
                          }`}
                        >
                          <span className="truncate">{g.guild?.name || 'Server'}</span>
                          {isSelected && <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (selectedGuild) {
                  setIsReloading(true);
                  sendCommand('reload');
                  setTimeout(() => setIsReloading(false), 1000);
                }
              }}
              disabled={isReloading || !selectedGuild}
              className="shrink-0 p-1.5 rounded-full text-zinc-400 hover:text-amber-400 hover:bg-amber-400/10 transition-all disabled:opacity-50"
              title="Reload bot in server"
            >
              <Icon name="refresh-cw" className={`h-4 w-4 ${isReloading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}
      </form>

      {/* Dropdown Results */}
      {isOpen && (query.trim() || results.length > 0 || isSearching) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50 max-h-[400px] flex flex-col">
          {isSearching ? (
            <div className="p-8 text-center text-zinc-400 text-sm flex flex-col items-center">
              <svg className="animate-spin h-6 w-6 mb-2 text-amber-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
              Searching...
            </div>
          ) : results.length > 0 ? (
            <div className="overflow-y-auto p-2 space-y-1">
              {results.map((track, i) => (
                <div key={`${track.identifier}-${i}`} className="flex items-center gap-3 p-2 hover:bg-zinc-800 rounded-lg group transition">
                  <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden relative">
                    <FallbackImage 
                      src={track.artwork_url} 
                      className="object-cover" 
                      sizes="40px" 
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                      <button onClick={() => handlePlay(track, 'play', i)} className="text-white hover:text-amber-400 transition" aria-label="Play">
                        <Icon name="play" className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-zinc-200 text-sm truncate">{track.title}</p>
                    <p className="text-xs text-zinc-500 truncate">{track.author} · {formatDuration(track.duration)}</p>
                  </div>
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                    {feedback?.idx === i ? (
                      <span className="text-xs text-amber-400 pr-2">{feedback.msg}</span>
                    ) : (
                      <button
                        onClick={() => handlePlay(track, 'queue', i)}
                        className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-amber-500 hover:text-zinc-950 transition"
                        title="Add to queue"
                      >
                        Queue
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-zinc-500 text-sm">
              No results found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
