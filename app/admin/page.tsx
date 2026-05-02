import { redirect } from 'next/navigation';
import AdminClient from '../../components/AdminClient';
import { createAdminSupabaseClient } from '../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../lib/supabase/server';
import { isAdminRole, normalizeRole } from '../../lib/roles';

function testModeAdmin() {
  return process.env.ADMIN_TEST_MODE === 'true' && (process.env.VERCEL_ENV ?? 'development') !== 'production';
}

export default async function AdminPage() {
  if (!testModeAdmin()) {
    const server = createServerSupabaseClient();
    const admin = createAdminSupabaseClient();
    const { data: { user } } = await server.auth.getUser();
    if (!user) redirect('/login');

    const { data: profile } = await admin.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
    if (!isAdminRole(profile?.role)) {
      return (
        <main>
          <h1>Admin Access Denied</h1>
          <p className="muted">Your account is logged in but is not authorized for admin access.</p>
          <ul>
            <li><strong>User email:</strong> {user.email ?? 'unknown'}</li>
            <li><strong>Profile found:</strong> {String(Boolean(profile))}</li>
            <li><strong>Raw role value:</strong> {String(profile?.role ?? '') || '(empty)'}</li>
            <li><strong>Normalized role value:</strong> {normalizeRole(profile?.role) || '(empty)'}</li>
            <li><strong>Denial reason:</strong> role is not admin</li>
          </ul>
        </main>
      );
    }
  }

  return <AdminClient />;
}
