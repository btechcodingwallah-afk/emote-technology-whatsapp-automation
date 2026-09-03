'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@emotetechnology.in');
  const [password, setPassword] = useState('EmotePassword2026!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to log in');
      }

      // Save token to localStorage for client-side API requests
      if (data.token) {
        localStorage.setItem('emote_token', data.token);
        localStorage.setItem('emote_user', JSON.stringify(data.user));
      }

      router.push('/dashboard/whatsapp');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-12">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-lg font-bold text-slate-950 shadow-lg shadow-emerald-500/20">
            E
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">
            Emote <span className="text-emerald-400">Platform</span>
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Log in to manage WhatsApp automation & integrations
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="admin@emotetechnology.in"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-4 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/25 transition-all hover:opacity-95 disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Sign In to Dashboard'}
          </button>
        </form>

        {/* Reviewer Notice */}
        <div className="rounded-xl border border-white/5 bg-slate-950/60 p-4 text-xs text-slate-400">
          <span className="font-semibold text-slate-200">Default Admin Account:</span>
          <div className="mt-1 font-mono text-slate-300">Email: admin@emotetechnology.in</div>
          <div className="font-mono text-slate-300">Pass: EmotePassword2026!</div>
        </div>
      </div>
    </div>
  );
}
