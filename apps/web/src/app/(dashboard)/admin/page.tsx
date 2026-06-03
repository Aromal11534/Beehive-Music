'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, getApiBase } from '@/lib/api';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/types';
import { Icon } from '@/components/icons';

interface UsersResponse {
  users: User[];
}

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');

  const loadUsers = async (q?: string) => {
    try {
      const data = await api.get<UsersResponse>(`/users?page=1&page_size=50${q ? `&search=${q}` : ''}`);
      setUsers(data.users || []);
    } catch {}
  };

  useEffect(() => {
    if (user && !user.is_admin) {
      router.push('/');
      return;
    }

    let isMounted = true;
    async function fetchUsers() {
      try {
        const data = await api.get<UsersResponse>('/users?page=1&page_size=50');
        if (isMounted) setUsers(data.users || []);
      } catch {}
    }

    void fetchUsers();
    return () => { isMounted = false; };
  }, [user, router]);

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Admin Panel</h1>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/15 text-amber-400 rounded-lg text-sm font-medium">
          <Icon name="shield" className="h-4 w-4" /> Admin
        </span>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); loadUsers(e.target.value); }}
          placeholder="Search users..."
          className="flex-1 px-4 py-2.5 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        />
      </div>

      {/* Users Table */}
      <div className="glass-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-700/50">
              <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Email</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-zinc-500 uppercase">Status</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-zinc-500 uppercase">Role</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-zinc-500 uppercase">MFA</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {users.map((u) => {
              const avatarFilename = u.avatar_path ? u.avatar_path.split(/[/\\]/).pop() : null;
              const avatarUrl = avatarFilename ? `${getApiBase()}/avatars/${avatarFilename}` : null;

              return (
              <tr key={u.id} className="hover:bg-zinc-800/30 transition">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-amber-400 text-sm font-semibold overflow-hidden shrink-0">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        u.display_name?.[0]?.toUpperCase()
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{u.display_name}</p>
                      <p className="text-xs text-zinc-500">@{u.username}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-zinc-400">{u.email || '-'}</td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-2 py-1 rounded-lg text-xs ${u.is_active ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 text-center text-sm">
                  {u.is_admin ? <span className="inline-flex items-center justify-center gap-1.5 text-amber-400"><Icon name="shield" className="h-4 w-4" /> Admin</span> : <span className="text-zinc-500">User</span>}
                </td>
                <td className="px-6 py-4 text-center text-sm">
                  {u.mfa_enabled ? <Icon name="lock" className="mx-auto h-4 w-4 text-amber-400" /> : '-'}
                </td>
                <td className="px-6 py-4 text-right text-xs text-zinc-500">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
