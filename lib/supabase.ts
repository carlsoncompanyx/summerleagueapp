import { createClient } from '@supabase/supabase-js';

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value : undefined;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function getSupabaseUrl(): string | undefined {
  if (isBrowser()) {
    return getEnv('NEXT_PUBLIC_SUPABASE_URL');
  }
  return getEnv('NEXT_PUBLIC_SUPABASE_URL') ?? getEnv('SUPABASE_URL');
}

function getSupabaseAnonKey(): string | undefined {
  if (isBrowser()) {
    return getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? getEnv('SUPABASE_ANON_KEY');
}

function requireSupabaseUrl(): string {
  const value = getSupabaseUrl();
  if (!value) {
    const requiredName = isBrowser()
      ? 'NEXT_PUBLIC_SUPABASE_URL'
      : 'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL';
    throw new Error(`${requiredName} is required.`);
  }
  return value;
}

function requireSupabaseAnonKey(): string {
  const value = getSupabaseAnonKey();
  if (!value) {
    const requiredName = isBrowser()
      ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
      : 'NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY';
    throw new Error(`${requiredName} is required.`);
  }
  return value;
}

function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function getSupabase() {
  return createClient(requireSupabaseUrl(), requireSupabaseAnonKey());
}

export function getSupabaseSafe() {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

export function getSupabaseAdmin() {
  return createClient(requireSupabaseUrl(), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false }
  });
}

export function getSupabaseSafe() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  return createClient(url, anonKey);
}

export function getSupabaseEnvStatus() {
  return {
    hasNextPublicUrl: Boolean(getEnv('NEXT_PUBLIC_SUPABASE_URL')),
    hasSupabaseUrl: Boolean(getEnv('SUPABASE_URL')),
    hasNextPublicAnon: Boolean(getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')),
    hasSupabaseAnon: Boolean(getEnv('SUPABASE_ANON_KEY')),
    hasServiceRole: Boolean(getEnv('SUPABASE_SERVICE_ROLE_KEY')),
  };
}
