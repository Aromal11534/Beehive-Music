'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { BrandMark, Icon } from '@/components/icons';

type AuthView = 'login' | 'signup' | 'forgot' | 'mfa';

export default function LoginPage() {
  const router = useRouter();
  const { login, register, verifyMfa } = useAuth();

  const [view, setView] = useState<AuthView>('login');

  // Login fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Signup fields
  const [signupUsername, setSignupUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupDisplayName, setSignupDisplayName] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');

  // Forgot password fields
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // MFA
  const [mfaCode, setMfaCode] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(username, password);
      if (result.mfa_required) {
        setMfaToken(result.mfa_token || null);
        setView('mfa');
      } else {
        router.push('/');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (signupPassword !== signupConfirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await register(signupUsername, signupEmail, signupPassword, signupDisplayName);
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await api.post('/auth/forgot-password', { email: forgotEmail });
      setForgotSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await verifyMfa(mfaToken!, mfaCode);
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid MFA code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // TODO: Implement Google OAuth — redirect to backend OAuth endpoint
    setError('Google OAuth is not configured yet. Please use username/password login.');
  };

  const switchView = (v: AuthView) => {
    setError('');
    setView(v);
    setForgotSent(false);
  };

  const inputClass =
    'w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition';

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-zinc-950 relative overflow-hidden">
      {/* Left Column: Branding */}
      <div className="relative hidden lg:flex flex-col items-center justify-center p-12 overflow-hidden bg-zinc-950">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-zinc-950 to-zinc-950"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.15),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.05),_transparent_40%)]"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
        {/* Right edge dissolve gradient */}
        <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-zinc-950 to-transparent z-20 pointer-events-none"></div>

        <div className="relative z-10 flex flex-col items-center text-center max-w-lg animate-fade-in pr-12">
          <BrandMark className="w-24 h-24 rounded-[2rem] mb-8 shadow-2xl shadow-amber-500/30" />
          <h1 className="text-5xl font-semibold text-white tracking-tight mb-4">Beehive Music</h1>
          <p className="text-lg text-zinc-400 leading-relaxed font-medium">
            The ultimate music control panel for your Discord servers. Sync, play, and manage queues beautifully.
          </p>
        </div>
      </div>

      {/* Right Column: Auth */}
      <div className="relative flex items-center justify-center p-6 sm:p-12 animate-fade-in bg-zinc-950 z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(245,158,11,0.03)_0%,_transparent_70%)] lg:hidden"></div>

        <div className="relative w-full max-w-md lg:-ml-12">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <BrandMark className="w-16 h-16 rounded-2xl mb-4 shadow-xl shadow-amber-500/20 mx-auto" />
            <h1 className="text-3xl font-semibold text-white">Beehive Music</h1>
          </div>

          {/* Auth Card */}
          <div className="glass-card p-8 shadow-2xl ring-1 ring-white/5 bg-zinc-900/80 backdrop-blur-xl">
            {view === 'mfa' ? (
              /* ── MFA View ── */
              <form onSubmit={handleMfaVerify} className="space-y-5">
                <div className="text-center mb-4">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800 text-amber-400 mb-3">
                    <Icon name="lock" className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-semibold text-zinc-100">Two-Factor Authentication</h2>
                  <p className="text-sm text-zinc-500 mt-1">Enter the code from your authenticator app</p>
                </div>

                <div>
                  <input
                    type="text"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    className={`${inputClass} text-center text-2xl tracking-[0.5em] font-mono`}
                    placeholder="000000"
                    maxLength={8}
                    autoFocus
                    required
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-semibold rounded-xl transition-all duration-200 disabled:opacity-50"
                >
                  {isLoading ? 'Verifying...' : 'Verify'}
                </button>

                <button
                  type="button"
                  onClick={() => switchView('login')}
                  className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-300 transition inline-flex items-center justify-center gap-2"
                >
                  <Icon name="arrow-left" className="h-4 w-4" /> Back to login
                </button>
              </form>
            ) : view === 'forgot' ? (
              /* ── Forgot Password View ── */
              <div className="space-y-5">
                <div className="text-center mb-2">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800 text-amber-400 mb-3">
                    <Icon name="lock" className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-semibold text-zinc-100">Reset Password</h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    {forgotSent
                      ? 'Check your email for a reset link'
                      : 'Enter your email to receive a password reset link'}
                  </p>
                </div>

                {forgotSent ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm text-center">
                      <Icon name="check-circle" className="h-5 w-5 mx-auto mb-2" />
                      If an account with that email exists, a reset link has been sent.
                    </div>
                    <button
                      type="button"
                      onClick={() => switchView('login')}
                      className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-300 transition inline-flex items-center justify-center gap-2"
                    >
                      <Icon name="arrow-left" className="h-4 w-4" /> Back to login
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-5">
                    <div>
                      <label htmlFor="forgot-email" className="block text-sm font-medium text-zinc-400 mb-1.5">
                        Email Address
                      </label>
                      <input
                        id="forgot-email"
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className={inputClass}
                        placeholder="you@example.com"
                        required
                        autoFocus
                      />
                    </div>

                    {error && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
                    >
                      {isLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Sending...
                        </span>
                      ) : 'Send Reset Link'}
                    </button>

                    <button
                      type="button"
                      onClick={() => switchView('login')}
                      className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-300 transition inline-flex items-center justify-center gap-2"
                    >
                      <Icon name="arrow-left" className="h-4 w-4" /> Back to login
                    </button>
                  </form>
                )}
              </div>
            ) : (
              /* ── Login / Signup Tabs ── */
              <div className="space-y-5">
                {/* Tab Switcher */}
                <div className="flex rounded-xl bg-zinc-800/60 p-1">
                  <button
                    type="button"
                    onClick={() => switchView('login')}
                    className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${view === 'login'
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 shadow-lg shadow-amber-500/20'
                      : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => switchView('signup')}
                    className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${view === 'signup'
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 shadow-lg shadow-amber-500/20'
                      : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                  >
                    Sign Up
                  </button>
                </div>

                {view === 'login' ? (
                  /* ── Login Form ── */
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label htmlFor="username" className="block text-sm font-medium text-zinc-400 mb-1.5">
                        Username
                      </label>
                      <input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className={inputClass}
                        placeholder="Enter your username"
                        required
                        autoFocus
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="password" className="block text-sm font-medium text-zinc-400">
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => switchView('forgot')}
                          className="text-xs text-amber-400/80 hover:text-amber-400 transition"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={inputClass}
                        placeholder="Enter your password"
                        required
                      />
                    </div>

                    {error && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
                    >
                      {isLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Signing in...
                        </span>
                      ) : 'Sign In'}
                    </button>
                  </form>
                ) : (
                  /* ── Signup Form ── */
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="signup-username" className="block text-sm font-medium text-zinc-400 mb-1.5">
                          Username
                        </label>
                        <input
                          id="signup-username"
                          type="text"
                          value={signupUsername}
                          onChange={(e) => setSignupUsername(e.target.value)}
                          className={inputClass}
                          placeholder="username"
                          required
                          autoFocus
                        />
                      </div>
                      <div>
                        <label htmlFor="signup-display" className="block text-sm font-medium text-zinc-400 mb-1.5">
                          Display Name
                        </label>
                        <input
                          id="signup-display"
                          type="text"
                          value={signupDisplayName}
                          onChange={(e) => setSignupDisplayName(e.target.value)}
                          className={inputClass}
                          placeholder="Your Name"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="signup-email" className="block text-sm font-medium text-zinc-400 mb-1.5">
                        Email
                      </label>
                      <input
                        id="signup-email"
                        type="email"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        className={inputClass}
                        placeholder="you@example.com"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="signup-password" className="block text-sm font-medium text-zinc-400 mb-1.5">
                        Password
                      </label>
                      <input
                        id="signup-password"
                        type="password"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className={inputClass}
                        placeholder="Min. 8 characters"
                        minLength={8}
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="signup-confirm" className="block text-sm font-medium text-zinc-400 mb-1.5">
                        Confirm Password
                      </label>
                      <input
                        id="signup-confirm"
                        type="password"
                        value={signupConfirmPassword}
                        onChange={(e) => setSignupConfirmPassword(e.target.value)}
                        className={inputClass}
                        placeholder="Confirm your password"
                        minLength={8}
                        required
                      />
                    </div>

                    {error && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
                    >
                      {isLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Creating account...
                        </span>
                      ) : 'Create Account'}
                    </button>
                  </form>
                )}

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-700/50"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-zinc-800/60 px-3 text-zinc-500 rounded-full">or continue with</span>
                  </div>
                </div>

                {/* Social Login Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    className="flex items-center justify-center gap-2.5 py-2.5 px-4 bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/50 rounded-xl text-zinc-300 text-sm font-medium transition-all duration-200 hover:border-zinc-600/50"
                  >
                    <svg className="w-4.5 h-4.5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Google
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
                      if (!clientId) {
                        setError('Discord OAuth is not configured.');
                        return;
                      }
                      const redirectUri = encodeURIComponent(`${window.location.origin}/auth/discord/callback`);
                      window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify+guilds`;
                    }}
                    className="flex items-center justify-center gap-2.5 py-2.5 px-4 bg-[#5865F2]/10 hover:bg-[#5865F2]/20 border border-[#5865F2]/30 rounded-xl text-[#8b97ff] text-sm font-medium transition-all duration-200 hover:border-[#5865F2]/50"
                  >
                    <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                    </svg>
                    Discord
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="text-center text-zinc-600 text-xs mt-8 font-medium">
            Beehive Music | beehive.teamsyndicate.org
          </p>
        </div>
      </div>
    </div>
  );
}
