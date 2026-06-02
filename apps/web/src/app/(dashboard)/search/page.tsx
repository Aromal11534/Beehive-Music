'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { GuildAccess } from '@/lib/types';
import { Icon } from '@/components/icons';

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

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchTrack[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [guilds, setGuilds] = useState<GuildAccess[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<string>('');
  const [feedback, setFeedback] = useState<{ idx: number; msg: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    api.get<GuildAccess[]>('/guilds/my').then((data) => {
      const g = Array.isArray(data) ? data : [];
      setGuilds(g);
      if (g.length > 0) setSelectedGuild(g[0].guild?.discord_guild_id || '');
    }).catch((err) => {
      console.error("Failed to load guilds:", err);
      setErrorMsg("Failed to load your servers. Try refreshing.");
    });
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    if (!query.trim()) {
      return;
    }
    
    if (!selectedGuild) {
      setErrorMsg("Please select a server first. If you don't see any, make sure the bot is in your server and you have admin access.");
      return;
    }
    
    setIsSearching(true);
    setResults([]);
    try {
      const data = await api.post<{ tracks: SearchTrack[] }>('/player/search', {
        query: query.trim(),
        guild_id: selectedGuild,
      });
      if (data.tracks && data.tracks.length > 0) {
        setResults(data.tracks);
      } else {
        setErrorMsg("No results found. Try a different query.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Search failed. Ensure the bot is online and connected.");
    }
    setIsSearching(false);
  };

  const handlePlay = useCallback(async (track: SearchTrack, action: 'play' | 'queue', idx: number) => {
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
      alert("Failed to send command to the bot.");
    }
  }, [selectedGuild]);

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">Search Music</h1>
        <select
          value={selectedGuild}
          onChange={(e) => setSelectedGuild(e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        >
          {guilds.length === 0 ? (
             <option value="">No servers available</option>
          ) : (
             guilds.map((g) => (
               <option key={g.guild?.discord_guild_id || g.id} value={g.guild?.discord_guild_id || ''}>
                 {g.guild?.name || 'Unknown Server'}
               </option>
             ))
          )}
        </select>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <Icon name="lock" className="h-5 w-5 shrink-0" />
          <p>{errorMsg}</p>
        </div>
      )}

      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for songs, artists, or paste a URL..."
          className="flex-1 px-4 py-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition"
        />
        <button
          type="submit"
          disabled={isSearching}
          className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 font-semibold rounded-xl hover:from-amber-400 hover:to-amber-500 transition disabled:opacity-50"
        >
          {isSearching ? (
            <span className="inline-flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
              Searching
            </span>
          ) : (
            <span className="inline-flex items-center gap-2"><Icon name="search" className="h-4 w-4" /> Search</span>
          )}
        </button>
      </form>

      {results.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-500">{results.length} result{results.length !== 1 ? 's' : ''} found</p>
          {results.map((track, i) => (
            <div key={`${track.identifier}-${i}`} className="glass-card p-4 flex items-center gap-4 hover:border-amber-500/20 transition">
              <div className="w-12 h-12 rounded-lg bg-zinc-700/50 flex items-center justify-center shrink-0 overflow-hidden">
                {track.artwork_url ? (
                  <img src={track.artwork_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Icon name="music" className="h-5 w-5 text-amber-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-zinc-200 truncate">{track.title}</p>
                <p className="text-sm text-zinc-500">{track.author} · {formatDuration(track.duration)}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                {feedback?.idx === i ? (
                  <span className="px-3 py-1.5 text-amber-400 text-sm font-medium">{feedback.msg}</span>
                ) : (
                  <>
                    <button
                      onClick={() => handlePlay(track, 'play', i)}
                      className="px-3 py-1.5 bg-amber-500/15 text-amber-400 rounded-lg text-sm hover:bg-amber-500/25 transition"
                    >
                      Play
                    </button>
                    <button
                      onClick={() => handlePlay(track, 'queue', i)}
                      className="px-3 py-1.5 bg-zinc-800 text-zinc-400 rounded-lg text-sm hover:bg-zinc-700 transition"
                    >
                      Queue
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : isSearching ? (
        <div className="glass-card p-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 text-amber-400">
            <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
          </div>
          <h2 className="text-xl font-semibold text-zinc-300">Searching...</h2>
          <p className="text-zinc-500 mt-2">Looking through YouTube, SoundCloud, and more</p>
        </div>
      ) : (
        <div className="glass-card p-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-400">
            <Icon name="search" className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-300">Search for Music</h2>
          <p className="text-zinc-500 mt-2">Enter a query above to find songs on YouTube, SoundCloud, and more</p>
        </div>
      )}
    </div>
  );
}
