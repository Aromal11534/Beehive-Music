'use client';

import { useState, useEffect } from 'react';
import type { PlayerTrack, PlaylistSummary } from '@/lib/types';
import { Icon } from '@/components/icons';
import { useGuilds } from '@/context/GuildContext';
import { BackgroundWaveform } from '@/components/BackgroundWaveform';
import { usePlayer } from '@/context/PlayerContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import Link from 'next/link';
import { FallbackImage } from '@/components/FallbackImage';

const DEFAULT_ARTIST_BIO = 'Playback is synced from your Discord server through Beehive. Manage the queue, save favorites, and jump through the track without leaving this room.';

function getTrackTitle(track: PlayerTrack | null | undefined) {
  return track?.title || track?.track_title || 'Unknown Track';
}

function getTrackAuthor(track: PlayerTrack | null | undefined) {
  return track?.author || track?.track_author || 'Unknown Artist';
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function ArtistBio({ artist }: { artist: string }) {
  const [bio, setBio] = useState(DEFAULT_ARTIST_BIO);

  useEffect(() => {
    async function fetchBio() {
      try {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(artist)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.extract) {
            const words = data.extract.split(/\s+/);
            if (words.length > 23) {
              setBio(words.slice(0, 23).join(' ') + '...');
            } else {
              setBio(data.extract);
            }
          } else {
            setBio(`Listen to ${artist} and more on Beehive Music. Enjoy live queue control and favorites management.`);
          }
        } else {
          setBio(`Listen to ${artist} and more on Beehive Music. Enjoy live queue control and favorites management.`);
        }
      } catch {
        setBio(`Listen to ${artist} and more on Beehive Music. Enjoy live queue control and favorites management.`);
      }
    }
    fetchBio();
  }, [artist]);

  return <p className="mt-3 line-clamp-4 text-xs leading-5 text-zinc-300">{bio}</p>;
}

