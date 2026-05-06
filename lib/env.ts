export function getSupabaseEnvDiagnostics() {
  const rawUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  let host: string | null = null;
  try {
    host = rawUrl ? new URL(rawUrl).host : null;
  } catch {
    host = 'invalid-url';
  }

  return {
    nextPublicSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    nextPublicAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseUrl: Boolean(process.env.SUPABASE_URL),
    serviceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    adminUrlHost: host,
    localEnvFile: process.env.NODE_ENV === 'development' ? '.env.local' : 'deployment environment',
  };
}
