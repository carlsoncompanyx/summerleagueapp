import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { createAdminSupabaseClient } from '../../../lib/supabase/admin';
import { isAdminRole, normalizeRole } from '../../../lib/roles';

export async function GET() {
  const server = createServerSupabaseClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return NextResponse.json({ authenticated: false, email: null, profileFound: false, rawRole: null, normalizedRole: '', isAdmin: false });

  const admin = createAdminSupabaseClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
  const rawRole = profile?.role ?? null;
  const normalizedRole = normalizeRole(rawRole as any);
  return NextResponse.json({ authenticated: true, email: user.email ?? null, profileFound: Boolean(profile), rawRole, normalizedRole, isAdmin: isAdminRole(rawRole as any) });
}