export default function NowPlayingPage() {

  const { state } = usePlayer();
  const { guilds, selectedGuild } = useGuilds();
  const { user } = useAuth();
  const displayName = user?.display_name || user?.username || 'you';
  const [greeting] = useState(getGreeting);
  const [serverPlaylists, setServerPlaylists] = useState<PlaylistSummary[]>([]);
  const [personalPlaylists, setPersonalPlaylists] = useState<PlaylistSummary[]>([]);

  const track = state?.current_track;
  const currentTitle = getTrackTitle(track);
  const currentAuthor = getTrackAuthor(track);
  const queue = state?.queue ?? [];

  useEffect(() => {
    async function loadServerPlaylists() {
      if (!selectedGuild) {
        setServerPlaylists([]);
        return;
      }
      const g = guilds.find((gu) => gu.guild?.discord_guild_id === selectedGuild);
      if (g && g.guild_id) {
        try {
          const s = await api.get<PlaylistSummary[]>(`/guilds/${g.guild_id}/playlists`);
          setServerPlaylists(s.slice(0, 6));
        } catch {
          setServerPlaylists([]);
        }
      } else {
        setServerPlaylists([]);
      }
    }
    loadServerPlaylists();
  }, [selectedGuild, guilds]);

  useEffect(() => {
    async function loadPersonalPlaylists() {
      try {
        const p = await api.get<PlaylistSummary[]>('/playlists');
        setPersonalPlaylists(p);
      } catch { }
    }
    loadPersonalPlaylists();
  }, []);

  const featuredTracks = track ? [track, ...queue].slice(0, 6) : queue.slice(0, 6);
  const selectedGuildName = guilds.find((g) => g.guild?.discord_guild_id === selectedGuild)?.guild?.name || 'Select Server';

  const dailyMixArtworks = featuredTracks.map(t => t?.artwork_url).filter(Boolean).slice(0, 4);
  const quickPicksArtworks = queue.slice(0, 8).reverse().map(t => t?.artwork_url).filter(Boolean).slice(0, 4);
  const listenAgainArtworks = queue.slice(2, 10).map(t => t?.artwork_url).filter(Boolean).slice(0, 4);

  const fixedCards = [
    { id: 'daily-mix', title: 'Daily Mix', subtitle: track ? `Featuring ${getTrackAuthor(track)}` : 'Made for you', top_artworks: dailyMixArtworks, type: 'fixed' as const },
    { id: 'quick-picks', title: 'Quick Picks', subtitle: 'Start listening', top_artworks: quickPicksArtworks, type: 'fixed' as const },
    { id: 'listen-again', title: 'Listen Again', subtitle: 'Your recent favorites', top_artworks: listenAgainArtworks, type: 'fixed' as const },
  ].filter(c => c.top_artworks.length > 0);

  const personalCards = personalPlaylists.map(p => ({
    id: `playlist-${p.id}`,
    title: p.name,
    subtitle: `${p.track_count || 0} tracks`,
    playlist: p,
    top_artworks: p.top_artworks || [],
    type: 'playlist' as const
  }));

  const allSessionCards = [...fixedCards, ...personalCards].slice(0, 10);

  return (
    <div className="absolute top-6 bottom-6 left-6 right-6 flex justify-center pointer-events-none">
      <div className="w-full max-w-[1800px] h-full pointer-events-auto overflow-hidden rounded-[28px] bg-black text-white shadow-2xl ring-1 ring-white/10 flex flex-col relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(88,28,135,0.55),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(30,64,175,0.2),_transparent_30%),linear-gradient(180deg,_#111111_0%,_#050505_42%,_#000_100%)]" />

        <div className="relative z-10 flex flex-1 min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row">
            <section className="min-h-0 flex-1 overflow-y-auto rounded-[22px] bg-[#121212]/90">
              <div className="relative overflow-hidden rounded-t-[22px] bg-gradient-to-br from-[#2d155f] via-[#211345] to-[#111111] p-4 md:p-6">
                <BackgroundWaveform isPlaying={!!(state && state.is_playing && !state.is_paused)} track={track} />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,_rgba(132,90,223,0.3),_transparent_30%)] pointer-events-none" />
                <div className="relative mt-2 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
                  <div>
                    <p className="text-sm font-semibold text-zinc-300">{selectedGuildName}</p>
                    <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-5xl">{greeting}</h1>
                    <p className="mt-3 max-w-xl text-sm text-zinc-300">A private music room for this server, with live queue control and a focused player view.</p>
                  </div>

                  <div className="rounded-2xl bg-black/25 p-3 ring-1 ring-white/10 backdrop-blur">
                    <div className="flex items-center gap-3">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                        <FallbackImage src={track?.artwork_url} className="object-cover" sizes="64px" fallbackIcon="music" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Now Playing</p>
                        <p className="truncate text-sm font-semibold text-white">{track ? currentTitle : 'Nothing playing'}</p>
                        <p className="truncate text-xs text-zinc-400">{track ? currentAuthor : 'Start playback from Discord or Search'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-7 p-4 md:p-6 pb-24 md:pb-32 lg:pb-32">
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-medium text-zinc-400">Server Playlists</h2>
                    <Link href="/playlists" className="text-xs font-semibold uppercase tracking-wide text-zinc-400 hover:text-white transition">Show all</Link>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {serverPlaylists.length > 0 ? serverPlaylists.map((p) => (
                      <Link href={`/playlists?id=${p.id}&name=${encodeURIComponent(p.name)}`} key={p.id} className="group flex items-center gap-3 rounded-lg bg-white/10 p-2 transition hover:bg-white/18 cursor-pointer">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-black/40 flex items-center justify-center">
                          {p.top_artworks && p.top_artworks.length > 0 ? (
                            <div className={`w-full h-full ${p.top_artworks.length === 1 ? 'block' : 'grid grid-cols-2 grid-rows-2'}`}>
                              {p.top_artworks.length === 1 ? (
                                <div className="relative w-full h-full">
                                  <FallbackImage src={p.top_artworks[0]} className="object-cover" sizes="48px" />
                                </div>
                              ) : (
                                Array.from({ length: 4 }).map((_, i) => {
                                  const artwork = p.top_artworks![i] || p.top_artworks![i % p.top_artworks!.length];
                                  return artwork ? (
                                    <div key={i} className="relative w-full h-full">
                                      <FallbackImage src={artwork} className="object-cover" sizes="24px" />
                                    </div>
                                  ) : (
                                    <div key={i} className="bg-zinc-800 w-full h-full" />
                                  );
                                })
                              )}
                            </div>
                          ) : (
                            <Icon name="disc" className="h-5 w-5 text-emerald-500/50" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white group-hover:text-emerald-400 transition">{p.name}</p>
                          <p className="truncate text-xs text-zinc-400">{p.track_count || 0} tracks</p>
                        </div>
                      </Link>
                    )) : (
                      <div className="col-span-full py-6 text-center text-zinc-500 text-sm">
                        No server playlists available yet.
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <div className="mb-6">
                    <p className="text-sm font-medium text-zinc-400">Made For</p>
                    <h2 className="text-2xl font-bold tracking-tight text-white">{displayName}</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                    {allSessionCards.map((card) => {
                      const content = (
                        <>
                          <div className="relative aspect-square overflow-hidden rounded-md bg-zinc-800 shadow-lg">
                            {card.top_artworks && card.top_artworks.length > 0 ? (
                              <div className={`w-full h-full ${card.top_artworks.length === 1 ? 'block' : 'grid grid-cols-2 grid-rows-2'}`}>
                                {card.top_artworks.length === 1 ? (
                                  <div className="relative w-full h-full">
                                    <FallbackImage src={card.top_artworks[0] || '/default-album.png'} className="object-cover" sizes="180px" />
                                  </div>
                                ) : (
                                  Array.from({ length: 4 }).map((_, i) => {
                                    const artwork = card.top_artworks![i] || card.top_artworks![i % card.top_artworks!.length];
                                    return artwork ? (
                                      <div key={i} className="relative w-full h-full">
                                        <FallbackImage src={artwork} className="object-cover" sizes="90px" />
                                      </div>
                                    ) : (
                                      <div key={i} className="bg-zinc-800 w-full h-full" />
                                    );
                                  })
                                )}
                              </div>
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-amber-300"><Icon name="disc" className="h-8 w-8" /></div>
                            )}
                          </div>
                          <p className="mt-3 truncate text-sm font-semibold text-white group-hover:text-emerald-400 transition">{card.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{card.subtitle}</p>
                        </>
                      );

                      const wrapperClass = "group rounded-lg bg-[#181818] p-3 transition hover:bg-[#242424] block cursor-pointer";

                      if (card.type === 'playlist') {
                        return (
                          <Link href={`/playlists?id=${card.playlist.id}&name=${encodeURIComponent(card.playlist.name)}`} key={card.id} className={wrapperClass}>
                            {content}
                          </Link>
                        );
                      }

                      return (
                        <Link href={`/playlists?id=${card.id}&name=${encodeURIComponent(card.title)}&type=dynamic`} key={card.id} className={wrapperClass}>
                          {content}
                        </Link>
                      );
                    })}
                    {!allSessionCards.length && [1, 2, 3, 4, 5].map((item) => (
                      <div key={item} className="rounded-lg bg-[#181818] p-3">
                        <div className="aspect-square rounded-md bg-zinc-800/80" />
                        <div className="mt-3 h-3 rounded bg-zinc-700" />
                        <div className="mt-2 h-3 w-2/3 rounded bg-zinc-800" />
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </section>

            <aside className="hidden min-h-0 w-[320px] shrink-0 overflow-y-auto rounded-[22px] bg-[#181818] p-4 ring-1 ring-white/5 lg:block">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-black">{track ? 'Now Playing' : 'Player'}</h2>
              </div>

              <div className="relative aspect-square overflow-hidden rounded-xl bg-zinc-900 shadow-2xl">
                <FallbackImage src={track?.artwork_url} className="object-cover" sizes="320px" fallbackIcon="music" />
              </div>

              <div className="mt-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-xl font-black">{track ? currentTitle : 'Nothing Playing'}</h3>
                  <p className="mt-1 truncate text-sm text-zinc-400">{track ? currentAuthor : 'Choose a track from Search'}</p>
                </div>
              </div>

              <div className="relative mt-6 overflow-hidden rounded-xl bg-[#242424]">
                <div className="relative h-32 bg-zinc-900">
                  <FallbackImage src={track?.artwork_url} className="object-cover opacity-70 blur-[1px]" sizes="320px" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#242424] via-[#242424]/80 to-transparent" />
                </div>
                <div className="p-4">
                  <p className="text-sm font-black">About the artist</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{currentAuthor}</p>
                      <p className="text-xs text-zinc-400">Live from {selectedGuildName}</p>
                    </div>
                  </div>
                  {currentAuthor === 'Unknown Artist' || currentAuthor === 'Start playback from Discord or Search' ? (
                    <p className="mt-3 line-clamp-4 text-xs leading-5 text-zinc-300">{DEFAULT_ARTIST_BIO}</p>
                  ) : (
                    <ArtistBio key={currentAuthor} artist={currentAuthor} />
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
