import { NextResponse } from 'next/server';
import { roleFromAuthUser } from '../../../lib/auth/metadata';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { isAdminRole, normalizeRole } from '../../../lib/roles';

export async function GET() {
  const server = createServerSupabaseClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return NextResponse.json({ authenticated: false, email: null, profileFound: false, rawRole: null, normalizedRole: '', isAdmin: false });

  const rawRole = user.app_metadata?.role ?? user.app_metadata?.app_role ?? user.app_metadata?.ecrl_role ?? null;
  const role = roleFromAuthUser(user);
  const normalizedRole = normalizeRole(rawRole as any);
  return NextResponse.json({
    authenticated: true,
    email: user.email ?? null,
    profileFound: false,
    roleSource: 'auth.users app metadata',
    rawRole,
    normalizedRole: normalizedRole || role,
    isAdmin: isAdminRole(role),
  });
}
