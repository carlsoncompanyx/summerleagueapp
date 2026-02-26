'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { getSupabaseSafe } from '../../lib/supabase';

useEffect(() => {
  console.log('WINDOW?', typeof window !== 'undefined');
  console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('ANON:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}, []);

type Step = 1 | 2 | 3;

type OpenSeason = {
  id: string;
  name: string;
  registration_open_at: string | null;
  registration_close_at: string | null;
};

const POSITION_OPTIONS = ['Forward', 'Defense', 'Goalie'] as const;

export default function RegisterPage() {
  const supabase = useMemo(() => getSupabaseSafe(), []);
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [seasonSuccess, setSeasonSuccess] = useState(false);
  const [openSeasons, setOpenSeasons] = useState<OpenSeason[]>([]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [seasonId, setSeasonId] = useState('');
  const [preferredPositions, setPreferredPositions] = useState<string[]>([]);
  const [experience, setExperience] = useState('');

  const isLoggedIn = Boolean(sessionUserId);

  useEffect(() => {
    let mounted = true;

    if (!supabase) return;

    const syncSession = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!mounted) return;
      setSessionUserId(sessionData.session?.user?.id ?? null);
    };

    syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSessionUserId(session?.user?.id ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    let mounted = true;

    if (!supabase || !sessionUserId || step < 2) {
      if (mounted) {
        setOpenSeasons([]);
        setSeasonId('');
      }
      return;
    }

    const loadOpenSeasons = async () => {
      const now = new Date().toISOString();
      const { data, error: seasonsError } = await supabase
        .from('seasons')
        .select('id, name, registration_open_at, registration_close_at')
        .lte('registration_open_at', now)
        .gte('registration_close_at', now)
        .order('start_date', { ascending: true });

      if (!mounted) return;

      if (seasonsError) {
        setError(seasonsError.message);
        setOpenSeasons([]);
        setSeasonId('');
        return;
      }

      setOpenSeasons((data ?? []) as OpenSeason[]);
      if ((data ?? []).length) {
        setSeasonId(String((data ?? [])[0].id));
      } else {
        setSeasonId('');
      }
    };

    loadOpenSeasons();

    return () => {
      mounted = false;
    };
  }, [supabase, sessionUserId, step]);

  const ensureSessionAfterSignUp = async (nextEmail: string, nextPassword: string) => {
    if (!supabase) return null;

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: nextEmail,
      password: nextPassword,
    });

    if (signInError) {
      throw new Error(
        `Account created, but sign-in is still required before profile save (${signInError.message}). ` +
          'If email confirmation is enabled, confirm your email and then log in.',
      );
    }

    return signInData.user?.id ?? null;
  };

  const handleProfile = async () => {
    setError(null);
    setLoading(true);

    try {
      if (!supabase) throw new Error('Supabase client is not configured.');
      let userId = sessionUserId;

      if (!isLoggedIn) {
        if (!email.trim() || !password.trim()) {
          throw new Error('Email and password are required when not logged in.');
        }

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
        });

        if (signUpError) throw signUpError;

        userId = signUpData.user?.id ?? null;
        if (!signUpData.session) {
          userId = await ensureSessionAfterSignUp(email.trim(), password.trim());
        }

        setSessionUserId(userId);
      }

      if (!userId) {
        throw new Error('No authenticated user found. Please log in and try again.');
      }

      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          user_id: userId,
          display_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          contact: phone.trim(),
        },
        { onConflict: 'user_id' },
      );

      if (profileError) {
        if (profileError.code === '42501') {
          throw new Error(
            'Profile save was blocked by Supabase RLS. Confirm you are logged in and that profiles insert/update policy allows auth.uid() = user_id.',
          );
        }
        throw profileError;
      }

      return userId;
    } catch (e: any) {
      setError(e?.message ?? 'Unable to create profile.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const onSubmitProfileOnly = async () => {
    const userId = await handleProfile();
    if (!userId) return;
    setProfileSuccess(true);
  };

  const onRegisterForSeasonFromStep1 = async () => {
    const userId = await handleProfile();
    if (!userId) return;
    setStep(2);
  };

  const onSubmitSeason = async () => {
    setError(null);
    setLoading(true);

    try {
      if (!supabase) throw new Error('Supabase client is not configured.');
      if (!sessionUserId) throw new Error('You must be logged in before season registration.');
      if (!seasonId) throw new Error('Please select a season.');

      const { error: registrationError } = await supabase.from('registrations').insert({
        season_id: seasonId,
        user_id: sessionUserId,
        status: 'pending',
        preferred_positions: preferredPositions,
        experience,
      });

      if (registrationError) {
        if ((registrationError as any).code === '23505') {
          throw new Error('You are already registered for this season.');
        }
        if ((registrationError as any).code === '42501') {
          throw new Error('Registration save was blocked by Supabase RLS. Please log in again and retry.');
        }
        throw registrationError;
      }

      setSeasonSuccess(true);
      setStep(3);
    } catch (e: any) {
      setError(e?.message ?? 'Unable to submit season registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <h1>Register</h1>

      {!supabase && (
        <section className="card" style={{ marginBottom: 12 }}>
          <p>Supabase client is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel project environment variables.</p>
        </section>
      )}

      {error && (
        <section className="card" style={{ marginBottom: 12 }}>
          <p>{error}</p>
        </section>
      )}

      <section className="card" style={{ marginBottom: 12, opacity: step === 1 ? 1 : 0.75 }}>
        <h2 className="section-title">Step 1: Profile Creation</h2>

        {profileSuccess ? (
          <div>
            <p><strong>Profile successfully created.</strong></p>
            <button
              type="button"
              onClick={() => {
                setStep(2);
                setProfileSuccess(false);
              }}
            >
              Register for a season
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <label htmlFor="firstName">First Name</label>
            <input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />

            <label htmlFor="lastName">Last Name</label>
            <input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />

            <label htmlFor="phone">Phone</label>
            <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />

            {!isLoggedIn && (
              <>
                <label htmlFor="email">Email</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

                <label htmlFor="password">Password</label>
                <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" disabled={loading || !supabase} onClick={onSubmitProfileOnly}>Submit Profile Only</button>
              <button type="button" disabled={loading || !supabase} onClick={onRegisterForSeasonFromStep1}>Register for Season</button>
            </div>
          </div>
        )}
      </section>

      <section className="card" style={{ marginBottom: 12, opacity: step >= 2 ? 1 : 0.6 }}>
        <h2 className="section-title">Step 2: Season Registration</h2>

        {seasonSuccess ? (
          <div>
            <p><strong>Season registration submitted.</strong></p>
            <p><Link href="/">Back to Home</Link></p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <label htmlFor="seasonId">Season</label>
            <select id="seasonId" value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
              {openSeasons.length === 0 && <option value="">No open seasons</option>}
              {openSeasons.map((season) => (
                <option key={season.id} value={season.id}>{season.name}</option>
              ))}
            </select>

            <label htmlFor="preferredPositions">Preferred Positions</label>
            <select
              id="preferredPositions"
              multiple
              value={preferredPositions}
              onChange={(e) =>
                setPreferredPositions(Array.from(e.target.selectedOptions).map((opt) => opt.value))
              }
              size={3}
            >
              {POSITION_OPTIONS.map((position) => (
                <option key={position} value={position}>{position}</option>
              ))}
            </select>

            <label htmlFor="experience">Experience</label>
            <textarea id="experience" rows={4} value={experience} onChange={(e) => setExperience(e.target.value)} />

            <button type="button" disabled={loading || step < 2 || !supabase} onClick={onSubmitSeason}>Submit Season Registration</button>
          </div>
        )}
      </section>

      <section className="card" style={{ opacity: 0.65 }}>
        <h2 className="section-title">Step 3: Payment</h2>
        <button type="button" disabled style={{ background: '#d1d5db', color: '#4b5563' }}>
          Stripe Payment (Coming Soon)
        </button>
        <p className="muted">Payment functionality coming soon.</p>
      </section>
    </main>
  );
}
