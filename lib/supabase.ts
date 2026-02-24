import { createClient } from '@supabase/supabase-js';

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value : undefined;
}

function getSupabaseUrl(): string | undefined {
  return getEnv('NEXT_PUBLIC_SUPABASE_URL') ?? getEnv('SUPABASE_URL');
}

function getSupabaseAnonKey(): string | undefined {
  return getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? getEnv('SUPABASE_ANON_KEY');
}

function requireSupabaseUrl(): string {
  const value = getSupabaseUrl();
  if (!value) throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required.');
  return value;
}

function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function getSupabase() {
  return createClient(requireSupabaseUrl(), requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
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

export function getSupabaseAdminSafe() {
  const url = getSupabaseUrl();
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
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
