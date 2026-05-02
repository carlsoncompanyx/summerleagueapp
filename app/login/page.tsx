'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createBrowserSupabaseClient } from '../../lib/supabase/client';

export default function LoginPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onLogin = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (!supabase) throw new Error('Supabase client is not configured.');
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });
      if (signInError) throw signInError;
      const meRes = await fetch('/api/me', { cache: 'no-store' });
      const me = await meRes.json();
      setSuccess('Logged in successfully.');
      router.refresh();
      if (me?.isAdmin) router.push('/admin');
      else router.push('/');
    } catch (e: any) {
      setError(e?.message ?? 'Unable to log in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <h1>Login</h1>

      {!supabase && (
        <section className="card" style={{ marginBottom: 12 }}>
          <p>Supabase client is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel project environment variables.</p>
        </section>
      )}

      <section className="card" style={{ display: 'grid', gap: 10, maxWidth: 500 }}>
        <label htmlFor="login-email">Email</label>
        <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label htmlFor="login-password">Password</label>
        <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

        <button type="button" onClick={onLogin} disabled={loading || !supabase}>Login</button>

        {error && <p>{error}</p>}
        {success && <p>{success}</p>}
      </section>

      <p><Link href="/">Back to Home</Link></p>
    </main>
  );
}
